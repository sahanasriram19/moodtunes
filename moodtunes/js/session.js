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
        chips.forEach(function(c) { c.classList.remove('selected'); });
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
            chips.forEach(function(c) { if (c.dataset.mood === s.mood) c.classList.add('selected'); });
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
var hiddenMoods = JSON.parse(localStorage.getItem('moodtunes_hidden_moods') || '[]');

// wire up edit pencil + hidden-mood support on default chips
chips.forEach(function(chip) {
    if (hiddenMoods.includes(chip.dataset.mood)) {
        chip.style.display = 'none';
        return;
    }
    var editBtn = document.createElement('button');
    editBtn.style.cssText = 'background:none;border:none;color:#666;cursor:pointer;padding:0 0 0 4px;font-size:10px;vertical-align:middle;';
    editBtn.textContent = '✎';
    editBtn.title = 'hide mood';
    editBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        hiddenMoods.push(chip.dataset.mood);
        localStorage.setItem('moodtunes_hidden_moods', JSON.stringify(hiddenMoods));
        chip.style.display = 'none';
        if (selectedMood === chip.dataset.mood) selectedMood = null;
    });
    chip.appendChild(editBtn);
});

function addChip(name, emoji, id) {
    var chip = document.createElement('span');
    chip.classList.add('chip', 'custom-chip');
    chip.dataset.mood = name;
    chip.dataset.customId = id || '';
    chip.style.cssText = 'display:inline-flex;align-items:center;gap:4px;cursor:pointer;';

    var label = document.createElement('button');
    label.style.cssText = 'background:none;border:none;color:inherit;cursor:pointer;padding:0;font:inherit;';
    label.textContent = (emoji ? emoji + ' ' : '') + name;
    label.addEventListener('click', function() {
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

    var editBtn = document.createElement('button');
    editBtn.style.cssText = 'background:none;border:none;color:#666;cursor:pointer;padding:0 0 0 2px;font-size:10px;';
    editBtn.textContent = '✎';
    editBtn.title = 'edit mood';
    editBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        showEditMoodPanel(name, emoji, id, chip, label);
    });

    chip.appendChild(label);
    chip.appendChild(editBtn);
    var addBtn = moodChipsContainer.querySelector('.add-mood-btn');
    moodChipsContainer.insertBefore(chip, addBtn);
    return chip;
}

function showEditMoodPanel(name, emoji, id, chip, label) {
    var existing = document.getElementById('add-mood-panel');
    if (existing) existing.remove();

    var emojiGrid = EMOJIS.map(function(e) {
        return '<button class="emoji-opt" data-emoji="' + e + '" style="background:' + (e === emoji ? '#1a1a2e' : 'none') + ';border:2px solid ' + (e === emoji ? '#7f77dd' : 'transparent') + ';border-radius:6px;font-size:20px;cursor:pointer;padding:3px;">' + e + '</button>';
    }).join('');

    var panel = document.createElement('div');
    panel.id = 'add-mood-panel';
    panel.style.cssText = 'background:#141414;border:1px solid #2a2a2a;border-radius:12px;padding:18px;margin-top:12px;';
    panel.innerHTML =
        '<div style="font-size:12px;color:#888;margin-bottom:8px;">mood name <span style="color:#555;">(leave blank to delete)</span></div>' +
        '<input id="new-mood-input" type="text" maxlength="20" value="' + name + '" style="width:100%;padding:10px 12px;background:#1a1a1a;border:1px solid #333;border-radius:8px;color:#f0f0f0;font-size:14px;box-sizing:border-box;margin-bottom:12px;" />' +
        '<div style="font-size:12px;color:#888;margin-bottom:8px;">pick an emoji <span id="chosen-emoji" style="font-size:16px;margin-left:6px;">' + (emoji || '🎵') + '</span></div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px;">' + emojiGrid + '</div>' +
        '<div style="display:flex;gap:8px;">' +
            '<button id="cancel-mood" class="skip-note-btn" style="flex:1;">cancel</button>' +
            '<button id="delete-mood" class="skip-note-btn" style="flex:1;color:#e05c5c;border-color:#e05c5c;">delete</button>' +
            '<button id="save-mood" class="save-note-btn" style="flex:1;">save</button>' +
        '</div>';

    document.querySelector('.mood-section').appendChild(panel);

    var chosenEmoji = emoji || '🎵';
    panel.querySelectorAll('.emoji-opt').forEach(function(btn) {
        btn.addEventListener('click', function() {
            panel.querySelectorAll('.emoji-opt').forEach(function(b) { b.style.borderColor = 'transparent'; b.style.background = 'none'; });
            btn.style.borderColor = '#7f77dd'; btn.style.background = '#1a1a2e';
            chosenEmoji = btn.dataset.emoji;
            document.getElementById('chosen-emoji').textContent = chosenEmoji;
        });
    });

    document.getElementById('cancel-mood').addEventListener('click', function() { panel.remove(); });

    function deleteMood() {
        apiCall('/moods/' + id, 'DELETE', null, function() {
            chip.remove(); panel.remove();
            if (selectedMood === name) selectedMood = null;
        });
    }
    document.getElementById('delete-mood').addEventListener('click', deleteMood);

    document.getElementById('save-mood').addEventListener('click', function() {
        var newName = document.getElementById('new-mood-input').value.trim().toLowerCase();
        if (!newName) { deleteMood(); return; }
        apiCall('/moods/' + id, 'DELETE', null, function() {
            apiCall('/moods', 'POST', { name: newName, emoji: chosenEmoji }, function(err, result) {
                if (err || result.status >= 400) return;
                chip.dataset.mood = result.data.name;
                chip.dataset.customId = result.data.id;
                label.textContent = (result.data.emoji ? result.data.emoji + ' ' : '') + result.data.name;
                if (selectedMood === name) selectedMood = result.data.name;
                panel.remove();
            });
        });
    });
}

function showAddMoodPanel() {
    var existing = document.getElementById('add-mood-panel');
    if (existing) { existing.remove(); return; }

    var emojiGrid = EMOJIS.map(function(e) {
        return '<button class="emoji-opt" data-emoji="' + e + '">' + e + '</button>';
    }).join('');

    var panel = document.createElement('div');
    panel.id = 'add-mood-panel';
    panel.style.cssText = 'background:#141414;border:1px solid #2a2a2a;border-radius:12px;padding:18px;margin-top:12px;';
    panel.innerHTML =
        '<div style="font-size:12px;color:#888;margin-bottom:8px;">mood name</div>' +
        '<input id="new-mood-input" type="text" maxlength="20" placeholder="e.g. melancholy, grind..." style="width:100%;padding:10px 12px;background:#1a1a1a;border:1px solid #333;border-radius:8px;color:#f0f0f0;font-size:14px;box-sizing:border-box;margin-bottom:12px;" />' +
        '<div style="font-size:12px;color:#888;margin-bottom:8px;">pick an emoji <span id="chosen-emoji" style="font-size:16px;margin-left:6px;">🎵</span></div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px;">' + emojiGrid + '</div>' +
        (hiddenMoods.length > 0
            ? '<div style="font-size:12px;color:#7f77dd;margin-bottom:12px;cursor:pointer;" id="restore-moods-btn">↩ restore hidden moods (' + hiddenMoods.length + ')</div>'
            : '') +
        '<div style="display:flex;gap:8px;">' +
            '<button id="cancel-mood" class="skip-note-btn" style="flex:1;">cancel</button>' +
            '<button id="save-mood" class="save-note-btn" style="flex:1;">+ add mood</button>' +
        '</div>';

    document.querySelector('.mood-section').appendChild(panel);

    var chosenEmoji = '🎵';
    panel.querySelectorAll('.emoji-opt').forEach(function(btn) {
        btn.style.cssText = 'background:none;border:2px solid transparent;border-radius:6px;font-size:20px;cursor:pointer;padding:3px;';
        btn.addEventListener('click', function() {
            panel.querySelectorAll('.emoji-opt').forEach(function(b) { b.style.borderColor = 'transparent'; });
            btn.style.borderColor = '#7f77dd';
            chosenEmoji = btn.dataset.emoji;
            document.getElementById('chosen-emoji').textContent = chosenEmoji;
        });
    });

    document.getElementById('cancel-mood').addEventListener('click', function() { panel.remove(); });

    if (document.getElementById('restore-moods-btn')) {
        document.getElementById('restore-moods-btn').addEventListener('click', function() {
            hiddenMoods = [];
            localStorage.setItem('moodtunes_hidden_moods', '[]');
            panel.remove();
            document.querySelectorAll('.chip[data-mood]').forEach(function(c) { c.style.display = ''; });
        });
    }

    document.getElementById('save-mood').addEventListener('click', function() {
        var name = document.getElementById('new-mood-input').value.trim().toLowerCase();
        if (!name) return;
        apiCall('/moods', 'POST', { name: name, emoji: chosenEmoji }, function(err, result) {
            if (err || result.status >= 400) {
                alert(result && result.data && result.data.message ? result.data.message : 'could not create mood');
                return;
            }
            addChip(result.data.name, result.data.emoji, result.data.id);
            panel.remove();
        });
    });

    document.getElementById('new-mood-input').focus();
}

// add the + button
var addMoodBtn = document.createElement('button');
addMoodBtn.classList.add('chip', 'add-mood-btn');
addMoodBtn.title = 'add a custom mood';
addMoodBtn.textContent = '+';
addMoodBtn.style.cssText = 'font-size:18px;font-weight:300;padding:6px 14px;';
addMoodBtn.addEventListener('click', showAddMoodPanel);
moodChipsContainer.appendChild(addMoodBtn);

// load custom moods from backend
apiCall('/moods', 'GET', null, function(err, result) {
    if (err || !result.data) return;
    var customs = Array.isArray(result.data) ? result.data : [];
    customs.forEach(function(m) { addChip(m.name, m.emoji, m.id); });
});