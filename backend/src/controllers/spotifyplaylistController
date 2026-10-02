const axios = require('axios');
const pool = require('../services/db');
const spotify = require('./spotifyController');

// ── mood playlists saved to your spotify library ────────
// "save to spotify" on a playlist creates a private playlist called
// "moodtunes — <mood>" in your spotify account (or updates the one it made
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
        made = await call(userId, 'post', '/me/playlists', {
            name: 'moodtunes — ' + mood,
            description: 'your ' + mood + ' playlist, kept up to date by moodtunes',
            public: false
        });
    } catch (e) {
        if (e.status !== 404 && e.status !== 405) throw e;
        const me = await call(userId, 'get', '/me');
        made = await call(userId, 'post', '/users/' + encodeURIComponent(me.id) + '/playlists', {
            name: 'moodtunes — ' + mood, description: 'your ' + mood + ' playlist, kept up to date by moodtunes', public: false
        });
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

const playlistUrl = (id) => 'https://open.spotify.com/playlist/' + id;

function fail(res, e, what) {
    if (e.status === 401) return res.status(401).json({ message: 'connect spotify first' });
    if (e.status === 403) return res.status(403).json({ message: 'spotify didn’t allow this — try disconnecting and reconnecting spotify' });
    console.error(what + ' failed:', e.status || '', e.response ? JSON.stringify(e.response.data) : e.message);
    res.status(502).json({ message: 'spotify didn’t respond — try again in a moment' });
}

// GET /api/spotify/playlists → [{ mood, playlist_id, url }]
module.exports.listSaved = async (req, res) => {
    try {
        const rows = await query('SELECT mood, playlist_id FROM SpotifyPlaylist WHERE user_id = ?', [res.locals.userId]);
        res.json(rows.map((r) => ({ mood: r.mood, playlist_id: r.playlist_id, url: playlistUrl(r.playlist_id) })));
    } catch (e) {
        res.json([]);
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