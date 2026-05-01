// playlists.js

requireAuth();

var moodEmojis = { happy: '😊', sad: '😢', hype: '🔥', heartbreak: '💔', nostalgic: '🌙', focused: '🎯', chill: '😌' };
var playlistsList = document.getElementById('playlists-list');

// ── helpers ────────────────────────────────────────────
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
        var card = document.createElement('div');
        card.classList.add('playlist-card');
        card.innerHTML =
            buildCoverHTML(songs, mood, 'small') +
            '<div class="playlist-card-title">' + mood + ' playlist</div>' +
            '<div class="playlist-card-count">' + songs.length + ' song' + (songs.length !== 1 ? 's' : '') + '</div>';

        card.addEventListener('click', (function(m, s) {
            return function() { openPlaylist(m, s); };
        })(mood, songs));

        grid.appendChild(card);
    });
}

// ── open a playlist ────────────────────────────────────
function openPlaylist(mood, songs) {
    document.getElementById('grid-view').classList.add('hidden');
    var view = document.getElementById('playlist-view');
    view.classList.add('active');

    songs.sort(function(a, b) { return b.play_count - a.play_count; });

    var tracksHTML = songs.map(function(song) {
        return '<div class="log-card" id="log-' + song.song_id + '-' + mood + '">' +
            '<img class="song-art" src="' + song.album_art + '" alt="album art" />' +
            '<div class="song-info">' +
                '<div class="song-title">' + song.title + '</div>' +
                '<div class="song-artist">' + song.artist + '</div>' +
                '<div class="log-note-area" id="pl-note-area-' + song.song_id + '-' + mood + '">' +
                    (song.note
                        ? '<div class="log-note">"' + song.note + '"</div>' +
                          '<button class="edit-note-btn" data-song-id="' + song.song_id + '" data-mood="' + mood + '" data-note="' + song.note.replace(/"/g, '&quot;') + '" data-source="playlist">edit note</button>'
                        : '<button class="add-note-btn" data-song-id="' + song.song_id + '" data-mood="' + mood + '" data-source="playlist">+ add note</button>') +
                '</div>' +
                '<div class="log-meta">' +
                    '<span class="mood-badge">' + song.mood + '</span>' +
                    '<span class="plays-text">' + song.play_count + ' play' + (song.play_count !== 1 ? 's' : '') + '</span>' +
                    '<span class="date-text">' + formatTimestamp(song.last_logged) + '</span>' +
                '</div>' +
            '</div>' +
            '<button class="play-btn song-play-btn" data-url="' + song.spotify_url + '">▶</button>' +
            '<button class="delete-btn playlist-remove-btn" data-songid="' + song.song_id + '" data-mood="' + mood + '" title="remove from view">✕</button>' +
        '</div>';
    }).join('');

    view.innerHTML =
        '<button class="back-btn" id="back-btn">← back to playlists</button>' +
        '<div class="playlist-view-header">' +
            buildCoverHTML(songs, mood, 'large') +
            '<div class="playlist-view-info">' +
                '<div class="playlist-view-title">' + mood + ' playlist</div>' +
                '<div class="playlist-view-count">' + songs.length + ' song' + (songs.length !== 1 ? 's' : '') + ' · built from your journal</div>' +
            '</div>' +
            '<button class="playlist-play-btn" id="sync-btn" style="border:none;cursor:pointer;">▶</button>' +
        '</div>' +
        '<div class="playlist-block">' + tracksHTML + '</div>';

    document.getElementById('back-btn').addEventListener('click', function() {
        view.classList.remove('active');
        document.getElementById('grid-view').classList.remove('hidden');
    });

    document.getElementById('sync-btn').addEventListener('click', function() {
        if (songs.length > 0) {
            openSpotify(songs[0].spotify_url);
        }
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
        apiCall('/logs/' + songId + '/' + mood, 'PUT', { note: note }, function() {
            area.innerHTML = note
                ? '<div class="log-note">"' + note + '"</div>' +
                  '<button class="edit-note-btn" data-song-id="' + songId + '" data-mood="' + mood + '" data-note="' + note.replace(/"/g, '&quot;') + '" data-source="playlist">edit note</button>'
                : '<button class="add-note-btn" data-song-id="' + songId + '" data-mood="' + mood + '" data-source="playlist">+ add note</button>';
        });
    });

    document.getElementById('pl-cancel-' + songId).addEventListener('click', function() {
        area.innerHTML = existingNote
            ? '<div class="log-note">"' + existingNote + '"</div>' +
              '<button class="edit-note-btn" data-song-id="' + songId + '" data-mood="' + mood + '" data-note="' + existingNote.replace(/"/g, '&quot;') + '" data-source="playlist">edit note</button>'
            : '<button class="add-note-btn" data-song-id="' + songId + '" data-mood="' + mood + '" data-source="playlist">+ add note</button>';
    });
}

document.addEventListener('click', function(e) {
    if ((e.target.classList.contains('add-note-btn') || e.target.classList.contains('edit-note-btn')) && e.target.dataset.source === 'playlist') {
        showInlineNotePlaylist(e.target.dataset.songId, e.target.dataset.mood, e.target.dataset.note || '');
    }
});

// ── remove from playlist view (UI only — keeps log in database) ────────────
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