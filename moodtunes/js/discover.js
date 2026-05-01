// discover.js
requireAuth();

var chips          = document.querySelectorAll('.chip');
var discoverContent = document.getElementById('discover-content');
var selectedMood   = null;

chips.forEach(function(chip) {
    chip.addEventListener('click', function() {
        chips.forEach(function(c) { c.classList.remove('selected'); });
        chip.classList.add('selected');
        selectedMood = chip.dataset.mood;
        loadRecommendations(selectedMood);
    });
});

function loadRecommendations(mood) {
    discoverContent.innerHTML = '<p class="discover-loading">finding songs for your ' + mood + ' mood...</p>';

    apiCall('/logs/mood/' + mood, 'GET', null, function(err, result) {
        if (err) { discoverContent.innerHTML = '<p class="discover-empty">could not load your logs — try again!</p>'; return; }

        var logs = Array.isArray(result.data) ? result.data : [];
        if (logs.length === 0) {
            discoverContent.innerHTML = '<div class="discover-empty">you haven\'t logged any <span>' + mood + '</span> songs yet — go to the journal first!</div>';
            return;
        }

        logs.sort(function(a, b) { return b.play_count - a.play_count; });
        var seed = logs[0];

        var seen = {};
        var extraArtists = [];
        logs.forEach(function(l) {
            var a = l.artist.split(',')[0].trim();
            if (a !== seed.artist && !seen[a]) { seen[a] = true; extraArtists.push(a); }
        });

        var recUrl = '/spotify/recommendations?artist=' + encodeURIComponent(seed.artist) + '&title=' + encodeURIComponent(seed.title);
        if (extraArtists.length > 0) recUrl += '&seeds=' + encodeURIComponent(extraArtists.slice(0, 4).join('||'));

        apiCall(recUrl, 'GET', null, function(err2, rec) {
            if (err2 || !rec || !rec.data || !rec.data.tracks || rec.data.tracks.length === 0) {
                discoverContent.innerHTML = '<p class="discover-empty">couldn\'t find recommendations — try a different mood!</p>';
                return;
            }

            var loggedKeys = {};
            logs.forEach(function(l) { loggedKeys[l.title.toLowerCase() + '||' + l.artist.toLowerCase()] = true; });

            var tracks = rec.data.tracks
                .filter(function(t) { return !loggedKeys[t.title.toLowerCase() + '||' + t.artist.toLowerCase()]; })
                .slice(0, 10);

            if (tracks.length === 0) {
                discoverContent.innerHTML = '<p class="discover-empty">you\'ve already logged all these — try refreshing!</p>';
                attachRefresh(mood);
                return;
            }
            renderRecommendations(tracks, mood);
        });
    });
}

function renderRecommendations(tracks, mood) {
    discoverContent.innerHTML =
        '<div class="discover-header"><span class="discover-title">recommended for your ' + mood + ' mood</span><button class="refresh-btn" id="refresh-btn">↻ refresh</button></div>';

    tracks.forEach(function(track) {
        var card = document.createElement('div');
        card.classList.add('discover-card');
        card.innerHTML =
            (track.albumArt ? '<img src="' + track.albumArt + '" alt="album art" />' : '<div class="discover-no-art">♪</div>') +
            '<div class="discover-card-info">' +
                '<div class="discover-card-title">' + track.title + '</div>' +
                '<div class="discover-card-artist">' + track.artist + '</div>' +
                '<div class="discover-card-reason">similar to your ' + mood + ' songs</div>' +
            '</div>' +
            '<button class="play-btn discover-play-btn" data-url="' + track.spotifyUrl + '">▶</button>' +
            '<button class="add-to-playlist-btn" data-id="' + track.id + '" data-title="' + track.title.replace(/"/g, '&quot;') + '" data-artist="' + track.artist.replace(/"/g, '&quot;') + '" data-art="' + (track.albumArt || '') + '" data-url="' + track.spotifyUrl + '" data-mood="' + mood + '" title="add to ' + mood + ' playlist">+</button>';
        discoverContent.appendChild(card);
    });
    attachRefresh(mood);
}

function attachRefresh(mood) {
    var btn = document.getElementById('refresh-btn');
    if (btn) btn.addEventListener('click', function() { loadRecommendations(mood); });
}

document.addEventListener('click', function(e) {
    if (e.target.classList.contains('discover-play-btn')) {
        openSpotify(e.target.dataset.url);
    }
    if (e.target.classList.contains('add-to-playlist-btn')) {
        var btn = e.target;
        var data = { song_id: btn.dataset.id, title: btn.dataset.title, artist: btn.dataset.artist, album_art: btn.dataset.art, spotify_url: btn.dataset.url, mood: btn.dataset.mood };
        btn.textContent = '...'; btn.disabled = true;
        apiCall('/logs', 'POST', data, function(err) {
            if (err) { btn.textContent = '+'; btn.disabled = false; return; }
            btn.textContent = '✓'; btn.style.background = '#1DB954'; btn.style.color = '#fff'; btn.disabled = true;
        });
    }
});

document.getElementById('logout-btn').addEventListener('click', logout);