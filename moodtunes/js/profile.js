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
        '--text-secondary': '#998',
        '--text-muted':     '#555',
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
    purple: {
        label: 'deep purple',
        '--bg-page':        '#08061a',
        '--bg-card':        'rgba(26,21,62,0.9)',
        '--bg-input':       'rgba(24,19,58,0.92)',
        '--bg-hover':       'rgba(36,29,82,0.94)',
        '--border':         'rgba(127,119,221,0.15)',
        '--border-mid':     'rgba(127,119,221,0.25)',
        '--text-primary':   '#fff',
        '--text-secondary': 'rgba(255,255,255,0.55)',
        '--text-muted':     'rgba(255,255,255,0.3)',
        '--ambient':        '#a09af5',
        '--accent':         '#82e3c6',                    // mint, to go with the deep purple
        '--accent-bg':      'rgba(130,227,198,0.14)',
        '--chip-bg':        'rgba(127,119,221,0.08)',
        '--chip-border':    'rgba(127,119,221,0.25)',
        '--search-bg':      'rgba(255,255,255,0.04)',
        '--search-border':  'rgba(127,119,221,0.2)',
        '--nav-bg':         'rgba(127,119,221,0.06)',
        '--nav-border':     'rgba(127,119,221,0.15)',
        '--circle-bg':      'rgba(127,119,221,0.2)',
        '--circle-border':  '#82e3c6',
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
        '--text-secondary': '#666',
        '--text-muted':     '#858585',
        '--accent':         '#9b6fc2',
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
    localStorage.setItem('moodtunes_theme', key);
    if (window.MoodFX) window.MoodFX.setMood(window.MoodFX.getMood());
}

// apply on load
var savedTheme = localStorage.getItem('moodtunes_theme') || 'default';
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

navRight.appendChild(profileBtn);

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
            purple:  'linear-gradient(135deg, #5a4fc8 50%, #82e3c6 50%)',
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

    // logout
    var logoutRow = document.createElement('button');
    logoutRow.style.cssText = [
        'display:flex', 'align-items:center', 'gap:10px',
        'width:100%', 'padding:8px 10px',
        'background:none', 'border:none',
        'border-top:1px solid var(--border,#222)',
        'margin-top:10px', 'padding-top:12px',
        'cursor:pointer', 'text-align:left',
        'color:#e05c5c', 'font-size:13px',
        'border-radius:0',
    ].join(';');
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
    deleteRow.addEventListener('click', function(e) { e.stopPropagation(); closeDropdown(); showDeleteAccount(); });
    d.appendChild(deleteRow);

    return d;
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
    closing.classList.add('closing');
    setTimeout(function() { closing.remove(); }, 170);
}

profileBtn.style.position = 'relative';
profileBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    if (dropdown) { closeDropdown(); return; }
    dropdown = buildDropdown();
    profileBtn.appendChild(dropdown);
});

document.addEventListener('click', function(e) {
    if (dropdown && !profileBtn.contains(e.target)) closeDropdown();
});

// wire up help btn logout redirect if it still exists
var lb = document.getElementById('logout-btn');
if (lb) lb.addEventListener('click', logout);

})();