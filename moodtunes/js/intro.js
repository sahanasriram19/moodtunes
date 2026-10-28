// intro.js — a short guided intro the first time someone opens each page
// a spotlight glides from one part of the page to the next with a line or two
// about it. it's shown once per page per account (and never to accounts that had
// already dismissed the old help popup). the full guide stays behind the ? button,
// which also has "show me around this page" to replay the intro any time.

(function() {

var PAGE = (location.pathname.split('/').pop() || 'index.html').replace('.html', '') || 'index';
if (PAGE === 'login' || PAGE === 'offline') return;

var USER = localStorage.getItem('moodtunes_username') || 'guest';
var KEY = 'moodtunes_intro_' + PAGE + '_' + USER;
var phone = function() { return window.innerWidth <= 768; };
var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ── the steps for each page ──────────────────────────────
// target: a selector, or a function returning an element (null = centred card)
// skipIf: leave the step out when it returns true
function navTarget() {
    var tab = document.getElementById('tabbar');
    if (tab && tab.offsetParent !== null && getComputedStyle(tab).display !== 'none') return tab;
    return document.querySelector('.nav-links');
}
function helpTarget() {
    var h = document.getElementById('help-btn');
    if (h && h.offsetParent !== null && getComputedStyle(h).display !== 'none') return h;
    return document.getElementById('profile-btn');
}
function visible(el) {
    if (!el) return false;
    var r = el.getBoundingClientRect();
    return r.width > 4 && r.height > 4 && getComputedStyle(el).visibility !== 'hidden';
}

var STEPS = {
    index: [
        { title: 'welcome to moodtunes', text: 'a music journal for how songs make you feel. here’s a 20 second look around.' },
        { target: '.mood-chips', title: 'start with a mood', text: 'pick how you’re feeling right now. every mood gets its own colour, and its own playlist.' },
        { target: '#song-search', title: 'find your song', text: 'search for what you’re listening to. tap a result to play it in spotify and log it under your mood, with a note if you like.' },
        { target: '#now-playing', title: 'now playing', text: 'whatever’s on in spotify shows up here. tap a mood under it to log it in one tap.',
          skipIf: function() { var n = document.getElementById('now-playing'); return !n || n.classList.contains('np-hidden'); } },
        { target: '#logs-list', title: 'your journal', text: 'songs you log today and yesterday land here. add or edit a note on any of them.' },
        { target: navTarget, title: 'the rest of moodtunes', text: function() {
            return 'playlists, sessions, history and stats are ' + (phone() ? 'down here' : 'up here') + '. each one has its own quick intro the first time you open it.'; } },
        { target: helpTarget, title: 'need more detail?', text: 'the full guide is always here, with everything moodtunes can do.' }
    ],
    playlists: [
        { target: function() { return document.getElementById('playlist-grid') || document.getElementById('playlists-list'); },
          title: 'your mood playlists', text: 'every mood you log songs under becomes a playlist. the cover shows its top 4 songs.' },
        { target: '.playlist-card', title: 'open one', text: 'drag songs to reorder, add notes, or tap ✕ to take a song out (it stays in your history).',
          skipIf: function() { return !document.querySelector('.playlist-card'); } },
        { target: '.playlist-card', title: 'take it to spotify', text: 'inside a playlist, “save to spotify” adds it to your library and keeps it up to date as you log.',
          skipIf: function() { return !document.querySelector('.playlist-card'); } }
    ],
    session: [
        { target: '.mood-chips', title: 'pick a mood', text: 'choose the mood you want this listening session to be.' },
        { target: '.session-timer-circle', title: 'start a session', text: 'moodtunes finds new songs from the genres of your songs in that mood, and the timer runs while you listen.' },
        { target: '#session-how', title: 'premium or free', text: 'how sessions play in spotify depends on your account. open this to see how yours works.' }
    ],
    history: [
        { target: '.song-search-section', title: 'find any song', text: 'search a song to see every day you played it, how many times, and your notes.' },
        { target: '.history-tabs', title: 'timeline and sessions', text: 'switch between everything you logged day by day, and your past listening sessions.' },
        { target: '#timeline', title: 'your timeline', text: 'edit notes or delete entries here. removing a song from a playlist never touches this.',
          skipIf: function() { return !visible(document.getElementById('timeline')); } }
    ],
    stats: [
        { target: '.stats-sentence', title: 'your listening at a glance', text: 'plays, songs, days and your top mood, all in one line.' },
        { target: '.stats-grid', title: 'moods and timing', text: 'which moods you play most, and when in your day you listen (in your own timezone).',
          skipIf: function() { return !document.querySelector('.stats-grid'); } },
        { target: '#mood-calendar', title: 'your month in moods', text: 'each day shows the mood you played most. tap a day to see what you were listening to.',
          skipIf: function() { return !document.getElementById('mood-calendar'); } }
    ]
};

var steps = STEPS[PAGE];
if (!steps) return;

// ── styles ───────────────────────────────────────────────
function injectCSS() {
    if (document.getElementById('mt-tour-css')) return;
    var css = document.createElement('style');
    css.id = 'mt-tour-css';
    css.textContent = [
        '#mt-tour{position:fixed;inset:0;z-index:99990;pointer-events:auto;}',
        '#mt-tour .mtt-spot{position:fixed;border-radius:16px;pointer-events:none;',
            'box-shadow:0 0 0 2px color-mix(in srgb,var(--mood,#b99cff) 70%,transparent),0 0 0 9999px rgba(8,4,18,0.66);',
            'transition:top .45s cubic-bezier(.2,.8,.2,1),left .45s cubic-bezier(.2,.8,.2,1),width .45s cubic-bezier(.2,.8,.2,1),height .45s cubic-bezier(.2,.8,.2,1),opacity .3s;}',
        '#mt-tour .mtt-spot.mtt-none{box-shadow:0 0 0 9999px rgba(8,4,18,0.72);}',
        '#mt-tour .mtt-spot::after{content:"";position:absolute;inset:-6px;border-radius:20px;border:2px solid var(--mood,#b99cff);opacity:0;animation:mtt-pulse 1.8s ease-out infinite;}',
        '#mt-tour .mtt-spot.mtt-none::after{display:none;}',
        '@keyframes mtt-pulse{0%{opacity:.7;transform:scale(.98)}100%{opacity:0;transform:scale(1.06)}}',
        '#mt-tour .mtt-tip{position:fixed;width:min(340px,calc(100vw - 32px));box-sizing:border-box;padding:18px 18px 14px;border-radius:16px;',
            'background:var(--bg-card,#1b1430);color:var(--text-primary,#f6f1ff);border:1px solid var(--border-mid,rgba(196,170,255,.3));',
            'box-shadow:0 24px 60px -18px rgba(0,0,0,.7);font:14px/1.5 "DM Sans",system-ui,sans-serif;',
            'backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);',
            'transition:top .45s cubic-bezier(.2,.8,.2,1),left .45s cubic-bezier(.2,.8,.2,1),opacity .3s,transform .3s;}',
        '#mt-tour.mtt-in .mtt-tip{opacity:0;transform:translateY(10px) scale(.97);}',
        '#mt-tour .mtt-arrow{position:absolute;width:14px;height:14px;background:inherit;border:inherit;transform:rotate(45deg);',
            'transition:left .45s cubic-bezier(.2,.8,.2,1);}',
        '#mt-tour .mtt-tip[data-side="below"] .mtt-arrow{top:-8px;border-right:0;border-bottom:0;}',
        '#mt-tour .mtt-tip[data-side="above"] .mtt-arrow{bottom:-8px;border-left:0;border-top:0;}',
        '#mt-tour .mtt-tip[data-side="center"] .mtt-arrow{display:none;}',
        '#mt-tour .mtt-body{animation:mtt-swap .35s cubic-bezier(.2,.8,.2,1);}',
        '@keyframes mtt-swap{from{opacity:0;transform:translateX(12px)}to{opacity:1;transform:none}}',
        '#mt-tour .mtt-step{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--mood,#b99cff);margin-bottom:6px;font-weight:600;}',
        '#mt-tour .mtt-title{font:600 18px/1.25 var(--font-display,"Outfit","DM Sans",sans-serif);margin-bottom:6px;color:var(--text-primary,#fff);}',
        '#mt-tour .mtt-text{color:var(--text-secondary,#c9bde6);font-size:14px;}',
        '#mt-tour .mtt-foot{display:flex;align-items:center;gap:8px;margin-top:16px;}',
        '#mt-tour .mtt-dots{display:flex;gap:5px;margin-right:auto;}',
        '#mt-tour .mtt-dots i{width:6px;height:6px;border-radius:99px;background:var(--border-mid,rgba(196,170,255,.3));transition:width .3s,background .3s;}',
        '#mt-tour .mtt-dots i.on{width:18px;background:var(--mood,#b99cff);}',
        '#mt-tour button{font:inherit;cursor:pointer;border-radius:999px;}',
        '#mt-tour .mtt-skip{background:none;border:0;color:var(--text-muted,#9384b8);font-size:12.5px;padding:6px 4px;}',
        '#mt-tour .mtt-skip:hover{color:var(--text-primary,#fff);}',
        '#mt-tour .mtt-back{background:none;border:1px solid var(--border-mid,#444);color:var(--text-secondary,#ccc);font-size:13px;padding:7px 12px;}',
        '#mt-tour .mtt-next{border:0;background:var(--mood,#b99cff);color:var(--mood-ink,#fff);font-size:13px;font-weight:600;padding:8px 16px;}',
        '#mt-tour .mtt-next:focus-visible,#mt-tour .mtt-back:focus-visible{outline:2px solid var(--text-primary,#fff);outline-offset:2px;}',
        '#mt-tour.mtt-out{opacity:0;transition:opacity .25s;}',
        '@media (prefers-reduced-motion:reduce){#mt-tour *{transition:none!important;animation:none!important;}}'
    ].join('');
    document.head.appendChild(css);
}

// ── the tour itself ─────────────────────────────────────
var root = null, spot, tip, body, arrow, list = [], at = 0, current = null, raf = 0;

function resolve(step) {
    if (!step.target) return null;
    var el = typeof step.target === 'function' ? step.target() : document.querySelector(step.target);
    return visible(el) ? el : null;
}

function build() {
    injectCSS();
    root = document.createElement('div');
    root.id = 'mt-tour';
    root.className = 'mtt-in';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'quick intro to this page');
    root.innerHTML =
        '<div class="mtt-spot mtt-none"></div>' +
        '<div class="mtt-tip" data-side="center"><span class="mtt-arrow"></span><div class="mtt-body" aria-live="polite"></div></div>';
    document.body.appendChild(root);
    spot = root.querySelector('.mtt-spot');
    tip = root.querySelector('.mtt-tip');
    body = root.querySelector('.mtt-body');
    arrow = root.querySelector('.mtt-arrow');
    // the spotlight starts as a dot in the middle and grows onto the first target
    setSpot({ top: innerHeight / 2, left: innerWidth / 2, width: 0, height: 0 });
    requestAnimationFrame(function() { requestAnimationFrame(function() { root.classList.remove('mtt-in'); }); });

    root.addEventListener('click', function(e) {
        var b = e.target.closest('button');
        if (!b) return;
        if (b.classList.contains('mtt-next')) go(at + 1);
        else if (b.classList.contains('mtt-back')) go(at - 1);
        else if (b.classList.contains('mtt-skip')) finish();
    });
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
}

function onKey(e) {
    if (!root) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); go(at + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); go(at - 1); }
}

function setSpot(r) {
    spot.style.top = r.top + 'px';
    spot.style.left = r.left + 'px';
    spot.style.width = r.width + 'px';
    spot.style.height = r.height + 'px';
}

// fit the spotlight around the element, and put the tip above or below it
function reposition() {
    if (!root) return;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(function() {
        var vw = innerWidth, vh = innerHeight, pad = 8, gap = 16;
        var tw = tip.offsetWidth, th = tip.offsetHeight;
        if (!current) {
            spot.classList.add('mtt-none');
            setSpot({ top: vh / 2, left: vw / 2, width: 0, height: 0 });
            tip.dataset.side = 'center';
            tip.style.left = Math.round((vw - tw) / 2) + 'px';
            tip.style.top = Math.round((vh - th) / 2) + 'px';
            return;
        }
        spot.classList.remove('mtt-none');
        var r = current.getBoundingClientRect();
        var top = Math.max(r.top - pad, 8), bottom = Math.min(r.bottom + pad, vh - 8);
        // very tall areas: light up the top part, so there's room for the tip
        var maxH = Math.max(80, vh - th - gap * 3 - 16);
        if (bottom - top > maxH) bottom = top + maxH;
        var left = Math.max(r.left - pad, 8), right = Math.min(r.right + pad, vw - 8);
        setSpot({ top: top, left: left, width: Math.max(0, right - left), height: Math.max(0, bottom - top) });

        var side = (vh - bottom >= th + gap + 8) ? 'below' : (top >= th + gap + 8 ? 'above' : 'below');
        var tTop = side === 'below' ? bottom + gap : top - gap - th;
        tTop = Math.max(8, Math.min(tTop, vh - th - 8));
        var cx = (left + right) / 2;
        var tLeft = Math.max(16, Math.min(cx - tw / 2, vw - tw - 16));
        tip.dataset.side = side;
        tip.style.left = Math.round(tLeft) + 'px';
        tip.style.top = Math.round(tTop) + 'px';
        arrow.style.left = Math.round(Math.max(18, Math.min(cx - tLeft - 7, tw - 32))) + 'px';
    });
}

function text(v) { return typeof v === 'function' ? v() : v; }
function esc(s) { return window.MoodFX ? MoodFX.esc(s) : String(s); }

function go(i) {
    if (i < 0) return;
    if (i >= list.length) return finish();
    at = i;
    var step = list[i];
    current = resolve(step);
    var last = i === list.length - 1;
    body.innerHTML =
        '<div class="mtt-step">' + (i + 1) + ' of ' + list.length + '</div>' +
        '<div class="mtt-title">' + esc(text(step.title)) + '</div>' +
        '<div class="mtt-text">' + esc(text(step.text)) + '</div>' +
        '<div class="mtt-foot">' +
            '<span class="mtt-dots">' + list.map(function(_, k) { return '<i class="' + (k === i ? 'on' : '') + '"></i>'; }).join('') + '</span>' +
            (last ? '' : '<button type="button" class="mtt-skip">skip</button>') +
            (i > 0 ? '<button type="button" class="mtt-back">back</button>' : '') +
            '<button type="button" class="mtt-next">' + (last ? 'got it' : (i === 0 ? 'show me' : 'next')) + '</button>' +
        '</div>';
    // restart the slide-in on the new text
    body.style.animation = 'none'; void body.offsetWidth; body.style.animation = '';
    var next = body.querySelector('.mtt-next');
    if (current) {
        var r = current.getBoundingClientRect();
        var needsScroll = current.getBoundingClientRect && getComputedStyle(current).position !== 'fixed' &&
            (r.top < 70 || r.bottom > innerHeight - (phone() ? 260 : 220));
        if (needsScroll) {
            current.scrollIntoView({ block: r.height > innerHeight * 0.5 ? 'start' : 'center', behavior: reduce ? 'auto' : 'smooth' });
        }
    }
    reposition();
    setTimeout(reposition, 420);       // once any smooth scrolling has settled
    try { next.focus({ preventScroll: true }); } catch (e) {}
}

function finish() {
    if (!root) return;
    try { localStorage.setItem(KEY, '1'); } catch (e) {}
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', reposition);
    window.removeEventListener('scroll', reposition, true);
    var r = root;
    root = null;
    r.classList.add('mtt-out');
    setTimeout(function() { r.remove(); }, 260);
}

function start(force) {
    if (root) return;
    if (!force) {
        try {
            if (localStorage.getItem(KEY)) return;
            // accounts that already went through the old help popup aren't new
            if (localStorage.getItem('moodtunes_seen_help_' + USER)) return;
        } catch (e) { return; }
        if (document.getElementById('help-modal')) return;
    }
    list = steps.filter(function(s) { return !(s.skipIf && s.skipIf()); });
    if (!list.length) return;
    build();
    go(0);
}

// wait until the page has something to point at (its content loads from the
// server), then begin. gives up quietly after a few seconds
function whenReady(force) {
    var first = steps[0];
    var tries = 0;
    (function check() {
        var ready = !first.target || resolve(first);
        // the playlists page: wait for the covers rather than the loading skeleton
        if (PAGE === 'playlists') ready = !!document.getElementById('playlist-grid') || !!document.querySelector('#playlists-list .mt-empty, #playlists-list [class*="empty"]');
        if (PAGE === 'stats') ready = !!document.querySelector('.stats-sentence');
        if (ready) return setTimeout(function() { start(force); }, force ? 0 : 600);
        if (++tries < 40) setTimeout(check, 200);
    })();
}

window.MoodTour = { start: function() { whenReady(true); } };

// prerendered pages (opened early in the background) wait until you actually see them
function begin() { whenReady(false); }
if (document.prerendering) document.addEventListener('prerenderingchange', begin, { once: true });
else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', begin);
else begin();

})();