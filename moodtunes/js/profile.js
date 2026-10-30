// profile.js — profile dropdown + theme switcher, shared across all pages

(function() {

// ── theme definitions ──────────────────────────────────
var THEMES = {
    default: {
        label: 'default',
        // night-sky purple: cards are see-through violet glass instead of black
        '--bg-page':        '#120a20',
        '--bg-card':        'rgba(42, 26, 74, 0.94)',
        '--bg-input':       'rgba(48, 30, 84, 0.94)',
        '--bg-hover':       'rgba(62, 40, 106, 0.95)',
        '--border':         'rgba(196, 170, 255, 0.16)',
        '--border-mid':     'rgba(196, 170, 255, 0.3)',
        '--text-primary':   '#f6f1ff',
        '--text-secondary': '#c9bde6',
        '--text-muted':     '#9384b8',
        '--ambient':        '#b99cff',                    // the page glow with no mood picked stays purple
        '--accent':         '#ff9fcf',                    // rose: stands out on the violet instead of blending in
        '--accent-bg':      'rgba(255, 159, 207, 0.16)',
        '--chip-bg':        'transparent',
        '--chip-border':    '#333',
        '--search-bg':      '#7a4aaa',
        '--search-border':  '#7a4aaa',
        '--nav-bg':         '#1a0f2e',
        '--nav-border':     'rgba(196, 170, 255, 0.14)',
        '--circle-bg':      '#4a2570',
        '--circle-border':  '#9b6fc2',
    },
    warm: {
        label: 'warm editorial',
        '--bg-page':        '#0a0a0a',
        '--bg-card':        '#111',
        '--bg-input':       '#141414',
        '--bg-hover':       '#181818',
        '--border':         '#2a2a2a',
        '--border-mid':     '#333',
        '--text-primary':   '#f5f0e8',
        '--text-secondary': '#b3aa9a',
        '--text-muted':     '#958c7e',                   // readable on black (was #555, too faint)
        '--accent':         '#c4762d',
        '--accent-bg':      '#1a1008',
        '--chip-bg':        '#141414',
        '--chip-border':    '#2a2a2a',
        '--search-bg':      '#141414',
        '--search-border':  '#c4762d44',
        '--nav-bg':         '#0a0a0a',
        '--nav-border':     '#2a2a2a',
        '--circle-bg':      '#2a1200',
        '--circle-border':  '#c4762d',
    },
    ocean: {
        label: 'ocean',
        // midnight ocean: deep navy with aqua, plus coral and sand as partner colours
        '--bg-page':        '#071821',
        '--bg-card':        'rgba(15,42,55,0.92)',
        '--bg-input':       'rgba(12,36,48,0.94)',
        '--bg-hover':       'rgba(22,56,72,0.95)',
        '--border':         'rgba(120,220,230,0.15)',
        '--border-mid':     'rgba(120,220,230,0.28)',
        '--text-primary':   '#eefafc',
        '--text-secondary': '#b9d3da',
        '--text-muted':     '#86a9b3',
        '--ambient':        '#2f8fb0',                    // the page glows ocean blue when no mood is picked
        '--accent':         '#5fe0d0',                    // aqua
        '--accent-bg':      'rgba(95,224,208,0.14)',
        '--chip-bg':        'rgba(95,224,208,0.06)',
        '--chip-border':    'rgba(120,220,230,0.25)',
        '--search-bg':      'rgba(255,255,255,0.04)',
        '--search-border':  'rgba(120,220,230,0.2)',
        '--nav-bg':         'rgba(10,32,44,0.6)',
        '--nav-border':     'rgba(120,220,230,0.15)',
        '--circle-bg':      'rgba(47,143,176,0.2)',
        '--circle-border':  '#5fe0d0',
    },
    light: {
        label: 'clean light',
        '--bg-page':        '#f8f8f6',
        '--bg-card':        '#fff',
        '--bg-input':       '#fff',
        '--bg-hover':       '#f5f5f0',
        '--border':         '#e8e8e4',
        '--border-mid':     '#e0e0da',
        '--text-primary':   '#111',
        '--text-secondary': '#555',
        '--text-muted':     '#666',                      // readable on white (was #858585)
        '--accent':         '#7a4fa8',                    // a deeper purple, readable on white
        '--accent-bg':      '#f0eff9',
        '--chip-bg':        '#fff',
        '--chip-border':    '#e0e0da',
        '--search-bg':      '#fff',
        '--search-border':  '#e0e0da',
        '--nav-bg':         '#fff',
        '--nav-border':     '#e8e8e4',
        '--circle-bg':      '#f0eff9',
        '--circle-border':  '#9b6fc2',
    }
};

// ── apply theme ────────────────────────────────────────
function applyTheme(key) {
    var t = THEMES[key] || THEMES.default;
    var root = document.documentElement;
    root.setAttribute('data-theme', THEMES[key] ? key : 'default');   // lets the css style each theme
    root.style.removeProperty('--ambient');     // only some themes set it
    Object.keys(t).forEach(function(prop) {
        if (prop === 'label') return;
        root.style.setProperty(prop, t[prop]);
    });
    // also set body bg directly for pages that use it
    document.body.style.backgroundColor = t['--bg-page'];
    // and the page behind it, so switching pages never flashes white (see the
    // small script at the top of each page, which does this before anything loads)
    root.style.background = t['--bg-page'];
    root.style.colorScheme = key === 'light' ? 'light' : 'dark';
    var cs = document.querySelector('meta[name="color-scheme"]');
    if (cs) cs.content = key === 'light' ? 'light' : 'dark';
    var tc = document.querySelector('meta[name="theme-color"]');
    if (tc) tc.content = t['--bg-page'];
    localStorage.setItem('moodtunes_theme', key);
    if (window.MoodFX) window.MoodFX.setMood(window.MoodFX.getMood());
}

// apply on load
var savedTheme = localStorage.getItem('moodtunes_theme') || 'default';
if (savedTheme === 'purple') savedTheme = 'ocean';   // deep purple was replaced by ocean
applyTheme(savedTheme);

// ── inject CSS overrides that use CSS vars ────────────
var style = document.createElement('style');
style.textContent = [
    'body { background-color: var(--bg-page) !important; color: var(--text-primary) !important; }',
    '.navbar { background: color-mix(in srgb, var(--nav-bg) 50%, transparent) !important; border-bottom-color: var(--nav-border) !important; backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); }',
    '.log-card { background: var(--bg-card) !important; border-color: var(--border) !important; }',
    '.log-card:hover { border-color: var(--border-mid) !important; }',
    '.chip { background: var(--chip-bg) !important; border-color: var(--chip-border) !important; color: var(--text-secondary) !important; }',
    '.chip:hover { border-color: var(--mc, var(--accent)) !important; color: var(--text-primary) !important; }',
    '.chip.selected { background: var(--mc, var(--accent)) !important; border-color: var(--mc, var(--accent)) !important; color: var(--mc-ink, #fff) !important; }',
    '#song-search { background: color-mix(in srgb, var(--mood) 24%, var(--bg-input)) !important; border-color: color-mix(in srgb, var(--mood) 55%, transparent) !important; color: var(--text-primary) !important; }',
    '#song-search:focus { border-color: var(--mood) !important; box-shadow: none !important; }',
    '.stats-card, .stats-card-title, .flashback-card { background: var(--bg-card) !important; border-color: var(--border) !important; }',
    '.section-label { color: var(--text-muted) !important; }',
    '.song-title { color: var(--text-primary) !important; }',
    '.song-artist, .plays-text, .date-text { color: var(--text-secondary) !important; }',
    '.nav-links a { color: var(--text-muted) !important; }',
    '.nav-links a:hover, .nav-links a.active { color: var(--text-primary) !important; border-bottom-color: var(--mood) !important; }',
    '.save-note-btn { background: var(--mood) !important; color: var(--mood-ink, #fff) !important; transition: background .9s, opacity .2s !important; }',
    '.add-note-btn, .edit-note-btn, .log-note { color: var(--accent) !important; }',
    '.logo span { color: var(--accent) !important; }',
    
    '.session-hero-label { color: var(--text-muted) !important; }',
    '.session-hero-timer { color: var(--text-primary) !important; }',
    '#session-start-btn { background: var(--mood) !important; color: var(--mood-ink, #fff) !important; transition: background .9s, transform .2s !important; }',
    '#session-start-btn:hover { transform: translateY(-1px); }',
    '#session-refresh-btn { border-color: var(--border-mid) !important; color: var(--text-secondary) !important; }',
    '.note-textarea { background: var(--bg-input) !important; border-color: var(--border-mid) !important; color: var(--text-primary) !important; }',
    '.note-input-container { background: var(--bg-card) !important; border-color: var(--accent) !important; }',
    '.result-item:hover { background: var(--bg-hover) !important; }',
    '.result-item .result-title { color: var(--text-primary) !important; }',
    '.result-item .result-artist { color: var(--text-secondary) !important; }',
    '.log-card .song-info .song-title { color: var(--text-primary) !important; }',
    '.skip-note-btn { border-color: var(--border-mid) !important; color: var(--text-secondary) !important; }',
    '.skip-note-btn:hover { border-color: var(--text-secondary) !important; color: var(--text-primary) !important; }',
    '.session-summary-box { background: var(--bg-card) !important; border-color: var(--border) !important; }',
    '.session-summary-close { background: var(--accent) !important; }',
    '.session-summary-title { color: var(--text-primary) !important; }',
    '.session-summary-meta { color: var(--text-muted) !important; }',
    '.stat-box { border-radius: 12px !important; }',
    '.timeline-date { color: var(--text-primary) !important; }',
    '.playlist-card { background: var(--bg-card) !important; border-color: var(--border) !important; }',
    '.playlist-card-title { color: #fff !important; }',   // the name sits on the cover, so it's white in every theme
    '.playlist-card-count { color: var(--text-muted) !important; }',
    '.playlist-view-header { background: var(--bg-card) !important; }',
    '.log-card.draggable-card { background: var(--bg-card) !important; border-color: var(--border) !important; }',
    '.stats-card-title { color: var(--text-muted) !important; }',
    '.mood-bar-name, .time-bar-label { color: var(--text-secondary) !important; }',
    '.mood-bar-track, .time-bar-track { background: var(--border) !important; }',
    '.mood-bar-count, .top-song-plays { color: var(--text-muted) !important; }',
    '.top-song-title { color: var(--text-primary) !important; }',
    '.top-song-artist { color: var(--text-secondary) !important; }',
    '.flashback-label { color: var(--accent) !important; }',
    '.flashback-subtitle { color: var(--text-secondary) !important; }',
    '.flashback-title { color: var(--text-primary) !important; }',
    '.stat-box-label { color: rgba(255, 255, 255, 0.82) !important; }',   // the boxes are always coloured
    'input, textarea { caret-color: var(--accent) !important; }',
    '.logout-btn { border-color: var(--border-mid) !important; color: var(--text-muted) !important; }',
    '.section-subtitle { color: var(--text-muted) !important; }',
    '.song-history-card { background: var(--bg-card) !important; border-color: var(--border) !important; }',
    '.song-history-title { color: var(--text-primary) !important; }',
    '.song-history-artist, .song-history-total { color: var(--text-secondary) !important; }',
    '.song-history-date { color: var(--text-secondary) !important; }',
    '.session-history-card { background: var(--bg-card) !important; border-color: var(--border) !important; }',
    '.session-history-mood { color: var(--text-primary) !important; }',
    '.session-history-meta { color: var(--text-muted) !important; }',
    // the profile button: white ring and icon in every theme, matching the ? help button
    '#profile-btn { border-color: #fff !important; color: #fff !important; }',
    '#profile-btn:hover { background: rgba(255, 255, 255, 0.12) !important; }',
].join('\n');
document.head.appendChild(style);

// ── build profile button ───────────────────────────────
var username = localStorage.getItem('moodtunes_username') || 'you';

// remove logout btn if it still exists in the HTML
var logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) logoutBtn.remove();

// find nav-right — works regardless of whether logout-btn was present
var navRight = document.querySelector('.nav-right');
if (!navRight) return;

var profileBtn = document.createElement('button');
profileBtn.id = 'profile-btn';
profileBtn.title = 'profile';
profileBtn.style.cssText = [
    'background:none',
    'border:1.5px solid #fff',               // white ring, like the ? button
    'color:#fff',
    'width:32px', 'height:32px',
    'border-radius:50%',
    'cursor:pointer',
    'display:flex', 'align-items:center', 'justify-content:center',
    'flex-shrink:0',
    'transition:border-color 0.15s, color 0.15s',
    'position:relative',
].join(';');
profileBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>';

profileBtn.setAttribute('aria-label', 'profile and settings');
profileBtn.setAttribute('aria-haspopup', 'true');
profileBtn.setAttribute('aria-expanded', 'false');
// the menu opens next to the button (not inside it), so its own buttons, switch and
// time box work normally and don't count as clicks on the profile button
var profileWrap = document.createElement('div');
profileWrap.className = 'profile-wrap';
profileWrap.style.cssText = 'position:relative;display:flex;flex-shrink:0;';
profileWrap.appendChild(profileBtn);
navRight.appendChild(profileWrap);

// ── dropdown ───────────────────────────────────────────
function buildDropdown() {
    var d = document.createElement('div');
    d.id = 'profile-dropdown';
    d.style.cssText = [
        'position:absolute',
        'top:calc(100% + 10px)', 'right:0',
        'width:230px',
        'background:var(--bg-card, #141414)',
        'border:1px solid var(--border, #222)',
        'border-radius:12px',
        'padding:14px',
        'z-index:9999',
        'box-shadow:0 8px 24px rgba(0,0,0,0.4)',
    ].join(';');

    // user info
    var info = document.createElement('div');
    info.style.cssText = 'margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid var(--border, #222);';
    info.innerHTML =
        '<div style="font-size:14px;font-weight:500;color:var(--text-primary,#f0f0f0);margin-bottom:2px;">' + (window.MoodFX ? MoodFX.esc(username) : username) + '</div>' +
        '<div style="font-size:11px;color:var(--text-muted,#555);">moodtunes account</div>';
    d.appendChild(info);

    // theme section
    var themeLabel = document.createElement('div');
    themeLabel.style.cssText = 'font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-muted,#555);margin-bottom:10px;';
    themeLabel.textContent = 'theme';
    d.appendChild(themeLabel);

    var currentTheme = localStorage.getItem('moodtunes_theme') || 'default';
    Object.keys(THEMES).forEach(function(key) {
        var t = THEMES[key];
        var row = document.createElement('button');
        row.style.cssText = [
            'display:flex', 'align-items:center', 'gap:10px',
            'width:100%', 'padding:8px 10px',
            'background:' + (key === currentTheme ? 'var(--accent-bg,#4a2570)' : 'none'),
            'border:none',
            'border-radius:8px',
            'cursor:pointer',
            'text-align:left',
            'margin-bottom:3px',
            'transition:background 0.1s',
        ].join(';');

        // colour swatch
        var swatch = document.createElement('span');
        // each theme's swatch: its main colour with the accent that goes with it
        var swatchColors = {
            default: 'linear-gradient(135deg, #9b6fc2 50%, #ff9fcf 50%)',
            warm:    '#c4762d',
            ocean:   'linear-gradient(135deg, #1f5f7a 50%, #5fe0d0 50%)',
            light:   '#9b6fc2'
        };
        swatch.style.cssText = 'width:12px;height:12px;border-radius:50%;background:' + swatchColors[key] + ';flex-shrink:0;';

        var lbl = document.createElement('span');
        lbl.style.cssText = 'font-size:13px;color:' + (key === currentTheme ? 'var(--accent,#9b6fc2)' : 'var(--text-secondary,#aaa)') + ';';
        lbl.textContent = t.label;

        if (key === currentTheme) {
            var tick = document.createElement('span');
            tick.style.cssText = 'margin-left:auto;font-size:12px;color:var(--accent,#9b6fc2);';
            tick.textContent = '✓';
            row.appendChild(swatch);
            row.appendChild(lbl);
            row.appendChild(tick);
        } else {
            row.appendChild(swatch);
            row.appendChild(lbl);
        }

        row.addEventListener('click', function() {
            applyTheme(key);
            closeDropdown();
            // rebuild to reflect new selection
            setTimeout(function() { if (document.getElementById('profile-btn')) document.getElementById('profile-btn').click(); }, 190);
        });

        d.appendChild(row);
    });

    d.appendChild(buildReminderSection());

    // logout
    var logoutRow = document.createElement('button');
    logoutRow.style.cssText = [
        'display:flex', 'align-items:center', 'gap:10px',
        'width:100%', 'padding:8px 10px',
        'background:none', 'border:none',
        'border-top:1px solid var(--border,#222)',
        'margin-top:10px', 'padding-top:12px',
        'cursor:pointer', 'text-align:left',
        'font-size:13px',
        'border-radius:0',
    ].join(';');
    logoutRow.className = 'pd-logout';      // its red is set in motion.css (readable in every theme)
    logoutRow.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg> logout';
    logoutRow.addEventListener('click', function() { logout(); });
    d.appendChild(logoutRow);

    var deleteRow = document.createElement('button');
    deleteRow.style.cssText = [
        'display:block', 'width:100%', 'padding:6px 10px 2px',
        'background:none', 'border:none', 'cursor:pointer', 'text-align:left',
        'color:var(--text-muted,#888)', 'font-size:12px',
        'text-decoration:underline', 'text-underline-offset:2px',
    ].join(';');
    deleteRow.textContent = 'delete account';
    deleteRow.addEventListener('click', function() { closeDropdown(); showDeleteAccount(); });
    d.appendChild(deleteRow);

    return d;
}

// ── daily check-in reminder ────────────────────────────
// "remind me at 9:00 pm": a notification ("how are you feeling?") once a day at
// that time, sent by the server, skipped on days you've already logged a song
// (see backend reminderController.js and the push handler in sw.js). each device
// is set up separately. on iPhone it needs moodtunes added to the home screen.
var REMINDER_KEY = 'moodtunes_reminder_' + (localStorage.getItem('moodtunes_username') || '');
function reminderState() {
    try { return Object.assign({ on: false, time: '21:00' }, JSON.parse(localStorage.getItem(REMINDER_KEY) || '{}')); }
    catch (e) { return { on: false, time: '21:00' }; }
}
function saveReminderState(st) { try { localStorage.setItem(REMINDER_KEY, JSON.stringify(st)); } catch (e) {} }

function api(endpoint, method, body) {
    return new Promise(function(resolve) {
        apiCall(endpoint, method, body, function(err, res) { resolve(err ? { status: 0, data: null } : res); });
    });
}
function keyBytes(base64) {
    var pad = '='.repeat((4 - base64.length % 4) % 4);
    var raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
}
function pushSupported() {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}
function isIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
function swReady() {
    return Promise.race([
        navigator.serviceWorker.ready,
        new Promise(function(_, reject) { setTimeout(function() { reject(new Error('no service worker')); }, 6000); })
    ]);
}

// turns the reminder on (or changes its time) for this device. resolves to an error message or ''
function enableReminder(time) {
    if (!pushSupported()) {
        return Promise.resolve(isIOS()
            ? 'on iPhone, add moodtunes to your home screen first (share → add to home screen), then turn this on from there'
            : 'this browser can’t show notifications');
    }
    return Notification.requestPermission().then(function(perm) {
        if (perm !== 'granted') return 'notifications are blocked. allow them for this site in your browser settings, then try again';
        return api('/reminders/key', 'GET', null).then(function(res) {
            if (!res || res.status !== 200 || !res.data || !res.data.publicKey) {
                return res && res.status === 503 ? 'reminders aren’t switched on on the server yet' : 'couldn’t reach the server, try again';
            }
            return swReady().then(function(reg) {
                return reg.pushManager.getSubscription().then(function(sub) {
                    return sub || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(res.data.publicKey) });
                });
            }).then(function(sub) {
                return api('/reminders', 'POST', { subscription: sub.toJSON(), time: time, tz_offset: new Date().getTimezoneOffset() });
            }).then(function(r) {
                return r && r.status === 200 ? '' : ((r && r.data && r.data.message) || 'couldn’t save your reminder, try again');
            });
        });
    }).catch(function() { return 'couldn’t set up notifications on this device'; });
}

function disableReminder() {
    if (!pushSupported()) return Promise.resolve();
    return swReady().then(function(reg) { return reg.pushManager.getSubscription(); }).then(function(sub) {
        if (!sub) return;
        return api('/reminders', 'DELETE', { endpoint: sub.endpoint }).then(function() { return sub.unsubscribe(); });
    }).catch(function() {});
}

function timeLabel(t) {
    var h = Number(t.slice(0, 2)), m = t.slice(3, 5);
    return ((h % 12) || 12) + ':' + m + (h < 12 ? ' am' : ' pm');
}

function buildReminderSection() {
    var st = reminderState();
    var box = document.createElement('div');
    box.className = 'pd-reminder';
    box.style.cssText = 'margin-top:10px;padding-top:12px;border-top:1px solid var(--border,#222);';
    box.innerHTML =
        '<div style="font-size:10px;text-transform:uppercase;letter-spacing:0.1em;color:var(--text-muted,#555);margin-bottom:8px;" id="pd-reminder-label">daily check-in</div>' +
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:0 10px;">' +
            '<span style="font-size:13px;color:var(--text-secondary,#aaa);" id="pd-reminder-text">remind me to log</span>' +
            '<button type="button" class="pd-switch" role="switch" aria-checked="' + st.on + '" aria-labelledby="pd-reminder-label pd-reminder-text"><i></i></button>' +
        '</div>' +
        '<label class="pd-time" style="display:' + (st.on ? 'flex' : 'none') + ';align-items:center;justify-content:space-between;gap:10px;padding:8px 10px 0;font-size:13px;color:var(--text-secondary,#aaa);">at ' +
            '<input type="time" value="' + st.time + '" step="300" aria-label="reminder time" /></label>' +
        '<p class="pd-reminder-note" role="status" style="margin:8px 10px 0;font-size:11.5px;line-height:1.45;color:var(--text-muted,#888);"></p>';

    var sw = box.querySelector('.pd-switch'), timeRow = box.querySelector('.pd-time'), input = box.querySelector('input'), note = box.querySelector('.pd-reminder-note');
    function show(on, msg) {
        sw.setAttribute('aria-checked', String(on));
        timeRow.style.display = on ? 'flex' : 'none';
        note.textContent = msg || (on ? 'you’ll get a nudge at ' + timeLabel(input.value) + ' on days you haven’t logged a song yet' : '');
    }
    show(st.on);
    sw.addEventListener('click', function() {
        if (sw.disabled) return;
        sw.disabled = true;
        if (sw.getAttribute('aria-checked') === 'true') {
            show(false, 'turning off…');
            disableReminder().then(function() { st.on = false; saveReminderState(st); sw.disabled = false; show(false, 'reminder off'); });
        } else {
            note.textContent = 'setting up…';
            enableReminder(input.value).then(function(err) {
                sw.disabled = false;
                if (err) { show(false, err); return; }
                st.on = true; st.time = input.value; saveReminderState(st); show(true);
            });
        }
    });
    input.addEventListener('change', function() {
        if (!/^\d\d:\d\d$/.test(input.value)) return;
        st.time = input.value; saveReminderState(st);
        if (sw.getAttribute('aria-checked') !== 'true') return;
        note.textContent = 'saving…';
        enableReminder(input.value).then(function(err) { show(true, err); });
    });
    return box;
}

// ── delete account ─────────────────────────────────────
// asks for your password, then deletes the account and everything saved with
// it (logs, notes, sessions, playlists, moods) from the database for good
function showDeleteAccount() {
    if (document.getElementById('delete-account-modal')) return;
    var esc = window.MoodFX ? MoodFX.esc : function(x) { return x; };
    var modal = document.createElement('div');
    modal.id = 'delete-account-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'da-title');
    modal.style.cssText = 'position:fixed;inset:0;z-index:100001;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(0,0,0,0.7);';
    modal.innerHTML =
        '<div style="width:100%;max-width:400px;background:var(--bg-card,#141414);border:1px solid var(--border-mid,#333);border-radius:14px;padding:24px;color:var(--text-primary,#f0f0f0);font-size:14px;line-height:1.5;">' +
            '<div id="da-title" style="font-size:18px;font-weight:600;margin-bottom:8px;">delete your account?</div>' +
            '<p style="margin:0 0 10px;color:var(--text-secondary,#aaa);">this permanently deletes <b>' + esc(username) + '</b> and everything saved in it: every logged song and note, your sessions, playlists, play counts and custom moods. it can’t be undone.</p>' +
            '<p style="margin:0 0 16px;color:var(--text-secondary,#aaa);">playlists you saved to spotify stay in your spotify library.</p>' +
            '<label for="da-password" style="display:block;font-size:13px;color:var(--text-secondary,#aaa);margin-bottom:6px;">enter your password to confirm</label>' +
            '<input type="password" id="da-password" autocomplete="current-password" style="width:100%;box-sizing:border-box;padding:11px 12px;border-radius:8px;border:1px solid var(--border-mid,#333);background:var(--bg-input,#1a1a1a);color:var(--text-primary,#f0f0f0);font:inherit;outline:none;" />' +
            '<p id="da-error" style="min-height:20px;margin:8px 0 0;font-size:13px;color:#e05c5c;"></p>' +
            '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:8px;">' +
                '<button type="button" id="da-cancel" style="padding:10px 16px;border-radius:999px;border:1px solid var(--border-mid,#333);background:none;color:var(--text-secondary,#aaa);font:inherit;cursor:pointer;">cancel</button>' +
                '<button type="button" id="da-confirm" style="padding:10px 16px;border-radius:999px;border:0;background:#c94545;color:#fff;font:inherit;font-weight:600;cursor:pointer;">delete my account</button>' +
            '</div>' +
        '</div>';
    document.body.appendChild(modal);
    var input = modal.querySelector('#da-password');
    var err = modal.querySelector('#da-error');
    var btn = modal.querySelector('#da-confirm');
    input.focus();

    function close() { modal.remove(); document.removeEventListener('keydown', onKey, true); }
    function onKey(e) {
        if (e.key === 'Escape') { e.stopPropagation(); close(); }
        else if (e.key === 'Enter' && document.activeElement === input) confirm();
    }
    document.addEventListener('keydown', onKey, true);
    modal.addEventListener('click', function(e) { if (e.target === modal) close(); });
    modal.querySelector('#da-cancel').addEventListener('click', close);
    btn.addEventListener('click', confirm);

    function confirm() {
        if (btn.disabled) return;
        var password = input.value;
        err.textContent = '';
        if (!password) { err.textContent = 'enter your password'; return; }
        btn.disabled = true;
        btn.textContent = 'deleting…';
        apiCall('/auth/account', 'DELETE', { password: password }, function(e, res) {
            if (!e && res && res.status === 200) {
                // forget everything this device kept for the account too
                try {
                    var user = localStorage.getItem('moodtunes_username') || '';
                    clearApiCache();
                    Object.keys(localStorage).forEach(function(k) {
                        if (k.indexOf('moodtunes_') === 0 && (k.indexOf(user) !== -1 || /^moodtunes_(token|username|session|order_)/.test(k))) localStorage.removeItem(k);
                    });
                    sessionStorage.clear();
                } catch (x) {}
                location.replace('login.html?deleted=1');
                return;
            }
            err.textContent = (res && res.data && res.data.message) || 'couldn’t delete your account, try again';
            btn.disabled = false;
            btn.textContent = 'delete my account';
        });
    }
}

var dropdown = null;
function closeDropdown() {
    if (!dropdown) return;
    // let it animate out (see #profile-dropdown.closing in motion.css) before removing
    var closing = dropdown;
    dropdown = null;
    profileBtn.setAttribute('aria-expanded', 'false');
    closing.classList.add('closing');
    setTimeout(function() { closing.remove(); }, 170);
}

profileBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    if (dropdown) { closeDropdown(); return; }
    dropdown = buildDropdown();
    profileWrap.appendChild(dropdown);
    profileBtn.setAttribute('aria-expanded', 'true');
});

document.addEventListener('click', function(e) {
    if (dropdown && !profileWrap.contains(e.target)) closeDropdown();
});
// esc closes the menu and puts you back on the profile button
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && dropdown) { closeDropdown(); profileBtn.focus(); }
});

// wire up help btn logout redirect if it still exists
var lb = document.getElementById('logout-btn');
if (lb) lb.addEventListener('click', logout);

})();