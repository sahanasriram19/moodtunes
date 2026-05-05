// app.js — journal page
requireAuth();

var selectedMood  = null;
var activeSession = null;
var spotifyToken  = null;

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

// ── spotify search token ───────────────────────────────
async function loadSpotifyToken() {
    try {
        var creds = btoa(CONFIG.SPOTIFY_CLIENT_ID + ':' + CONFIG.SPOTIFY_CLIENT_SECRET);
        var r = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: { 'Authorization': 'Basic ' + creds, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'grant_type=client_credentials'
        });
        spotifyToken = (await r.json()).access_token;
    } catch(e) { console.error('spotify token:', e); }
}

// ── custom moods ───────────────────────────────────────
var EMOJIS = ['🎵','🌟','💫','🔥','❤️','💜','💙','🌙','⚡','🌈','🎶','🎸','🎹','🥺','😤','🤩','😴','🌊','🍃','✨','🎯','💪','🧠','👻','🦋','🌸','🌺','🎪','🏆','💎'];
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
    delBtn.innerHTML = '🗑';
    delBtn.style.cssText = 'display:none;background:none;border:none;color:#e05c5c;font-size:20px;padding:2px 4px;cursor:pointer;line-height:1;';
    delBtn.addEventListener('click', function() {
        delBtn.innerHTML = '...'; delBtn.disabled = true;
        apiCall('/moods/' + id, 'DELETE', null, function() {
            if (selectedMood === name) selectedMood = null;
            wrap.remove();
        });
    });

    wrap.appendChild(chip);
    wrap.appendChild(delBtn);
    moodChipsContainer.insertBefore(wrap, document.getElementById('manage-moods-btn'));
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
    delBtn.innerHTML = '🗑';
    delBtn.style.cssText = 'display:none;background:none;border:none;color:#e05c5c;font-size:20px;padding:2px 4px;cursor:pointer;line-height:1;';
    delBtn.addEventListener('click', function() {
        wrap.remove();
        if (selectedMood === chip.dataset.mood) selectedMood = null;
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
manageMoodsBtn.style.cssText = 'background:none;border:none;border-bottom:1px solid #333;color:#555;font-size:12px;padding:2px 0;cursor:pointer;margin-top:14px;display:block;letter-spacing:0.04em;transition:color 0.15s,border-color 0.15s;';
manageMoodsBtn.addEventListener('mouseover', function() { this.style.color = '#aaa'; });
manageMoodsBtn.addEventListener('mouseout', function() {
    this.style.color = managingMoods ? '#7f77dd' : '#555';
    this.style.borderColor = managingMoods ? '#7f77dd' : '#333';
});
manageMoodsBtn.addEventListener('click', function() {
    managingMoods = !managingMoods;
    manageMoodsBtn.textContent = managingMoods ? 'done' : 'manage moods';
    manageMoodsBtn.style.border = managingMoods ? '1px solid #7f77dd' : 'none';
    manageMoodsBtn.style.borderBottom = managingMoods ? '1px solid #7f77dd' : '1px solid #333';
    manageMoodsBtn.style.padding = managingMoods ? '4px 14px' : '2px 0';
    manageMoodsBtn.style.borderRadius = managingMoods ? '20px' : '0';
    manageMoodsBtn.style.color = managingMoods ? '#7f77dd' : '#555';
    
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
    '<div style="font-size:12px;color:#888;margin-bottom:8px;">pick an emoji <span id="chosen-emoji" style="font-size:16px;margin-left:6px;">🎵</span></div>' +
    '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px;">' +
        EMOJIS.map(function(e) {
            return '<button class="emoji-opt" data-emoji="' + e + '" style="background:none;border:2px solid transparent;border-radius:6px;font-size:20px;cursor:pointer;padding:3px;">' + e + '</button>';
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
        document.getElementById('chosen-emoji').textContent = chosenEmoji;
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
        document.getElementById('chosen-emoji').textContent = '🎵';
        addMoodSection.querySelectorAll('.emoji-opt').forEach(function(b) { b.style.borderColor = 'transparent'; });
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

async function doSearch(query) {
    if (!spotifyToken) { await loadSpotifyToken(); }
    try {
        var r = await fetch('https://api.spotify.com/v1/search?q=' + encodeURIComponent(query) + '&type=track&limit=5', {
            headers: { 'Authorization': 'Bearer ' + spotifyToken }
        });
        var data = await r.json();
        if (data.error && data.error.status === 401) { await loadSpotifyToken(); return doSearch(query); }
        showResults(data.tracks ? data.tracks.items : []);
    } catch(e) { console.error('search:', e); }
}

function showResults(tracks) {
    searchResults.innerHTML = '';
    if (!tracks || tracks.length === 0) {
        searchResults.innerHTML = '<p style="color:#555;font-size:13px;padding:8px 0;">no results found</p>';
        return;
    }
    tracks.forEach(function(track) {
        var images  = track.album.images;
        var art     = images && images.length > 0 ? (images[1] ? images[1].url : images[0].url) : '';
        var artists = track.artists.map(function(a) { return a.name; }).join(', ');

        var item = document.createElement('div');
        item.classList.add('result-item');
        item.innerHTML =
            (art ? '<img src="' + art + '" alt="album art" />' : '<div style="width:44px;height:44px;background:#2a2a2a;border-radius:6px;flex-shrink:0;"></div>') +
            '<div class="result-text"><div class="result-title">' + track.name + '</div><div class="result-artist">' + artists + '</div></div>' +
            '<span class="result-hint">▶ play</span>';

        item.addEventListener('click', function() {
            document.querySelectorAll('.result-item').forEach(function(el) { el.classList.remove('selected'); });
            item.classList.add('selected');

            var existing = document.getElementById('search-note-panel');
            if (existing) existing.remove();

            var panel = document.createElement('div');
            panel.id = 'search-note-panel';
            panel.style.cssText = 'background:#1a1a2e;border:1px solid #7f77dd44;border-radius:10px;padding:14px 16px;margin:4px 0 8px;';

            var moodPickerHTML = !selectedMood
                ? '<div style="margin-bottom:12px;"><div style="font-size:12px;color:#888;margin-bottom:8px;">pick a mood first</div><div style="display:flex;flex-wrap:wrap;gap:6px;">' +
                      ['happy','sad','hype','heartbreak','nostalgic','focused','chill'].map(function(m) {
                          return '<button class="chip inline-mood-chip" data-mood="' + m + '" style="font-size:11px;padding:5px 10px;">' + m + '</button>';
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
                    document.querySelectorAll('.chip[data-mood="' + chip.dataset.mood + '"]').forEach(function(c) { c.classList.add('selected'); });
                    selectedMood = chip.dataset.mood;
                    document.getElementById('search-note-input').focus();
                });
            });

            if (selectedMood) document.getElementById('search-note-input').focus();

            document.getElementById('just-play-btn').addEventListener('click', function() {
                if (!selectedMood) { alert('pick a mood first!'); return; }
                panel.remove();
                logSong(track.id, track.name, artists, art, track.external_urls.spotify, selectedMood, '');
                openSpotify(track.external_urls.spotify);
            });

            document.getElementById('play-with-note-btn').addEventListener('click', function() {
                if (!selectedMood) { alert('pick a mood first!'); return; }
                var note = document.getElementById('search-note-input').value.trim();
                panel.remove();
                logSong(track.id, track.name, artists, art, track.external_urls.spotify, selectedMood, note);
                openSpotify(track.external_urls.spotify);
            });
        });

        searchResults.appendChild(item);
    });
}

// ── log song ───────────────────────────────────────────
function logSong(songId, title, artist, albumArt, spotifyUrl, mood, note) {
    apiCall('/logs', 'POST', { song_id: songId, title: title, artist: artist, album_art: albumArt, spotify_url: spotifyUrl, mood: mood, note: note || '' }, function(err) {
        if (err) { console.error('log error:', err); return; }
        searchResults.innerHTML = '';
        songSearch.value = '';
        loadLogs();
    });
}

// ── load logs ──────────────────────────────────────────
function loadLogs() {
    apiCall('/logs/recent', 'GET', null, function(err, result) {
        if (err) return;
        var logs = Array.isArray(result.data) ? result.data : [];
        logsList.innerHTML = '';
        if (logs.length === 0) {
            logsList.innerHTML = '<p style="color:#555;font-size:14px;">no songs logged yet — search for a song above!</p>';
            return;
        }

        // group by date
        var grouped = {};
        logs.slice(0, 30).forEach(function(log) {
            var key = new Date(log.last_logged).toDateString();
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
                    card.innerHTML =
                        '<img class="song-art" src="' + log.album_art + '" alt="album art" />' +
                        '<div class="song-info">' +
                            '<div class="song-title">' + log.title + '</div>' +
                            '<div class="song-artist">' + log.artist + '</div>' +
                            (log.note ? '<div class="log-note">"' + log.note + '"</div>' : '') +
                            '<div class="log-meta">' +
                                '<span class="mood-badge">' + log.mood + '</span>' +
                                '<span class="plays-text">' + log.play_count + ' play' + (log.play_count !== 1 ? 's' : '') + '</span>' +
                                '<span class="date-text">' + formatTimestamp(log.last_logged) + '</span>' +
                            '</div>' +
                        '</div>' +
                        '<button class="play-btn log-play-btn" data-id="' + log.id + '" data-song-id="' + log.song_id + '" data-mood="' + log.mood + '" data-title="' + log.title.replace(/"/g, '&quot;') + '" data-artist="' + log.artist.replace(/"/g, '&quot;') + '" data-art="' + log.album_art + '" data-url="' + log.spotify_url + '">▶</button>';
                    logsList.appendChild(card);
                });
            });
    });
}

// ── click handlers ─────────────────────────────────────
document.addEventListener('click', function(e) {
    if (e.target.classList.contains('log-play-btn')) {
        var url = e.target.dataset.url;
        var sid = e.target.dataset.songId;
        var moo = e.target.dataset.mood;
        openSpotify(url);
        // increment play count then reload so song moves to top
        apiCall('/logs', 'POST', {
            song_id: sid, title: e.target.dataset.title, artist: e.target.dataset.artist,
            album_art: e.target.dataset.art, spotify_url: url, mood: moo, note: ''
        }, function() { loadLogs(); });
    }
    if (e.target.classList.contains('journal-delete-btn')) {
        if (!confirm('remove this song from your journal?')) return;
        apiCall('/logs/' + e.target.dataset.id, 'DELETE', null, function(err) {
            if (!err) { var c = document.getElementById('log-' + e.target.dataset.id); if (c) c.remove(); }
        });
    }
});

// ── sessions ───────────────────────────────────────────
function startSession(mood) {
    apiCall('/sessions', 'POST', { mood: mood }, function(err, result) {
        if (err || result.status !== 201) return;
        activeSession = { id: result.data.session_id, mood: mood, startTime: new Date() };
        localStorage.setItem('moodtunes_session', JSON.stringify({ id: result.data.session_id, mood: mood, startTime: new Date().toISOString() }));
        showSessionPanel(mood);
    });
}

function showSessionPanel(mood) {
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
    sessionRecs.innerHTML = '<p style="color:#666;font-size:13px;">loading recommendations...</p>';
    apiCall('/logs/mood/' + mood, 'GET', null, function(err, result) {
        var logs = Array.isArray(result && result.data) ? result.data : [];
        if (err || logs.length === 0) {
            sessionRecs.innerHTML = '<p style="color:#666;font-size:13px;">log some ' + mood + ' songs first to get recommendations</p>';
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

        var url = '/spotify/recommendations?artist=' + encodeURIComponent(seed.artist) + '&title=' + encodeURIComponent(seed.title);
        if (extraArtists.length > 0) url += '&seeds=' + encodeURIComponent(extraArtists.slice(0, 4).join('||'));

        apiCall(url, 'GET', null, function(err2, rec) {
            if (err2 || !rec || !rec.data || !rec.data.tracks || rec.data.tracks.length === 0) {
                sessionRecs.innerHTML = '<p style="color:#666;font-size:13px;">no recommendations found — try logging more songs</p>';
                return;
            }
            sessionRecs.innerHTML = '';
            rec.data.tracks.forEach(function(track) {
                var card = document.createElement('div');
                card.classList.add('session-rec-card');
                card.innerHTML =
                    '<div class="rec-img-wrap">' +
                        (track.albumArt ? '<img src="' + track.albumArt + '" alt="album art" />' : '<div class="rec-no-art">♪</div>') +
                        '<div class="rec-play-overlay"><button class="play-btn">▶</button></div>' +
                    '</div>' +
                    '<div class="rec-title">' + track.title + '</div>' +
                    '<div class="rec-artist">' + track.artist + '</div>';
                card.addEventListener('click', (function(t) {
                    return function() {
                        openSpotify(t.spotifyUrl);
                        if (activeSession) {
                            var tid = t.spotifyUrl.split('/track/')[1];
                            if (tid) tid = tid.split('?')[0];
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
        sessionPanel.classList.add('hidden');
        sessionBtn.textContent = '▶ start session';
        sessionBtn.classList.remove('active-session');
        showSessionSummary(mood, startTime, endTime, songs);
    });
}

function showSessionSummary(mood, startTime, endTime, songs) {
    var mins = Math.floor((endTime - startTime) / 60000);
    var overlay = document.createElement('div');
    overlay.classList.add('session-summary');
    overlay.innerHTML =
        '<div class="session-summary-box">' +
            '<div class="session-summary-title">' + mood + ' session complete</div>' +
            '<div class="session-summary-meta">' + startTime.toLocaleTimeString('en-SG', {hour:'numeric',minute:'2-digit',hour12:true}) + ' – ' + endTime.toLocaleTimeString('en-SG', {hour:'numeric',minute:'2-digit',hour12:true}) + ' · ' + mins + ' min · ' + songs.length + ' song' + (songs.length !== 1 ? 's' : '') + '</div>' +
            (songs.length > 0
                ? '<div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:16px;">' + songs.map(function(s) { return '<div style="text-align:center;width:60px;"><img src="' + s.album_art + '" style="width:52px;height:52px;border-radius:8px;object-fit:cover;" /><p style="font-size:10px;color:#888;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;width:60px;">' + s.title + '</p></div>'; }).join('') + '</div>'
                : '<p style="color:#555;font-size:13px;">no songs logged during this session</p>') +
            '<button class="session-summary-close" id="close-summary">done</button>' +
        '</div>';
    document.body.appendChild(overlay);
    document.getElementById('close-summary').addEventListener('click', function() { overlay.remove(); });
}

sessionBtn.addEventListener('click', function() {
    if (activeSession) { endSession(); }
    else { if (!selectedMood) { alert('pick a mood first!'); return; } startSession(selectedMood); }
});
sessionEndBtn.addEventListener('click', endSession);
document.getElementById('logout-btn').addEventListener('click', logout);

// ── sync play counts from spotify recently played ──────
function syncSpotifyPlays() {
    apiCall('/spotify/recently-played', 'GET', null, function(err, result) {
        if (err || !result || !result.data || !Array.isArray(result.data)) return;

        var items = result.data;
        var todayStr = new Date().toDateString();
        var playCounts = {};
        items.forEach(function(item) {
            if (new Date(item.played_at).toDateString() !== todayStr) return;
            var tid = item.track.id;
            playCounts[tid] = (playCounts[tid] || 0) + 1;
        });

        if (Object.keys(playCounts).length === 0) return;

        apiCall('/logs/recent', 'GET', null, function(err2, logsResult) {
            if (err2 || !logsResult || !Array.isArray(logsResult.data)) return;
            var logs = logsResult.data;
            var pending = [];

            logs.forEach(function(log) {
                var parts = log.spotify_url ? log.spotify_url.split('/track/') : [];
                var trackId = parts[1] ? parts[1].split('?')[0] : null;
                if (!trackId || !playCounts[trackId]) return;
                if (playCounts[trackId] <= log.play_count) return;

                var diff = playCounts[trackId] - log.play_count;
                pending.push({ log: log, diff: diff });
            });

            if (pending.length === 0) return;

            // batch all increments then reload once
            var done = 0;
            var total = pending.reduce(function(sum, p) { return sum + p.diff; }, 0);

            pending.forEach(function(p) {
                for (var i = 0; i < p.diff; i++) {
                    apiCall('/logs', 'POST', {
                        song_id: p.log.song_id, title: p.log.title, artist: p.log.artist,
                        album_art: p.log.album_art, spotify_url: p.log.spotify_url,
                        mood: p.log.mood, note: p.log.note || ''
                    }, function() {
                        done++;
                        if (done >= total) loadLogs();
                    });
                }
            });
        });
    });
}

// sync when tab becomes visible again
document.addEventListener('visibilitychange', function() {
    if (!document.hidden) syncSpotifyPlays();
});

// boot — sessions only start when you click the button
// but if YOU started one this browser session, restore it across tab switches
loadSpotifyToken();
loadLogs();

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
        });
    } catch(e) { localStorage.removeItem('moodtunes_session'); }
}

syncSpotifyPlays();
setInterval(syncSpotifyPlays, 120000);

// help modal is handled by js/help.js