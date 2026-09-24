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
            'Authorization': 'Bearer ' + getToken()
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
        .then(function(result) { callback(null, result); })
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
    apiCall(endpoint, 'GET', null, function(err, result) {
        if (err || !result || result.status !== 200) {
            if (!cachedText) callback(err, result, false);   // keep showing cached data if the refresh fails
            return;
        }
        var freshText = JSON.stringify(result);
        if (freshText === cachedText) return;                  // nothing changed — no re-render
        try { localStorage.setItem(apiCacheKey(endpoint), freshText); } catch (e) {}
        // the page is already showing cached content: update it quietly, no entrance animations
        if (cachedText) window.__mtQuietUntil = performance.now() + 100;
        callback(null, result, false);
    });
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
function openSpotify(spotifyUrl) {
    // derive the spotify:// app URI from the web URL
    var parts   = spotifyUrl.split('/track/');
    var trackId = parts[1] ? parts[1].split('?')[0] : null;
    var appUri  = trackId ? 'spotify:track:' + trackId : null;

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

    // close after clicking app or browser link
    ['open-app-btn', 'open-browser-btn'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.addEventListener('click', function() {
            setTimeout(function() { overlay.remove(); }, 300);
        });
    });
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