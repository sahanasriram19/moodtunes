// history.js

requireAuth();

// ── elements ───────────────────────────────────────────
var statsGrid    = document.getElementById('stats-grid');
var flashbackEl  = document.getElementById('flashback-container');
var timeline     = document.getElementById('timeline');
var sessionsList = document.getElementById('sessions-list');
var allLogs      = [];

// ── song search ────────────────────────────────────────
var songSearchInput   = document.getElementById('song-history-search');
var songSearchResults = document.getElementById('song-search-results');
var searchTimer = null;

if (songSearchInput) {
    songSearchInput.addEventListener('input', function() {
        clearTimeout(searchTimer);
        var q = songSearchInput.value.trim().toLowerCase();
        if (!q) { songSearchResults.innerHTML = ''; return; }
        searchTimer = setTimeout(function() { searchSongHistory(q); }, 250);
    });
}

function searchSongHistory(query) {
    var matches = allLogs.filter(function(log) {
        return log.title.toLowerCase().includes(query) || log.artist.toLowerCase().includes(query);
    });

    if (matches.length === 0) {
        songSearchResults.innerHTML = '<p style="color:#555;font-size:13px;padding:12px 0;">no songs found matching "' + MoodFX.esc(query) + '"</p>';
        return;
    }

    // group by title+artist
    var grouped = {};
    matches.forEach(function(log) {
        var key = log.title + '||' + log.artist;
        if (!grouped[key]) grouped[key] = { title: log.title, artist: log.artist, album_art: log.album_art, spotify_url: log.spotify_url, entries: [] };
        grouped[key].entries.push(log);
    });

    songSearchResults.innerHTML = '';
    Object.values(grouped).forEach(function(song) {
        song.entries.sort(function(a, b) { return new Date(b.last_logged) - new Date(a.last_logged); });
        var totalPlays = song.entries.reduce(function(sum, e) { return sum + e.play_count; }, 0);

        var entryRows = song.entries.map(function(e) {
            var date = new Date(e.last_logged);
            var dateStr = date.toLocaleDateString('en-SG', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
            return '<div class="song-history-entry">' +
                '<span class="mood-badge">' + MoodFX.esc(e.mood) + '</span>' +
                '<span class="song-history-date">' + dateStr + '</span>' +
                '<span class="song-history-plays">' + e.play_count + ' play' + (e.play_count !== 1 ? 's' : '') + '</span>' +
                (e.note ? '<span class="log-note" style="display:block;margin-top:4px;margin-left:0;">"' + MoodFX.esc(e.note) + '"</span>' : '') +
            '</div>';
        }).join('');

        var card = document.createElement('div');
        card.classList.add('song-history-card');
        card.innerHTML =
            '<div class="song-history-header">' +
                '<img src="' + MoodFX.esc(song.album_art) + '" alt="album art" />' +
                '<div class="song-history-info">' +
                    '<div class="song-history-title">' + MoodFX.esc(song.title) + '</div>' +
                    '<div class="song-history-artist">' + MoodFX.esc(song.artist) + '</div>' +
                    '<div class="song-history-total">' + totalPlays + ' total plays across ' + song.entries.length + ' day' + (song.entries.length !== 1 ? 's' : '') + '</div>' +
                '</div>' +
                '<button class="play-btn search-play-btn" data-url="' + MoodFX.esc(song.spotify_url) + '">▶</button>' +
            '</div>' +
            '<div class="song-history-entries">' + entryRows + '</div>';

        songSearchResults.appendChild(card);
    });
}

// ── stats ──────────────────────────────────────────────
function renderStats(logs) {
    var totalPlays = logs.reduce(function(sum, l) { return sum + l.play_count; }, 0);
    var moodCounts = {};
    logs.forEach(function(l) { moodCounts[l.mood] = (moodCounts[l.mood] || 0) + 1; });
    var topMood = Object.keys(moodCounts).sort(function(a, b) { return moodCounts[b] - moodCounts[a]; })[0] || '—';

    statsGrid.innerHTML =
        '<div class="stat-card"><div class="stat-num">' + logs.length + '</div><div class="stat-label">songs logged</div></div>' +
        '<div class="stat-card"><div class="stat-num">' + totalPlays + '</div><div class="stat-label">total plays</div></div>' +
        '<div class="stat-card"><div class="stat-num">' + topMood + '</div><div class="stat-label">top mood</div></div>';
}

// ── flashback ──────────────────────────────────────────
function renderFlashback(logs) {
    var oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    var match = logs.find(function(l) {
        return new Date(l.last_logged).toDateString() === oneMonthAgo.toDateString();
    });

    if (!match) { flashbackEl.innerHTML = ''; return; }

    var monthName = oneMonthAgo.toLocaleDateString('en-SG', { month: 'long', day: 'numeric' });
    flashbackEl.innerHTML =
        '<div class="flashback-card">' +
            '<div class="flashback-icon">✦</div>' +
            '<div class="flashback-content">' +
                '<div class="flashback-title">a month ago today</div>' +
                '<div class="flashback-sub">on ' + monthName + ' you were listening to</div>' +
                '<div class="flashback-song">' +
                    '<img src="' + MoodFX.esc(match.album_art) + '" alt="album art" />' +
                    '<div>' +
                        '<div class="flashback-song-title">' + MoodFX.esc(match.title) + '</div>' +
                        '<div class="flashback-song-artist">' + MoodFX.esc(match.artist) + '</div>' +
                    '</div>' +
                '</div>' +
            '</div>' +
        '</div>';
}

// ── timeline ───────────────────────────────────────────
function renderTimeline(logs) {
    timeline.innerHTML = '';
    if (logs.length === 0) {
        timeline.innerHTML = '<p style="color:#555;font-size:14px;">no history yet — go to the journal and start logging songs!</p>';
        return;
    }

    var grouped = {};
    logs.forEach(function(log) {
        var key = new Date(log.last_logged.replace(' ', 'T') + 'Z').toDateString();
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(log);
    });

    Object.keys(grouped)
        .sort(function(a, b) { return new Date(b) - new Date(a); })
        .forEach(function(key) {
            var group = document.createElement('div');
            group.classList.add('timeline-group');
            group.innerHTML = '<div class="timeline-date">' + formatDateOnly(key) + '</div>';

            grouped[key].forEach(function(log) {
                var card = document.createElement('div');
                card.classList.add('log-card');
                card.id = 'history-log-' + log.id;
                card.innerHTML =
                    '<img class="song-art" src="' + MoodFX.esc(log.album_art) + '" alt="album art" />' +
                    '<div class="song-info">' +
                        '<div class="song-title">' + MoodFX.esc(log.title) + '</div>' +
                        '<div class="song-artist">' + MoodFX.esc(log.artist) + '</div>' +
                        '<div class="log-note-area" id="note-area-' + log.id + '">' +
                            (log.note
                                ? '<div class="log-note">"' + MoodFX.esc(log.note) + '"</div>' +
                                  '<button class="edit-note-btn" data-log-id="' + log.id + '" data-song-id="' + log.song_id + '" data-mood="' + MoodFX.esc(log.mood) + '" data-note="' + MoodFX.esc(log.note) + '">edit note</button>'
                                : '<button class="add-note-btn" data-log-id="' + log.id + '" data-song-id="' + log.song_id + '" data-mood="' + MoodFX.esc(log.mood) + '">+ add note</button>') +
                        '</div>' +
                        '<div class="log-meta">' +
                            '<span class="mood-badge">' + MoodFX.esc(log.mood) + '</span>' +
                            '<span class="plays-text">' + log.play_count + ' play' + (log.play_count !== 1 ? 's' : '') + '</span>' +
                            '<span class="date-text">' + formatTimestamp(log.last_logged) + '</span>' +
                        '</div>' +
                    '</div>' +
                    '<button class="play-btn timeline-play-btn" data-url="' + MoodFX.esc(log.spotify_url) + '">▶</button>' +
                    '<button class="delete-btn history-delete-btn" data-song-id="' + log.song_id + '" data-mood="' + MoodFX.esc(log.mood) + '" data-log-id="' + log.id + '" title="delete this entry">✕</button>';
                group.appendChild(card);
            });

            timeline.appendChild(group);
        });
}

// ── inline note editor ─────────────────────────────────
function showInlineNoteHistory(logId, songId, mood, existingNote) {
    var area = document.getElementById('note-area-' + logId);
    if (!area) return;
    area.innerHTML =
        '<textarea class="note-textarea" id="inline-note-' + logId + '" style="margin-top:8px;" placeholder="what does this song mean to you right now...">' + MoodFX.esc(existingNote || '') + '</textarea>' +
        '<div class="note-btn-row">' +
            '<button class="skip-note-btn" id="cancel-note-' + logId + '">cancel</button>' +
            '<button class="save-note-btn" id="save-note-' + logId + '">save</button>' +
        '</div>';

    document.getElementById('save-note-' + logId).addEventListener('click', function() {
        var note = document.getElementById('inline-note-' + logId).value.trim();
        apiCall('/logs/' + logId, 'PUT', { note: note }, function() {
            area.innerHTML = note
                ? '<div class="log-note">"' + MoodFX.esc(note) + '"</div><button class="edit-note-btn" data-log-id="' + logId + '" data-song-id="' + songId + '" data-mood="' + MoodFX.esc(mood) + '" data-note="' + MoodFX.esc(note) + '">edit note</button>'
                : '<button class="add-note-btn" data-log-id="' + logId + '" data-song-id="' + songId + '" data-mood="' + MoodFX.esc(mood) + '">+ add note</button>';
        });
    });

    document.getElementById('cancel-note-' + logId).addEventListener('click', function() {
        area.innerHTML = existingNote
            ? '<div class="log-note">"' + MoodFX.esc(existingNote) + '"</div><button class="edit-note-btn" data-log-id="' + logId + '" data-song-id="' + songId + '" data-mood="' + MoodFX.esc(mood) + '" data-note="' + MoodFX.esc(existingNote) + '">edit note</button>'
            : '<button class="add-note-btn" data-log-id="' + logId + '" data-song-id="' + songId + '" data-mood="' + MoodFX.esc(mood) + '">+ add note</button>';
    });
}

// ── sessions ───────────────────────────────────────────
function renderSessions() {
    sessionsList.innerHTML = MoodFX.skeleton('rows', 3);

    apiCall('/sessions', 'GET', null, function(err, result) {
        if (err) { sessionsList.innerHTML = '<p style="color:#e05c5c;font-size:14px;">could not load sessions</p>'; return; }

        var sessions = Array.isArray(result.data) ? result.data : [];
        var ended = sessions.filter(function(s) { return s.status === 'ended'; });

        sessionsList.innerHTML = '';
        if (ended.length === 0) {
            sessionsList.innerHTML = '<p style="color:#555;font-size:14px;">no completed sessions yet — start a session from the journal page!</p>';
            return;
        }

        ended.forEach(function(session) {
            var startStr = formatTimestamp(session.start_time);
            var duration = '';
            if (session.end_time) {
                var mins = Math.floor((new Date(session.end_time) - new Date(session.start_time)) / 60000);
                duration = ' · ' + mins + ' min' + (mins !== 1 ? 's' : '');
            }

            apiCall('/sessions/' + session.id + '/songs', 'GET', null, function(err2, songsResult) {
                var songs = (!err2 && Array.isArray(songsResult.data)) ? songsResult.data : [];

                var card = document.createElement('div');
                card.classList.add('session-history-card');
                card.id = 'session-' + session.id;

                var songsHTML = songs.length === 0
                    ? '<p class="session-empty">no songs logged during this session</p>'
                    : '<div class="session-history-songs">' +
                        songs.map(function(s) {
                            return '<div class="session-song-thumb" id="ssong-' + s.id + '">' +
                                '<div class="thumb-img-wrap">' +
                                    '<img src="' + MoodFX.esc(s.album_art) + '" alt="album art" />' +
                                    '<div class="thumb-play-overlay">' +
                                        '<button class="play-btn session-thumb-play" data-url="' + MoodFX.esc(s.spotify_url) + '">▶</button>' +
                                    '</div>' +
                                '</div>' +
                                '<p>' + MoodFX.esc(s.title) + '</p>' +
                                '<p class="thumb-artist">' + MoodFX.esc(s.artist) + '</p>' +
                                '<div class="thumb-actions">' +
                                    '<button class="session-song-delete" data-session-id="' + session.id + '" data-song-id="' + s.id + '">✕ remove</button>' +
                                '</div>' +
                            '</div>';
                        }).join('') +
                      '</div>';

                card.innerHTML =
                    '<div class="session-history-header">' +
                        '<div class="session-history-mood">' + MoodFX.esc(session.mood) + ' session</div>' +
                        '<div class="session-history-meta">' + startStr + duration + '</div>' +
                        '<button class="session-delete-btn" data-session-id="' + session.id + '">delete session</button>' +
                    '</div>' +
                    songsHTML;

                sessionsList.appendChild(card);
            });
        });
    });
}

// ── tab switching ──────────────────────────────────────
document.getElementById('tab-timeline').addEventListener('click', function() {
    document.getElementById('tab-timeline').classList.add('active');
    document.getElementById('tab-sessions').classList.remove('active');
    document.getElementById('timeline-section').classList.remove('hidden');
    document.getElementById('sessions-section').classList.add('hidden');
});

document.getElementById('tab-sessions').addEventListener('click', function() {
    document.getElementById('tab-sessions').classList.add('active');
    document.getElementById('tab-timeline').classList.remove('active');
    document.getElementById('sessions-section').classList.remove('hidden');
    document.getElementById('timeline-section').classList.add('hidden');
    renderSessions();
});

// ── delegated click handlers ───────────────────────────
document.addEventListener('click', function(e) {
    if (e.target.classList.contains('timeline-play-btn') || e.target.classList.contains('search-play-btn') || e.target.classList.contains('session-thumb-play')) {
        openSpotify(e.target.dataset.url);
    }
    if (e.target.classList.contains('add-note-btn') || e.target.classList.contains('edit-note-btn')) {
        showInlineNoteHistory(e.target.dataset.logId, e.target.dataset.songId, e.target.dataset.mood, e.target.dataset.note || '');
    }
    if (e.target.classList.contains('history-delete-btn')) {
        var songId = e.target.dataset.songId;
        var mood   = e.target.dataset.mood;
        var logId  = e.target.dataset.logId;
        var logCard = document.getElementById('history-log-' + logId);
        MoodFX.undoable({
            message: 'entry deleted', mood: mood,
            hide:    function() { if (logCard) logCard.style.display = 'none'; },
            restore: function() { if (logCard) logCard.style.display = ''; },
            commit:  function() { apiCall('/logs/' + logId, 'DELETE', null, function(err) { if (!err && logCard) logCard.remove(); }); }
        });
    }
    if (e.target.classList.contains('session-delete-btn')) {
        var sid = e.target.dataset.sessionId;
        var sessCard = document.getElementById('session-' + sid);
        MoodFX.undoable({
            message: 'session deleted',
            hide:    function() { if (sessCard) sessCard.style.display = 'none'; },
            restore: function() { if (sessCard) sessCard.style.display = ''; },
            commit:  function() { apiCall('/sessions/' + sid, 'DELETE', null, function(err) { if (!err && sessCard) sessCard.remove(); }); }
        });
    }
    if (e.target.classList.contains('session-song-delete')) {
        var sessionId = e.target.dataset.sessionId;
        var songId = e.target.dataset.songId;
        var thumb = document.getElementById('ssong-' + songId);
        MoodFX.undoable({
            message: 'song removed from session',
            hide:    function() { if (thumb) thumb.style.display = 'none'; },
            restore: function() { if (thumb) thumb.style.display = ''; },
            commit:  function() { apiCall('/sessions/' + sessionId + '/songs/' + songId, 'DELETE', null, function(err) { if (!err && thumb) thumb.remove(); }); }
        });
    }
});

var sessionBtn = document.getElementById('session-btn');
if (sessionBtn) sessionBtn.addEventListener('click', function() { window.location.href = 'index.html'; });

var _lb = document.getElementById('logout-btn'); if (_lb) _lb.addEventListener('click', logout);

// ── boot ───────────────────────────────────────────────
statsGrid.innerHTML = MoodFX.skeleton('stats', 3).replace('sk-stats', 'sk-stats sk-3');
timeline.innerHTML  = MoodFX.skeleton('rows', 5);
apiCall('/logs/perday', 'GET', null, function(err, result) {
    if (err || !result.data) { statsGrid.innerHTML = ''; timeline.innerHTML = '<p style="color:#888;font-size:14px;">couldn’t load your history — try again later</p>'; return; }
    allLogs = Array.isArray(result.data) ? result.data : [];
    renderStats(allLogs);
    renderFlashback(allLogs);
    renderTimeline(allLogs);
});