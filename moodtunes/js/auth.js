// auth.js

var BACKEND_URL = 'https://moodtunes-2avk.onrender.com/api';

// tab switching
document.getElementById('login-tab').addEventListener('click', function() {
    this.classList.add('active');
    document.getElementById('register-tab').classList.remove('active');
    document.getElementById('login-form').style.display = 'block';
    document.getElementById('register-form').style.display = 'none';
});

document.getElementById('register-tab').addEventListener('click', function() {
    this.classList.add('active');
    document.getElementById('login-tab').classList.remove('active');
    document.getElementById('register-form').style.display = 'block';
    document.getElementById('login-form').style.display = 'none';
});

// ── notices (after deleting an account or changing a password) ──
(function() {
    var q = new URLSearchParams(location.search);
    var text = q.get('deleted') ? 'your account and everything saved in it has been deleted.'
             : q.get('reset') ? 'your password has been changed. log in with your new one.'
             : '';
    if (!text) return;
    var n = document.getElementById('auth-notice');
    n.textContent = text;
    n.hidden = false;
    history.replaceState(null, '', location.pathname);
})();

// ── forgot password ────────────────────────────────────
function showForgot(on) {
    document.getElementById('forgot-form').style.display = on ? 'block' : 'none';
    document.getElementById('login-form').style.display = on ? 'none' : 'block';
    document.querySelector('.auth-tabs').style.display = on ? 'none' : '';
    if (on) {
        var u = document.getElementById('login-username').value.trim();
        var email = document.getElementById('forgot-email');
        if (!email.value && u.indexOf('@') > 0) email.value = u;
        email.focus();
    }
}
document.getElementById('forgot-link').addEventListener('click', function() { showForgot(true); });
document.getElementById('forgot-back').addEventListener('click', function() { showForgot(false); });

document.getElementById('forgot-btn').addEventListener('click', function() {
    var btn = this;
    var email = document.getElementById('forgot-email').value.trim();
    var msg = document.getElementById('forgot-error');
    msg.textContent = '';
    msg.classList.remove('ok');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { msg.textContent = 'please enter a valid email'; return; }
    btn.disabled = true;
    btn.textContent = 'sending…';
    fetch(BACKEND_URL + '/auth/forgot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email })
    })
    .then(function(r) { return r.json().then(function(d) { return { status: r.status, data: d }; }); })
    .then(function(result) {
        msg.textContent = (result.data && result.data.message) || (result.status === 200 ? 'check your inbox' : 'something went wrong, try again');
        if (result.status === 200) msg.classList.add('ok');
    })
    .catch(function() { msg.textContent = 'could not connect to server'; })
    .then(function() { btn.disabled = false; btn.textContent = 'send reset link'; });
});

// enter submits whichever form is showing
document.addEventListener('keydown', function(e) {
    if (e.key !== 'Enter' || e.target.tagName !== 'INPUT') return;
    var form = e.target.closest('#login-form, #register-form, #forgot-form');
    var btn = form && form.querySelector('.auth-btn');
    if (btn && !btn.disabled) btn.click();
});

// login
document.getElementById('login-btn').addEventListener('click', function() {
    var username = document.getElementById('login-username').value.trim();
    var password = document.getElementById('login-password').value.trim();
    var errorEl = document.getElementById('login-error');
    errorEl.textContent = '';

    if (!username || !password) { errorEl.textContent = 'please fill in all fields'; return; }

    fetch(BACKEND_URL + '/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username, password: password })
    })
    .then(function(r) { return r.json().then(function(d) { return { status: r.status, data: d }; }); })
    .then(function(result) {
        if (result.status === 200) {
            localStorage.setItem('moodtunes_token', result.data.token);
            localStorage.setItem('moodtunes_username', username);
            window.location.href = 'https://moodtunes-2avk.onrender.com/api/spotify/login?token=' + result.data.token;
        } else {
            errorEl.textContent = result.data.message || 'login failed';
        }
    })
    .catch(function() { errorEl.textContent = 'could not connect to server'; });
});

// register
document.getElementById('register-btn').addEventListener('click', function() {
    var username = document.getElementById('reg-username').value.trim();
    var email = document.getElementById('reg-email').value.trim();
    var password = document.getElementById('reg-password').value.trim();
    var errorEl = document.getElementById('register-error');
    errorEl.textContent = '';

    if (!username || !email || !password) { errorEl.textContent = 'please fill in all fields'; return; }

    fetch(BACKEND_URL + '/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username, email: email, password: password })
    })
    .then(function(r) { return r.json().then(function(d) { return { status: r.status, data: d }; }); })
    .then(function(result) {
        if (result.status === 200) {
            localStorage.setItem('moodtunes_token', result.data.token);
            localStorage.setItem('moodtunes_username', username);
            window.location.href = 'https://moodtunes-2avk.onrender.com/api/spotify/login?token=' + result.data.token;
        } else {
            errorEl.textContent = result.data.message || 'registration failed';
        }
    })
    .catch(function() { errorEl.textContent = 'could not connect to server'; });
}); 

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js');
  });
}