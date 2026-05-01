// api.js — shared helpers loaded on every page

var BACKEND_URL = 'http://localhost:3000/api';

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

    fetch(BACKEND_URL + endpoint, options)
        .then(function(res) {
            return res.json().then(function(data) {
                return { status: res.status, data: data };
            });
        })
        .then(function(result) { callback(null, result); })
        .catch(function(err) { callback(err, null); });
}

function logout() {
    localStorage.removeItem('moodtunes_token');
    localStorage.removeItem('moodtunes_username');
    window.location.href = 'login.html';
}

function formatTimestamp(isoString) {
    var date = new Date(isoString);
    var today = new Date();
    var yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    var timeStr = date.toLocaleTimeString('en-SG', { hour: 'numeric', minute: '2-digit', hour12: true });

    if (date.toDateString() === today.toDateString()) return 'today at ' + timeStr;
    if (date.toDateString() === yesterday.toDateString()) return 'yesterday at ' + timeStr;
    return date.toLocaleDateString('en-SG', { month: 'short', day: 'numeric' }) + ' at ' + timeStr;
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
    var date = new Date(isoString);
    var today = new Date();
    var yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    if (date.toDateString() === today.toDateString()) return 'today';
    if (date.toDateString() === yesterday.toDateString()) return 'yesterday';
    return date.toLocaleDateString('en-SG', { month: 'short', day: 'numeric' });
}
// ── service worker registration ────────────────────────
if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
        navigator.serviceWorker.register('/sw.js').catch(function(e) {
            console.log('SW registration failed:', e);
        });
    });
}