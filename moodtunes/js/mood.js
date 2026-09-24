// mood.js — shared across every page
// mood-reactive theming, entrance animations, skeleton loaders, toasts,
// confetti, the live "now playing" card, and the animated session summary.
// Load it right after api.js on each page; it exposes window.MoodFX.

(function() {

// ── mood palette ───────────────────────────────────────
// colours match stats.js so the whole app speaks the same colour language
// (happy is sunny yellow so it doesn't clash with focused's green)
var COLORS = {
    happy: '#f2c84b', sad: '#378add', hype: '#ef9f27',
    heartbreak: '#d4537e', nostalgic: '#7f77dd', focused: '#1D9E75', chill: '#888780'
};
// seconds per "beat" — drives breathing / pulse speed. hype is fast, sad is slow.
var TEMPO = {
    hype: 0.45, happy: 0.6, focused: 1.0, nostalgic: 1.4, chill: 1.8, heartbreak: 2.0, sad: 2.4
};
var EMOJI = {
    happy: '😊', sad: '🌧️', hype: '🔥', heartbreak: '💔', nostalgic: '📼', focused: '🎯', chill: '🌊'
};

var root = document.documentElement;
var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// custom moods get a stable colour derived from their name
function hashHue(str) {
    var h = 0;
    for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360;
    return h;
}

function color(mood) {
    if (!mood) return accent();
    mood = String(mood).toLowerCase().trim();
    return COLORS[mood] || 'hsl(' + hashHue(mood) + ', 58%, 64%)';
}

function tempo(mood) {
    return TEMPO[(mood || '').toLowerCase()] || 1.2;
}

function emoji(mood) {
    return EMOJI[(mood || '').toLowerCase()] || '';
}

// readable text colour on top of a mood colour: dark ink on light moods (e.g. happy yellow), white otherwise
var inkCache = {};
function ink(c) {
    if (!c) return '#fff';
    if (inkCache[c]) return inkCache[c];
    var probe = document.createElement('span');
    probe.style.color = c;
    probe.style.display = 'none';
    root.appendChild(probe);
    var m = getComputedStyle(probe).color.match(/[\d.]+/g);
    probe.remove();
    if (!m) return '#fff';
    var lin = function(v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    var L = 0.2126 * lin(+m[0]) + 0.7152 * lin(+m[1]) + 0.0722 * lin(+m[2]);
    // only genuinely light colours (e.g. happy yellow, hype orange) get dark text — the rest keep white
    var out = L > 0.4 ? '#1a1405' : '#fff';
    inkCache[c] = out;
    return out;
}

function accent() {
    var a = getComputedStyle(root).getPropertyValue('--accent').trim();
    return a || '#9b6fc2';
}

// ── set the page mood ──────────────────────────────────
var currentMood = null;
function setMood(mood) {
    currentMood = mood || null;
    root.style.setProperty('--mood', color(mood));
    root.style.setProperty('--mood-ink', ink(color(mood)));
    root.style.setProperty('--mood-tempo', tempo(mood) + 's');
    if (mood) root.setAttribute('data-mood', mood); else root.removeAttribute('data-mood');
}

// album-art colour — blended into the ambient glow by the now-playing card
function setTrackColor(c) {
    root.style.setProperty('--np', c || 'var(--mood)');
    root.classList.toggle('has-np', !!c);
}

// ── ambient background glow ────────────────────────────
function mountAmbient() {
    if (document.getElementById('mood-ambient')) return;
    var amb = document.createElement('div');
    amb.id = 'mood-ambient';
    amb.setAttribute('aria-hidden', 'true');
    amb.innerHTML = '<span class="blob blob-a"></span><span class="blob blob-b"></span><span class="blob blob-c"></span><span class="blob blob-d"></span>';
    document.body.insertBefore(amb, document.body.firstChild);
}

// ── decorate chips + badges with their mood colour ─────
function decorate(node) {
    if (!node || node.nodeType !== 1) return;
    var chips = node.matches && node.matches('.chip[data-mood]') ? [node] : [];
    chips = chips.concat(Array.prototype.slice.call(node.querySelectorAll ? node.querySelectorAll('.chip[data-mood]') : []));
    chips.forEach(function(chip) {
        chip.style.setProperty('--mc', color(chip.dataset.mood));
        chip.style.setProperty('--mc-ink', ink(color(chip.dataset.mood)));
        if (!chip.querySelector('.chip-emoji')) {
            var e = chip.dataset.emoji || emoji(chip.dataset.mood);
            if (e) {
                var span = document.createElement('span');
                span.className = 'chip-emoji';
                span.setAttribute('aria-hidden', 'true');
                span.textContent = e;
                chip.insertBefore(span, chip.firstChild);
            }
        }
    });

    var badges = node.matches && node.matches('.mood-badge') ? [node] : [];
    badges = badges.concat(Array.prototype.slice.call(node.querySelectorAll ? node.querySelectorAll('.mood-badge') : []));
    badges.forEach(function(b) {
        var c = color(b.textContent);
        b.style.setProperty('--mc', c);
        b.classList.add('mood-tinted');
    });
}

// ── staggered entrance for anything list-like ──────────
var ENTER_SEL = [
    '.log-card', '.result-item', '.session-rec-card', '.rec-tile', '.playlist-card',
    '.stat-box', '.stats-card', '.stat-card', '.song-history-card', '.session-history-card',
    '.timeline-date', '.flashback-card', '.session-song-thumb', '.top-song-row'
].join(',');
var batch = 0, batchReset = null;

function stagger(node) {
    if (!node || node.nodeType !== 1 || reduceMotion) return;
    var list = [];
    if (node.matches(ENTER_SEL)) list.push(node);
    list = list.concat(Array.prototype.slice.call(node.querySelectorAll(ENTER_SEL)));
    list.forEach(function(el) {
        if (el.classList.contains('mt-in')) return;
        el.style.animationDelay = Math.min(batch * 45, 700) + 'ms';
        el.classList.add('mt-in');
        batch++;
    });
    if (list.length && !batchReset) {
        batchReset = requestAnimationFrame(function() {
            requestAnimationFrame(function() { batch = 0; batchReset = null; });
        });
    }
}

// ── skeleton loaders ───────────────────────────────────
function skeleton(kind, n) {
    var i, html = '';
    n = n || 4;
    if (kind === 'rows') {
        html = '<div class="sk-wrap" aria-busy="true" aria-label="loading">';
        for (i = 0; i < n; i++) {
            html += '<div class="sk-row"><div class="sk sk-art"></div><div class="sk-lines">' +
                '<div class="sk sk-line" style="width:' + (48 + (i * 17) % 30) + '%"></div>' +
                '<div class="sk sk-line sk-short" style="width:' + (22 + (i * 11) % 18) + '%"></div>' +
                '</div><div class="sk sk-dot"></div></div>';
        }
        return html + '</div>';
    }
    if (kind === 'grid') {
        html = '<div class="sk-grid" aria-busy="true" aria-label="loading">';
        for (i = 0; i < n; i++) {
            html += '<div class="sk-tile"><div class="sk sk-square"></div><div class="sk sk-line"></div><div class="sk sk-line sk-short"></div></div>';
        }
        return html + '</div>';
    }
    if (kind === 'recs') {
        html = '<div class="sk-recs" aria-busy="true" aria-label="loading">';
        for (i = 0; i < n; i++) {
            html += '<div class="sk-rec"><div class="sk sk-square"></div><div class="sk sk-line"></div></div>';
        }
        return html + '</div>';
    }
    if (kind === 'stats') {
        html = '<div class="sk-stats" aria-busy="true" aria-label="loading">';
        for (i = 0; i < (n || 4); i++) html += '<div class="sk sk-stat"></div>';
        return html + '</div>';
    }
    if (kind === 'block') {
        return '<div class="sk sk-block" aria-busy="true" aria-label="loading"></div>';
    }
    return '';
}

// ── toast ──────────────────────────────────────────────
// opts: { action: 'undo', onAction: fn, duration: ms }
var toastTimer = null;
function toast(text, mood, opts) {
    opts = opts || {};
    var old = document.querySelector('.mt-toast');
    if (old) old.remove();
    clearTimeout(toastTimer);
    var t = document.createElement('div');
    t.className = 'mt-toast';
    t.setAttribute('role', 'status');
    t.style.setProperty('--mc', color(mood || currentMood));
    var dot = document.createElement('span');
    dot.className = 'mt-toast-dot';
    var msg = document.createElement('span');
    msg.textContent = text;
    t.appendChild(dot);
    t.appendChild(msg);
    if (opts.action) {
        var btn = document.createElement('button');
        btn.className = 'mt-toast-action';
        btn.textContent = opts.action;
        btn.addEventListener('click', function() {
            dismiss();
            if (opts.onAction) opts.onAction();
        });
        t.appendChild(btn);
        // a thin bar that runs down while the action is still available
        var bar = document.createElement('span');
        bar.className = 'mt-toast-timer';
        bar.style.animationDuration = (opts.duration || 5000) + 'ms';
        t.appendChild(bar);
    }
    document.body.appendChild(t);
    requestAnimationFrame(function() { t.classList.add('show'); });
    function dismiss() {
        clearTimeout(toastTimer);
        t.classList.remove('show');
        setTimeout(function() { t.remove(); }, 400);
    }
    toastTimer = setTimeout(dismiss, opts.duration || 2600);
    return dismiss;
}

// ── delete with undo ───────────────────────────────────
// hides the thing straight away, offers "undo" for 5s, then commits.
// anything still pending when the page is left is committed immediately.
var pending = [];
function undoable(o) {
    var entry = { done: false, commit: o.commit };
    pending.push(entry);
    if (o.hide) o.hide();
    var timer = setTimeout(finish, o.duration || 5000);
    function finish() {
        if (entry.done) return;
        entry.done = true;
        pending.splice(pending.indexOf(entry), 1);
        entry.commit();
    }
    toast(o.message, o.mood, {
        action: 'undo', duration: o.duration || 5000,
        onAction: function() {
            if (entry.done) return;
            entry.done = true;
            clearTimeout(timer);
            pending.splice(pending.indexOf(entry), 1);
            if (o.restore) o.restore();
        }
    });
}
window.addEventListener('pagehide', function() {
    pending.slice().forEach(function(e) { if (!e.done) { e.done = true; e.commit(); } });
});

// ── "pick a mood first" nudge (replaces alert()) ───────
function nudgeMoods(scope) {
    var targets = [];
    if (scope && scope.querySelector) {
        var inner = scope.querySelector('.inline-mood-picker');
        if (inner) targets.push(inner);
    }
    var main = document.querySelector('.mood-chips');
    if (main) targets.push(main);
    targets.forEach(function(el) {
        el.classList.remove('mt-shake');
        void el.offsetWidth;
        el.classList.add('mt-shake');
    });
    if (main && !isInView(main)) main.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
    toast('pick a mood first ✨');
}
function isInView(el) {
    var r = el.getBoundingClientRect();
    return r.top >= 0 && r.bottom <= innerHeight;
}

// ── hidden built-in moods ──────────────────────────────
// users can remove any built-in mood from their page; the choice is saved to
// the backend (with a local copy so the page doesn't flash hidden chips)
var DEFAULT_MOODS = ['happy', 'sad', 'hype', 'heartbreak', 'nostalgic', 'focused', 'chill'];
function hiddenKey() { return 'moodtunes_hidden_moods_' + (localStorage.getItem('moodtunes_username') || 'guest'); }
var hiddenMoods = (function() {
    try { var h = JSON.parse(localStorage.getItem(hiddenKey()) || '[]'); return Array.isArray(h) ? h : []; }
    catch (e) { return []; }
})();

var hiddenStyle = document.createElement('style');
hiddenStyle.id = 'mt-hidden-moods';
document.head.appendChild(hiddenStyle);

function saveHidden() {
    try { localStorage.setItem(hiddenKey(), JSON.stringify(hiddenMoods)); } catch (e) {}
}

function applyHidden() {
    // CSS rather than DOM removal, so chips added later by other scripts are covered too
    hiddenStyle.textContent = hiddenMoods.map(function(m) {
        var sel = '.chip[data-mood="' + CSS.escape(m) + '"]:not(.custom-chip)';
        return '.chip-wrap:has(> ' + sel + '), .mood-chips > ' + sel + ', .inline-mood-picker ' + sel;
    }).join(',\n') + (hiddenMoods.length ? ' { display: none !important; }' : '');
    renderRestore();
}

function isHidden(m) { return hiddenMoods.indexOf(m) !== -1; }

function hideMood(m) {
    if (!m || isHidden(m)) return;
    hiddenMoods.push(m);
    saveHidden();
    applyHidden();
    if (currentMood === m) setMood(null);
    apiCall('/moods/hidden', 'POST', { mood: m }, function() {});
}

function unhideMood(m) {
    if (!isHidden(m)) return;
    hiddenMoods.splice(hiddenMoods.indexOf(m), 1);
    saveHidden();
    applyHidden();
    apiCall('/moods/hidden/' + encodeURIComponent(m), 'DELETE', null, function() {});
}

function syncHidden() {
    apiCall('/moods/hidden', 'GET', null, function(err, res) {
        // older backend without the route: keep the local list
        if (err || !res || res.status !== 200 || !Array.isArray(res.data)) return;
        hiddenMoods = res.data.filter(function(m) { return DEFAULT_MOODS.indexOf(m) !== -1; });
        saveHidden();
        applyHidden();
    });
}

// the moods currently on the page: visible built-ins + the user's custom ones
function visibleMoods() {
    var list = DEFAULT_MOODS.filter(function(m) { return !isHidden(m); });
    document.querySelectorAll('.mood-chips .chip.custom-chip[data-mood]').forEach(function(c) {
        if (list.indexOf(c.dataset.mood) === -1) list.push(c.dataset.mood);
    });
    return list;
}

// "hidden moods — tap to bring back", shown inside the add-mood panel in manage mode
function renderRestore() {
    var host = document.getElementById('add-mood-section');
    if (!host) return;
    var box = document.getElementById('hidden-moods-restore');
    if (!box) {
        box = document.createElement('div');
        box.id = 'hidden-moods-restore';
        host.insertBefore(box, host.firstChild);
    }
    box.innerHTML = '';
    if (!hiddenMoods.length) { box.style.display = 'none'; return; }
    box.style.display = '';
    var label = document.createElement('div');
    label.className = 'restore-label';
    label.textContent = 'hidden moods — tap to bring one back';
    box.appendChild(label);
    var row = document.createElement('div');
    row.className = 'restore-row';
    hiddenMoods.forEach(function(m) {
        var b = document.createElement('button');
        b.className = 'restore-chip';
        b.style.setProperty('--mc', color(m));
        b.textContent = '+ ' + (emoji(m) ? emoji(m) + ' ' : '') + m;
        b.addEventListener('click', function() {
            unhideMood(m);
            toast(m + ' is back on your page', m);
        });
        row.appendChild(b);
    });
    box.appendChild(row);
}

applyHidden();

// ── ripple on chip / button press ──────────────────────
function ripple(el, evt) {
    if (reduceMotion) return;
    var r = el.getBoundingClientRect();
    var s = document.createElement('span');
    s.className = 'mt-ripple';
    var size = Math.max(r.width, r.height) * 1.6;
    s.style.width = s.style.height = size + 'px';
    s.style.left = ((evt.clientX || r.left + r.width / 2) - r.left - size / 2) + 'px';
    s.style.top  = ((evt.clientY || r.top + r.height / 2) - r.top - size / 2) + 'px';
    el.appendChild(s);
    setTimeout(function() { s.remove(); }, 600);
}

// ── confetti ───────────────────────────────────────────
function confetti(baseColor) {
    if (reduceMotion) return;
    var canvas = document.createElement('canvas');
    canvas.className = 'mt-confetti';
    var dpr = window.devicePixelRatio || 1;
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    document.body.appendChild(canvas);
    var ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    var palette = [baseColor, baseColor, '#ffffff', 'color-mix(in srgb, ' + baseColor + ' 50%, white)'];
    // canvas can't parse color-mix — resolve colours through a probe element
    var probe = document.createElement('span');
    document.body.appendChild(probe);
    palette = palette.map(function(c) { probe.style.color = c; return getComputedStyle(probe).color; });
    probe.remove();

    var parts = [];
    var cx = innerWidth / 2, cy = innerHeight * 0.38;
    for (var i = 0; i < 140; i++) {
        var a = Math.random() * Math.PI * 2;
        var v = 4 + Math.random() * 9;
        parts.push({
            x: cx, y: cy,
            vx: Math.cos(a) * v, vy: Math.sin(a) * v - 5,
            w: 5 + Math.random() * 6, h: 3 + Math.random() * 4,
            r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
            c: palette[i % palette.length]
        });
    }
    var start = performance.now();
    (function frame(now) {
        var t = now - start;
        ctx.clearRect(0, 0, innerWidth, innerHeight);
        parts.forEach(function(p) {
            p.vy += 0.22; p.vx *= 0.99; p.vy *= 0.99;
            p.x += p.vx; p.y += p.vy; p.r += p.vr;
            ctx.save();
            ctx.globalAlpha = Math.max(0, 1 - t / 2400);
            ctx.translate(p.x, p.y);
            ctx.rotate(p.r);
            ctx.fillStyle = p.c;
            ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
            ctx.restore();
        });
        if (t < 2400) requestAnimationFrame(frame); else canvas.remove();
    })(start);
}

// ── count-up numbers ───────────────────────────────────
function countUp(el, to, ms) {
    if (reduceMotion || !to) { el.textContent = to; return; }
    var start = performance.now();
    (function tick(now) {
        var k = Math.min(1, (now - start) / ms);
        var eased = 1 - Math.pow(1 - k, 3);
        el.textContent = Math.round(to * eased);
        if (k < 1) requestAnimationFrame(tick);
    })(start);
}

// ── html escape (song titles come from third-party APIs) ──
function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
}

// ── animated session summary ───────────────────────────
function sessionSummary(mood, startTime, endTime, songs) {
    var mins = Math.max(0, Math.floor((endTime - startTime) / 60000));
    var fmt = function(d) { return d.toLocaleTimeString('en-SG', { hour: 'numeric', minute: '2-digit', hour12: true }); };
    var c = color(mood);

    var overlay = document.createElement('div');
    overlay.className = 'session-summary mt-summary';
    overlay.style.setProperty('--mc', c);
    overlay.style.setProperty('--mc-ink', ink(c));

    var covers = songs.length > 0
        ? '<div class="sum-covers">' + songs.map(function(s, i) {
            return '<a class="sum-cover" style="--i:' + i + '" href="' + esc(s.spotify_url || '#') + '" target="_blank" rel="noopener" title="' + esc(s.title) + '">' +
                (s.album_art ? '<img src="' + esc(s.album_art) + '" alt="" />' : '<span class="sum-cover-empty">♪</span>') +
                '<span class="sum-cover-title">' + esc(s.title) + '</span>' +
            '</a>';
          }).join('') + '</div>'
        : '<p class="sum-empty">no songs logged during this session</p>';

    overlay.innerHTML =
        '<div class="session-summary-box" role="dialog" aria-modal="true" aria-labelledby="sum-title">' +
            '<div class="sum-glow" aria-hidden="true"></div>' +
            (emoji(mood) ? '<div class="sum-emoji" aria-hidden="true">' + emoji(mood) + '</div>' : '') +
            '<div class="session-summary-title" id="sum-title">' + esc(mood) + ' session complete</div>' +
            '<div class="session-summary-meta">' + fmt(startTime) + ' – ' + fmt(endTime) + '</div>' +
            '<div class="sum-stats">' +
                '<div class="sum-stat"><b data-count="' + mins + '">0</b><span>minute' + (mins !== 1 ? 's' : '') + '</span></div>' +
                '<div class="sum-stat"><b data-count="' + songs.length + '">0</b><span>song' + (songs.length !== 1 ? 's' : '') + '</span></div>' +
            '</div>' +
            covers +
            '<button class="session-summary-close" id="close-summary">done</button>' +
        '</div>';

    document.body.appendChild(overlay);
    requestAnimationFrame(function() { overlay.classList.add('open'); });
    overlay.querySelectorAll('[data-count]').forEach(function(el) {
        setTimeout(function() { countUp(el, parseInt(el.dataset.count, 10), 900); }, 250);
    });
    setTimeout(function() { confetti(c); }, 200);

    function close() {
        overlay.classList.remove('open');
        overlay.classList.add('closing');
        setTimeout(function() { overlay.remove(); }, 280);
    }
    overlay.querySelector('#close-summary').addEventListener('click', close);
    overlay.addEventListener('click', function(e) { if (e.target === overlay) close(); });
    return overlay;
}

// ── dominant colour of an album cover ──────────────────
function artColor(url, cb) {
    if (!url) return cb(null);
    var img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function() {
        try {
            var cv = document.createElement('canvas');
            cv.width = cv.height = 24;
            var cx = cv.getContext('2d');
            cx.drawImage(img, 0, 0, 24, 24);
            var d = cx.getImageData(0, 0, 24, 24).data;
            var r = 0, g = 0, b = 0, w = 0;
            for (var i = 0; i < d.length; i += 4) {
                var R = d[i], G = d[i + 1], B = d[i + 2];
                var max = Math.max(R, G, B), min = Math.min(R, G, B);
                var sat = max === 0 ? 0 : (max - min) / max;
                var lum = (max + min) / 510;
                if (lum < 0.08 || lum > 0.95) continue;           // skip near-black / near-white
                var wt = 0.15 + sat * sat * 2;                    // favour vivid pixels
                r += R * wt; g += G * wt; b += B * wt; w += wt;
            }
            if (!w) return cb(null);
            cb('rgb(' + Math.round(r / w) + ',' + Math.round(g / w) + ',' + Math.round(b / w) + ')');
        } catch (e) { cb(null); }   // tainted canvas (no CORS) — fall back to mood colour
    };
    img.onerror = function() { cb(null); };
    img.src = url;
}

// ── session auto-log bookkeeping ───────────────────────
function sessionSeen(sessionId) {
    try { return JSON.parse(localStorage.getItem('moodtunes_autolog_' + sessionId) || '[]'); }
    catch (e) { return []; }
}
function markSessionSong(sessionId, songId) {
    if (!sessionId || !songId) return;
    var seen = sessionSeen(sessionId);
    if (seen.indexOf(songId) === -1) {
        seen.push(songId);
        try { localStorage.setItem('moodtunes_autolog_' + sessionId, JSON.stringify(seen)); } catch (e) {}
    }
}
function sessionHasSong(sessionId, songId) {
    return sessionSeen(sessionId).indexOf(songId) !== -1;
}

// ── live now-playing card ──────────────────────────────
// opts: { compact, hideWhenIdle, getSession() -> {id, mood} | null, onTrack(track), onIdle() }
function nowPlaying(container, opts) {
    opts = opts || {};
    if (!container) return null;

    var POLL_MS = 5000;
    var state = { track: null, playing: false, base: 0, duration: 0, at: 0 };
    var pollTimer = null, raf = null, failures = 0, stopped = false;

    container.classList.add('np-mount');
    container.innerHTML =
        '<div class="np-card' + (opts.compact ? ' np-compact' : '') + ' np-idle">' +
            '<div class="np-art-wrap"><img class="np-art" alt="" /><div class="np-art-fallback">♪</div></div>' +
            '<div class="np-body">' +
                '<div class="np-label"><span class="np-eq" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span class="np-status">listening for spotify…</span></div>' +
                '<div class="np-title"></div>' +
                '<div class="np-artist"></div>' +
                '<div class="np-progress"><div class="np-bar"><div class="np-fill"></div></div><span class="np-time"></span></div>' +
            '</div>' +
            '<div class="np-added" aria-live="polite"></div>' +
        '</div>';

    var card   = container.querySelector('.np-card');
    var art    = container.querySelector('.np-art');
    var status = container.querySelector('.np-status');
    var title  = container.querySelector('.np-title');
    var artist = container.querySelector('.np-artist');
    var fill   = container.querySelector('.np-fill');
    var time   = container.querySelector('.np-time');
    var added  = container.querySelector('.np-added');

    if (opts.hideWhenIdle) container.classList.add('np-hidden');

    function mmss(ms) {
        var s = Math.max(0, Math.floor(ms / 1000));
        return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
    }

    function flashAdded(text) {
        added.textContent = text;
        added.classList.remove('show');
        void added.offsetWidth;
        added.classList.add('show');
    }

    function tick() {
        raf = null;
        if (!state.track) return;
        var pos = state.base + (state.playing ? performance.now() - state.at : 0);
        if (state.duration && pos > state.duration + 800 && state.playing) {
            // song probably ended — ask spotify right away instead of waiting
            pos = state.duration;
            poll(true);
        }
        pos = Math.min(pos, state.duration || pos);
        fill.style.transform = 'scaleX(' + (state.duration ? pos / state.duration : 0) + ')';
        time.textContent = mmss(pos) + ' / ' + mmss(state.duration);
        if (state.playing) raf = requestAnimationFrame(tick);
    }

    function showIdle(msg) {
        state.track = null;
        card.classList.add('np-idle');
        card.classList.remove('np-paused');
        status.textContent = msg;
        title.textContent = '';
        artist.textContent = '';
        time.textContent = '';
        fill.style.transform = 'scaleX(0)';
        art.removeAttribute('src');
        if (opts.hideWhenIdle) container.classList.add('np-hidden');
        setTrackColor(null);
        if (opts.onIdle) opts.onIdle();
    }

    function autoLog(track) {
        var s = opts.getSession ? opts.getSession() : null;
        if (!s || !s.id || !track.id) return;
        if (sessionHasSong(s.id, track.id)) return;
        markSessionSong(s.id, track.id);
        apiCall('/sessions/songs', 'POST', {
            session_id: s.id, song_id: track.id, title: track.title, artist: track.artist,
            album_art: track.albumArt, spotify_url: track.spotifyUrl
        }, function(err, res) {
            if (err || !res || res.status >= 400) return;
            flashAdded('+ added to session');
            toast('“' + track.title + '” added to your ' + s.mood + ' session', s.mood);
        });
    }

    function apply(data) {
        if (!data || !data.playing || !data.track) { showIdle('nothing playing on spotify right now'); return; }
        var t = data.track;
        var changed = !state.track || state.track.id !== t.id;

        state.playing  = !!data.is_playing;
        state.base     = data.progress_ms || 0;
        state.duration = data.duration_ms || 0;
        state.at       = performance.now();

        container.classList.remove('np-hidden');
        card.classList.remove('np-idle');
        card.classList.toggle('np-paused', !state.playing);
        status.textContent = state.playing ? 'now playing' : 'paused';

        if (changed) {
            state.track = t;
            card.classList.remove('np-swap');
            void card.offsetWidth;          // restart the swap animation
            card.classList.add('np-swap');
            title.textContent = t.title;
            artist.textContent = t.artist;
            if (t.albumArt) art.src = t.albumArt; else art.removeAttribute('src');
            artColor(t.albumArt, function(c) {
                card.style.setProperty('--np-color', c || 'var(--mood)');
                card.style.setProperty('--np-ink', c ? ink(c) : 'var(--mood-ink)');
                setTrackColor(c);
            });
            if (opts.onTrack) opts.onTrack(t);
        }
        if (state.playing) autoLog(t);
        if (!raf) raf = requestAnimationFrame(tick);
    }

    function schedule() {
        clearTimeout(pollTimer);
        if (stopped || document.hidden) return;
        pollTimer = setTimeout(poll, POLL_MS);
    }

    function poll(immediate) {
        if (stopped) return;
        if (immediate === true) clearTimeout(pollTimer);
        apiCall('/spotify/now-playing', 'GET', null, function(err, res) {
            if (err || !res) {
                failures++;
                // backend without the /now-playing route (or offline) — give up quietly
                if (failures >= 3) { stopped = true; showIdle('live playback unavailable'); if (opts.hideWhenIdle) container.classList.add('np-hidden'); return; }
                return schedule();
            }
            failures = 0;
            if (res.status === 401) { showIdle('connect spotify to see what you’re playing'); stopped = true; return; }
            if (res.status >= 400) { showIdle('couldn’t reach spotify — retrying'); return schedule(); }
            apply(res.data);
            schedule();
        });
    }

    document.addEventListener('visibilitychange', function() {
        if (document.hidden) { clearTimeout(pollTimer); }
        else if (!stopped) { poll(true); }
    });

    poll();

    return {
        refresh: function() { poll(true); },
        markLogged: function(sessionId, songId) { markSessionSong(sessionId, songId); },
        get track() { return state.track; }
    };
}

// ── empty states ───────────────────────────────────────
// emptyState({ art: 'vinyl'|'search'|'offline', title, text, compact,
//              action: { label, href } | { label, focus: '#sel' } | { label, click: '#sel' } | { label, reload: true } })
var EMPTY_ART = {
    vinyl:
        '<svg viewBox="0 0 120 120" aria-hidden="true">' +
            '<circle class="ea-glow" cx="60" cy="62" r="46"/>' +
            '<g class="ea-spin"><circle class="ea-disc" cx="60" cy="62" r="38"/>' +
            '<circle class="ea-groove" cx="60" cy="62" r="30"/><circle class="ea-groove" cx="60" cy="62" r="23"/>' +
            '<circle class="ea-label" cx="60" cy="62" r="12"/><circle class="ea-hole" cx="60" cy="62" r="2.5"/>' +
            '<path class="ea-shine" d="M34 44 A32 32 0 0 1 52 32"/></g>' +
            '<g class="ea-note n1"><path d="M92 30 v-14 l10 -3 v14"/><circle cx="89" cy="30" r="3.5"/><circle cx="99" cy="27" r="3.5"/></g>' +
            '<g class="ea-note n2"><path d="M22 36 v-12"/><circle cx="19" cy="36" r="3.5"/></g>' +
        '</svg>',
    search:
        '<svg viewBox="0 0 120 120" aria-hidden="true">' +
            '<circle class="ea-glow" cx="60" cy="60" r="40"/>' +
            '<g class="ea-bob"><circle class="ea-lens" cx="54" cy="54" r="22"/><path class="ea-handle" d="M70 70 l18 18"/>' +
            '<path class="ea-shine" d="M42 46 A14 14 0 0 1 52 38"/></g>' +
        '</svg>',
    offline:
        '<svg viewBox="0 0 120 120" aria-hidden="true">' +
            '<circle class="ea-glow" cx="60" cy="62" r="40"/>' +
            '<g class="ea-bob"><path class="ea-cloud" d="M38 78 h46 a16 16 0 0 0 -3 -31.7 A22 22 0 0 0 39 52 a13 13 0 0 0 -1 26z"/>' +
            '<path class="ea-slash" d="M44 90 L80 38"/></g>' +
        '</svg>'
};

function emptyState(o) {
    o = o || {};
    var a = o.action, btn = '';
    if (a) {
        var attrs = a.href ? ' href="' + esc(a.href) + '"' :
            ' href="#" data-empty-' + (a.focus ? 'focus="' + esc(a.focus) + '"' : a.click ? 'click="' + esc(a.click) + '"' : 'reload="1"');
        btn = '<a class="mt-empty-btn"' + attrs + '>' + esc(a.label) + '</a>';
    }
    return '<div class="mt-empty' + (o.compact ? ' mt-empty-compact' : '') + '" role="status">' +
        '<div class="mt-empty-art">' + (EMPTY_ART[o.art] || EMPTY_ART.vinyl) + '</div>' +
        '<div class="mt-empty-body">' +
            (o.title ? '<div class="mt-empty-title">' + esc(o.title) + '</div>' : '') +
            (o.text ? '<div class="mt-empty-text">' + esc(o.text) + '</div>' : '') +
            btn +
        '</div>' +
    '</div>';
}

document.addEventListener('click', function(e) {
    var b = e.target.closest && e.target.closest('.mt-empty-btn');
    if (!b || b.getAttribute('href') !== '#') return;
    e.preventDefault();
    if (b.dataset.emptyReload) { location.reload(); return; }
    var sel = b.dataset.emptyFocus || b.dataset.emptyClick;
    var el = sel && document.querySelector(sel);
    if (!el) return;
    if (b.dataset.emptyFocus) {
        el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
        setTimeout(function() { el.focus(); }, reduceMotion ? 0 : 300);
    } else {
        el.click();
    }
});

// ── keyboard shortcuts ─────────────────────────────────
//   1–9  pick a mood        /  jump to search
//   ?    open help          Esc close the top-most popup
function closeTopLayer() {
    var summary = document.querySelector('.mt-summary.open #close-summary');
    if (summary) { summary.click(); return true; }
    var popup = document.getElementById('spotify-open-popup');
    if (popup) { popup.remove(); return true; }
    var help = document.getElementById('help-modal');
    if (help) { help.remove(); return true; }
    var dd = document.getElementById('profile-dropdown');
    if (dd) { document.body.click(); return true; }
    var note = document.getElementById('search-note-panel');
    if (note) {
        note.remove();
        document.querySelectorAll('.result-item.selected').forEach(function(r) { r.classList.remove('selected'); });
        return true;
    }
    return false;
}

document.addEventListener('keydown', function(e) {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    var t = e.target;
    var typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);

    if (e.key === 'Escape') {
        if (!closeTopLayer() && typing) t.blur();
        return;
    }
    if (typing) return;

    if (e.key === '/') {
        var search = document.querySelector('#song-search, #song-history-search');
        if (search) { e.preventDefault(); search.focus(); search.select(); }
    } else if (e.key === '?') {
        var help = document.getElementById('help-btn');
        if (help && !document.getElementById('help-modal')) { e.preventDefault(); help.click(); }
    } else if (/^[1-9]$/.test(e.key)) {
        if (window.managingMoods) return;
        var chips = Array.prototype.filter.call(
            document.querySelectorAll('.mood-chips .chip[data-mood]'),
            function(c) { return c.offsetParent !== null; }
        );
        var chip = chips[parseInt(e.key, 10) - 1];
        if (chip) { e.preventDefault(); chip.click(); chip.focus({ preventScroll: true }); }
    }
});

// ── boot ───────────────────────────────────────────────
function initialMood() {
    try {
        var s = JSON.parse(localStorage.getItem('moodtunes_session') || 'null');
        if (s && s.mood) return s.mood;
    } catch (e) {}
    return null;
}

function boot() {
    mountAmbient();
    setMood(initialMood());
    decorate(document.body);
    applyHidden();
    syncHidden();

    // selecting any mood chip re-tints the page
    document.addEventListener('click', function(e) {
        var chip = e.target.closest && e.target.closest('.chip[data-mood]');
        if (!chip || window.managingMoods) return;
        ripple(chip, e);
        setMood(chip.dataset.mood);
        chip.classList.remove('mt-pop');
        void chip.offsetWidth;
        chip.classList.add('mt-pop');
    });

    var mo = new MutationObserver(function(muts) {
        muts.forEach(function(m) {
            m.addedNodes.forEach(function(n) {
                if (n.nodeType !== 1) return;
                decorate(n);
                stagger(n);
            });
        });
    });
    mo.observe(document.body, { childList: true, subtree: true });
}

// set colour vars immediately so there's no flash, then finish once DOM + profile.js are ready
setMood(initialMood());
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else setTimeout(boot, 0);

window.MoodFX = {
    color: color, tempo: tempo, emoji: emoji, ink: ink,
    setMood: setMood, getMood: function() { return currentMood; },
    skeleton: skeleton, toast: toast, confetti: confetti, countUp: countUp,
    sessionSummary: sessionSummary, nowPlaying: nowPlaying,
    markSessionSong: markSessionSong, esc: esc, reduceMotion: reduceMotion,
    undoable: undoable, nudgeMoods: nudgeMoods,
    hideMood: hideMood, unhideMood: unhideMood, isHidden: isHidden, visibleMoods: visibleMoods,
    DEFAULT_MOODS: DEFAULT_MOODS, emptyState: emptyState
};

})();