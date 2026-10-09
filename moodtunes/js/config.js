// config.js
// ============================================
// No API keys or secrets are needed in the frontend any more.
// Spotify search now goes through the backend (/api/spotify/search-tracks),
// so SPOTIFY_CLIENT_SECRET only lives in backend/.env.
// ============================================
const CONFIG = {};

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js');
  });
}

// ── waking up the server ───────────────────────────────
// the backend runs on render's free plan, which goes to sleep after ~15 minutes
// with no visitors. the first request after that waits up to a minute while it
// starts up again, and without this the page just looks stuck. so every page
// pings the server straight away; if it hasn't answered within 2.5s a small
// "waking up the server" notice shows until it does
(function() {
    var HEALTH_URL = 'https://moodtunes-2avk.onrender.com/api/health';
    var AWAKE_KEY = 'moodtunes_server_awake';
    var AWAKE_FOR = 10 * 60 * 1000;      // render sleeps after 15 min, so 10 is safe

    try {
        var last = +sessionStorage.getItem(AWAKE_KEY) || 0;
        if (Date.now() - last < AWAKE_FOR) return;   // answered recently: no need to ask
    } catch (e) {}

    var done = false, pill = null, started = Date.now(), slowTimer, stillTimer;

    function show() {
        if (done || pill || !document.body) return;
        pill = document.createElement('div');
        pill.id = 'mt-waking';
        pill.setAttribute('role', 'status');
        pill.innerHTML = '<span class="mt-waking-dot"></span><span class="mt-waking-text">waking up the server… the first visit in a while can take up to a minute</span>';
        var css = document.createElement('style');
        css.textContent =
            '#mt-waking{position:fixed;left:50%;bottom:calc(20px + env(safe-area-inset-bottom));transform:translate(-50%,16px);opacity:0;z-index:2000;' +
            'display:flex;align-items:center;gap:10px;max-width:calc(100vw - 32px);box-sizing:border-box;padding:10px 16px;border-radius:999px;' +
            'font:13px/1.35 "DM Sans",system-ui,sans-serif;color:#f3eefe;background:rgba(28,18,50,0.94);border:1px solid rgba(180,140,255,0.35);' +
            'box-shadow:0 12px 34px -12px rgba(0,0,0,0.6);transition:opacity .35s ease,transform .35s ease;pointer-events:none}' +
            '#mt-waking.show{opacity:1;transform:translate(-50%,0)}' +
            '.mt-waking-dot{flex:none;width:14px;height:14px;border-radius:50%;border:2px solid rgba(180,140,255,0.3);border-top-color:#c8a6ff;animation:mt-waking-spin .9s linear infinite}' +
            '#mt-waking.ready .mt-waking-dot{animation:none;border-color:#1db954;background:#1db954}' +
            '@keyframes mt-waking-spin{to{transform:rotate(360deg)}}' +
            '@media (max-width:768px){#mt-waking{bottom:calc(84px + env(safe-area-inset-bottom))}}' +   // above the phone tab bar
            '@media (prefers-reduced-motion:reduce){.mt-waking-dot{animation-duration:2.5s}}';
        document.head.appendChild(css);
        document.body.appendChild(pill);
        requestAnimationFrame(function() { requestAnimationFrame(function() { pill.classList.add('show'); }); });
        stillTimer = setTimeout(function() {
            if (!done && pill) pill.querySelector('.mt-waking-text').textContent = 'still waking up… almost there';
        }, 25000);
    }

    function finish() {
        if (done) return;
        done = true;
        clearTimeout(slowTimer);
        clearTimeout(stillTimer);
        try { sessionStorage.setItem(AWAKE_KEY, String(Date.now())); } catch (e) {}
        if (!pill) return;
        pill.classList.add('ready');
        pill.querySelector('.mt-waking-text').textContent = 'server is awake';
        setTimeout(function() {
            pill.classList.remove('show');
            setTimeout(function() { if (pill) pill.remove(); }, 400);
        }, 1200);
    }

    function ping() {
        if (done) return;
        fetch(HEALTH_URL, { cache: 'no-store' })
            .then(function(res) { if (res.ok) finish(); else retry(); })
            .catch(retry);
    }

    // while it's starting up render can refuse the connection, so keep trying
    // (every 4s, for up to 2 minutes; nothing at all when you're offline)
    function retry() {
        if (done) return;
        if (Date.now() - started > 120000 || navigator.onLine === false) {
            done = true;
            if (pill) pill.remove();
            return;
        }
        setTimeout(ping, 4000);
    }

    slowTimer = setTimeout(function() {
        if (navigator.onLine === false) return;
        if (document.body) show();
        else document.addEventListener('DOMContentLoaded', show);
    }, 2500);
    ping();

    // any normal request that comes back also means the server is up
    window.mtServerAwake = finish;
})();