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
function saveOrder(mood, songIds) {
    localStorage.setItem('moodtunes_order_' + mood, JSON.stringify(songIds));
}

function applyOrder(mood, songs) {
    var saved = localStorage.getItem('moodtunes_order_' + mood);
    if (!saved) return songs;
    try {
        var ids = JSON.parse(saved);
        var map = {};
        songs.forEach(function(s) { map[s.song_id] = s; });
        var ordered = [];
        ids.forEach(function(id) { if (map[id]) ordered.push(map[id]); });
        // append any new songs not in saved order
        songs.forEach(function(s) { if (ids.indexOf(s.song_id) === -1) ordered.push(s); });
        return ordered;
    } catch(e) { return songs; }
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
        var sorted = applyOrder(mood, songs.slice().sort(function(a, b) { return b.play_count - a.play_count; }));
        var card = document.createElement('div');
        card.classList.add('playlist-card');
        card.dataset.mood = mood;
        card.innerHTML =
            buildCoverHTML(sorted, mood, 'small') +
            '<div class="playlist-card-title">' + mood + ' playlist</div>' +
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

    // list: apply saved order, fallback to play count
    var listSongs = applyOrder(mood, songs.slice().sort(function(a, b) {
        if (b.play_count !== a.play_count) return b.play_count - a.play_count;
        return new Date(a.last_logged) - new Date(b.last_logged);
    }));

    view.innerHTML =
        '<button class="back-btn" id="back-btn">← back to playlists</button>' +
        '<div class="playlist-view-header">' +
            '<div id="playlist-cover-wrap">' + buildCoverHTML(listSongs, mood, 'large') + '</div>' +
            '<div class="playlist-view-info">' +
                '<div class="playlist-view-title">' + mood + ' playlist</div>' +
                '<div class="playlist-view-count">' + songs.length + ' song' + (songs.length !== 1 ? 's' : '') + ' · built from your journal</div>' +
                '<div style="font-size:12px;color:#555;margin-top:4px;">drag to reorder · cover shows top 4</div>' +
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
            '<img class="song-art" src="' + song.album_art + '" alt="album art" />' +
            '<div class="song-info">' +
                '<div class="song-title">' + song.title + '</div>' +
                '<div class="song-artist">' + song.artist + '</div>' +
                '<div class="log-note-area" id="pl-note-area-' + song.song_id + '-' + mood + '">' +
                    (song.note
                        ? '<div class="log-note">"' + song.note + '"</div><button class="edit-note-btn" data-song-id="' + song.song_id + '" data-mood="' + mood + '" data-note="' + song.note.replace(/"/g, '&quot;') + '" data-source="playlist">edit note</button>'
                        : '<button class="add-note-btn" data-song-id="' + song.song_id + '" data-mood="' + mood + '" data-source="playlist">+ add note</button>') +
                '</div>' +
                '<div class="log-meta">' +
                    '<span class="mood-badge">' + song.mood + '</span>' +
                    '<span class="plays-text">' + song.play_count + ' play' + (song.play_count !== 1 ? 's' : '') + '</span>' +
                    '<span class="date-text">' + formatTimestamp(song.last_logged) + '</span>' +
                '</div>' +
            '</div>' +
            '<button class="play-btn song-play-btn" data-url="' + song.spotify_url + '">▶</button>' +
            '<button class="delete-btn playlist-remove-btn" data-songid="' + song.song_id + '" data-mood="' + mood + '" title="remove from view">✕</button>';
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
        var gridCard = document.querySelector('.playlist-card[data-mood="' + mood + '"]');
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
        '<textarea class="note-textarea" id="pl-inline-note-' + songId + '" style="margin-top:8px;" placeholder="what does this song mean to you right now...">' + (existingNote || '') + '</textarea>' +
        '<div class="note-btn-row">' +
            '<button class="skip-note-btn" id="pl-cancel-' + songId + '">cancel</button>' +
            '<button class="save-note-btn" id="pl-save-' + songId + '">save</button>' +
        '</div>';

    document.getElementById('pl-save-' + songId).addEventListener('click', function() {
        var note = document.getElementById('pl-inline-note-' + songId).value.trim();
        apiCall('/logs/latest/' + songId + '/' + mood, 'PUT', { note: note }, function() {
            area.innerHTML = note
                ? '<div class="log-note">"' + note + '"</div><button class="edit-note-btn" data-song-id="' + songId + '" data-mood="' + mood + '" data-note="' + note.replace(/"/g, '&quot;') + '" data-source="playlist">edit note</button>'
                : '<button class="add-note-btn" data-song-id="' + songId + '" data-mood="' + mood + '" data-source="playlist">+ add note</button>';
        });
    });

    document.getElementById('pl-cancel-' + songId).addEventListener('click', function() {
        area.innerHTML = existingNote
            ? '<div class="log-note">"' + existingNote + '"</div><button class="edit-note-btn" data-song-id="' + songId + '" data-mood="' + mood + '" data-note="' + existingNote.replace(/"/g, '&quot;') + '" data-source="playlist">edit note</button>'
            : '<button class="add-note-btn" data-song-id="' + songId + '" data-mood="' + mood + '" data-source="playlist">+ add note</button>';
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

document.getElementById('logout-btn').addEventListener('click', logout);

// ── boot ───────────────────────────────────────────────
playlistsList.innerHTML = '<p style="color:#555;font-size:14px;">loading...</p>';
apiCall('/logs', 'GET', null, function(err, result) {
    if (err) { playlistsList.innerHTML = '<p style="color:#e05c5c;">could not load playlists</p>'; return; }
    var logs = Array.isArray(result.data) ? result.data : [];
    if (logs.length === 0) {
        playlistsList.innerHTML = '<p style="color:#555;font-size:14px;">no songs logged yet — go to the journal and log some songs first!</p>';
        return;
    }
    renderGrid(groupByMood(logs));
});