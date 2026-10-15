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

// initialise hero with prompt
sessionMoodLabel.textContent = 'pick a mood to begin';
sessionTimerEl.textContent = '00:00';
sessionTimerEl.style.opacity = '0.3';

var selectedMood  = null;
var activeSession = null;
var timerInterval = null;

// ── mood chips ─────────────────────────────────────────
chips.forEach(function(chip) {
    chip.addEventListener('click', function() {
        document.querySelectorAll('.chip').forEach(function(c) { c.classList.remove('selected'); });
        chip.classList.add('selected');
        selectedMood = chip.dataset.mood;
        sessionMoodLabel.textContent = chip.dataset.mood + ' session';
        sessionTimerEl.style.opacity = '1';
        if (!activeSession) {
            sessionStartBtn.classList.remove('hidden');
            sessionEndBtn.classList.add('hidden');
            sessionRefreshBtn.classList.add('hidden');
            sessionTimerEl.textContent = '00:00';
        }
    });
});

// ── live ring ──────────────────────────────────────────
// the SVG ring fills once per minute, a glowing dot rides the leading edge,
// and the circle "breathes" at the mood's tempo (see motion.css)
var sessionHero  = document.getElementById('session-controls');
var ringProgress = document.getElementById('ring-progress');
var ringDot      = document.getElementById('ring-dot');
var ringSub      = document.getElementById('ring-sub');
var ringArt      = document.getElementById('ring-art');
var RING_C       = 2 * Math.PI * 131;
var ringRaf      = null;
var lastMinute   = -1;

ringProgress.style.strokeDasharray  = RING_C;
ringProgress.style.strokeDashoffset = RING_C;

function startRing(startTime) {
    cancelAnimationFrame(ringRaf);
    lastMinute = -1;
    sessionHero.classList.add('live');
    MoodFX.setSessionLive(true);     // hides the mood chips on phones so the timer is on top
    (function frame() {
        var ms     = Math.max(0, Date.now() - startTime.getTime());
        var sec    = (ms / 1000) % 60;
        var minute = Math.floor(ms / 60000);
        ringProgress.style.strokeDashoffset = RING_C * (1 - sec / 60);
        ringDot.style.transform = 'rotate(' + (sec * 6) + 'deg)';
        if (minute !== lastMinute) {
            if (lastMinute !== -1) {
                // every completed minute gets a little pulse
                sessionHero.classList.add('lap');
                setTimeout(function() { sessionHero.classList.remove('lap'); }, 700);
            }
            lastMinute = minute;
            ringSub.textContent = 'minute ' + (minute + 1);
        }
        ringRaf = requestAnimationFrame(frame);
    })();
}

function stopRing() {
    cancelAnimationFrame(ringRaf);
    sessionHero.classList.remove('live', 'lap');
    MoodFX.setSessionLive(false);
    ringProgress.style.strokeDashoffset = RING_C;
    ringDot.style.transform = 'rotate(0deg)';
    ringSub.textContent = 'minute 1';
}

// ── timer ──────────────────────────────────────────────
function startTimer(startTime) {
    clearInterval(timerInterval);
    sessionTimerEl.style.opacity = '1';
    startRing(startTime);
    timerInterval = setInterval(function() {
        var elapsed = Math.floor((new Date() - startTime) / 1000);
        var mins = Math.floor(elapsed / 60);
        var secs = elapsed % 60;
        sessionTimerEl.textContent = (mins < 10 ? '0' : '') + mins + ':' + (secs < 10 ? '0' : '') + secs;
    }, 1000);
}

// ── session controls ───────────────────────────────────
sessionStartBtn.addEventListener('click', function() {
    if (!selectedMood) { MoodFX.nudgeMoods(); return; }
    apiCall('/sessions', 'POST', { mood: selectedMood }, function(err, result) {
        if (err || result.status !== 201) return;
        var startTime = new Date();
        activeSession = { id: result.data.session_id, mood: selectedMood, startTime: startTime };
        localStorage.setItem('moodtunes_session', JSON.stringify({ id: result.data.session_id, mood: selectedMood, startTime: startTime.toISOString() }));
        sessionStartBtn.classList.add('hidden');
        sessionEndBtn.classList.remove('hidden');
        sessionRefreshBtn.classList.remove('hidden');
        startTimer(startTime);
        MoodFX.setMood(selectedMood);
        if (nowPlayingCard) nowPlayingCard.refresh();
        startInSpotify(activeSession);
        loadSoFar();
    });
});

// ── session songs → your spotify queue ─────────────────
// starting a session picks songs from the genres of that mood (+ your own songs
// if "mix in my songs" is on) and adds them all to the queue of whatever spotify
// is playing. if spotify isn't open yet, it keeps trying until it is. on a free
// account spotify doesn't allow queueing, so ▶ opens songs in spotify as before.
// "save as spotify playlist" (optional on premium, the main way on free) puts the
// session's songs in a new private playlist, which free accounts play on shuffle.
var MIX_KEY = 'moodtunes_session_mix';
var mixMine = true;
try { mixMine = localStorage.getItem(MIX_KEY) !== '0'; } catch (e) {}

var mixToggle = document.createElement('label');
mixToggle.className = 'session-mix-toggle';
mixToggle.innerHTML = '<input type="checkbox" id="session-mix-input"' + (mixMine ? ' checked' : '') + ' /> mix in my songs';
mixToggle.title = 'on: new genre picks with your own songs from this mood in between. off: only new songs';
document.querySelector('.session-hero-actions').insertAdjacentElement('afterend', mixToggle);
document.getElementById('session-mix-input').addEventListener('change', function(e) {
    mixMine = e.target.checked;
    try { localStorage.setItem(MIX_KEY, mixMine ? '1' : '0'); } catch (err) {}
});

// shows while there are songs waiting to go into the queue
var queueBtn = document.createElement('button');
queueBtn.id = 'session-open-spotify-btn';
queueBtn.className = 'hidden';
document.querySelector('.session-hero-actions').appendChild(queueBtn);
queueBtn.addEventListener('click', function() {
    if (!activeSession || !pendingUris.length) return;
    queueBtn.disabled = true;
    queueBtn.textContent = 'adding…';
    queuePending(activeSession.id, true);
});

// save the session's songs as a playlist in spotify
var saveBtn = document.createElement('button');
saveBtn.id = 'session-save-playlist-btn';
saveBtn.className = 'hidden';
document.querySelector('.session-hero-actions').appendChild(saveBtn);
saveBtn.addEventListener('click', function() {
    if (!activeSession || !sessionUris.length) return;
    var s = activeSession;
    if (s.playlist && s.playlist.songs === sessionUris.length) { openSpotify(s.playlist.url); return; }
    saveBtn.disabled = true;
    saveBtn.textContent = 'saving…';
    apiCall('/sessions/' + s.id + '/spotify/playlist', 'POST', { uris: sessionUris }, function(err, res) {
        if (activeSession !== s) return;
        if (err || !res || res.status !== 200) {
            setSpotifyButton();
            MoodFX.toast((res && res.data && res.data.message) || 'couldn’t save the playlist, try again', s.mood);
            return;
        }
        s.playlist = { url: res.data.url, songs: sessionUris.length };
        saveSessionLocal();
        setSpotifyButton();
        MoodFX.toast('saved “' + s.mood + ' session” to your spotify' + (s.account === 'free' ? ', play it on shuffle there' : ''), s.mood);
        openSpotify(res.data.url);
    });
});

// "how sessions work" starts open the first time you visit
try {
    if (!localStorage.getItem('moodtunes_session_how_seen')) {
        document.getElementById('session-how').open = true;
        localStorage.setItem('moodtunes_session_how_seen', '1');
    }
} catch (e) {}

var pendingUris = [];       // songs not in the spotify queue yet
var sessionUris = [];       // every song this session recommended (what "save as playlist" saves)
var queueRetry  = null;

function saveSessionLocal() {
    if (!activeSession) return;
    localStorage.setItem('moodtunes_session', JSON.stringify({
        id: activeSession.id, mood: activeSession.mood,
        startTime: activeSession.startTime.toISOString(), queueMode: !!activeSession.queueMode,
        account: activeSession.account || null, uris: sessionUris, playlist: activeSession.playlist || null
    }));
}

function setSpotifyButton() {
    var s = activeSession;
    var show = !!(s && s.queueMode && pendingUris.length);
    queueBtn.classList.toggle('hidden', !show);
    queueBtn.disabled = false;
    queueBtn.textContent = '+ add ' + pendingUris.length + ' to spotify queue';

    saveBtn.classList.toggle('hidden', !(s && sessionUris.length));
    saveBtn.disabled = false;
    var saved = s && s.playlist && s.playlist.songs === sessionUris.length;
    saveBtn.textContent = saved ? 'open playlist in spotify' : (s && s.account === 'free' ? 'save as spotify playlist' : 'also save as playlist');
    // free: saving is the main way to listen, so it gets the green button
    saveBtn.classList.toggle('primary', !!(s && s.account === 'free'));

    mixToggle.classList.toggle('hidden', !!s);
    document.body.dataset.spotifyAccount = (s && s.account) || '';
}

function startInSpotify(session) {
    discoverContent.innerHTML = MoodFX.skeleton('grid', 12);
    apiCall('/sessions/' + session.id + '/spotify/start', 'POST', { mix_mine: mixMine }, function(err, res) {
        if (!activeSession || activeSession.id !== session.id) return;
        if (err || !res || res.status !== 200) {
            // spotify not connected / didn't answer: the in-app session still works
            MoodFX.toast(session.mood + ' session started. songs you play on spotify are added automatically', session.mood);
            loadRecommendations(session.mood);
            return;
        }
        var d = res.data;
        activeSession.queueMode = d.reason !== 'premium_required' && d.reason !== 'not_connected' && d.reason !== 'reconnect';
        if (d.reason === 'premium_required') activeSession.account = 'free';
        else if (d.queued) activeSession.account = 'premium';
        pendingUris = Array.isArray(d.left) ? d.left : [];
        sessionUris = Array.isArray(d.uris) ? d.uris : [];
        renderRecs(session.mood, d, null);
        saveSessionLocal();
        setSpotifyButton();
        afterQueue(session, d, false);
    });
}

// what to tell you after a try at queueing, and whether to keep trying
function afterQueue(session, d, manual) {
    clearTimeout(queueRetry);
    var mood = session.mood;
    if (d.queued && session.account !== 'premium') { session.account = 'premium'; saveSessionLocal(); setSpotifyButton(); }
    if (d.queued && !pendingUris.length) {
        MoodFX.toast(d.queued + ' ' + mood + ' songs added to your spotify queue' + (d.device ? ' on ' + d.device : ''), mood);
        return;
    }
    if (d.reason === 'premium_required') {
        activeSession.queueMode = false; activeSession.account = 'free'; saveSessionLocal(); setSpotifyButton();
        MoodFX.toast('spotify free can’t add songs to the queue. save the session as a playlist and play it on shuffle', mood, { duration: 7000 });
        return;
    }
    if (d.reason === 'no_active_device') {
        if (!manual && !session.waitToasted) {
            session.waitToasted = true;
            MoodFX.toast('play anything in spotify and your ' + mood + ' songs will be added to the queue', mood, { duration: 7000 });
        }
        waitForSpotify(session.id);
        return;
    }
    if (d.queued) MoodFX.toast(d.queued + ' songs queued, ' + pendingUris.length + ' still to add', mood);
    else if (manual) MoodFX.toast('spotify didn’t take the songs, try again in a moment', mood);
}

function queuePending(sessionId, manual) {
    if (!pendingUris.length) return;
    apiCall('/sessions/' + sessionId + '/spotify/queue', 'POST', { uris: pendingUris }, function(err, res) {
        if (!activeSession || activeSession.id !== sessionId) return;
        var d = (res && res.data) || { queued: 0, reason: 'failed' };
        if (Array.isArray(d.left)) pendingUris = d.left;
        setSpotifyButton();
        if (manual || d.queued || d.reason !== 'no_active_device') afterQueue(activeSession, d, manual);
        else waitForSpotify(sessionId);
    });
}

// keep checking (every 5s, for up to 3 minutes) until spotify is playing somewhere
function waitForSpotify(sessionId) {
    clearTimeout(queueRetry);
    var s = activeSession;
    if (!s || s.id !== sessionId) return;
    s.waitTries = (s.waitTries || 0) + 1;
    if (s.waitTries > 36) return;   // the button stays, so you can still add them yourself
    queueRetry = setTimeout(function() { queuePending(sessionId, false); }, 5000);
}

sessionEndBtn.addEventListener('click', endSession);
var refreshAsked = false;
sessionRefreshBtn.addEventListener('click', function() {
    refreshAsked = true;
    if (selectedMood) loadRecommendations(selectedMood);
});
// a fresh batch during a session: offer to put it in the spotify queue too
window.addEventListener('moodtunes:recs', function(e) {
    if (!refreshAsked || !activeSession) return;
    refreshAsked = false;
    // new songs join what "save as playlist" saves
    e.detail.uris.forEach(function(u) { if (sessionUris.indexOf(u) === -1) sessionUris.push(u); });
    if (activeSession.queueMode) { pendingUris = e.detail.uris; activeSession.waitTries = 0; }
    saveSessionLocal();
    setSpotifyButton();
});

function endSession() {
    if (!activeSession) return;
    clearInterval(timerInterval);
    stopRing();
    MoodFX.endSessionRequest(activeSession, function(err, result) {
        if (err || !result || result.status >= 400) { startTimer(activeSession.startTime); return; }
        var mood = activeSession.mood, startTime = activeSession.startTime, endTime = new Date(), id = activeSession.id;
        var songs = result.data && result.data.songs ? result.data.songs : [];
        activeSession = null;
        clearTimeout(queueRetry);
        pendingUris = [];
        sessionUris = [];
        setSpotifyButton();
        renderSoFar([]);
        localStorage.removeItem('moodtunes_session');
        sessionStartBtn.classList.remove('hidden');
        sessionEndBtn.classList.add('hidden');
        sessionRefreshBtn.classList.add('hidden');
        sessionTimerEl.textContent = '00:00';
        showSessionSummary(mood, startTime, endTime, songs, id);
    });
}

function showSessionSummary(mood, startTime, endTime, songs, sessionId) {
    MoodFX.sessionSummary(mood, startTime, endTime, songs, { sessionId: sessionId });
}

// ── this session so far ────────────────────────────────
// the songs added to the running session (by playing them in spotify or with ▶ here)
var soFar = document.createElement('div');
soFar.className = 'session-so-far';
soFar.hidden = true;
document.getElementById('session-now-playing').insertAdjacentElement('afterend', soFar);

function renderSoFar(songs) {
    soFar.hidden = !songs.length;
    if (!songs.length) { soFar.innerHTML = ''; return; }
    soFar.innerHTML =
        '<div class="ssf-head">so far this session, ' + songs.length + ' song' + (songs.length !== 1 ? 's' : '') + '</div>' +
        '<div class="ssf-list">' + songs.slice().reverse().map(function(x) {
            return '<a class="ssf-song" href="' + MoodFX.esc(x.spotify_url || '#') + '" target="_blank" rel="noopener" title="' + MoodFX.esc(x.title + ', ' + x.artist) + '">' +
                (x.album_art ? '<img src="' + MoodFX.esc(x.album_art) + '" alt="" />' : '<span class="ssf-empty">' + MoodFX.icon('note') + '</span>') +
                '<span class="ssf-title">' + MoodFX.esc(x.title) + '</span></a>';
        }).join('') + '</div>';
}

var soFarTimer = null;
function loadSoFar() {
    clearTimeout(soFarTimer);
    if (!activeSession) return renderSoFar([]);
    var id = activeSession.id;
    soFarTimer = setTimeout(function() {
        apiCall('/sessions/' + id + '/songs', 'GET', null, function(err, res) {
            if (err || !res || res.status !== 200 || !activeSession || activeSession.id !== id) return;
            renderSoFar(Array.isArray(res.data) ? res.data : []);
        });
    }, 300);
}
window.addEventListener('moodtunes:session-song', loadSoFar);

// ── recommendations ────────────────────────────────────
function loadRecommendations(mood) {
    discoverContent.innerHTML = MoodFX.skeleton('grid', 12);

    apiCall('/logs/mood/' + mood, 'GET', null, function(err, result) {
        if (err || !result.data || result.data.length === 0) {
            discoverContent.innerHTML = MoodFX.emptyState({ title: 'no ' + mood + ' songs yet', text: 'recommendations are based on what you’ve logged. add a few ' + mood + ' songs in your journal first', action: { label: 'go to journal', href: 'index.html' } });
            return;
        }

        var logs = result.data;
        // picked by the server from the genres of your songs in this mood
        var recUrl = '/spotify/recommendations?mood=' + encodeURIComponent(mood);

        apiCall(recUrl, 'GET', null, function(err2, rec) {
            if (err2 || !rec || !rec.data || !rec.data.tracks || rec.data.tracks.length === 0) {
                discoverContent.innerHTML = MoodFX.emptyState({ art: 'search', compact: true, title: 'couldn’t find recommendations', text: 'spotify came back empty this time', action: { label: '↻ refresh', click: '#session-refresh-btn' } });
                return;
            }

            renderRecs(mood, rec.data, logs);
        });
    });
}

// draws the recommendation grid. with logs, songs you've logged (and artists you've
// logged 3+ times) are left out; without, it shows exactly what's in the spotify session
function renderRecs(mood, data, logs) {
    if (!data || !data.tracks || !data.tracks.length) {
        discoverContent.innerHTML = MoodFX.emptyState({ art: 'search', compact: true, title: 'couldn’t find recommendations', text: 'spotify came back empty this time', action: { label: '↻ refresh', click: '#session-refresh-btn' } });
        return;
    }
    var rec = { data: data };
            var loggedKeys = {};
            var loggedArtistCount = {};
            (logs || []).forEach(function(l) {
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
                discoverContent.innerHTML = MoodFX.emptyState({ art: 'search', compact: true, title: 'you’ve heard them all', text: 'no new songs this round, refresh for another batch', action: { label: '↻ refresh', click: '#session-refresh-btn' } });
                return;
            }

            discoverContent.innerHTML = '';
            // where these came from: the genres of your songs in this mood
            var why = document.createElement('p');
            why.className = 'rec-why';
            var genres = Array.isArray(rec.data.genres) ? rec.data.genres : [];
            var lead = '';
            if (!logs && activeSession && activeSession.queueMode) lead = 'going into your spotify queue. ';
            else if (activeSession && activeSession.account === 'free') lead = 'save these as a playlist to play them on shuffle in spotify. ';
            // a blend of songs that fit the mood, songs from your genres and more from your artists
            var yours = Array.isArray(rec.data.yourGenres) ? rec.data.yourGenres : null;
            var chip = function(g) { return '<span class="rec-genre" style="--mc:' + MoodFX.color(mood) + '">' + MoodFX.esc(g) + '</span>'; };
            why.innerHTML = lead + (yours
                ? 'a mix of ' + MoodFX.esc(mood) + ' songs, ' + (yours.length ? 'your genres ' + yours.map(chip).join('') + ' ' : '') + 'and more from your artists'
                : (genres.length ? 'picked from the genres in your ' + MoodFX.esc(mood) + ' songs: ' + genres.map(chip).join('') : 'picked from the artists in your ' + MoodFX.esc(mood) + ' songs'));
            discoverContent.appendChild(why);
            var grid = document.createElement('div');
            grid.className = 'rec-grid';   // columns set in motion.css (6 on desktop, 3 on phones)

            if (logs) window.dispatchEvent(new CustomEvent('moodtunes:recs', { detail: { uris: tracks.map(function(t) { return t.spotifyUrl; }) } }));

            tracks.forEach(function(track) {
                var card = document.createElement('div');
                card.className = 'rec-tile';
                card.style.cssText = 'display:flex;flex-direction:column;';
                card.innerHTML =
                    '<div style="position:relative;width:100%;aspect-ratio:1;border-radius:8px;overflow:hidden;margin-bottom:6px;background:#2a2a2a;">' +
                        (track.albumArt ? '<img src="' + MoodFX.esc(track.albumArt) + '" style="width:100%;height:100%;object-fit:cover;" />' : '') +
                        '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.3);">' +
                            '<button class="session-play-btn" data-url="' + MoodFX.esc(track.spotifyUrl) + '" data-id="' + track.id + '" data-title="' + MoodFX.esc(track.title) + '" data-artist="' + MoodFX.esc(track.artist) + '" data-art="' + MoodFX.esc(track.albumArt||'') + '" style="background:#1DB954;border:none;width:28px;height:28px;border-radius:50%;color:#fff;font-size:11px;cursor:pointer;">▶</button>' +
                        '</div>' +
                    '</div>' +
                    '<div style="font-size:12px;color:#f0f0f0;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;width:100%;">' + MoodFX.esc(track.title) + '</div>' +
                    '<div style="font-size:11px;color:#888;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:' + (track.why ? '2' : '6') + 'px;width:100%;">' + MoodFX.esc(track.artist) + '</div>' +
                    (track.why ? '<div class="rec-tile-why" style="--mc:' + MoodFX.color(mood) + '">' + MoodFX.esc(track.why) + '</div>' : '') +
                    '<button class="session-add-btn" data-id="' + track.id + '" data-title="' + MoodFX.esc(track.title) + '" data-artist="' + MoodFX.esc(track.artist) + '" data-art="' + MoodFX.esc(track.albumArt||'') + '" data-url="' + MoodFX.esc(track.spotifyUrl) + '" data-mood="' + MoodFX.esc(mood) + '" style="background:none;border:1px solid #333;border-radius:14px;color:#888;font-size:11px;padding:3px 10px;cursor:pointer;width:100%;margin-top:auto;">+ add</button>';
                if (activeSession && MoodFX.isPendingLog(activeSession.id, track.id)) markAdded(card.querySelector('.session-add-btn'));
                grid.appendChild(card);
            });

            discoverContent.appendChild(grid);
}

// ── click handlers ─────────────────────────────────────
function markAdded(btn) {
    btn.textContent = '✓ added';
    btn.disabled = true;
    btn.title = 'goes into your journal once it plays';
    btn.style.color = '#1DB954'; btn.style.borderColor = '#1DB954';
}
document.addEventListener('click', function(e) {
    if (e.target.classList.contains('session-play-btn')) {
        var pb = e.target;
        if (activeSession && activeSession.queueMode) {
            // play it now in spotify; your queued session songs carry on after it
            apiCall('/sessions/' + activeSession.id + '/spotify/play', 'POST', { uri: pb.dataset.url }, function(err, res) {
                if (res && res.data && res.data.playing) { if (nowPlayingCard) nowPlayingCard.refresh(); return; }
                openSpotify(pb.dataset.url);
            });
            return;   // the now-playing poller adds it to the session once it's actually playing
        }
        openSpotify(pb.dataset.url);
        // not added to the session here: the now-playing card adds it once spotify is actually playing it
    }
    if (e.target.classList.contains('session-add-btn')) {
        var btn = e.target;
        if (activeSession) {
            // during a session it's only logged once it actually plays (see addPendingLog in mood.js)
            MoodFX.addPendingLog(activeSession.id, {
                song_id: btn.dataset.id, title: btn.dataset.title, artist: btn.dataset.artist,
                album_art: btn.dataset.art, spotify_url: btn.dataset.url, mood: btn.dataset.mood
            });
            markAdded(btn);
            MoodFX.toast('added. it goes into your journal once it plays', btn.dataset.mood);
            return;
        }
        btn.textContent = '...'; btn.disabled = true;
        apiCall('/logs', 'POST', {
            song_id: btn.dataset.id, title: btn.dataset.title, artist: btn.dataset.artist,
            album_art: btn.dataset.art, spotify_url: btn.dataset.url, mood: btn.dataset.mood,
            played: false, tz_offset: tzOffset()
        }, function(err) {
            if (err) { btn.textContent = '+ add'; btn.disabled = false; return; }
            btn.textContent = '✓ added'; btn.style.color = '#1DB954'; btn.style.borderColor = '#1DB954';
        });
    }
});

var _lb = document.getElementById('logout-btn'); if (_lb) _lb.addEventListener('click', logout);

// ── live now-playing ───────────────────────────────────
// polls spotify, shows the current track, blurs its cover inside the ring,
// and auto-adds new tracks to the active session
var nowPlayingCard = MoodFX.nowPlaying(document.getElementById('session-now-playing'), {
    quickLog: false,             // no "log as" moods here — songs go into the session by themselves
    getSession: function() { return activeSession; },
    onTrack: function(track) {
        if (track.albumArt) {
            ringArt.style.backgroundImage = 'url("' + String(track.albumArt).replace(/["\\]/g, '') + '")';
            ringArt.classList.add('show');
        } else {
            ringArt.classList.remove('show');
        }
    },
    onIdle: function() { ringArt.classList.remove('show'); }
});

// ── restore active session ─────────────────────────────
var savedSession = localStorage.getItem('moodtunes_session');
if (savedSession) {
    try {
        var s = JSON.parse(savedSession);
        apiCall('/sessions/active', 'GET', null, function(err, result) {
            if (err || result.status !== 200 || result.data.id !== s.id) {
                localStorage.removeItem('moodtunes_session'); return;
            }
            activeSession = { id: s.id, mood: s.mood, startTime: new Date(s.startTime), queueMode: !!s.queueMode, account: s.account || null, playlist: s.playlist || null };
            sessionUris = Array.isArray(s.uris) ? s.uris : [];
            setSpotifyButton();
            selectedMood = s.mood;
            document.querySelectorAll('.chip').forEach(function(c) { if (c.dataset.mood === s.mood) c.classList.add('selected'); });
                sessionMoodLabel.textContent = s.mood + ' session';
            sessionStartBtn.classList.add('hidden');
            sessionEndBtn.classList.remove('hidden');
            sessionRefreshBtn.classList.remove('hidden');
            startTimer(new Date(s.startTime));
            nowPlayingCard.refresh();   // log whatever is already playing right away
            loadRecommendations(s.mood);
            loadSoFar();
        });
    } catch(e) { localStorage.removeItem('moodtunes_session'); }
}


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
        sessionMoodLabel.textContent = name + ' session';
        if (!activeSession) {
            sessionStartBtn.classList.remove('hidden');
            sessionEndBtn.classList.add('hidden');
            sessionRefreshBtn.classList.add('hidden');
            sessionTimerEl.textContent = '00:00';
        }
    });

    var delBtn = document.createElement('button');
    delBtn.classList.add('chip-delete-btn');
    delBtn.innerHTML = MoodFX.icon('trash');
    delBtn.style.cssText = 'display:none;background:none;border:none;color:#e05c5c;padding:2px 4px;cursor:pointer;line-height:1;';
    delBtn.addEventListener('click', function() {
        if (selectedMood === name && !activeSession) selectedMood = null;
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

// wrap default chips
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
        if (selectedMood === m && !activeSession) { selectedMood = null; chip.classList.remove('selected'); }
        MoodFX.hideMood(m);
        MoodFX.toast('removed “' + m + '” from your moods', m, {
            action: 'undo', duration: 5000,
            onAction: function() { MoodFX.unhideMood(m); }
        });
    });
    wrap.appendChild(delBtn);
});

// manage moods button — plain underline style
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