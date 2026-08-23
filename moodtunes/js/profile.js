// profile.js — profile dropdown + theme switcher, shared across all pages

(function() {

// ── theme definitions ──────────────────────────────────
var THEMES = {
    default: {
        label: 'default',
        '--bg-page':        '#0f0f0f',
        '--bg-card':        '#141414',
        '--bg-input':       '#1a1a1a',
        '--bg-hover':       '#1e1e1e',
        '--border':         '#222',
        '--border-mid':     '#333',
        '--text-primary':   '#f0f0f0',
        '--text-secondary': '#aaa',
        '--text-muted':     '#555',
        '--accent':         '#7f77dd',
        '--accent-bg':      '#2d1f6e',
        '--chip-bg':        'transparent',
        '--chip-border':    '#333',
        '--search-bg':      '#1a1040',
        '--search-border':  '#b471ff',
        '--nav-bg':         '#0f0f0f',
        '--nav-border':     '#222',
        '--circle-bg':      '#2d1f6e',
        '--circle-border':  '#7f77dd',
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
        '--bg-card':        'rgba(127,119,221,0.07)',
        '--bg-input':       'rgba(127,119,221,0.06)',
        '--bg-hover':       'rgba(127,119,221,0.1)',
        '--border':         'rgba(127,119,221,0.15)',
        '--border-mid':     'rgba(127,119,221,0.25)',
        '--text-primary':   '#fff',
        '--text-secondary': 'rgba(255,255,255,0.55)',
        '--text-muted':     'rgba(255,255,255,0.3)',
        '--accent':         '#a09af5',
        '--accent-bg':      'rgba(127,119,221,0.15)',
        '--chip-bg':        'rgba(127,119,221,0.08)',
        '--chip-border':    'rgba(127,119,221,0.25)',
        '--search-bg':      'rgba(255,255,255,0.04)',
        '--search-border':  'rgba(127,119,221,0.2)',
        '--nav-bg':         'rgba(127,119,221,0.06)',
        '--nav-border':     'rgba(127,119,221,0.15)',
        '--circle-bg':      'rgba(127,119,221,0.2)',
        '--circle-border':  '#a09af5',
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
        '--text-secondary': '#888',
        '--text-muted':     '#bbb',
        '--accent':         '#7f77dd',
        '--accent-bg':      '#f0eff9',
        '--chip-bg':        '#fff',
        '--chip-border':    '#e0e0da',
        '--search-bg':      '#fff',
        '--search-border':  '#e0e0da',
        '--nav-bg':         '#fff',
        '--nav-border':     '#e8e8e4',
        '--circle-bg':      '#f0eff9',
        '--circle-border':  '#7f77dd',
    }
};

// ── apply theme ────────────────────────────────────────
function applyTheme(key) {
    var t = THEMES[key] || THEMES.default;
    var root = document.documentElement;
    Object.keys(t).forEach(function(prop) {
        if (prop === 'label') return;
        root.style.setProperty(prop, t[prop]);
    });
    // also set body bg directly for pages that use it
    document.body.style.backgroundColor = t['--bg-page'];
    localStorage.setItem('moodtunes_theme', key);
}

// apply on load
var savedTheme = localStorage.getItem('moodtunes_theme') || 'default';
applyTheme(savedTheme);

// ── inject CSS overrides that use CSS vars ────────────
var style = document.createElement('style');
style.textContent = [
    'body { background-color: var(--bg-page) !important; color: var(--text-primary) !important; }',
    '.navbar { background: var(--nav-bg) !important; border-bottom-color: var(--nav-border) !important; }',
    '.log-card { background: var(--bg-card) !important; border-color: var(--border) !important; }',
    '.log-card:hover { border-color: var(--border-mid) !important; }',
    '.chip { background: var(--chip-bg) !important; border-color: var(--chip-border) !important; color: var(--text-secondary) !important; }',
    '.chip:hover { border-color: var(--accent) !important; color: var(--text-primary) !important; }',
    '.chip.selected { background: var(--accent) !important; border-color: var(--accent) !important; color: #fff !important; }',
    '#song-search { background: var(--search-bg) !important; border-color: var(--search-border) !important; color: var(--text-primary) !important; }',
    '.stats-card, .stats-card-title, .flashback-card { background: var(--bg-card) !important; border-color: var(--border) !important; }',
    '.section-label { color: var(--text-muted) !important; }',
    '.song-title { color: var(--text-primary) !important; }',
    '.song-artist, .plays-text, .date-text { color: var(--text-secondary) !important; }',
    '.nav-links a { color: var(--text-muted) !important; }',
    '.nav-links a:hover, .nav-links a.active { color: var(--text-primary) !important; border-bottom-color: var(--accent) !important; }',
    '.save-note-btn { background: var(--accent) !important; }',
    '.add-note-btn, .edit-note-btn, .log-note { color: var(--accent) !important; }',
    '.logo span { color: var(--accent) !important; }',
    '.session-timer-circle { background: var(--circle-bg, #2d1f6e) !important; border-color: var(--circle-border, #7f77dd) !important; }',
    '.session-hero-label { color: var(--text-muted) !important; }',
    '.session-hero-timer { color: var(--text-primary) !important; }',
    '#session-start-btn { background: var(--accent) !important; }',
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
    '.playlist-card-title { color: var(--text-primary) !important; }',
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
    '.stat-box-label { color: var(--text-secondary) !important; }',
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
    'border:1px solid var(--border-mid, #333)',
    'color:var(--text-secondary, #888)',
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
        '<div style="font-size:14px;font-weight:500;color:var(--text-primary,#f0f0f0);margin-bottom:2px;">' + username + '</div>' +
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
            'background:' + (key === currentTheme ? 'var(--accent-bg,#2d1f6e)' : 'none'),
            'border:none',
            'border-radius:8px',
            'cursor:pointer',
            'text-align:left',
            'margin-bottom:3px',
            'transition:background 0.1s',
        ].join(';');

        // colour swatch
        var swatch = document.createElement('span');
        var swatchColors = { default: '#7f77dd', warm: '#c4762d', purple: '#a09af5', light: '#7f77dd' };
        swatch.style.cssText = 'width:12px;height:12px;border-radius:50%;background:' + swatchColors[key] + ';flex-shrink:0;';

        var lbl = document.createElement('span');
        lbl.style.cssText = 'font-size:13px;color:' + (key === currentTheme ? 'var(--accent,#7f77dd)' : 'var(--text-secondary,#aaa)') + ';';
        lbl.textContent = t.label;

        if (key === currentTheme) {
            var tick = document.createElement('span');
            tick.style.cssText = 'margin-left:auto;font-size:12px;color:var(--accent,#7f77dd);';
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
            setTimeout(function() { if (document.getElementById('profile-btn')) document.getElementById('profile-btn').click(); }, 50);
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

    return d;
}

var dropdown = null;
function closeDropdown() {
    if (dropdown) { dropdown.remove(); dropdown = null; }
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