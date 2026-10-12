const axios = require('axios');
const pool = require('../services/db');
const spotify = require('./spotifyController');

// ── mood playlists saved to your spotify library ────────
// "save to spotify" on a playlist creates a private playlist named after the
// mood (e.g. "chill") in your spotify account (or updates the one it made
// before). after that it stays up to date by itself:
//  - a song logged with that mood for the first time is added to the top
//  - a song whose last log for that mood is deleted is removed
//  - reordering the playlist in moodtunes re-saves it in the new order
// (uses spotify's february 2026 playlist endpoints: /me/playlists and
//  /playlists/{id}/items, falling back to the older /tracks ones if needed)

const API = 'https://api.spotify.com/v1';

pool.query(
    `CREATE TABLE IF NOT EXISTS SpotifyPlaylist (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        user_id     INT NOT NULL,
        mood        VARCHAR(50) NOT NULL,
        playlist_id VARCHAR(255) NOT NULL,
        FOREIGN KEY (user_id) REFERENCES User(id),
        UNIQUE KEY unique_user_mood (user_id, mood)
    )`,
    (err) => { if (err) console.error('SpotifyPlaylist table setup failed:', err.message); }
);

function query(sql, params) {
    return new Promise((resolve, reject) => pool.query(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));
}

// a spotify api call as this user, refreshing their token once if it has expired
function call(userId, method, path, data) {
    return new Promise((resolve, reject) => {
        spotify.getUserToken(userId, (err, token) => {
            if (err) return reject(Object.assign(new Error('Spotify not connected'), { status: 401 }));
            const go = (t, retried) => axios({
                method, url: API + path, data,
                headers: { 'Authorization': 'Bearer ' + t, 'Content-Type': 'application/json' },
                timeout: 15000
            })
                .then((r) => resolve(r.data))
                .catch((e) => {
                    const status = e.response && e.response.status;
                    if (!retried && status === 401) {
                        return spotify.refreshToken(userId, (e2, fresh) => e2 ? reject(e2) : go(fresh, true));
                    }
                    reject(Object.assign(e, { status }));
                });
            go(token, false);
        });
    });
}

// newer endpoint first, the older one if this app/account still uses it
async function items(userId, method, playlistId, body, oldBody) {
    try {
        return await call(userId, method, '/playlists/' + playlistId + '/items', body);
    } catch (e) {
        if (e.status !== 404 && e.status !== 410) throw e;
        return call(userId, method, '/playlists/' + playlistId + '/tracks', oldBody || body);
    }
}

function uriOf(urlOrId) {
    const s = String(urlOrId || '');
    const m = s.match(/track[/:]([A-Za-z0-9]{10,40})/) || s.match(/^([A-Za-z0-9]{10,40})$/);
    return m ? 'spotify:track:' + m[1] : null;
}

async function savedId(userId, mood) {
    const rows = await query('SELECT playlist_id FROM SpotifyPlaylist WHERE user_id = ? AND mood = ?', [userId, mood]);
    return rows.length ? rows[0].playlist_id : null;
}

async function createPlaylist(userId, mood) {
    let made;
    try {
        made = await call(userId, 'post', '/me/playlists', { name: mood, public: false });
    } catch (e) {
        if (e.status !== 404 && e.status !== 405) throw e;
        const me = await call(userId, 'get', '/me');
        made = await call(userId, 'post', '/users/' + encodeURIComponent(me.id) + '/playlists', { name: mood, public: false });
    }
    await query(
        'INSERT INTO SpotifyPlaylist (user_id, mood, playlist_id) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE playlist_id = VALUES(playlist_id)',
        [userId, mood, made.id]
    );
    return made.id;
}

// put exactly these songs, in this order, into the playlist
async function replaceAll(userId, playlistId, uris) {
    await items(userId, 'put', playlistId, { uris: uris.slice(0, 100) });
    for (let i = 100; i < uris.length; i += 100) {
        await items(userId, 'post', playlistId, { uris: uris.slice(i, i + 100) });
    }
}

// playlists saved before were called "moodtunes — chill": rename them to just the mood
async function renameTo(userId, playlistId, name) {
    try { await call(userId, 'put', '/playlists/' + playlistId, { name: name, description: '' }); }
    catch (e) {
        try { await call(userId, 'put', '/playlists/' + playlistId, { name: name }); } catch (e2) { /* keep the old name */ }
    }
}

// a cover image for a playlist: a base64 jpeg (spotify allows up to 256 KB)
async function uploadCover(userId, playlistId, base64) {
    const data = String(base64 || '').replace(/^data:image\/jpeg;base64,/, '');
    if (!data || data.length > 350000) throw Object.assign(new Error('cover too big'), { status: 413 });
    return new Promise((resolve, reject) => {
        spotify.getUserToken(userId, (err, token) => {
            if (err) return reject(Object.assign(new Error('Spotify not connected'), { status: 401 }));
            const go = (t, retried) => axios.put(API + '/playlists/' + playlistId + '/images', data, {
                headers: { 'Authorization': 'Bearer ' + t, 'Content-Type': 'image/jpeg' }, timeout: 20000
            })
                .then(() => resolve())
                .catch((e) => {
                    const status = e.response && e.response.status;
                    if (!retried && status === 401) return spotify.refreshToken(userId, (e2, fresh) => e2 ? reject(e2) : go(fresh, true));
                    reject(Object.assign(e, { status }));
                });
            go(token, false);
        });
    });
}

// spotify answers 403 "Insufficient client scope" when a feature needs a
// permission the user hasn't given yet (they connected before it existed)
function needsReconnect(e) {
    const msg = e && e.response && e.response.data && e.response.data.error && e.response.data.error.message;
    return (e.status === 403 || (e.response && e.response.status === 403)) && /scope/i.test(String(msg || ''));
}
module.exports.needsReconnect = needsReconnect;
module.exports.fail = fail;

module.exports.call = call;
module.exports.uriOf = uriOf;
module.exports.query = query;
module.exports.items = items;
module.exports.replaceAll = replaceAll;
module.exports.renameTo = renameTo;
module.exports.uploadCover = uploadCover;

const playlistUrl = (id) => 'https://open.spotify.com/playlist/' + id;
module.exports.playlistUrl = playlistUrl;

function fail(res, e, what) {
    if (e.status === 401) return res.status(401).json({ message: 'connect spotify first' });
    if (needsReconnect(e)) return res.status(403).json({ reason: 'reconnect', message: 'reconnect spotify to turn this on' });
    if (e.status === 403) return res.status(403).json({ message: 'spotify didn’t allow this — try disconnecting and reconnecting spotify' });
    console.error(what + ' failed:', e.status || '', e.response ? JSON.stringify(e.response.data) : e.message);
    res.status(502).json({ message: 'spotify didn’t respond — try again in a moment' });
}

// which of these playlists are still in your spotify library. deleting a playlist
// in spotify only takes it out of your library, so this is how moodtunes notices.
// returns a Set of ids, or null when spotify couldn't say (then nothing changes)
async function inLibrary(userId, ids, why) {
    if (!ids.length) return new Set();
    try {
        const out = new Set();
        for (let i = 0; i < ids.length; i += 40) {
            const chunk = ids.slice(i, i + 40);
            const uris = chunk.map((id) => 'spotify:playlist:' + id).join(',');
            const flags = await call(userId, 'get', '/me/library/contains?uris=' + encodeURIComponent(uris));
            if (!Array.isArray(flags)) return null;
            chunk.forEach((id, k) => { if (flags[k]) out.add(id); });
        }
        return out;
    } catch (e) {
        if (why && needsReconnect(e)) why.reconnect = true;
        return null;
    }
}

// put a playlist (back) in your library, e.g. when you save one you'd removed in spotify
async function follow(userId, playlistId) {
    try { await call(userId, 'put', '/me/library?uris=' + encodeURIComponent('spotify:playlist:' + playlistId)); }
    catch (e) { /* it still saves; it just may not show in the library */ }
}
module.exports.inLibrary = inLibrary;
module.exports.follow = follow;

// GET /api/spotify/playlists → [{ mood, playlist_id, url }]
// playlists you've deleted in spotify are forgotten here too
module.exports.listSaved = async (req, res) => {
    const userId = res.locals.userId;
    try {
        let rows = await query('SELECT mood, playlist_id FROM SpotifyPlaylist WHERE user_id = ?', [userId]);
        const why = {};
        const still = await inLibrary(userId, rows.map((r) => r.playlist_id), why);
        if (still) {
            const gone = rows.filter((r) => !still.has(r.playlist_id));
            if (gone.length) {
                await query('DELETE FROM SpotifyPlaylist WHERE user_id = ? AND playlist_id IN (?)', [userId, gone.map((r) => r.playlist_id)]);
                rows = rows.filter((r) => still.has(r.playlist_id));
            }
        }
        const list = rows.map((r) => ({ mood: r.mood, playlist_id: r.playlist_id, url: playlistUrl(r.playlist_id) }));
        // ?v=2: also says when spotify needs reconnecting for this check
        if (req.query.v === '2') return res.json({ playlists: list, reconnect: !!why.reconnect });
        res.json(list);
    } catch (e) {
        res.json(req.query.v === '2' ? { playlists: [] } : []);
    }
};

// PUT /api/spotify/playlists/:mood  body: { songs: [spotify url or track id, …] in playlist order }
module.exports.savePlaylist = async (req, res) => {
    const userId = res.locals.userId;
    const mood = String(req.params.mood || '').slice(0, 50);
    const uris = (Array.isArray(req.body.songs) ? req.body.songs : []).map(uriOf).filter(Boolean);
    if (!mood) return res.status(400).json({ message: 'mood required' });

    try {
        let id = await savedId(userId, mood);
        let created = false;
        if (!id) { id = await createPlaylist(userId, mood); created = true; }
        try {
            await replaceAll(userId, id, uris);
        } catch (e) {
            // the playlist was deleted in spotify: make a fresh one
            if (created || (e.status !== 404 && e.status !== 403)) throw e;
            id = await createPlaylist(userId, mood);
            created = true;
            await replaceAll(userId, id, uris);
        }
        if (!created) {
            await renameTo(userId, id, mood);
            await follow(userId, id);
        }
        res.json({ playlist_id: id, url: playlistUrl(id), created, songs: uris.length });
    } catch (e) {
        fail(res, e, 'saving the ' + mood + ' playlist to spotify');
    }
};

// ── keeping saved playlists up to date (called from the log controller) ──
// these never hold up or fail the request that triggered them

// a song logged with this mood for the first time goes to the top of the saved playlist
module.exports.songAdded = (userId, songId, mood, spotifyUrl) => {
    (async () => {
        const id = await savedId(userId, mood);
        if (!id) return;
        const rows = await query('SELECT COUNT(*) AS n FROM Log WHERE user_id = ? AND song_id = ? AND mood = ?', [userId, songId, mood]);
        if (Number(rows[0].n) !== 1) return;                     // already in the playlist
        const uri = uriOf(spotifyUrl) || uriOf(songId);
        if (uri) await items(userId, 'post', id, { uris: [uri], position: 0 });
    })().catch((e) => console.error('could not add to saved spotify playlist:', e.status || e.message));
};

// call before deleting a log: if it was the song's last log for that mood, it leaves the saved playlist
module.exports.beforeLogDeleted = (userId, logId) => {
    return query('SELECT song_id, mood, spotify_url FROM Log WHERE id = ? AND user_id = ?', [logId, userId])
        .then((rows) => rows[0] || null)
        .catch(() => null);
};
module.exports.afterLogDeleted = (userId, log) => {
    if (!log) return;
    (async () => {
        const id = await savedId(userId, log.mood);
        if (!id) return;
        const left = await query('SELECT COUNT(*) AS n FROM Log WHERE user_id = ? AND song_id = ? AND mood = ?', [userId, log.song_id, log.mood]);
        if (Number(left[0].n) > 0) return;
        const uri = uriOf(log.spotify_url) || uriOf(log.song_id);
        if (uri) await items(userId, 'delete', id, { items: [{ uri }] }, { tracks: [{ uri }] });
    })().catch((e) => console.error('could not remove from saved spotify playlist:', e.status || e.message));
};
// PUT /api/spotify/playlists/:mood/cover   body: { image: base64 jpeg }
// the same 4-cover picture the app shows, so the playlist looks the same in spotify
module.exports.saveCover = async (req, res) => {
    const userId = res.locals.userId;
    const mood = String(req.params.mood || '').slice(0, 50);
    try {
        const id = await savedId(userId, mood);
        if (!id) return res.status(404).json({ message: 'save this playlist to spotify first' });
        await renameTo(userId, id, mood);
        await uploadCover(userId, id, req.body.image);
        res.json({ ok: true });
    } catch (e) {
        fail(res, e, 'uploading the ' + mood + ' cover');
    }
};