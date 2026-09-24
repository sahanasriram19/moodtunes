// stats.js
requireAuth();

var MOOD_COLORS = {
    happy: '#f2c84b', sad: '#378add', hype: '#b07a50',
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
                    (s.album_art ? '<img class="flashback-art" src="' + MoodFX.esc(s.album_art) + '" alt="' + MoodFX.esc(s.title) + '" />' : '<div class="flashback-art"></div>') +
                    '<div class="flashback-title">' + MoodFX.esc(s.title) + '</div>' +
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
            '<div class="mood-bar-name">' + MoodFX.esc(m.mood) + '</div>' +
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

    // mood activity graph placeholder
    html += '<div class="stats-card" id="mood-graph-container" style="margin-bottom:16px;"><div class="stats-card-title">MOOD ACTIVITY — LAST 14 DAYS</div>' + MoodFX.skeleton('block') + '</div>';

    // top songs
    if (topSongs.length > 0) {
        html += '<div class="stats-card"><div class="stats-card-title">YOUR MOST PLAYED</div>';
        topSongs.forEach(function(s, i) {
            html += '<div class="top-song-row">' +
                '<div class="top-song-num">' + (i + 1) + '</div>' +
                (s.album_art ? '<img class="top-song-art" src="' + MoodFX.esc(s.album_art) + '" alt="' + MoodFX.esc(s.title) + '" />' : '<div class="top-song-art"></div>') +
                '<div class="top-song-info"><div class="top-song-title">' + MoodFX.esc(s.title) + '</div><div class="top-song-artist">' + MoodFX.esc(s.artist) + '</div></div>' +
                '<div class="top-song-plays">' + s.total_plays + ' plays</div>' +
            '</div>';
        });
        html += '</div>';
    }

    document.getElementById('stats-content').innerHTML = html;
}


function buildLineGraph(logs) {
    logs = logs || [];

    // group plays by date and mood
    var byDate = {};
    var moodSet = {};
    logs.forEach(function(log) {
        var d = log.last_logged ? log.last_logged.split('T')[0] : null;
        if (!d) return;
        if (!byDate[d]) byDate[d] = {};
        byDate[d][log.mood] = (byDate[d][log.mood] || 0) + log.play_count;
        moodSet[log.mood] = true;
    });

    var dates = Object.keys(byDate).sort();
    // only show last 14 days
    if (dates.length > 14) dates = dates.slice(dates.length - 14);
    var moods = Object.keys(moodSet);
    if (dates.length < 2) {
        var c0 = document.getElementById('mood-graph-container');
        if (c0) c0.innerHTML = '<div class="stats-card-title">MOOD ACTIVITY — LAST 14 DAYS</div><p style="color:#888;font-size:13px;">log songs on a couple of different days to see your mood graph</p>';
        return;
    }

    var W = 600, H = 200, padL = 20, padR = 20, padT = 16, padB = 32;
    var gW = W - padL - padR, gH = H - padT - padB;

    // find max plays in any day/mood
    var maxVal = 1;
    dates.forEach(function(d) {
        moods.forEach(function(m) {
            var v = (byDate[d] && byDate[d][m]) || 0;
            if (v > maxVal) maxVal = v;
        });
    });

    var xStep = gW / (dates.length - 1);

    function x(i) { return padL + i * xStep; }
    function y(v) { return padT + gH - (v / maxVal) * gH; }

    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;display:block;">';

    // grid lines
    for (var g = 0; g <= 4; g++) {
        var gy = padT + (gH / 4) * g;
        svg += '<line x1="' + padL + '" y1="' + gy + '" x2="' + (W - padR) + '" y2="' + gy + '" stroke="#1e1e1e" stroke-width="1"/>';
    }

    // lines per mood
    moods.forEach(function(mood) {
        var color = MOOD_COLORS[mood] || '#7f77dd';
        var pts = dates.map(function(d, i) {
            return x(i) + ',' + y((byDate[d] && byDate[d][mood]) || 0);
        });
        svg += '<polyline points="' + pts.join(' ') + '" fill="none" stroke="' + color + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" opacity="0.85"/>';
        // dots
        dates.forEach(function(d, i) {
            var v = (byDate[d] && byDate[d][mood]) || 0;
            if (v > 0) {
                svg += '<circle cx="' + x(i) + '" cy="' + y(v) + '" r="3" fill="' + color + '"/>';
            }
        });
    });

    // x-axis date labels — show first, last, and a few in between
    var labelIdxs = [0, Math.floor(dates.length / 2), dates.length - 1];
    labelIdxs.forEach(function(i) {
        var d = dates[i];
        var label = d ? d.slice(5) : ''; // MM-DD
        svg += '<text x="' + x(i) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="9" fill="#555" font-family="Segoe UI,sans-serif">' + label + '</text>';
    });

    svg += '</svg>';

    // legend
    var legend = '<div style="display:flex;flex-wrap:wrap;gap:10px 16px;margin-top:10px;">';
    moods.forEach(function(mood) {
        var color = MOOD_COLORS[mood] || '#7f77dd';
        legend += '<div style="display:flex;align-items:center;gap:5px;"><span style="width:10px;height:10px;border-radius:50%;background:' + color + ';display:inline-block;flex-shrink:0;"></span><span style="font-size:11px;color:#888;">' + MoodFX.esc(mood) + '</span></div>';
    });
    legend += '</div>';

    var container = document.getElementById('mood-graph-container');
    if (container) container.innerHTML = '<div class="stats-card-title">MOOD ACTIVITY — LAST 14 DAYS</div>' + svg + legend;
}

var _lb = document.getElementById('logout-btn'); if (_lb) _lb.addEventListener('click', logout);

document.getElementById('stats-content').innerHTML =
    MoodFX.skeleton('stats', 4) +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">' + MoodFX.skeleton('block') + MoodFX.skeleton('block') + '</div>' +
    MoodFX.skeleton('block');

apiCallCached('/logs/stats', function(err, result) {
    if (err || !result.data) {
        document.getElementById('stats-content').innerHTML = MoodFX.emptyState({ art: 'offline', title: 'couldn’t load your stats', text: 'check your connection and try again', action: { label: 'try again', reload: true } });
        return;
    }
    render(result.data);
    // fetch per-day logs for the graph
    apiCallCached('/logs/perday', function(err2, r2) {
        if (!err2 && r2 && r2.data) buildLineGraph(r2.data);
        else { var c = document.getElementById('mood-graph-container'); if (c) c.innerHTML = '<div class="stats-card-title">MOOD ACTIVITY</div><p style="color:#555;font-size:13px;">not enough data yet</p>'; }
    });
});