// playlists.js

requireAuth();


// custom moods: remember the emoji each was saved with, so its playlist cover
// shows the matching icon (built-in moods have their own icons)
var customMoodEmoji = {};
// the custom moods that still exist ({ name: id }). a mood you delete takes its
// playlist with it (the songs stay in your history and stats). kept on this device
// too, so the grid is right before the server answers
var CUSTOM_KEY = 'moodtunes_custom_moods_' + (localStorage.getItem('moodtunes_username') || '');
var customMoodIds = null;
try { customMoodIds = JSON.parse(localStorage.getItem(CUSTOM_KEY) || 'null'); } catch (e) {}
apiCall('/moods', 'GET', null, function(err, result) {
    if (err || !result.data) return;
    var customs = Array.isArray(result.data) ? result.data : [];
    customMoodIds = {};
    customs.forEach(function(m) { customMoodEmoji[m.name] = m.emoji; customMoodIds[m.name] = m.id; });
    try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(customMoodIds)); } catch (e) {}
    if (typeof renderPlaylists === 'function' && !playlistIsOpen()) renderPlaylists();
    // redraw empty cover tiles now that we know the icons
    document.querySelectorAll('.playlist-card[data-mood]').forEach(function(card) {
        var mood = card.dataset.mood;
        if (!customMoodEmoji[mood]) return;
        card.querySelectorAll('.playlist-cover-empty').forEach(function(tile) {
            tile.innerHTML = MoodFX.icon(MoodFX.moodIcon(mood, customMoodEmoji[mood]));
        });
    });
});

// ── saved to spotify ───────────────────────────────────
// "save to spotify" makes a private playlist named after the mood (e.g. "chill")
// in your spotify library, with the same 4-cover picture as here. the server keeps
// it up to date when you log or delete songs; reordering here re-saves it, and the
// cover is re-uploaded whenever its top 4 songs change. ▶ opens it in spotify.
var savedSpotify = {};                      // { mood: 'https://open.spotify.com/playlist/…' }
// (playlists you've deleted in spotify don't come back in this list)
apiCall('/spotify/playlists?v=2', 'GET', null, function(err, res) {
    if (err || !res || res.status !== 200 || !res.data) return;
    var list = Array.isArray(res.data) ? res.data : (res.data.playlists || []);
    if (res.data.reconnect) MoodFX.spotifyProblem('reconnect', 'noticing playlists you delete in spotify');
    list.forEach(function(p) { savedSpotify[p.mood] = p.url; });
    markSavedCards();
    if (window.__mtRefreshSaveBtn) window.__mtRefreshSaveBtn();
    syncCovers();
});

// ── the playlist cover in spotify ──────────────────────
// the top 4 album covers (in your order), uploaded when they change
var COVER_KEY = 'moodtunes_cover_' + (localStorage.getItem('moodtunes_username') || '') + '_';
function coverArts(mood, songIds) {
    var byId = {};
    playlistLogs().forEach(function(l) { if (l.mood === mood) byId[l.song_id] = l; });
    var list = songIds
        ? songIds.map(function(id) { return byId[id]; }).filter(Boolean)
        : orderedSongs(mood, Object.keys(byId).map(function(k) { return byId[k]; }));
    return list.slice(0, 4).map(function(x) { return x.album_art || ''; });
}
function coverSig(mood, arts) { return arts.join('|') + '|' + (customMoodEmoji[mood] || '') + '|' + (document.documentElement.getAttribute('data-theme') || ''); }

var coverBusy = {};
function uploadCover(mood, songIds, force) {
    if (!savedSpotify[mood] || coverBusy[mood]) return;
    var arts = coverArts(mood, songIds);
    var sig = coverSig(mood, arts);
    try { if (!force && localStorage.getItem(COVER_KEY + mood) === sig) return; } catch (e) {}
    coverBusy[mood] = true;
    MoodFX.composeCover(arts, mood, customMoodEmoji[mood], function(image) {
        if (!image) { coverBusy[mood] = false; return; }
        apiCall('/spotify/playlists/' + encodeURIComponent(mood) + '/cover', 'PUT', { image: image }, function(err, res) {
            coverBusy[mood] = false;
            if (!err && res && res.status === 200) {
                try { localStorage.setItem(COVER_KEY + mood, sig); } catch (e) {}
                return;
            }
            MoodFX.spotifyProblem(res && res.data && res.data.reason, 'playlist covers');
        });
    });
}
// every saved playlist whose top 4 changed since its cover was last uploaded
function syncCovers() {
    if (latestLogs === null || !ordersKnown || !removedKnown) return;
    Object.keys(savedSpotify).forEach(function(mood) { uploadCover(mood); });
}

function markSavedCards() {
    document.querySelectorAll('.playlist-card[data-mood]').forEach(function(card) {
        var saved = !!savedSpotify[card.dataset.mood];
        var badge = card.querySelector('.pl-in-spotify');
        if (saved && !badge) {
            badge = document.createElement('span');
            badge.className = 'pl-in-spotify';
            badge.title = 'saved in your spotify library';
            badge.textContent = 'in spotify';
            card.appendChild(badge);
        } else if (!saved && badge) badge.remove();
    });
}

// spotify links for a mood's songs, in the given order of song ids
function spotifyUrlsFor(mood, songIds) {
    var byId = {};
    (latestLogs || []).forEach(function(l) { if (l.mood === mood && l.spotify_url) byId[l.song_id] = l.spotify_url; });
    return songIds.map(function(id) { return byId[id] || id; });
}

function saveToSpotify(mood, songIds, quiet, done) {
    apiCall('/spotify/playlists/' + encodeURIComponent(mood), 'PUT', { songs: spotifyUrlsFor(mood, songIds) }, function(err, res) {
        if (err || !res || res.status >= 400) {
            if (!quiet) MoodFX.toast((res && res.data && res.data.message) || 'couldn’t save to spotify, try again');
            return done && done(null);
        }
        var first = !savedSpotify[mood];
        savedSpotify[mood] = res.data.url;
        markSavedCards();
        uploadCover(mood, songIds, !quiet);
        if (!quiet) MoodFX.toast(first ? '“' + mood + '” is now in your spotify library' : 'updated in spotify', mood);
        done && done(res.data.url);
    });
}

// reordering a saved playlist re-saves it (waits a moment so several drags count as one)
var resaveTimers = {};
function resaveIfSaved(mood, songIds) {
    if (!savedSpotify[mood]) return;
    clearTimeout(resaveTimers[mood]);
    resaveTimers[mood] = setTimeout(function() { saveToSpotify(mood, songIds, true); }, 1500);
}

// ── playlist order persistence ─────────────────────────
// the order you arrange songs in is saved to your account (/api/playlists/order),
// so every device shows the same playlist. orders that were only saved on this
// device (the old way) are moved up to your account the first time you open this page
var playlistOrders = {};                    // { mood: [songId, songId, ...] }
var LEGACY_ORDER_PREFIX = 'moodtunes_order_';

function saveOrder(mood, songIds, noResave) {
    playlistOrders[mood] = songIds;
    if (!noResave) resaveIfSaved(mood, songIds);
    apiCacheSet('/playlists/order', playlistOrders);
    apiCall('/playlists/order/' + encodeURIComponent(mood), 'PUT', { song_ids: songIds }, function(err, res) {
        if (err || !res || res.status >= 400) MoodFX.toast('couldn’t sync this order, it will still show on this device');
    });
    try { localStorage.removeItem(LEGACY_ORDER_PREFIX + mood); } catch (e) {}
}

function savedOrderFor(mood) {
    if (playlistOrders[mood]) return playlistOrders[mood];
    // fall back to an order saved on this device before syncing existed
    try {
        var legacy = localStorage.getItem(LEGACY_ORDER_PREFIX + mood);
        return legacy ? JSON.parse(legacy) : null;
    } catch (e) { return null; }
}

// move any device-only orders up to the account (only for moods the account
// doesn't have an order for yet — an order saved from another device wins)
function migrateLegacyOrders() {
    try {
        Object.keys(localStorage).forEach(function(k) {
            if (k.indexOf(LEGACY_ORDER_PREFIX) !== 0) return;
            var mood = k.slice(LEGACY_ORDER_PREFIX.length);
            if (!playlistOrders[mood]) {
                var ids = JSON.parse(localStorage.getItem(k) || 'null');
                if (Array.isArray(ids) && ids.length) saveOrder(mood, ids);
            }
            localStorage.removeItem(k);
        });
    } catch (e) {}
}

// newest additions first. a song's id comes from the first time it was logged
// with this mood, so a higher id means it was added to the playlist more recently
function newestFirst(songs) {
    return songs.slice().sort(function(a, b) { return (b.id || 0) - (a.id || 0); });
}

function applyOrder(mood, songs) {
    var ids = savedOrderFor(mood);
    if (!ids) return songs;
    try {
        var map = {};
        songs.forEach(function(s) { map[s.song_id] = s; });
        var ordered = [];
        ids.forEach(function(id) { if (map[id]) ordered.push(map[id]); });
        // songs added since you last arranged this playlist go to the TOP, so the
        // latest additions show on the cover (they used to be tacked onto the end)
        var added = songs.filter(function(s) { return ids.indexOf(s.song_id) === -1; });
        return added.concat(ordered);
    } catch(e) { return songs; }
}

// the one ordering used everywhere (grid cover, open playlist, big cover):
// your arranged order if you've dragged songs around, newest first otherwise,
// with any new songs on top either way
function orderedSongs(mood, songs) {
    return applyOrder(mood, newestFirst(songs));
}

var playlistsList = document.getElementById('playlists-list');

// ── songs removed from a playlist ──────────────────────
// ✕ takes a song out of this playlist only: its logs (journal history, stats)
// are kept. logging the song again with the same mood puts it back. a playlist
// whose songs are all removed stays, showing its mood icon on all four squares.
var removedSongs = {};                      // { mood: { songId: true } }
var removedKnown = false;

function isRemoved(mood, songId) {
    return !!(removedSongs[mood] && removedSongs[mood][songId]);
}
function setRemoved(mood, songId, on) {
    if (on) (removedSongs[mood] || (removedSongs[mood] = {}))[songId] = true;
    else if (removedSongs[mood]) delete removedSongs[mood][songId];
    // keep the saved copy in step, so the next page load is right straight away
    var out = {};
    Object.keys(removedSongs).forEach(function(m) {
        var ids = Object.keys(removedSongs[m]);
        if (ids.length) out[m] = ids;
    });
    apiCacheSet('/playlists/removed', out);
}
// your logs minus the songs you've taken out of their playlist
function playlistLogs() {
    return (latestLogs || []).filter(function(l) { return !isRemoved(l.mood, l.song_id); });
}
// deletes a playlist by deleting its mood. built-in moods are removed from your
// moods (bring them back any time from manage moods); custom moods are deleted.
// either way there's a few seconds to undo, and the songs stay in history
var pendingDeletes = {};
function deletePlaylist(mood) {
    var builtIn = MoodFX.DEFAULT_MOODS.indexOf(mood) !== -1;
    var id = customMoodIds && customMoodIds[mood];
    if (!builtIn && !id) return MoodFX.toast('couldn’t find that mood, refresh and try again');
    var view = document.getElementById('playlist-view');
    if (view.classList.contains('active')) document.getElementById('back-btn').click();
    pendingDeletes[mood] = true;
    renderPlaylists();
    MoodFX.undoable({
        message: 'deleted “' + mood + '” and its playlist. your songs stay in history', mood: mood,
        hide: function() {},
        restore: function() { delete pendingDeletes[mood]; renderPlaylists(); },
        commit: function() {
            delete pendingDeletes[mood];
            if (builtIn) { MoodFX.hideMood(mood); return; }
            apiCall('/moods/' + id, 'DELETE', null, function(err, res) {
                if (err || !res || res.status >= 400) { MoodFX.toast('couldn’t delete that mood, try again'); return renderPlaylists(); }
                delete customMoodIds[mood];
                try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(customMoodIds)); } catch (e) {}
                renderPlaylists();
            });
        }
    });
}

// the songs currently in a mood's playlist, in playlist order
function playlistSongs(mood) {
    return orderedSongs(mood, playlistLogs().filter(function(l) { return l.mood === mood; }));
}

// every mood you've logged keeps its playlist, even when all its songs are removed
// a mood still exists if it's a built-in one you haven't removed, or a custom one
// you haven't deleted (until the custom list is known, every logged mood counts)
function moodExists(mood) {
    if (MoodFX.DEFAULT_MOODS.indexOf(mood) !== -1) return !MoodFX.isHidden(mood);
    return !customMoodIds || Object.prototype.hasOwnProperty.call(customMoodIds, mood);
}

function groupByMood(logs) {
    var grouped = {};
    logs.forEach(function(log) {
        if (!moodExists(log.mood) || pendingDeletes[log.mood]) return;   // deleted mood: no playlist (songs stay in history)
        if (!grouped[log.mood]) grouped[log.mood] = [];
        if (!isRemoved(log.mood, log.song_id)) grouped[log.mood].push(log);
    });
    return grouped;
}

function buildCoverHTML(songs, mood, size) {
    var moodIconHTML = MoodFX.icon(MoodFX.moodIcon(mood, customMoodEmoji[mood]));
    var html = '<div class="' + (size === 'large' ? 'playlist-header-cover' : 'playlist-cover') + '">';
    for (var i = 0; i < 4; i++) {
        if (songs[i] && songs[i].album_art) {
            html += '<img src="' + MoodFX.esc(songs[i].album_art) + '" alt="" />';
        } else {
            html += '<div class="playlist-cover-empty">' + moodIconHTML + '</div>';
        }
    }
    return html + '</div>';
}

// ── keeping the name readable on light covers ──────────
// the playlist name is always white. how bright the bottom of the cover is
// (where the name sits) decides how dark the shade behind the name gets, and
// very light covers are dimmed a little too
var lumCache = {};
function imageLum(url, cb) {
    if (Object.prototype.hasOwnProperty.call(lumCache, url)) return cb(lumCache[url]);
    var im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = function() {
        var v = null;
        try {
            var c = document.createElement('canvas');
            c.width = c.height = 12;
            var x = c.getContext('2d');
            x.drawImage(im, 0, 0, 12, 12);
            var d = x.getImageData(0, 0, 12, 12).data, sum = 0;
            for (var i = 0; i < d.length; i += 4) sum += (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
            v = sum / (d.length / 4);
        } catch (e) { v = null; }            // the image wouldn't let itself be read
        lumCache[url] = v;
        cb(v);
    };
    im.onerror = function() { lumCache[url] = null; cb(null); };
    im.src = url;
}
function colorLum(css) {
    var m = /rgba?\(([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:[ ,/]+([\d.]+))?/.exec(css || '');
    if (!m || (m[4] !== undefined && Number(m[4]) < 0.2)) return null;
    return (0.2126 * m[1] + 0.7152 * m[2] + 0.0722 * m[3]) / 255;
}
function shadeCard(card) {
    var cover = card.querySelector('.playlist-cover');
    if (!cover) return;
    var tiles = [cover.children[2], cover.children[3]].filter(Boolean);   // the bottom row, behind the name
    var vals = [], left = tiles.length;
    function apply() {
        var known = vals.filter(function(v) { return v !== null; });
        var lum = known.length ? known.reduce(function(a, b) { return a + b; }, 0) / known.length : 0.6;
        var shade = Math.max(0, Math.min(1, (lum - 0.3) / 0.4));          // 0 = dark cover, 1 = very light
        card.style.setProperty('--pl-a1', (0.25 + 0.4 * shade).toFixed(2));
        card.style.setProperty('--pl-a2', (0.62 + 0.3 * shade).toFixed(2));
        card.style.setProperty('--pl-dim', (1 - 0.22 * shade).toFixed(2));
    }
    if (!left) return apply();
    tiles.forEach(function(t) {
        if (t.tagName === 'IMG') {
            imageLum(t.currentSrc || t.src, function(v) { vals.push(v); if (--left === 0) apply(); });
        } else {
            vals.push(colorLum(getComputedStyle(t).backgroundColor));
            if (--left === 0) apply();
        }
    });
}

// ── grid view ──────────────────────────────────────────
function renderGrid(grouped) {
    playlistsList.innerHTML =
        '<div class="playlist-grid-view" id="grid-view">' +
            '<div class="playlist-grid" id="playlist-grid"></div>' +
        '</div>' +
        '<div class="playlist-view" id="playlist-view"></div>';

    var grid = document.getElementById('playlist-grid');

    Object.keys(grouped).forEach(function(mood) {
        var sorted = orderedSongs(mood, grouped[mood]);
        var card = document.createElement('div');
        card.classList.add('playlist-card');
        card.dataset.mood = mood;
        card.innerHTML =
            buildCoverHTML(sorted, mood, 'small') +
            '<div class="playlist-card-title">' + MoodFX.esc(mood) + '</div>';
        card.addEventListener('click', function() { openPlaylist(mood); });
        grid.appendChild(card);
        shadeCard(card);
    });
    markSavedCards();
}

// redraw a playlist's covers (grid card + open header) and its song count
function refreshPlaylistBits(mood) {
    var songs = playlistSongs(mood);
    var gridCard = document.querySelector('.playlist-card[data-mood="' + CSS.escape(mood) + '"]');
    if (gridCard) {
        var oldCover = gridCard.querySelector('.playlist-cover');
        if (oldCover) {
            var tmp = document.createElement('div');
            tmp.innerHTML = buildCoverHTML(songs, mood, 'small');
            gridCard.replaceChild(tmp.firstChild, oldCover);
            shadeCard(gridCard);
        }
    }
    var view = document.getElementById('playlist-view');
    if (view && view.classList.contains('active') && view.dataset.mood === mood) {
        var wrap = document.getElementById('playlist-cover-wrap');
        if (wrap) wrap.innerHTML = buildCoverHTML(songs, mood, 'large');
        var count = document.getElementById('pl-count');
        if (count) count.textContent = songs.length + ' song' + (songs.length !== 1 ? 's' : '') + ' from your journal';
        var empty = document.getElementById('pl-empty-note');
        if (empty) empty.hidden = songs.length > 0;
    }
    uploadCover(mood, songs.map(function(s) { return s.song_id; }));
}

// ── open a playlist ────────────────────────────────────
function openPlaylist(mood) {
    document.getElementById('grid-view').classList.add('hidden');
    var view = document.getElementById('playlist-view');
    view.classList.add('active');
    view.dataset.mood = mood;

    // same order as the grid card, so both covers always match
    var listSongs = playlistSongs(mood);

    view.innerHTML =
        '<button class="back-btn" id="back-btn">← back to playlists</button>' +
        '<div class="playlist-view-header">' +
            '<div id="playlist-cover-wrap">' + buildCoverHTML(listSongs, mood, 'large') + '</div>' +
            '<div class="playlist-view-info">' +
                '<div class="playlist-view-title">' + MoodFX.esc(mood) + '</div>' +
                '<div class="playlist-view-count" id="pl-count">' + listSongs.length + ' song' + (listSongs.length !== 1 ? 's' : '') + ' from your journal</div>' +
                '<div class="playlist-view-hint">new songs go to the top, and you can drag to reorder. the cover shows the top 4. ✕ takes a song out of this playlist but keeps it in your history.</div>' +
                '<button type="button" class="pl-save-btn" id="pl-save-btn"></button>' +
                '<button type="button" class="pl-delete-btn" id="pl-delete-btn" title="deletes this mood and its playlist. your songs stay in your history and stats">delete playlist</button>' +
            '</div>' +
            '<button class="playlist-play-btn" id="sync-btn" title="play in spotify" style="border:none;cursor:pointer;">▶</button>' +
        '</div>' +
        '<p class="pl-empty-note" id="pl-empty-note"' + (listSongs.length ? ' hidden' : '') + '>no songs in this playlist right now. log a song with this mood and it’ll show up here.</p>' +
        '<div class="playlist-block" id="playlist-block"></div>';

    var block = document.getElementById('playlist-block');

    listSongs.forEach(function(song) {
        var card = document.createElement('div');
        card.classList.add('log-card', 'draggable-card');
        card.id = 'log-' + song.song_id + '-' + mood;
        card.dataset.songId = song.song_id;
        card.dataset.albumArt = song.album_art;
        card.innerHTML =
            '<div class="drag-handle" title="drag to reorder" tabindex="0" role="button" aria-label="move ' + MoodFX.esc(song.title) + ', use the up and down arrow keys">⠿</div>' +
            '<img class="song-art" src="' + MoodFX.esc(song.album_art) + '" alt="" draggable="false" />' +
            '<div class="song-info">' +
                songTitleHTML(song.title) +
                '<div class="song-artist">' + MoodFX.esc(song.artist) + '</div>' +
                noteLineHTML(song.note, 'pl-note-text-' + song.song_id + '-' + mood,
                    '<div class="log-note-area" id="pl-note-area-' + song.song_id + '-' + MoodFX.esc(mood) + '">' +
                        (song.note
                            ? '<button class="edit-note-btn" data-song-id="' + song.song_id + '" data-mood="' + MoodFX.esc(mood) + '" data-note="' + MoodFX.esc(song.note) + '" data-source="playlist">edit note</button>'
                            : '<button class="add-note-btn" data-song-id="' + song.song_id + '" data-mood="' + MoodFX.esc(mood) + '" data-source="playlist">+ add note</button>') +
                    '</div>') +
                '<div class="log-meta">' +
                    '<span class="mood-badge">' + MoodFX.esc(song.mood) + '</span>' +
                    '<span class="plays-text">' + playsLabel(song.play_count) + '</span>' +
                    '<span class="date-text">' + formatTimestamp(song.last_logged) + '</span>' +
                '</div>' +
            '</div>' +
            '<button class="play-btn song-play-btn" data-url="' + MoodFX.esc(song.spotify_url) + '" data-song-id="' + MoodFX.esc(song.song_id) + '" data-mood="' + MoodFX.esc(mood) + '">▶</button>' +
            '<button class="delete-btn playlist-remove-btn" data-songid="' + MoodFX.esc(song.song_id) + '" data-mood="' + MoodFX.esc(mood) + '" title="remove from this playlist (stays in your history)" aria-label="remove from this playlist">✕</button>';
        block.appendChild(card);
    });

    enableReorder(block, mood);

    document.getElementById('back-btn').addEventListener('click', function() {
        view.classList.remove('active');
        view.dataset.mood = '';
        document.getElementById('grid-view').classList.remove('hidden');
    });

    // delete: the playlist is the mood, so this deletes the mood (with undo).
    // your songs stay in history and stats; a copy saved in spotify stays there
    document.getElementById('pl-delete-btn').addEventListener('click', function() {
        deletePlaylist(mood);
    });

    // save / update in spotify
    var saveBtn = document.getElementById('pl-save-btn');
    function refreshSaveBtn() {
        var saved = !!savedSpotify[mood];
        saveBtn.classList.toggle('saved', saved);
        saveBtn.innerHTML = saved ? 'in your spotify library, <u>update it</u>' : 'save to spotify';
        saveBtn.title = saved ? 'it updates by itself when you log songs, tap to re-save it now' : 'add this playlist to your spotify library';
    }
    window.__mtRefreshSaveBtn = refreshSaveBtn;
    refreshSaveBtn();
    saveBtn.addEventListener('click', function() {
        if (saveBtn.disabled) return;
        saveBtn.disabled = true;
        saveBtn.textContent = 'saving…';
        saveToSpotify(mood, visibleIds(block), false, function() { saveBtn.disabled = false; refreshSaveBtn(); });
    });

    // ▶ plays the whole playlist in spotify (saving it there first if needed)
    document.getElementById('sync-btn').addEventListener('click', function() {
        if (savedSpotify[mood]) return openSpotify(savedSpotify[mood]);
        var btn = this;
        btn.disabled = true;
        saveToSpotify(mood, visibleIds(block), false, function(url) {
            btn.disabled = false;
            refreshSaveBtn();
            if (url) openSpotify(url);
        });
    });
}

// the song cards still showing in an open playlist, top to bottom
function visibleCards(block) {
    return Array.prototype.filter.call(block.children, function(c) {
        return c.classList.contains('draggable-card') && !c.classList.contains('pl-gone');
    });
}
function visibleIds(block) {
    return visibleCards(block).map(function(c) { return c.dataset.songId; });
}

// ── smooth moving ──────────────────────────────────────
// FLIP: note where each card is on screen, change the order, then let each card
// glide from its old spot to its new one instead of jumping
var EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
function setImp(el, prop, val) {
    if (val === '') el.style.removeProperty(prop);
    else el.style.setProperty(prop, val, 'important');     // beats the hover rules that pin transform
}
function flip(els, change, ms) {
    var first = els.map(function(el) { return el.getBoundingClientRect().top; });
    change();
    if (MoodFX.reduceMotion) return;
    els.forEach(function(el) { setImp(el, 'transition', 'none'); setImp(el, 'transform', ''); });
    var last = els.map(function(el) { return el.getBoundingClientRect().top; });
    els.forEach(function(el, i) {
        var d = first[i] - last[i];
        if (d) setImp(el, 'transform', 'translate3d(0,' + d + 'px,0)');
    });
    void document.body.offsetHeight;
    els.forEach(function(el) {
        setImp(el, 'transition', 'transform ' + (ms || 240) + 'ms ' + EASE);
        setImp(el, 'transform', 'translate3d(0,0,0)');
        clearTimeout(el._flipT);
        el._flipT = setTimeout(function() {
            if (el.classList.contains('pl-lifted')) return;
            setImp(el, 'transition', ''); setImp(el, 'transform', '');
        }, (ms || 240) + 40);
    });
}

// ── reordering: the whole card follows your finger / mouse ─
// mouse: grab a card anywhere (not on its buttons). touch: hold the ⠿ handle,
// so the page still scrolls normally. the other cards slide out of the way, and
// the card glides into its slot when you let go. keyboard: arrows on the handle.
function enableReorder(block, mood) {
    var drag = null;
    var scrollRaf = 0;

    function finishReorder() {
        saveOrder(mood, visibleIds(block));
        refreshPlaylistBits(mood);
    }

    block.addEventListener('pointerdown', function(e) {
        if (drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
        var card = e.target.closest('.draggable-card');
        if (!card || card.classList.contains('pl-gone')) return;
        var onHandle = !!e.target.closest('.drag-handle');
        if (e.pointerType !== 'mouse' && !onHandle) return;
        // (a mouse can grab the card anywhere except its buttons, a note being edited, or a note you tap to read)
        if (!onHandle && e.target.closest('button, a, input, textarea, select, .log-note:not([hidden])')) return;
        drag = {
            card: card, id: e.pointerId, startY: e.clientY, y: e.clientY,
            startScroll: window.scrollY, startTop: card.offsetTop, active: false
        };
        if (onHandle) { e.preventDefault(); start(); }
    });

    function start() {
        drag.active = true;
        drag.startTop = drag.card.offsetTop;
        drag.card.classList.add('pl-lifted');
        document.body.classList.add('pl-reordering');
        setImp(drag.card, 'transition', 'box-shadow 0.2s');
        try { window.getSelection().removeAllRanges(); } catch (e) {}
        tickScroll();
    }

    function place() {
        var card = drag.card;
        var moved = drag.y - drag.startY + (window.scrollY - drag.startScroll);
        var top = drag.startTop + moved;                       // where the card should be drawn
        var middle = top + card.offsetHeight / 2;
        var others = visibleCards(block).filter(function(c) { return c !== card; });
        var before = null;
        for (var i = 0; i < others.length; i++) {
            if (middle < others[i].offsetTop + others[i].offsetHeight / 2) { before = others[i]; break; }
        }
        var list = visibleCards(block);
        var next = list[list.indexOf(card) + 1] || null;
        if (before !== next) {
            flip(others, function() {
                if (before) block.insertBefore(card, before);
                else block.appendChild(card);
            });
        }
        setImp(card, 'transform', 'translate3d(0,' + (top - card.offsetTop) + 'px,0) scale(1.02)');
    }

    // near the top or bottom of the screen: scroll so you can drag further
    function tickScroll() {
        cancelAnimationFrame(scrollRaf);
        scrollRaf = requestAnimationFrame(function step() {
            if (!drag || !drag.active) return;
            var edge = 80, bottomEdge = window.innerHeight - (window.innerWidth <= 768 ? 150 : 80);
            var speed = 0;
            if (drag.y < edge) speed = -Math.ceil((edge - drag.y) / 6);
            else if (drag.y > bottomEdge) speed = Math.ceil((drag.y - bottomEdge) / 6);
            if (speed) { window.scrollBy(0, Math.max(-18, Math.min(18, speed))); place(); }
            scrollRaf = requestAnimationFrame(step);
        });
    }

    window.addEventListener('pointermove', function(e) {
        if (!drag || e.pointerId !== drag.id) return;
        drag.y = e.clientY;
        if (!drag.active) {
            if (Math.abs(e.clientY - drag.startY) < 6) return;
            start();
        }
        e.preventDefault();
        place();
    }, { passive: false });

    function end(e) {
        if (!drag || (e && e.pointerId !== drag.id)) return;
        var d = drag;
        drag = null;
        cancelAnimationFrame(scrollRaf);
        if (!d.active) return;
        var card = d.card;
        document.body.classList.remove('pl-reordering');
        // glide into its slot
        setImp(card, 'transition', 'transform 220ms ' + EASE + ', box-shadow 0.2s');
        setImp(card, 'transform', 'translate3d(0,0,0)');
        setTimeout(function() {
            card.classList.remove('pl-lifted');
            setImp(card, 'transition', ''); setImp(card, 'transform', '');
        }, 240);
        // a drag isn't a click on whatever was under the pointer
        var swallow = function(ev) { ev.stopPropagation(); ev.preventDefault(); };
        window.addEventListener('click', swallow, true);
        setTimeout(function() { window.removeEventListener('click', swallow, true); }, 0);
        finishReorder();
    }
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);

    // keyboard: arrow keys on the ⠿ handle move the song up or down
    block.addEventListener('keydown', function(e) {
        if (!e.target.classList.contains('drag-handle')) return;
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        e.preventDefault();
        var card = e.target.closest('.draggable-card');
        var list = visibleCards(block);
        var i = list.indexOf(card);
        var j = e.key === 'ArrowUp' ? i - 1 : i + 1;
        if (i < 0 || j < 0 || j >= list.length) return;
        flip(list, function() {
            if (e.key === 'ArrowUp') block.insertBefore(card, list[j]);
            else block.insertBefore(card, list[j].nextSibling);
        });
        e.target.focus();
        finishReorder();
    });
}

// ── song play buttons ──────────────────────────────────
// a play counts once the song is opened in spotify; the card's total goes up by one
function playFromPlaylist(url, songId, mood) {
    openSpotify(url, { onOpen: function() {
        recordPlay(songId, mood, function(ok) {
            if (!ok) { MoodFX.toast('couldn’t count that play, try again'); return; }
            var card = document.getElementById('log-' + songId + '-' + mood);
            var label = card && card.querySelector('.plays-text');
            if (label) {
                var n = (parseInt(label.textContent, 10) || 0) + 1;
                label.textContent = playsLabel(n);
            }
        });
    } });
}

document.addEventListener('click', function(e) {
    if (e.target.classList.contains('song-play-btn')) {
        e.stopPropagation();
        playFromPlaylist(e.target.dataset.url, e.target.dataset.songId, e.target.dataset.mood);
    }
});

// ── inline note editor ─────────────────────────────────
function showInlineNotePlaylist(songId, mood, existingNote) {
    var area = document.getElementById('pl-note-area-' + songId + '-' + mood);
    if (!area) return;
    area.innerHTML =
        '<textarea class="note-textarea" id="pl-inline-note-' + songId + '" style="margin-top:8px;" placeholder="what does this song mean to you right now...">' + MoodFX.esc(existingNote || '') + '</textarea>' +
        '<div class="note-btn-row">' +
            '<button class="skip-note-btn" id="pl-cancel-' + songId + '">cancel</button>' +
            '<button class="save-note-btn" id="pl-save-' + songId + '">save</button>' +
        '</div>';

    document.getElementById('pl-save-' + songId).addEventListener('click', function() {
        var note = document.getElementById('pl-inline-note-' + songId).value.trim();
        apiCall('/logs/latest/' + songId + '/' + mood, 'PUT', { note: note }, function() {
            setTitleNote('pl-note-text-' + songId + '-' + mood, note);
            area.innerHTML = note
                ? '<button class="edit-note-btn" data-song-id="' + songId + '" data-mood="' + MoodFX.esc(mood) + '" data-note="' + MoodFX.esc(note) + '" data-source="playlist">edit note</button>'
                : '<button class="add-note-btn" data-song-id="' + songId + '" data-mood="' + MoodFX.esc(mood) + '" data-source="playlist">+ add note</button>';
        });
    });

    document.getElementById('pl-cancel-' + songId).addEventListener('click', function() {
        area.innerHTML = existingNote
            ? '<button class="edit-note-btn" data-song-id="' + songId + '" data-mood="' + MoodFX.esc(mood) + '" data-note="' + MoodFX.esc(existingNote) + '" data-source="playlist">edit note</button>'
            : '<button class="add-note-btn" data-song-id="' + songId + '" data-mood="' + MoodFX.esc(mood) + '" data-source="playlist">+ add note</button>';
    });
}

document.addEventListener('click', function(e) {
    if ((e.target.classList.contains('add-note-btn') || e.target.classList.contains('edit-note-btn')) && e.target.dataset.source === 'playlist') {
        showInlineNotePlaylist(e.target.dataset.songId, e.target.dataset.mood, e.target.dataset.note || '');
    }
});

// ── ✕ remove a song from the playlist ──────────────────
// the card slides away and the songs below move up; "undo" brings it back.
// after 5 seconds it's saved. the song's logs and history aren't touched.
function hideCard(card, block) {
    var below = visibleCards(block).filter(function(c) {
        return c !== card && (card.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    card.classList.add('pl-gone');
    var done = function() { flip(below, function() { card.style.display = 'none'; }, 260); };
    if (MoodFX.reduceMotion || !card.animate) return done();
    var a = card.animate([
        { opacity: 1, transform: 'translateX(0)' },
        { opacity: 0, transform: 'translateX(24px)' }
    ], { duration: 180, easing: 'ease-in', fill: 'forwards' });
    a.onfinish = function() { done(); a.cancel(); };
}
function showCard(card, block) {
    if (!card.isConnected) return;
    var below = visibleCards(block).filter(function(c) {
        return card.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING;
    });
    card.classList.remove('pl-gone');
    flip(below, function() { card.style.display = ''; }, 260);
    if (!MoodFX.reduceMotion && card.animate) {
        card.animate([{ opacity: 0, transform: 'translateX(24px)' }, { opacity: 1, transform: 'translateX(0)' }],
            { duration: 220, easing: EASE });
    }
}

document.addEventListener('click', function(e) {
    var btn = e.target.closest && e.target.closest('.playlist-remove-btn');
    if (!btn) return;
    e.stopPropagation();
    var songId = btn.dataset.songid, mood = btn.dataset.mood;
    var card = btn.closest('.draggable-card');
    var block = document.getElementById('playlist-block');
    if (!card || !block || card.classList.contains('pl-gone')) return;
    var title = (card.querySelector('.song-title') || {}).textContent || 'song';

    MoodFX.undoable({
        message: 'removed from ' + mood, mood: mood,
        hide: function() {
            setRemoved(mood, songId, true);
            hideCard(card, block);
            refreshPlaylistBits(mood);
        },
        restore: function() {
            setRemoved(mood, songId, false);
            showCard(card, block);
            refreshPlaylistBits(mood);
        },
        commit: function() {
            apiCall('/playlists/removed', 'POST', { mood: mood, song_id: songId }, function(err, res) {
                if (err || !res || res.status >= 400) {
                    MoodFX.toast('couldn’t remove “' + title.trim() + '”, try again', mood);
                    setRemoved(mood, songId, false);
                    showCard(card, block);
                    refreshPlaylistBits(mood);
                    return;
                }
                // drop it from the saved order too, so if you log it again it comes back at the top.
                // (the server already took it out of the spotify copy)
                if (playlistOrders[mood]) {
                    saveOrder(mood, playlistOrders[mood].filter(function(id) { return id !== songId; }), true);
                }
                if (card.isConnected) card.remove();
            });
        }
    });
});

var _lb = document.getElementById('logout-btn'); if (_lb) _lb.addEventListener('click', logout);

// ── boot ───────────────────────────────────────────────
// the grid needs your songs, your saved orders and the songs you've removed; it
// draws as soon as all three are known (instantly from saved data when available)
// and quietly redraws when fresher data arrives — unless you've opened a playlist
var latestLogs = null;
var ordersKnown = false;
var logsError = false;

function renderPlaylists() {
    if (logsError) {
        playlistsList.innerHTML = MoodFX.emptyState({ art: 'offline', title: 'couldn’t load your playlists', text: 'check your connection and try again', action: { label: 'try again', reload: true } });
        return;
    }
    if (latestLogs === null || !ordersKnown) return;
    if (latestLogs.length === 0) {
        playlistsList.innerHTML = MoodFX.emptyState({ title: 'no playlists yet', text: 'every mood gets its own playlist as soon as you log a song with it', action: { label: 'log your first song', href: 'index.html' } });
        return;
    }
    var grouped = groupByMood(latestLogs);
    if (!Object.keys(grouped).length) {
        playlistsList.innerHTML = MoodFX.emptyState({ title: 'no playlists right now', text: 'the moods you logged songs with have been deleted. log a song with one of your moods and its playlist appears here', action: { label: 'go to journal', href: 'index.html' } });
        return;
    }
    renderGrid(grouped);
    syncCovers();
}

function playlistIsOpen() {
    var openView = document.getElementById('playlist-view');
    return !!(openView && openView.classList.contains('active'));
}

playlistsList.innerHTML = MoodFX.skeleton('rows', 4);

// repeats from a loop were just counted: refresh the totals
window.addEventListener('moodtunes:plays-updated', function(e) {
    var d = e.detail || {};
    if (playlistIsOpen()) {
        var label = document.querySelector('#log-' + CSS.escape(d.song_id + '-' + d.mood) + ' .plays-text');
        if (label) label.textContent = playsLabel((parseInt(label.textContent, 10) || 0) + (d.added || 0));
        return;
    }
    apiCall('/logs', 'GET', null, function(err, result) {
        if (err || !result || result.status !== 200 || !Array.isArray(result.data)) return;
        latestLogs = result.data;
        apiCacheSet('/logs', latestLogs);
        window.__mtQuietUntil = performance.now() + 100;
        renderPlaylists();
    });
});

apiCallCached('/playlists/order', function(err, result, fromCache) {
    if (!err && result && result.status === 200 && result.data && typeof result.data === 'object' && !Array.isArray(result.data)) {
        playlistOrders = result.data;
        if (!fromCache) migrateLegacyOrders();   // only against the account's real, current orders
    }
    // an older backend without this route: fall back to orders saved on this device
    var wasKnown = ordersKnown;
    ordersKnown = true;
    if (!wasKnown || !playlistIsOpen()) renderPlaylists();
});

apiCallCached('/playlists/removed', function(err, result, fromCache) {
    if (!err && result && result.status === 200 && result.data && typeof result.data === 'object' && !Array.isArray(result.data)) {
        var next = {};
        Object.keys(result.data).forEach(function(m) {
            next[m] = {};
            (result.data[m] || []).forEach(function(id) { next[m][id] = true; });
        });
        removedSongs = next;
    }
    // an older backend without this route: nothing has been removed
    var wasKnown = removedKnown;
    removedKnown = true;
    if (!wasKnown || !playlistIsOpen()) renderPlaylists();
});

apiCallCached('/logs', function(err, result, fromCache) {
    // don't yank someone out of a playlist they've already opened
    if (!fromCache && playlistIsOpen()) return;
    if (err) { logsError = latestLogs === null; renderPlaylists(); return; }
    logsError = false;
    latestLogs = Array.isArray(result.data) ? result.data : [];
    renderPlaylists();
});

// a mood was deleted, removed or brought back (here, on another page, or synced from
// the server): its playlist goes or comes back with it
window.addEventListener('moodtunes:moods-changed', function() { if (!playlistIsOpen()) renderPlaylists(); });