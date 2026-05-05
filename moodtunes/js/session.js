// session.js — concept C: timer hero, horizontal scroll recs
requireAuth();

var chips           = document.querySelectorAll('.chip');
var discoverContent = document.getElementById('discover-content');
var sessionControls = document.getElementById('session-controls');
var sessionMoodLabel = document.getElementById('session-mood-label');
var sessionTimerEl  = document.getElementById('session-timer');
var sessionStartBtn = document.getElementById('session-start-btn');
var sessionEndBtn   = document.getElementById('session-end-btn');
var sessionRefreshBtn = document.getElementById('session-refresh-btn');

var selectedMood  = null;
var activeSession = null;
var timerInterval = null;

// ── mood chips ─────────────────────────────────────────
chips.forEach(function(chip) {
    chip.addEventListener('click', function() {
        document.querySelectorAll('.chip').forEach(function(c) { c.classList.remove('selected'); });
        chip.classList.add('selected');
        selectedMood = chip.dataset.mood;
        sessionControls.classList.remove('hidden');
        sessionMoodLabel.textContent = chip.dataset.mood + ' session';
        if (!activeSession) {
            sessionStartBtn.classList.remove('hidden');
            sessionEndBtn.classList.add('hidden');
            sessionRefreshBtn.classList.add('hidden');
            sessionTimerEl.textContent = '00:00';
        }
        loadRecommendations(chip.dataset.mood);
    });
});

// ── timer ──────────────────────────────────────────────
function startTimer(startTime) {
    clearInterval(timerInterval);
    timerInterval = setInterval(function() {
        var elapsed = Math.floor((new Date() - startTime) / 1000);
        var mins = Math.floor(elapsed / 60);
        var secs = elapsed % 60;
        sessionTimerEl.textContent = (mins < 10 ? '0' : '') + mins + ':' + (secs < 10 ? '0' : '') + secs;
    }, 1000);
}

// ── session controls ───────────────────────────────────
sessionStartBtn.addEventListener('click', function() {
    if (!selectedMood) return;
    apiCall('/sessions', 'POST', { mood: selectedMood }, function(err, result) {
        if (err || result.status !== 201) return;
        var startTime = new Date();
        activeSession = { id: result.data.session_id, mood: selectedMood, startTime: startTime };
        localStorage.setItem('moodtunes_session', JSON.stringify({ id: result.data.session_id, mood: selectedMood, startTime: startTime.toISOString() }));
        sessionStartBtn.classList.add('hidden');
        sessionEndBtn.classList.remove('hidden');
        sessionRefreshBtn.classList.remove('hidden');
        startTimer(startTime);
    });
});

sessionEndBtn.addEventListener('click', endSession);
sessionRefreshBtn.addEventListener('click', function() {
    if (selectedMood) loadRecommendations(selectedMood);
});

function endSession() {
    if (!activeSession) return;
    clearInterval(timerInterval);
    apiCall('/sessions/' + activeSession.id + '/end', 'PUT', null, function(err, result) {
        if (err) return;
        var mood = activeSession.mood, startTime = activeSession.startTime, endTime = new Date();
        var songs = result.data && result.data.songs ? result.data.songs : [];
        activeSession = null;
        localStorage.removeItem('moodtunes_session');
        sessionStartBtn.classList.remove('hidden');
        sessionEndBtn.classList.add('hidden');
        sessionRefreshBtn.classList.add('hidden');
        sessionTimerEl.textContent = '00:00';
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
            '<div class="session-summary-meta">' +
                startTime.toLocaleTimeString('en-SG', {hour:'numeric',minute:'2-digit',hour12:true}) + ' – ' +
                endTime.toLocaleTimeString('en-SG', {hour:'numeric',minute:'2-digit',hour12:true}) +
                ' · ' + mins + ' min · ' + songs.length + ' song' + (songs.length !== 1 ? 's' : '') +
            '</div>' +
            (songs.length > 0
                ? '<div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:16px;">' +
                    songs.map(function(s) {
                        return '<div style="text-align:center;width:60px;">' +
                            '<img src="' + s.album_art + '" style="width:52px;height:52px;border-radius:8px;object-fit:cover;" />' +
                            '<p style="font-size:10px;color:#888;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;width:60px;">' + s.title + '</p>' +
                        '</div>';
                    }).join('') + '</div>'
                : '<p style="color:#555;font-size:13px;margin-top:12px;">no songs logged during this session</p>') +
            '<button class="session-summary-close" id="close-summary">done</button>' +
        '</div>';
    document.body.appendChild(overlay);
    document.getElementById('close-summary').addEventListener('click', function() { overlay.remove(); });
}

// ── recommendations ────────────────────────────────────
function loadRecommendations(mood) {
    discoverContent.innerHTML = '<p style="color:#555;font-size:13px;">finding songs for your ' + mood + ' mood...</p>';

    apiCall('/logs/mood/' + mood, 'GET', null, function(err, result) {
        if (err || !result.data || result.data.length === 0) {
            discoverContent.innerHTML = '<p style="color:#555;font-size:13px;">log some ' + mood + ' songs in your journal first!</p>';
            return;
        }

        var logs = result.data;
        logs.sort(function(a, b) { return b.play_count - a.play_count; });
        var seed = logs[0];

        var seen = {};
        var extraArtists = [];
        logs.forEach(function(l) {
            var a = l.artist.split(',')[0].trim();
            if (a !== seed.artist && !seen[a]) { seen[a] = true; extraArtists.push(a); }
        });

        var recUrl = '/spotify/recommendations?artist=' + encodeURIComponent(seed.artist) + '&title=' + encodeURIComponent(seed.title);
        if (extraArtists.length > 0) recUrl += '&seeds=' + encodeURIComponent(extraArtists.slice(0, 4).join('||'));

        apiCall(recUrl, 'GET', null, function(err2, rec) {
            if (err2 || !rec || !rec.data || !rec.data.tracks || rec.data.tracks.length === 0) {
                discoverContent.innerHTML = '<p style="color:#555;font-size:13px;">couldn\'t find recommendations — try refreshing!</p>';
                return;
            }

            var loggedKeys = {};
            var loggedArtistCount = {};
            logs.forEach(function(l) {
                loggedKeys[l.title.toLowerCase() + '||' + l.artist.toLowerCase()] = true;
                l.artist.split(',').forEach(function(a) {
                    var name = a.trim().toLowerCase();
                    loggedArtistCount[name] = (loggedArtistCount[name] || 0) + 1;
                });
            });

            var tracks = rec.data.tracks.filter(function(t) {
                if (loggedKeys[t.title.toLowerCase() + '||' + t.artist.toLowerCase()]) return false;
                var tArtists = t.artist.split(',').map(function(a) { return a.trim().toLowerCase(); });
                return !tArtists.every(function(a) { return (loggedArtistCount[a] || 0) >= 3; });
            }).slice(0, 18);

            if (tracks.length === 0) {
                discoverContent.innerHTML = '<p style="color:#555;font-size:13px;">no new recommendations — try refreshing!</p>';
                return;
            }

            discoverContent.innerHTML = '';
            var grid = document.createElement('div');
            grid.style.cssText = 'display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px;align-items:start;width:100%;';

            tracks.forEach(function(track) {
                var card = document.createElement('div');
                card.style.cssText = 'display:flex;flex-direction:column;';
                card.innerHTML =
                    '<div style="position:relative;width:100%;aspect-ratio:1;border-radius:8px;overflow:hidden;margin-bottom:6px;background:#2a2a2a;">' +
                        (track.albumArt ? '<img src="' + track.albumArt + '" style="width:100%;height:100%;object-fit:cover;" />' : '') +
                        '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.3);">' +
                            '<button class="session-play-btn" data-url="' + track.spotifyUrl + '" data-id="' + track.id + '" data-title="' + track.title.replace(/"/g,'&quot;') + '" data-artist="' + track.artist.replace(/"/g,'&quot;') + '" data-art="' + (track.albumArt||'') + '" style="background:#1DB954;border:none;width:28px;height:28px;border-radius:50%;color:#fff;font-size:11px;cursor:pointer;">▶</button>' +
                        '</div>' +
                    '</div>' +
                    '<div style="font-size:12px;color:#f0f0f0;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;width:100%;">' + track.title + '</div>' +
                    '<div style="font-size:11px;color:#888;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:6px;width:100%;">' + track.artist + '</div>' +
                    '<button class="session-add-btn" data-id="' + track.id + '" data-title="' + track.title.replace(/"/g,'&quot;') + '" data-artist="' + track.artist.replace(/"/g,'&quot;') + '" data-art="' + (track.albumArt||'') + '" data-url="' + track.spotifyUrl + '" data-mood="' + mood + '" style="background:none;border:1px solid #333;border-radius:14px;color:#888;font-size:11px;padding:3px 10px;cursor:pointer;width:100%;margin-top:auto;">+ add</button>';
                grid.appendChild(card);
            });

            discoverContent.appendChild(grid);
        });
    });
}

// ── click handlers ─────────────────────────────────────
document.addEventListener('click', function(e) {
    if (e.target.classList.contains('session-play-btn')) {
        openSpotify(e.target.dataset.url);
        if (activeSession) {
            apiCall('/sessions/songs', 'POST', {
                session_id: activeSession.id, song_id: e.target.dataset.id,
                title: e.target.dataset.title, artist: e.target.dataset.artist,
                album_art: e.target.dataset.art, spotify_url: e.target.dataset.url
            }, function() {});
        }
    }
    if (e.target.classList.contains('session-add-btn')) {
        var btn = e.target;
        btn.textContent = '...'; btn.disabled = true;
        apiCall('/logs', 'POST', {
            song_id: btn.dataset.id, title: btn.dataset.title, artist: btn.dataset.artist,
            album_art: btn.dataset.art, spotify_url: btn.dataset.url, mood: btn.dataset.mood
        }, function(err) {
            if (err) { btn.textContent = '+ add'; btn.disabled = false; return; }
            btn.textContent = '✓ added'; btn.style.color = '#1DB954'; btn.style.borderColor = '#1DB954';
        });
    }
});

document.getElementById('logout-btn').addEventListener('click', logout);

// ── restore active session ─────────────────────────────
var savedSession = localStorage.getItem('moodtunes_session');
if (savedSession) {
    try {
        var s = JSON.parse(savedSession);
        apiCall('/sessions/active', 'GET', null, function(err, result) {
            if (err || result.status !== 200 || result.data.id !== s.id) {
                localStorage.removeItem('moodtunes_session'); return;
            }
            activeSession = { id: s.id, mood: s.mood, startTime: new Date(s.startTime) };
            selectedMood = s.mood;
            document.querySelectorAll('.chip').forEach(function(c) { if (c.dataset.mood === s.mood) c.classList.add('selected'); });
            sessionControls.classList.remove('hidden');
            sessionMoodLabel.textContent = s.mood + ' session';
            sessionStartBtn.classList.add('hidden');
            sessionEndBtn.classList.remove('hidden');
            sessionRefreshBtn.classList.remove('hidden');
            startTimer(new Date(s.startTime));
            loadRecommendations(s.mood);
        });
    } catch(e) { localStorage.removeItem('moodtunes_session'); }
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
        sessionControls.classList.remove('hidden');
        sessionMoodLabel.textContent = name + ' session';
        if (!activeSession) {
            sessionStartBtn.classList.remove('hidden');
            sessionEndBtn.classList.add('hidden');
            sessionRefreshBtn.classList.add('hidden');
            sessionTimerEl.textContent = '00:00';
        }
        loadRecommendations(name);
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
    moodChipsContainer.appendChild(wrap);
    return chip;
}

// wrap default chips
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
});

// manage moods button — plain underline style
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
    addMoodSection.style.display = managingMoods ? 'block' : 'none';
    if (managingMoods) document.getElementById('new-mood-input').focus();
    if (!managingMoods) {
        document.querySelectorAll('.chip').forEach(function(c) { c.classList.remove('selected'); });
        selectedMood = null;
    }
});
document.querySelector('.mood-section').appendChild(manageMoodsBtn);

// add mood section
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

document.getElementById('save-new-mood').addEventListener('click', function() {
    var name = document.getElementById('new-mood-input').value.trim().toLowerCase();
    if (!name) return;
    var errorEl = document.getElementById('mood-error-msg');
    if (errorEl) errorEl.remove();
    apiCall('/moods', 'POST', { name: name, emoji: chosenEmoji }, function(err, result) {
        if (err || result.status >= 400) {
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