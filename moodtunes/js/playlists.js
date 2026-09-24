// playlists.js

requireAuth();

var moodEmojis = { happy: '😊', sad: '😢', hype: '🔥', heartbreak: '💔', nostalgic: '🌙', focused: '🎯', chill: '😌' };

// merge custom mood emojis on load
apiCall('/moods', 'GET', null, function(err, result) {
    if (err || !result.data) return;
    var customs = Array.isArray(result.data) ? result.data : [];
    customs.forEach(function(m) { moodEmojis[m.name] = m.emoji; });
});

// ── playlist order persistence ─────────────────────────
// the order you arrange songs in is saved to your account (/api/playlists/order),
// so every device shows the same playlist. orders that were only saved on this
// device (the old way) are moved up to your account the first time you open this page
var playlistOrders = {};                    // { mood: [songId, songId, ...] }
var LEGACY_ORDER_PREFIX = 'moodtunes_order_';

function saveOrder(mood, songIds) {
    playlistOrders[mood] = songIds;
    apiCacheSet('/playlists/order', playlistOrders);
    apiCall('/playlists/order/' + encodeURIComponent(mood), 'PUT', { song_ids: songIds }, function(err, res) {
        if (err || !res || res.status >= 400) MoodFX.toast('couldn’t sync this order — it will still show on this device');
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

function groupByMood(logs) {
    var grouped = {};
    logs.forEach(function(log) {
        if (!grouped[log.mood]) grouped[log.mood] = [];
        grouped[log.mood].push(log);
    });
    return grouped;
}

function buildCoverHTML(songs, mood, size) {
    var emoji = moodEmojis[mood] || '🎵';
    var html = '<div class="' + (size === 'large' ? 'playlist-header-cover' : 'playlist-cover') + '">';
    for (var i = 0; i < 4; i++) {
        if (songs[i] && songs[i].album_art) {
            html += '<img src="' + songs[i].album_art + '" alt="album art" />';
        } else {
            html += '<div class="playlist-cover-empty">' + emoji + '</div>';
        }
    }
    return html + '</div>';
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
        var songs = grouped[mood];
        var sorted = orderedSongs(mood, songs);
        var card = document.createElement('div');
        card.classList.add('playlist-card');
        card.dataset.mood = mood;
        card.innerHTML =
            buildCoverHTML(sorted, mood, 'small') +
            '<div class="playlist-card-title">' + MoodFX.esc(mood) + ' playlist</div>' +
            '<div class="playlist-card-count">' + songs.length + ' song' + (songs.length !== 1 ? 's' : '') + '</div>';
        card.addEventListener('click', (function(m, s) {
            return function() { openPlaylist(m, s); };
        })(mood, sorted));
        grid.appendChild(card);
    });
}

// ── open a playlist ────────────────────────────────────
function openPlaylist(mood, songs) {
    document.getElementById('grid-view').classList.add('hidden');
    var view = document.getElementById('playlist-view');
    view.classList.add('active');

    // same order as the grid card, so both covers always match
    var listSongs = orderedSongs(mood, songs);

    view.innerHTML =
        '<button class="back-btn" id="back-btn">← back to playlists</button>' +
        '<div class="playlist-view-header">' +
            '<div id="playlist-cover-wrap">' + buildCoverHTML(listSongs, mood, 'large') + '</div>' +
            '<div class="playlist-view-info">' +
                '<div class="playlist-view-title">' + MoodFX.esc(mood) + ' playlist</div>' +
                '<div class="playlist-view-count">' + songs.length + ' song' + (songs.length !== 1 ? 's' : '') + ' · built from your journal</div>' +
                '<div style="font-size:12px;color:#555;margin-top:4px;">new songs go to the top · drag to reorder · cover shows the top 4</div>' +
            '</div>' +
            '<button class="playlist-play-btn" id="sync-btn" style="border:none;cursor:pointer;">▶</button>' +
        '</div>' +
        '<div class="playlist-block" id="playlist-block"></div>';

    var block = document.getElementById('playlist-block');
    var songMap = {};

    listSongs.forEach(function(song) {
        songMap[song.song_id] = song;
        var card = document.createElement('div');
        card.classList.add('log-card', 'draggable-card');
        card.id = 'log-' + song.song_id + '-' + mood;
        card.dataset.songId = song.song_id;
        card.dataset.albumArt = song.album_art;
        card.draggable = true;
        card.innerHTML =
            '<div class="drag-handle" title="drag to reorder">⠿</div>' +
            '<img class="song-art" src="' + MoodFX.esc(song.album_art) + '" alt="album art" />' +
            '<div class="song-info">' +
                '<div class="song-title">' + MoodFX.esc(song.title) + '</div>' +
                '<div class="song-artist">' + MoodFX.esc(song.artist) + '</div>' +
                '<div class="log-note-area" id="pl-note-area-' + song.song_id + '-' + MoodFX.esc(mood) + '">' +
                    (song.note
                        ? '<div class="log-note">"' + MoodFX.esc(song.note) + '"</div><button class="edit-note-btn" data-song-id="' + song.song_id + '" data-mood="' + MoodFX.esc(mood) + '" data-note="' + MoodFX.esc(song.note) + '" data-source="playlist">edit note</button>'
                        : '<button class="add-note-btn" data-song-id="' + song.song_id + '" data-mood="' + MoodFX.esc(mood) + '" data-source="playlist">+ add note</button>') +
                '</div>' +
                '<div class="log-meta">' +
                    '<span class="mood-badge">' + MoodFX.esc(song.mood) + '</span>' +
                    '<span class="plays-text">' + song.play_count + ' play' + (song.play_count !== 1 ? 's' : '') + '</span>' +
                    '<span class="date-text">' + formatTimestamp(song.last_logged) + '</span>' +
                '</div>' +
            '</div>' +
            '<button class="play-btn song-play-btn" data-url="' + MoodFX.esc(song.spotify_url) + '">▶</button>' +
            '<button class="delete-btn playlist-remove-btn" data-songid="' + song.song_id + '" data-mood="' + MoodFX.esc(mood) + '" title="remove from view">✕</button>';
        block.appendChild(card);
    });

    // ── drag and drop ──────────────────────────────────
    var dragging = null;

    function finishReorder() {
        if (dragging) dragging.classList.remove('dragging');
        dragging = null;
        document.querySelectorAll('.drag-over').forEach(function(el) { el.classList.remove('drag-over'); });
        var cards = block.querySelectorAll('.draggable-card');
        var orderedIds = [];
        var top4 = [];
        cards.forEach(function(c, i) {
            orderedIds.push(c.dataset.songId);
            if (i < 4) top4.push({ album_art: c.dataset.albumArt || '' });
        });
        saveOrder(mood, orderedIds);
        document.getElementById('playlist-cover-wrap').innerHTML = buildCoverHTML(top4, mood, 'large');
        var gridCard = document.querySelector('.playlist-card[data-mood="' + CSS.escape(mood) + '"]');
        if (gridCard) {
            var oldCover = gridCard.querySelector('.playlist-cover');
            if (oldCover) {
                var tmp = document.createElement('div');
                tmp.innerHTML = buildCoverHTML(top4, mood, 'small');
                gridCard.replaceChild(tmp.firstChild, oldCover);
            }
        }
    }

    // ── mouse / desktop drag ───────────────────────────
    block.addEventListener('dragstart', function(e) {
        dragging = e.target.closest('.draggable-card');
        if (!dragging) return;
        dragging.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
    });

    block.addEventListener('dragover', function(e) {
        e.preventDefault();
        if (!dragging) return;
        var target = e.target.closest('.draggable-card');
        if (!target || target === dragging) return;
        document.querySelectorAll('.drag-over').forEach(function(el) { el.classList.remove('drag-over'); });
        target.classList.add('drag-over');
        var rect = target.getBoundingClientRect();
        if (e.clientY < rect.top + rect.height / 2) {
            block.insertBefore(dragging, target);
        } else {
            block.insertBefore(dragging, target.nextSibling);
        }
    });

    block.addEventListener('dragend', finishReorder);

    // ── touch / mobile drag ────────────────────────────
    var touchClone = null;
    var touchOffsetX = 0;
    var touchOffsetY = 0;

    block.addEventListener('touchstart', function(e) {
        var handle = e.target.closest('.drag-handle');
        if (!handle) return;
        dragging = handle.closest('.draggable-card');
        if (!dragging) return;
        e.preventDefault();
        dragging.classList.add('dragging');

        var touch = e.touches[0];
        var rect = dragging.getBoundingClientRect();
        touchOffsetX = touch.clientX - rect.left;
        touchOffsetY = touch.clientY - rect.top;

        touchClone = dragging.cloneNode(true);
        touchClone.style.cssText = 'position:fixed;z-index:9999;pointer-events:none;opacity:0.85;width:' + rect.width + 'px;box-shadow:0 8px 24px rgba(0,0,0,0.5);border-radius:10px;';
        touchClone.style.left = (touch.clientX - touchOffsetX) + 'px';
        touchClone.style.top  = (touch.clientY - touchOffsetY) + 'px';
        document.body.appendChild(touchClone);
    }, { passive: false });

    block.addEventListener('touchmove', function(e) {
        if (!dragging || !touchClone) return;
        e.preventDefault();
        var touch = e.touches[0];
        touchClone.style.left = (touch.clientX - touchOffsetX) + 'px';
        touchClone.style.top  = (touch.clientY - touchOffsetY) + 'px';

        // find card under finger
        touchClone.style.display = 'none';
        var el = document.elementFromPoint(touch.clientX, touch.clientY);
        touchClone.style.display = '';
        var target = el ? el.closest('.draggable-card') : null;
        if (!target || target === dragging) return;

        document.querySelectorAll('.drag-over').forEach(function(c) { c.classList.remove('drag-over'); });
        target.classList.add('drag-over');
        var rect = target.getBoundingClientRect();
        if (touch.clientY < rect.top + rect.height / 2) {
            block.insertBefore(dragging, target);
        } else {
            block.insertBefore(dragging, target.nextSibling);
        }
    }, { passive: false });

    block.addEventListener('touchend', function(e) {
        if (!dragging) return;
        if (touchClone) { touchClone.remove(); touchClone = null; }
        finishReorder();
    });

    document.getElementById('back-btn').addEventListener('click', function() {
        view.classList.remove('active');
        document.getElementById('grid-view').classList.remove('hidden');
    });

    document.getElementById('sync-btn').addEventListener('click', function() {
        var first = block.querySelector('.draggable-card');
        if (first) openSpotify(songMap[first.dataset.songId].spotify_url);
    });
}

// ── song play buttons ──────────────────────────────────
document.addEventListener('click', function(e) {
    if (e.target.classList.contains('song-play-btn')) {
        e.stopPropagation();
        openSpotify(e.target.dataset.url);
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
            area.innerHTML = note
                ? '<div class="log-note">"' + MoodFX.esc(note) + '"</div><button class="edit-note-btn" data-song-id="' + songId + '" data-mood="' + MoodFX.esc(mood) + '" data-note="' + MoodFX.esc(note) + '" data-source="playlist">edit note</button>'
                : '<button class="add-note-btn" data-song-id="' + songId + '" data-mood="' + MoodFX.esc(mood) + '" data-source="playlist">+ add note</button>';
        });
    });

    document.getElementById('pl-cancel-' + songId).addEventListener('click', function() {
        area.innerHTML = existingNote
            ? '<div class="log-note">"' + MoodFX.esc(existingNote) + '"</div><button class="edit-note-btn" data-song-id="' + songId + '" data-mood="' + MoodFX.esc(mood) + '" data-note="' + MoodFX.esc(existingNote) + '" data-source="playlist">edit note</button>'
            : '<button class="add-note-btn" data-song-id="' + songId + '" data-mood="' + MoodFX.esc(mood) + '" data-source="playlist">+ add note</button>';
    });
}

document.addEventListener('click', function(e) {
    if ((e.target.classList.contains('add-note-btn') || e.target.classList.contains('edit-note-btn')) && e.target.dataset.source === 'playlist') {
        showInlineNotePlaylist(e.target.dataset.songId, e.target.dataset.mood, e.target.dataset.note || '');
    }
});

document.addEventListener('click', function(e) {
    if (!e.target.classList.contains('playlist-remove-btn')) return;
    var card = document.getElementById('log-' + e.target.dataset.songid + '-' + e.target.dataset.mood);
    if (card) card.remove();
});

var _lb = document.getElementById('logout-btn'); if (_lb) _lb.addEventListener('click', logout);

// ── boot ───────────────────────────────────────────────
// the grid needs both your songs and your saved orders; it draws as soon as both
// are known (instantly from saved data when available) and quietly redraws when
// fresher data arrives — unless you've already opened a playlist
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
    renderGrid(groupByMood(latestLogs));
}

function playlistIsOpen() {
    var openView = document.getElementById('playlist-view');
    return !!(openView && openView.classList.contains('active'));
}

playlistsList.innerHTML = MoodFX.skeleton('rows', 4);

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

apiCallCached('/logs', function(err, result, fromCache) {
    // don't yank someone out of a playlist they've already opened
    if (!fromCache && playlistIsOpen()) return;
    if (err) { logsError = latestLogs === null; renderPlaylists(); return; }
    logsError = false;
    latestLogs = Array.isArray(result.data) ? result.data : [];
    renderPlaylists();
});