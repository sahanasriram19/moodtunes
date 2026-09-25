// app.js — journal page
requireAuth();

var selectedMood  = null;
var activeSession = null;

var chips         = document.querySelectorAll('.chip');
var songSearch    = document.getElementById('song-search');
var searchResults = document.getElementById('search-results');
var logsList      = document.getElementById('logs-list');
var sessionPanel  = document.getElementById('session-panel');
var sessionRecs   = document.getElementById('session-recommendations');
var sessionBtn    = document.getElementById('session-btn');
var sessionEndBtn = document.getElementById('session-end-btn');
var sessionLabel  = document.getElementById('session-mood-label');
var sessionTime   = document.getElementById('session-start-time');

// ── custom moods ───────────────────────────────────────
var EMOJIS = MoodFX.ICON_PICKER;   // [emoji saved to the backend, icon shown]
var moodChipsContainer = document.querySelector('.mood-chips');
var managingMoods = false;

function addChip(name, emoji, id) {
    var wrap = document.createElement('div');
    wrap.classList.add('chip-wrap');
    wrap.style.cssText = 'display:inline-flex;flex-direction:column;align-items:center;gap:5px;';

    var chip = document.createElement('button');
    chip.classList.add('chip', 'custom-chip');
    chip.dataset.mood = name;
    chip.dataset.customId = id || '';
    chip.dataset.emoji = emoji || '';
    chip.textContent = name;
    chip.addEventListener('click', function() {
        if (managingMoods) return;
        document.querySelectorAll('.chip').forEach(function(c) { c.classList.remove('selected'); });
        chip.classList.add('selected');
        selectedMood = name;
        songSearch.focus();
    });

    var delBtn = document.createElement('button');
    delBtn.classList.add('chip-delete-btn');
    delBtn.innerHTML = MoodFX.icon('trash');
    delBtn.style.cssText = 'display:none;background:none;border:none;color:#e05c5c;padding:2px 4px;cursor:pointer;line-height:1;';
    delBtn.addEventListener('click', function() {
        if (selectedMood === name) selectedMood = null;
        MoodFX.undoable({
            message: 'deleted “' + name + '”', mood: name,
            hide:    function() { wrap.style.display = 'none'; },
            restore: function() { wrap.style.display = ''; },
            commit:  function() { apiCall('/moods/' + id, 'DELETE', null, function() { wrap.remove(); }); }
        });
    });

    wrap.appendChild(chip);
    wrap.appendChild(delBtn);
    moodChipsContainer.appendChild(wrap);
    return chip;
}

// wrap default chips too
chips.forEach(function(chip) {
    var wrap = document.createElement('div');
    wrap.classList.add('chip-wrap');
    wrap.style.cssText = 'display:inline-flex;flex-direction:column;align-items:center;gap:5px;';

    chip.parentNode.insertBefore(wrap, chip);
    wrap.appendChild(chip);

    var delBtn = document.createElement('button');
    delBtn.classList.add('chip-delete-btn');
    delBtn.innerHTML = MoodFX.icon('trash');
    delBtn.style.cssText = 'display:none;background:none;border:none;color:#e05c5c;padding:2px 4px;cursor:pointer;line-height:1;';
    delBtn.addEventListener('click', function() {
        var m = chip.dataset.mood;
        if (selectedMood === m) { selectedMood = null; chip.classList.remove('selected'); }
        MoodFX.hideMood(m);
        MoodFX.toast('removed “' + m + '” from your moods', m, {
            action: 'undo', duration: 5000,
            onAction: function() { MoodFX.unhideMood(m); }
        });
    });
    wrap.appendChild(delBtn);

    chip.addEventListener('click', function() {
        if (managingMoods) return;
        chips.forEach(function(c) { c.classList.remove('selected'); });
        document.querySelectorAll('.custom-chip').forEach(function(c) { c.classList.remove('selected'); });
        chip.classList.add('selected');
        selectedMood = chip.dataset.mood;
        songSearch.focus();
    });
});

// manage moods button — plain text with underline, no chip styling
var manageMoodsBtn = document.createElement('button');
manageMoodsBtn.id = 'manage-moods-btn';
manageMoodsBtn.textContent = 'manage moods';
manageMoodsBtn.style.cssText = 'background:none;border:none;border-bottom:1px solid #333;color:#9a9a9a;font-size:12px;padding:2px 0;cursor:pointer;margin-top:14px;display:block;letter-spacing:0.04em;transition:color 0.15s,border-color 0.15s;';
manageMoodsBtn.addEventListener('mouseover', function() { this.style.color = '#aaa'; });
manageMoodsBtn.addEventListener('mouseout', function() {
    this.style.color = managingMoods ? '#7f77dd' : '#9a9a9a';
    this.style.borderColor = managingMoods ? '#7f77dd' : '#333';
});
manageMoodsBtn.addEventListener('click', function() {
    managingMoods = !managingMoods;
    manageMoodsBtn.textContent = managingMoods ? 'done' : 'manage moods';
    manageMoodsBtn.style.border = managingMoods ? '1px solid #7f77dd' : 'none';
    manageMoodsBtn.style.borderBottom = managingMoods ? '1px solid #7f77dd' : '1px solid #333';
    manageMoodsBtn.style.padding = managingMoods ? '4px 14px' : '2px 0';
    manageMoodsBtn.style.borderRadius = managingMoods ? '20px' : '0';
    manageMoodsBtn.style.color = managingMoods ? '#7f77dd' : '#9a9a9a';
    
    document.querySelectorAll('.chip-delete-btn').forEach(function(btn) {
        btn.style.display = managingMoods ? 'block' : 'none';
    });
    if (!managingMoods) {
        document.querySelectorAll('.chip').forEach(function(c) { c.classList.remove('selected'); });
        selectedMood = null;
    }
});
document.querySelector('.mood-section').appendChild(manageMoodsBtn);

// add mood button — only visible in manage mode
var addMoodSection = document.createElement('div');
addMoodSection.id = 'add-mood-section';
addMoodSection.style.cssText = 'display:none;margin-top:16px;background:#141414;border:1px solid #2a2a2a;border-radius:12px;padding:18px;';
addMoodSection.innerHTML =
    '<div style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#555;margin-bottom:12px;">add a mood</div>' +
    '<input id="new-mood-input" type="text" maxlength="20" placeholder="e.g. melancholy, grind..." style="width:100%;padding:10px 12px;background:#1a1a1a;border:1px solid #333;border-radius:8px;color:#f0f0f0;font-size:14px;box-sizing:border-box;margin-bottom:12px;" />' +
    '<div style="font-size:12px;color:#888;margin-bottom:8px;">pick an icon <span id="chosen-emoji" style="margin-left:6px;">' + MoodFX.icon('note') + '</span></div>' +
    '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px;">' +
        EMOJIS.map(function(e) {
            return '<button class="emoji-opt" data-emoji="' + e[0] + '" data-icon="' + e[1] + '" title="' + e[1] + '" aria-label="' + e[1] + '" style="background:none;border:2px solid transparent;border-radius:8px;cursor:pointer;padding:4px;">' + MoodFX.icon(e[1]) + '</button>';
        }).join('') +
    '</div>' +
    '<button id="save-new-mood" class="save-note-btn" style="width:100%;">+ add mood</button>';
document.querySelector('.mood-section').appendChild(addMoodSection);

var chosenEmoji = '🎵';
addMoodSection.querySelectorAll('.emoji-opt').forEach(function(btn) {
    btn.addEventListener('click', function() {
        addMoodSection.querySelectorAll('.emoji-opt').forEach(function(b) { b.style.borderColor = 'transparent'; });
        btn.style.borderColor = '#7f77dd';
        chosenEmoji = btn.dataset.emoji;
        document.getElementById('chosen-emoji').innerHTML = MoodFX.icon(btn.dataset.icon);
    });
});

// show/hide add mood section with manage mode
var origManageClick = manageMoodsBtn.onclick;
manageMoodsBtn.addEventListener('click', function() {
    addMoodSection.style.display = managingMoods ? 'block' : 'none';
    if (managingMoods) document.getElementById('new-mood-input').focus();
});

document.getElementById('save-new-mood').addEventListener('click', function() {
    var name = document.getElementById('new-mood-input').value.trim().toLowerCase();
    if (!name) return;
    var errorEl = document.getElementById('mood-error-msg');
    if (errorEl) errorEl.remove();
    apiCall('/moods', 'POST', { name: name, emoji: chosenEmoji }, function(err, result) {
        if (err || result.status >= 400) {
            // 409 = already exists in DB but not showing — reload chips
            if (result && result.status === 409) {
                document.querySelectorAll('.chip.custom-chip').forEach(function(c) { c.closest('.chip-wrap').remove(); });
                apiCall('/moods', 'GET', null, function(e2, r2) {
                    if (e2 || !r2.data) return;
                    (Array.isArray(r2.data) ? r2.data : []).forEach(function(m) {
                        var chip = addChip(m.name, m.emoji, m.id);
                        if (managingMoods) chip.parentNode.querySelector('.chip-delete-btn').style.display = 'block';
                    });
                });
            }
            var msg = document.createElement('p');
            msg.id = 'mood-error-msg';
            msg.style.cssText = 'color:#e05c5c;font-size:12px;margin:8px 0 0;';
            msg.textContent = result && result.data && result.data.message ? result.data.message : 'could not create mood';
            document.getElementById('save-new-mood').insertAdjacentElement('afterend', msg);
            return;
        }
        var chip = addChip(result.data.name, result.data.emoji, result.data.id);
        chip.parentNode.querySelector('.chip-delete-btn').style.display = 'block';
        document.getElementById('new-mood-input').value = '';
        chosenEmoji = '🎵';
        document.getElementById('chosen-emoji').innerHTML = MoodFX.icon('note');
        addMoodSection.querySelectorAll('.emoji-opt').forEach(function(b) { b.style.borderColor = 'transparent'; });
        // close manage mode after adding
        managingMoods = false;
        manageMoodsBtn.textContent = 'manage moods';
        manageMoodsBtn.style.border = 'none';
        manageMoodsBtn.style.borderBottom = '1px solid #333';
        manageMoodsBtn.style.padding = '2px 0';
        manageMoodsBtn.style.borderRadius = '0';
        manageMoodsBtn.style.color = '#9a9a9a';
        document.querySelectorAll('.chip-delete-btn').forEach(function(b) { b.style.display = 'none'; });
        addMoodSection.style.display = 'none';
    });
});

// load custom moods from backend
apiCall('/moods', 'GET', null, function(err, result) {
    if (err || !result.data) return;
    var customs = Array.isArray(result.data) ? result.data : [];
    customs.forEach(function(m) { addChip(m.name, m.emoji, m.id); });
});

// ── search ─────────────────────────────────────────────
var searchTimer = null;
songSearch.addEventListener('input', function() {
    clearTimeout(searchTimer);
    var q = songSearch.value.trim();
    if (!q) { searchResults.innerHTML = ''; return; }
    searchTimer = setTimeout(function() { doSearch(q); }, 350);
});

// searches go through the backend (/spotify/search-tracks) so the Spotify
// client secret never has to be shipped to the browser
var latestQuery = '';
function doSearch(query) {
    latestQuery = query;
    if (!searchResults.children.length) searchResults.innerHTML = MoodFX.skeleton('rows', 3);
    apiCall('/spotify/search-tracks?q=' + encodeURIComponent(query) + '&limit=5', 'GET', null, function(err, res) {
        if (query !== latestQuery) return;               // a newer search already started
        if (err || !res || res.status !== 200 || !Array.isArray(res.data)) {
            searchResults.innerHTML = MoodFX.emptyState({ art: 'offline', compact: true, title: 'search is taking a break', text: 'couldn’t reach spotify — try again in a moment' });
            return;
        }
        showResults(res.data);
    });
}

function showResults(tracks) {
    searchResults.innerHTML = '';
    if (!tracks || tracks.length === 0) {
        searchResults.innerHTML = MoodFX.emptyState({ art: 'search', compact: true, title: 'no matches', text: 'try a different spelling, or search by artist' });
        return;
    }
    tracks.forEach(function(track) {
        var images  = track.album.images;
        var art     = images && images.length > 0 ? (images[1] ? images[1].url : images[0].url) : '';
        var artists = track.artists.map(function(a) { return a.name; }).join(', ');

        var item = document.createElement('div');
        item.classList.add('result-item');
        item.innerHTML =
            (art ? '<img src="' + MoodFX.esc(art) + '" alt="album art" />' : '<div style="width:44px;height:44px;background:#2a2a2a;border-radius:6px;flex-shrink:0;"></div>') +
            '<div class="result-text"><div class="result-title">' + MoodFX.esc(track.name) + '</div><div class="result-artist">' + MoodFX.esc(artists) + '</div></div>' +
            '<span class="result-hint">▶ play</span>';

        item.addEventListener('click', function() {
            document.querySelectorAll('.result-item').forEach(function(el) { el.classList.remove('selected'); });
            item.classList.add('selected');

            var existing = document.getElementById('search-note-panel');
            if (existing) existing.remove();

            var panel = document.createElement('div');
            panel.id = 'search-note-panel';
            panel.className = 'search-note-panel';   // colours follow the mood (see motion.css)

            var moodPickerHTML = !selectedMood
                ? '<div style="margin-bottom:12px;"><div style="font-size:12px;color:#888;margin-bottom:8px;">pick a mood first</div><div class="inline-mood-picker" style="display:flex;flex-wrap:wrap;gap:6px;">' +
                      MoodFX.visibleMoods().map(function(m) {
                          var custom = document.querySelector('.mood-chips .custom-chip[data-mood="' + CSS.escape(m) + '"]');
                          return '<button class="chip inline-mood-chip" data-mood="' + MoodFX.esc(m) + '"' + (custom && custom.dataset.emoji ? ' data-emoji="' + MoodFX.esc(custom.dataset.emoji) + '"' : '') + ' style="font-size:11px;padding:5px 10px;">' + MoodFX.esc(m) + '</button>';
                      }).join('') + '</div></div>'
                : '';

            panel.innerHTML =
                moodPickerHTML +
                '<div style="font-size:12px;color:#888;margin-bottom:8px;">add a note to look back on? <span style="color:#555;">— you can always add one later</span></div>' +
                '<textarea id="search-note-input" class="note-textarea" style="height:64px;" placeholder="e.g. first time hearing this, reminds me of..."></textarea>' +
                '<div class="note-btn-row" style="margin-top:10px;">' +
                    '<button class="skip-note-btn" id="just-play-btn">▶ just play</button>' +
                    '<button class="save-note-btn" id="play-with-note-btn">▶ play + save note</button>' +
                '</div>';

            item.insertAdjacentElement('afterend', panel);

            panel.querySelectorAll('.inline-mood-chip').forEach(function(chip) {
                chip.addEventListener('click', function(e) {
                    e.stopPropagation();
                    panel.querySelectorAll('.inline-mood-chip').forEach(function(c) { c.classList.remove('selected'); });
                    chip.classList.add('selected');
                    chips.forEach(function(c) { c.classList.remove('selected'); });
                    document.querySelectorAll('.chip[data-mood="' + CSS.escape(chip.dataset.mood) + '"]').forEach(function(c) { c.classList.add('selected'); });
                    selectedMood = chip.dataset.mood;
                    document.getElementById('search-note-input').focus();
                });
            });

            if (selectedMood) document.getElementById('search-note-input').focus();

            // the song is logged (and its play counted) once it's opened in spotify.
            // cancelling the "open in spotify" popup logs nothing and keeps your note here
            function playFromSearch(note) {
                var mood = selectedMood;
                openSpotify(track.external_urls.spotify, { onOpen: function() {
                    panel.remove();
                    logSong(track.id, track.name, artists, art, track.external_urls.spotify, mood, note);
                } });
            }

            document.getElementById('just-play-btn').addEventListener('click', function() {
                if (!selectedMood) { MoodFX.nudgeMoods(panel); return; }
                playFromSearch('');
            });

            document.getElementById('play-with-note-btn').addEventListener('click', function() {
                if (!selectedMood) { MoodFX.nudgeMoods(panel); return; }
                playFromSearch(document.getElementById('search-note-input').value.trim());
            });
        });

        searchResults.appendChild(item);
    });
}

// ── log song ───────────────────────────────────────────
function logSong(songId, title, artist, albumArt, spotifyUrl, mood, note) {
    apiCall('/logs', 'POST', { song_id: songId, title: title, artist: artist, album_art: albumArt, spotify_url: spotifyUrl, mood: mood, note: note || '', tz_offset: tzOffset() }, function(err) {
        if (err) { console.error('log error:', err); MoodFX.toast('couldn’t log that song — try again'); return; }
        searchResults.innerHTML = '';
        songSearch.value = '';
        MoodFX.toast('logged “' + title + '” as ' + mood, mood);
        loadLogs(songId);
    });
}

// ── load logs ──────────────────────────────────────────
function loadLogs(highlightSongId) {
    if (!logsList.children.length) logsList.innerHTML = MoodFX.skeleton('rows', 4);
    var highlighted = false;
    apiCallCached('/logs/recent', function(err, result) {
        if (err) { logsList.innerHTML = MoodFX.emptyState({ art: 'offline', title: 'couldn’t load your journal', text: 'check your connection and give it another go', action: { label: 'try again', reload: true } }); return; }
        var logs = Array.isArray(result.data) ? result.data : [];
        logsList.innerHTML = '';
        if (logs.length === 0) {
            logsList.innerHTML = MoodFX.emptyState({ title: 'your journal is empty', text: 'pick how you’re feeling, then search for the song you’re listening to — it’ll show up here', action: { label: 'search for a song', focus: '#song-search' } });
            return;
        }

        // group by date
        var grouped = {};
        logs.slice(0, 30).forEach(function(log) {
            var key = new Date(log.last_logged.replace(' ', 'T') + 'Z').toDateString();
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(log);
        });

        Object.keys(grouped)
            .sort(function(a, b) { return new Date(b) - new Date(a); })
            .forEach(function(key) {
                var dateLabel = document.createElement('div');
                dateLabel.classList.add('timeline-date');
                dateLabel.textContent = formatDateOnly(key);
                logsList.appendChild(dateLabel);

                grouped[key].forEach(function(log) {
                    var card = document.createElement('div');
                    card.classList.add('log-card');
                    card.id = 'log-' + log.id;
                    if (highlightSongId && !highlighted && log.song_id === highlightSongId) {
                        card.classList.add('just-logged');
                        highlighted = true;
                    }
                    card.innerHTML =
                        '<img class="song-art" src="' + MoodFX.esc(log.album_art) + '" alt="album art" />' +
                        '<div class="song-info">' +
                            '<div class="song-title">' + MoodFX.esc(log.title) + '</div>' +
                            '<div class="song-artist">' + MoodFX.esc(log.artist) + '</div>' +
                            (log.note ? '<div class="log-note">"' + MoodFX.esc(log.note) + '"</div>' : '') +
                            '<div class="log-meta">' +
                                '<span class="mood-badge">' + MoodFX.esc(log.mood) + '</span>' +
                                '<span class="plays-text">' + playsLabel(log.play_count) + '</span>' +
                                '<span class="date-text">' + formatTimestamp(log.last_logged) + '</span>' +
                            '</div>' +
                        '</div>' +
                        '<button class="play-btn log-play-btn" data-id="' + log.id + '" data-song-id="' + log.song_id + '" data-mood="' + MoodFX.esc(log.mood) + '" data-title="' + MoodFX.esc(log.title) + '" data-artist="' + MoodFX.esc(log.artist) + '" data-art="' + MoodFX.esc(log.album_art) + '" data-url="' + MoodFX.esc(log.spotify_url) + '">▶</button>';
                    logsList.appendChild(card);
                });
            });
    });
}

// ── click handlers ─────────────────────────────────────
document.addEventListener('click', function(e) {
    if (e.target.classList.contains('log-play-btn')) {
        var playBtn = e.target;
        openSpotify(playBtn.dataset.url, { onOpen: function() {
            recordPlay(playBtn.dataset.songId, playBtn.dataset.mood, function(ok) {
                if (ok) loadLogs(playBtn.dataset.songId);
                else MoodFX.toast('couldn’t count that play — try again');
            });
        } });
    }
    if (e.target.classList.contains('journal-delete-btn')) {
        var logId = e.target.dataset.id;
        var card = document.getElementById('log-' + logId);
        MoodFX.undoable({
            message: 'removed from your journal',
            hide:    function() { if (card) card.style.display = 'none'; },
            restore: function() { if (card) card.style.display = ''; },
            commit:  function() { apiCall('/logs/' + logId, 'DELETE', null, function(err) { if (!err && card) card.remove(); }); }
        });
    }
});

// ── sessions ───────────────────────────────────────────
function startSession(mood) {
    apiCall('/sessions', 'POST', { mood: mood }, function(err, result) {
        if (err || result.status !== 201) return;
        activeSession = { id: result.data.session_id, mood: mood, startTime: new Date() };
        localStorage.setItem('moodtunes_session', JSON.stringify({ id: result.data.session_id, mood: mood, startTime: new Date().toISOString() }));
        MoodFX.setMood(mood);
        MoodFX.toast(mood + ' session started — songs you play on spotify will be added automatically', mood);
        showSessionPanel(mood);
    });
}

function showSessionPanel(mood) {
    MoodFX.setSessionLive(true);
    sessionPanel.classList.remove('hidden');
    sessionLabel.textContent = mood + ' session active';
    sessionTime.textContent  = '· started at ' + new Date().toLocaleTimeString('en-SG', { hour: 'numeric', minute: '2-digit', hour12: true });
    sessionBtn.textContent   = '■ session active';
    sessionBtn.classList.add('active-session');
    loadSessionRecs(mood);
}

function loadSessionRecs(mood) {
    // don't reload if recs are already showing
    if (sessionRecs.querySelector('.session-rec-card')) return;
    sessionRecs.innerHTML = MoodFX.skeleton('recs', 7);
    apiCall('/logs/mood/' + mood, 'GET', null, function(err, result) {
        var logs = Array.isArray(result && result.data) ? result.data : [];
        if (err || logs.length === 0) {
            sessionRecs.innerHTML = MoodFX.emptyState({ compact: true, title: 'no ' + mood + ' songs yet', text: 'log a few ' + mood + ' songs and recommendations will appear here', action: { label: 'search for a song', focus: '#song-search' } });
            return;
        }
        logs.sort(function(a, b) { return b.play_count - a.play_count; });
        var seed = logs[0];

        // collect up to 4 different artists from the mood for diversity
        var seen = {};
        var extraArtists = [];
        logs.forEach(function(l) {
            var a = l.artist.split(',')[0].trim(); // first artist only
            if (a !== seed.artist && !seen[a]) { seen[a] = true; extraArtists.push(a); }
        });

        var url = '/spotify/recommendations?artist=' + encodeURIComponent(seed.artist) + '&title=' + encodeURIComponent(seed.title) + '&mood=' + encodeURIComponent(mood);
        if (extraArtists.length > 0) url += '&seeds=' + encodeURIComponent(extraArtists.slice(0, 4).join('||'));

        apiCall(url, 'GET', null, function(err2, rec) {
            if (err2 || !rec || !rec.data || !rec.data.tracks || rec.data.tracks.length === 0) {
                sessionRecs.innerHTML = MoodFX.emptyState({ art: 'search', compact: true, title: 'no recommendations yet', text: 'log a few more songs in this mood to help us find similar ones' });
                return;
            }
            sessionRecs.innerHTML = '';
            rec.data.tracks.forEach(function(track) {
                var card = document.createElement('div');
                card.classList.add('session-rec-card');
                card.innerHTML =
                    '<div class="rec-img-wrap">' +
                        (track.albumArt ? '<img src="' + MoodFX.esc(track.albumArt) + '" alt="album art" />' : '<div class="rec-no-art">' + MoodFX.icon('note') + '</div>') +
                        '<div class="rec-play-overlay"><button class="play-btn">▶</button></div>' +
                    '</div>' +
                    '<div class="rec-title">' + MoodFX.esc(track.title) + '</div>' +
                    '<div class="rec-artist">' + MoodFX.esc(track.artist) + '</div>';
                card.addEventListener('click', (function(t) {
                    return function() {
                        openSpotify(t.spotifyUrl);
                        if (activeSession) {
                            var tid = t.spotifyUrl.split('/track/')[1];
                            if (tid) tid = tid.split('?')[0];
                            MoodFX.markSessionSong(activeSession.id, tid || t.id);
                            apiCall('/sessions/songs', 'POST', { session_id: activeSession.id, song_id: tid || t.id, title: t.title, artist: t.artist, album_art: t.albumArt, spotify_url: t.spotifyUrl }, function() {});
                        }
                    };
                })(track));
                sessionRecs.appendChild(card);
            });
        });
    });
}

function endSession() {
    if (!activeSession) return;
    apiCall('/sessions/' + activeSession.id + '/end', 'PUT', null, function(err, result) {
        if (err) return;
        var mood = activeSession.mood, startTime = activeSession.startTime, endTime = new Date();
        var songs = result.data && result.data.songs ? result.data.songs : [];
        activeSession = null;
        localStorage.removeItem('moodtunes_session');
        MoodFX.setSessionLive(false);
        sessionPanel.classList.add('hidden');
        sessionBtn.textContent = '▶ start session';
        sessionBtn.classList.remove('active-session');
        showSessionSummary(mood, startTime, endTime, songs);
    });
}

function showSessionSummary(mood, startTime, endTime, songs) {
    MoodFX.sessionSummary(mood, startTime, endTime, songs);
}

sessionBtn.addEventListener('click', function() {
    if (activeSession) { endSession(); }
    else { if (!selectedMood) { MoodFX.nudgeMoods(); return; } startSession(selectedMood); }
});
sessionEndBtn.addEventListener('click', endSession);
var _lb = document.getElementById('logout-btn'); if (_lb) _lb.addEventListener('click', logout);

// plays count when a song is opened from moodtunes, plus repeats of that song while
// spotify loops it (checked by syncLoopPlays in api.js). the old sync that counted
// everything in spotify's "recently played" is gone; clear its bookmark
try { localStorage.removeItem('moodtunes_last_sync'); } catch (e) {}
window.addEventListener('moodtunes:plays-updated', function(e) { loadLogs(e.detail && e.detail.song_id); });

// boot — sessions only start when you click the button
// but if YOU started one this browser session, restore it across tab switches
loadLogs();

var nowPlayingCard = MoodFX.nowPlaying(document.getElementById('now-playing'), {
    compact: true,
    hideWhenIdle: true,
    getSession: function() { return activeSession; }
});

var savedSession = localStorage.getItem('moodtunes_session');
if (savedSession) {
    try {
        var s = JSON.parse(savedSession);
        // verify it's still active in the DB before restoring
        apiCall('/sessions/active', 'GET', null, function(err, result) {
            if (err || result.status !== 200 || result.data.id !== s.id) {
                // session ended on server side, clear local storage
                localStorage.removeItem('moodtunes_session');
                return;
            }
            activeSession = { id: s.id, mood: s.mood, startTime: new Date(s.startTime) };
            chips.forEach(function(c) { if (c.dataset.mood === s.mood) c.classList.add('selected'); });
            sessionPanel.classList.remove('hidden');
            sessionLabel.textContent = s.mood + ' session active';
            sessionTime.textContent  = '· started at ' + new Date(s.startTime).toLocaleTimeString('en-SG', { hour: 'numeric', minute: '2-digit', hour12: true });
            sessionBtn.textContent   = '■ session active';
            sessionBtn.classList.add('active-session');
            loadSessionRecs(s.mood);
            if (nowPlayingCard) nowPlayingCard.refresh();   // log whatever is already playing
        });
    } catch(e) { localStorage.removeItem('moodtunes_session'); }
}

// help modal is handled by js/help.js