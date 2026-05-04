// stats.js
requireAuth();

var MOOD_COLORS = {
    happy: '#5dcaa5', sad: '#378add', hype: '#ef9f27',
    heartbreak: '#d4537e', nostalgic: '#7f77dd', focused: '#1D9E75', chill: '#888780'
};

function getMoodColor(mood) {
    return MOOD_COLORS[mood] || '#7f77dd';
}

function getPeakTime(tod) {
    var times = { morning: tod.morning || 0, afternoon: tod.afternoon || 0, evening: tod.evening || 0, 'late night': tod.late_night || 0 };
    return Object.keys(times).reduce(function(a, b) { return times[a] > times[b] ? a : b; });
}

function render(data) {
    var stats = data.stats || {};
    var moods = data.moods || [];
    var topSongs = data.topSongs || [];
    var tod = data.timeOfDay || {};
    var flashback = data.flashback || [];

    var maxMoodPlays = moods.length > 0 ? moods[0].total_plays : 1;
    var maxTime = Math.max(tod.morning || 0, tod.afternoon || 0, tod.evening || 0, tod.late_night || 0) || 1;
    var peakTime = getPeakTime(tod);

    var html =
        // summary stats
        '<div class="stats-summary">' +
            '<div class="stat-box"><div class="stat-box-num">' + (stats.total_plays || 0) + '</div><div class="stat-box-label">total plays</div></div>' +
            '<div class="stat-box"><div class="stat-box-num">' + (stats.unique_songs || 0) + '</div><div class="stat-box-label">unique songs</div></div>' +
            '<div class="stat-box"><div class="stat-box-num">' + (stats.days_active || 0) + '</div><div class="stat-box-label">days active</div></div>' +
            '<div class="stat-box"><div class="stat-box-num">' + (moods.length > 0 ? moods[0].mood : '—') + '</div><div class="stat-box-label">top mood</div></div>' +
        '</div>';

    // flashback
    if (flashback.length > 0) {
        var fbMood = flashback[0].mood;
        html += '<div class="flashback-card">' +
            '<div class="flashback-label">FLASHBACK — A MONTH AGO</div>' +
            '<div class="flashback-subtitle">you were feeling ' + fbMood + ' and listening to these</div>' +
            '<div class="flashback-songs">' +
            flashback.map(function(s) {
                return '<div class="flashback-song">' +
                    (s.album_art ? '<img class="flashback-art" src="' + s.album_art + '" alt="' + s.title + '" />' : '<div class="flashback-art"></div>') +
                    '<div class="flashback-title">' + s.title + '</div>' +
                    '<div class="flashback-plays">' + s.total_plays + ' plays</div>' +
                '</div>';
            }).join('') +
            '</div></div>';
    }

    html += '<div class="stats-grid">';

    // mood breakdown
    html += '<div class="stats-card"><div class="stats-card-title">MOOD BREAKDOWN</div>';
    moods.forEach(function(m) {
        var pct = Math.round((m.total_plays / maxMoodPlays) * 100);
        html += '<div class="mood-bar-row">' +
            '<div class="mood-bar-name">' + m.mood + '</div>' +
            '<div class="mood-bar-track"><div class="mood-bar-fill" style="width:' + pct + '%;background:' + getMoodColor(m.mood) + ';"></div></div>' +
            '<div class="mood-bar-count">' + m.total_plays + '</div>' +
        '</div>';
    });
    html += '</div>';

    // time of day
    html += '<div class="stats-card"><div class="stats-card-title">WHEN YOU LISTEN</div>' +
        '<div class="time-bar-row"><div class="time-bar-label">morning</div><div class="time-bar-track"><div class="time-bar-fill" style="width:' + Math.round(((tod.morning||0)/maxTime)*100) + '%;"></div></div></div>' +
        '<div class="time-bar-row"><div class="time-bar-label">afternoon</div><div class="time-bar-track"><div class="time-bar-fill" style="width:' + Math.round(((tod.afternoon||0)/maxTime)*100) + '%;"></div></div></div>' +
        '<div class="time-bar-row"><div class="time-bar-label">evening</div><div class="time-bar-track"><div class="time-bar-fill" style="width:' + Math.round(((tod.evening||0)/maxTime)*100) + '%;"></div></div></div>' +
        '<div class="time-bar-row"><div class="time-bar-label">late night</div><div class="time-bar-track"><div class="time-bar-fill" style="width:' + Math.round(((tod.late_night||0)/maxTime)*100) + '%;"></div></div></div>' +
        '<div style="font-size:11px;color:#555;margin-top:10px;">you\'re mostly a ' + peakTime + ' listener</div>' +
    '</div>';

    html += '</div>'; // close stats-grid

    // top songs
    if (topSongs.length > 0) {
        html += '<div class="stats-card"><div class="stats-card-title">YOUR MOST PLAYED</div>';
        topSongs.forEach(function(s, i) {
            html += '<div class="top-song-row">' +
                '<div class="top-song-num">' + (i + 1) + '</div>' +
                (s.album_art ? '<img class="top-song-art" src="' + s.album_art + '" alt="' + s.title + '" />' : '<div class="top-song-art"></div>') +
                '<div class="top-song-info"><div class="top-song-title">' + s.title + '</div><div class="top-song-artist">' + s.artist + '</div></div>' +
                '<div class="top-song-plays">' + s.total_plays + ' plays</div>' +
            '</div>';
        });
        html += '</div>';
    }

    document.getElementById('stats-content').innerHTML = html;
}

document.getElementById('logout-btn').addEventListener('click', logout);

apiCall('/logs/stats', 'GET', null, function(err, result) {
    if (err || !result.data) {
        document.getElementById('stats-content').innerHTML = '<p style="color:#555;font-size:14px;">could not load stats — try again later</p>';
        return;
    }
    render(result.data);
});