// api.js — shared helpers loaded on every page

var BACKEND_URL = 'https://moodtunes-2avk.onrender.com/api';

function getToken() {
    return localStorage.getItem('moodtunes_token');
}

function requireAuth() {
    if (!getToken()) {
        window.location.href = 'login.html';
    }
}

function apiCall(endpoint, method, body, callback) {
    var options = {
        method: method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + getToken(),
            // your timezone, so plays land on the right calendar day
            'X-Timezone-Offset': String(tzOffset())
        }
    };
    if (body) options.body = JSON.stringify(body);
    // keepalive lets writes complete even if the user navigates away mid-request
    if (method !== 'GET') options.keepalive = true;

    fetch(BACKEND_URL + endpoint, options)
        .then(function(res) {
            return res.json().then(function(data) {
                return { status: res.status, data: data };
            });
        })
        .then(function(result) {
            // your moodtunes login has run out (e.g. a laptop you haven't used in a while):
            // go to the login page instead of quietly failing everywhere
            if (result.status === 401 && result.data && /token/i.test(result.data.error || '')) return loginExpired();
            callback(null, result);
        })
        .catch(function(err) { callback(err, null); });
}

// ── instant page loads ─────────────────────────────────
// apiCallCached draws the page straight away from the last response we saw,
// then fetches fresh data and only calls back again if something changed.
// saved data is kept after you log/delete things too: the page shows it for a
// moment and then quietly updates, which is much faster than waiting on the
// backend with loading placeholders. it's only wiped on logout.
// That way a page (and its page transition) shows real content immediately
// instead of loading placeholders while the backend wakes up.
var API_CACHE_PREFIX = 'moodtunes_cache_';

function apiCacheKey(endpoint) {
    return API_CACHE_PREFIX + (localStorage.getItem('moodtunes_username') || '') + ':' + endpoint;
}

function clearApiCache() {
    try {
        Object.keys(localStorage).forEach(function(k) {
            if (k.indexOf(API_CACHE_PREFIX) === 0) localStorage.removeItem(k);
        });
    } catch (e) {}
}

// update the saved copy of a GET response after we change the data ourselves,
// so the next page load shows the new version straight away
function apiCacheSet(endpoint, data) {
    try { localStorage.setItem(apiCacheKey(endpoint), JSON.stringify({ status: 200, data: data })); } catch (e) {}
}

function apiCallCached(endpoint, callback) {
    var cachedText = null;
    try { cachedText = localStorage.getItem(apiCacheKey(endpoint)); } catch (e) {}
    if (cachedText) {
        try { callback(null, JSON.parse(cachedText), true); }
        catch (e) { cachedText = null; }      // bad cache entry — fall through to a normal load
    }
    // the backend sleeps when it isn't used for a while and can take up to a minute
    // to wake up. with nothing saved to show yet, keep trying instead of giving up
    var attempt = 0;
    var RETRY_DELAYS = [2000, 4000, 8000, 15000, 25000];

    function load() {
        apiCall(endpoint, 'GET', null, handle);
    }

    function handle(err, result) {
        var failed = err || !result || result.status !== 200;
        var serverTrouble = err || (result && result.status >= 500);
        if (failed && serverTrouble && !cachedText && attempt < RETRY_DELAYS.length) {
            if (attempt === 0 && window.MoodFX) MoodFX.toast('waking up the server — this can take up to a minute');
            setTimeout(load, RETRY_DELAYS[attempt++]);
            return;
        }
        if (failed) {
            if (!cachedText) callback(err, result, false);   // keep showing cached data if the refresh fails
            return;
        }
        var freshText = JSON.stringify(result);
        if (freshText === cachedText) return;                  // nothing changed — no re-render
        try { localStorage.setItem(apiCacheKey(endpoint), freshText); } catch (e) {}
        // the page is already showing cached content: update it quietly, no entrance animations
        if (cachedText) window.__mtQuietUntil = performance.now() + 100;
        callback(null, result, false);
    }

    load();
}

var _loginExpired = false;
function loginExpired() {
    if (_loginExpired || /login\.html/.test(location.pathname)) return;
    _loginExpired = true;
    localStorage.removeItem('moodtunes_token');
    if (window.MoodFX) MoodFX.toast('you’ve been logged out — please log in again');
    setTimeout(function() { window.location.href = 'login.html'; }, 1200);
}

function logout() {
    clearApiCache();
    localStorage.removeItem('moodtunes_token');
    localStorage.removeItem('moodtunes_username');
    window.location.href = 'login.html';
}

function formatTimestamp(isoString) {
    if (!isoString) return '';

    var date;

    if (typeof isoString === 'string') {
        // MySQL: "2025-07-16 14:23:11"
        if (isoString.indexOf('T') === -1) {
            date = new Date(isoString.replace(' ', 'T') + 'Z');
        } else {
            // ISO string
            date = new Date(isoString);
        }
    } else {
        date = new Date(isoString);
    }

    if (isNaN(date.getTime())) return '';

    var today = new Date();
    var yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    var timeStr = date.toLocaleTimeString('en-SG', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });

    if (date.toDateString() === today.toDateString()) {
        return 'today at ' + timeStr;
    }

    if (date.toDateString() === yesterday.toDateString()) {
        return 'yesterday at ' + timeStr;
    }

    return date.toLocaleDateString('en-SG', {
        month: 'short',
        day: 'numeric'
    }) + ' at ' + timeStr;
}

// ── spotify open popup ─────────────────────────────────
// ── play counting ──────────────────────────────────────
// a play is counted only when a song is opened in spotify FROM moodtunes (tapping
// "open in spotify app" / "open in browser"). plays made in spotify itself are
// never added. each day gets its own log, so the backend needs the local timezone.
function tzOffset() {
    return new Date().getTimezoneOffset();
}

function playsLabel(n) {
    n = Number(n) || 0;
    return n === 0 ? 'not played yet' : n + ' play' + (n !== 1 ? 's' : '');
}

// +1 play for a song that's already in the journal (today's log for it)
function recordPlay(songId, mood, callback) {
    apiCall('/logs/play', 'POST', { song_id: songId, mood: mood, tz_offset: tzOffset() }, function(err, res) {
        var ok = !err && res && res.status < 400;
        if (callback) callback(ok);
    });
}

// ── loops ──────────────────────────────────────────────
// a song you open from moodtunes keeps counting while spotify repeats it (repeat /
// loop), until a different song plays. the backend reads spotify's listening
// history to count those repeats; the app asks it to check when you open
// moodtunes, when you come back to it, and every 2 minutes while you're on it.
// pages listen for 'moodtunes:plays-updated' to refresh their counts
var loopCheckRunning = false;
function syncLoopPlays() {
    if (!getToken() || loopCheckRunning || document.hidden || document.prerendering) return;
    loopCheckRunning = true;
    apiCall('/logs/sync-loops', 'POST', {}, function(err, res) {
        loopCheckRunning = false;
        var data = !err && res && res.status === 200 && res.data ? res.data : null;
        if (!data || !(data.added || data.updated)) return;
        if (data.added && window.MoodFX) MoodFX.toast('+' + data.added + ' play' + (data.added !== 1 ? 's' : '') + ' of “' + data.title + '” from your loop', data.mood);
        window.dispatchEvent(new CustomEvent('moodtunes:plays-updated', { detail: data }));
    });
}

if (!/login\.html$/.test(location.pathname)) {
    var startLoopChecks = function() {
        syncLoopPlays();
        document.addEventListener('visibilitychange', function() { if (!document.hidden) syncLoopPlays(); });
        setInterval(syncLoopPlays, 120000);
    };
    // a page prepared in the background waits until it's really opened
    if (document.prerendering) document.addEventListener('prerenderingchange', startLoopChecks, { once: true });
    else setTimeout(startLoopChecks, 1500);   // after the page's own data has started loading
}

// ── spotify free or premium ────────────────────────────
// "play next" needs premium. once spotify says no, the queue buttons are hidden
// for a few days (then it checks again, in case you've upgraded)
var FREE_KEY = 'moodtunes_spotify_free';
function spotifyIsFree() {
    try { return Date.now() - Number(localStorage.getItem(FREE_KEY) || 0) < 3 * 86400000; } catch (e) { return false; }
}
function markSpotifyFree() {
    try { localStorage.setItem(FREE_KEY, String(Date.now())); } catch (e) {}
    document.documentElement.classList.add('spotify-free');
}
if (spotifyIsFree()) document.documentElement.classList.add('spotify-free');

// "play next": adds a song to your spotify queue (premium)
function playNextInSpotify(spotifyUrl, btn) {
    if (spotifyIsFree()) { if (window.MoodFX) MoodFX.toast('play next needs spotify premium'); return; }
    if (btn) btn.classList.add('is-starting');
    apiCall('/spotify/play-next', 'POST', { uri: spotifyUrl }, function(err, res) {
        if (btn) btn.classList.remove('is-starting');
        var reason = res && res.data && res.data.reason;
        if (!err && res && res.status === 200) {
            if (btn) { btn.classList.add('done'); setTimeout(function() { btn.classList.remove('done'); }, 1600); }
            return window.MoodFX && MoodFX.toast('⏭ playing next in spotify');
        }
        if (reason === 'premium_required') { markSpotifyFree(); return MoodFX.toast('play next needs spotify premium'); }
        if (reason === 'no_active_device') return MoodFX.toast('start playing something in spotify first, then add songs to play next');
        if (reason === 'not_connected') return MoodFX.toast('connect spotify to use play next');
        MoodFX.toast('couldn’t add that to your queue — try again');
    });
}

// ── open a song or playlist in spotify ─────────────────
// opts.onOpen runs once, when a way to listen is picked (not on cancel)
function openSpotify(spotifyUrl, opts) {
    // derive the spotify:// app URI from the web URL
    var m       = String(spotifyUrl).match(/\/(track|playlist|album)\/([A-Za-z0-9]+)/);
    var appUri  = m ? 'spotify:' + m[1] + ':' + m[2] : null;

    // remove any existing popup
    var existing = document.getElementById('spotify-open-popup');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = 'spotify-open-popup';
    overlay.style.cssText = [
        'position:fixed', 'inset:0', 'background:rgba(0,0,0,0.7)',
        'display:flex', 'align-items:center', 'justify-content:center', 'z-index:99999'
    ].join(';');

    overlay.innerHTML =
        '<div style="background:#1a1a1a;border:1px solid #333;border-radius:16px;padding:28px 32px;width:320px;text-align:center;">' +
            '<div style="font-size:15px;font-weight:600;color:#f0f0f0;margin-bottom:6px;">open in spotify</div>' +
            '<div style="font-size:13px;color:#666;margin-bottom:24px;">how would you like to listen?</div>' +
            '<div style="display:flex;flex-direction:column;gap:10px;">' +
                (appUri
                    ? '<a href="' + appUri + '" id="open-app-btn" style="display:block;padding:12px;border-radius:10px;background:#1DB954;color:#fff;font-size:14px;font-weight:500;text-decoration:none;transition:opacity 0.15s;">open in spotify app</a>'
                    : '') +
                '<a href="' + spotifyUrl + '" target="_blank" id="open-browser-btn" style="display:block;padding:12px;border-radius:10px;background:#2a2a2a;border:1px solid #333;color:#f0f0f0;font-size:14px;text-decoration:none;transition:background 0.15s;">open in browser</a>' +
                '<button id="cancel-open-btn" style="background:none;border:none;color:#555;font-size:13px;cursor:pointer;padding:8px;margin-top:2px;">cancel</button>' +
            '</div>' +
        '</div>';

    document.body.appendChild(overlay);

    // close on cancel
    document.getElementById('cancel-open-btn').addEventListener('click', function() {
        overlay.remove();
    });

    // close on overlay click
    overlay.addEventListener('click', function(e) {
        if (e.target === overlay) overlay.remove();
    });

    // close after clicking app or browser link — that's when the song is really played
    var opened = false;
    ['open-app-btn', 'open-browser-btn'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.addEventListener('click', function() {
            if (!opened && opts && opts.onOpen) { opened = true; opts.onOpen(); }
            setTimeout(function() { overlay.remove(); }, 300);
        });
    });
}

// ── song title + note on one line ──────────────────────
// the note sits to the right of the title. long notes are cut off with "…";
// tapping the note shows it in full (see mood.js)
function titleRowHTML(title, note, noteId) {
    var esc = MoodFX.esc;
    return '<div class="title-row">' +
        '<div class="song-title">' + esc(title) + '</div>' +
        '<div class="log-note"' + (noteId ? ' id="' + esc(noteId) + '"' : '') + (note ? '' : ' hidden') +
            ' title="' + esc(note || '') + '">' + (note ? '“' + esc(note) + '”' : '') + '</div>' +
    '</div>';
}

// after a note is saved or cleared, update the note beside the title
function setTitleNote(noteId, note) {
    var el = document.getElementById(noteId);
    if (!el) return;
    el.hidden = !note;
    el.title = note || '';
    el.textContent = note ? '“' + note + '”' : '';
    el.classList.remove('note-open');
}

// listening time for a day's log: "1:50 am", or "1:50 – 2:00 am" once you've listened
// for a while (first play that day → end of the latest listen)
function formatPlayRange(firstLogged, lastLogged) {
    function parse(v) {
        if (!v) return null;
        var d = typeof v === 'string' && v.indexOf('T') === -1 ? new Date(v.replace(' ', 'T') + 'Z') : new Date(v);
        return isNaN(d.getTime()) ? null : d;
    }
    function time(d) {
        return d.toLocaleTimeString('en-SG', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
    }
    var first = parse(firstLogged), last = parse(lastLogged);
    if (!last) return first ? time(first) : '';
    if (!first || last - first < 60000) return time(last);
    if (first > last) { var t = first; first = last; last = t; }
    var a = time(first), b = time(last);
    var ap = a.slice(-2), bp = b.slice(-2);
    // "1:50 – 2:00 am" when both are am (or pm), otherwise "11:50 pm – 12:10 am"
    return (ap === bp ? a.slice(0, -2).trim() : a) + ' – ' + b;
}

function formatDateOnly(isoString) {
    if (!isoString) return '';

    var date;

    if (typeof isoString === 'string') {
        if (isoString.indexOf('T') === -1) {
            date = new Date(isoString.replace(' ', 'T') + 'Z');
        } else {
            date = new Date(isoString);
        }
    } else {
        date = new Date(isoString);
    }

    if (isNaN(date.getTime())) return '';

    var today = new Date();
    var yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
        return 'today';
    }

    if (date.toDateString() === yesterday.toDateString()) {
        return 'yesterday';
    }

    return date.toLocaleDateString('en-SG', {
        month: 'short',
        day: 'numeric'
    });
}
// service worker disabled