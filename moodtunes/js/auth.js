// auth.js

var BACKEND_URL = 'https://moodtunes-production.up.railway.app/api';

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
            window.location.href = 'https://moodtunes-production.up.railway.app/api/spotify/login?token=' + result.data.token;
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
            window.location.href = 'https://moodtunes-production.up.railway.app/api/spotify/login?token=' + result.data.token;
        } else {
            errorEl.textContent = result.data.message || 'registration failed';
        }
    })
    .catch(function() { errorEl.textContent = 'could not connect to server'; });
});