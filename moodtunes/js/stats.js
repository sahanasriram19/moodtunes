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

    // mood calendar (filled in once the per-day logs arrive)
    html += '<div class="stats-card mood-cal" id="mood-calendar"><div class="stats-card-title">MOOD CALENDAR</div>' + MoodFX.skeleton('block') + '</div>';

    // flashback
    if (flashback.length > 0) {
        var fbMood = flashback[0].mood;
        html += '<div class="flashback-card">' +
            '<div class="flashback-label">' + MoodFX.icon('calendar') + 'FLASHBACK — A MONTH AGO</div>' +
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

// ── mood calendar ──────────────────────────────────────
// one month at a time, every day filled with the colour of the mood you
// played most that day (stronger colour = more plays). tap a day to see
// what you listened to.
var MoodCalendar = (function() {
    var MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
    var days = {};            // 'YYYY-MM-DD' → { moods: {mood: plays}, total, songs: [log] }
    var view = null;          // { y, m } (m = 0..11)
    var selected = null;      // 'YYYY-MM-DD'
    var first = null;         // earliest month with logs

    function pad(n) { return (n < 10 ? '0' : '') + n; }
    function keyOf(y, m, d) { return y + '-' + pad(m + 1) + '-' + pad(d); }
    function todayKey() { var t = new Date(); return keyOf(t.getFullYear(), t.getMonth(), t.getDate()); }

    // the day a log belongs to: its own day (in your timezone) when the server sends it,
    // otherwise the local date of when it was last played
    function dayOf(log) {
        if (log.log_date) return String(log.log_date).slice(0, 10);
        if (!log.last_logged) return null;
        var t = new Date(String(log.last_logged).replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(log.last_logged) ? '' : 'Z'));
        return isNaN(t) ? null : keyOf(t.getFullYear(), t.getMonth(), t.getDate());
    }

    function mainMood(day) {
        var best = null;
        Object.keys(day.moods).forEach(function(m) { if (!best || day.moods[m] > day.moods[best]) best = m; });
        return best;
    }

    function show(logs) {
        days = {};
        first = null;
        (logs || []).forEach(function(log) {
            var k = dayOf(log);
            if (!k) return;
            var d = days[k] || (days[k] = { moods: {}, total: 0, songs: [] });
            var plays = Math.max(1, Number(log.play_count) || 0);
            d.moods[log.mood] = (d.moods[log.mood] || 0) + plays;
            d.total += plays;
            d.songs.push(log);
            if (!first || k < first) first = k;
        });
        var t = new Date();
        if (!view) view = { y: t.getFullYear(), m: t.getMonth() };
        draw();
    }

    function move(step) {
        var m = view.m + step, y = view.y;
        if (m < 0) { m = 11; y--; } else if (m > 11) { m = 0; y++; }
        view = { y: y, m: m };
        selected = null;
        draw(step);
    }

    function draw(step) {
        var box = document.getElementById('mood-calendar');
        if (!box) return;
        var t = new Date();
        var isNow = view.y === t.getFullYear() && view.m === t.getMonth();
        var firstKey = keyOf(view.y, view.m, 1);
        var canBack = first && first.slice(0, 7) < firstKey.slice(0, 7);
        var daysIn = new Date(view.y, view.m + 1, 0).getDate();
        var lead = (new Date(view.y, view.m, 1).getDay() + 6) % 7;      // weeks start on monday
        var today = todayKey();

        // busiest day this month sets the scale for colour strength
        var maxPlays = 1, moodDays = {};
        for (var d = 1; d <= daysIn; d++) {
            var day = days[keyOf(view.y, view.m, d)];
            if (!day) continue;
            maxPlays = Math.max(maxPlays, day.total);
            var mm = mainMood(day);
            moodDays[mm] = (moodDays[mm] || 0) + 1;
        }

        var cells = '';
        for (var i = 0; i < lead; i++) cells += '<span class="mc-cell mc-pad" aria-hidden="true"></span>';
        for (d = 1; d <= daysIn; d++) {
            var k = keyOf(view.y, view.m, d);
            var info = days[k];
            var cls = 'mc-cell' + (k === today ? ' mc-today' : '') + (k === selected ? ' mc-selected' : '') + (k > today ? ' mc-future' : '');
            if (!info) {
                cells += '<span class="' + cls + ' mc-empty"><span class="mc-num">' + d + '</span></span>';
                continue;
            }
            var mood = mainMood(info);
            var others = Object.keys(info.moods).filter(function(m) { return m !== mood; }).slice(0, 3);
            var strength = Math.round(38 + 52 * Math.min(1, info.total / maxPlays));
            cells += '<button type="button" class="' + cls + ' mc-filled" data-day="' + k + '" ' +
                'style="--mc:' + MoodFX.color(mood) + ';--mc-mix:' + strength + '%;" ' +
                'aria-label="' + d + ' ' + MONTHS[view.m] + ': mostly ' + MoodFX.esc(mood) + ', ' + info.total + ' play' + (info.total === 1 ? '' : 's') + '">' +
                '<span class="mc-num">' + d + '</span>' +
                (others.length ? '<span class="mc-dots">' + others.map(function(m) { return '<i style="background:' + MoodFX.color(m) + '"></i>'; }).join('') + '</span>' : '') +
                '</button>';
        }

        var legendMoods = Object.keys(moodDays).sort(function(a, b) { return moodDays[b] - moodDays[a]; });
        var legend = legendMoods.length
            ? legendMoods.map(function(m) {
                return '<span class="mc-key"><i style="background:' + MoodFX.color(m) + '"></i>' + MoodFX.esc(m) + ' <b>' + moodDays[m] + 'd</b></span>';
            }).join('')
            : '<span class="mc-none">no songs logged this month</span>';

        var chevron = function(dir) {
            return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="' + (dir < 0 ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7') + '"/></svg>';
        };

        box.innerHTML =
            '<div class="mc-head">' +
                '<div class="stats-card-title" style="margin:0;">MOOD CALENDAR</div>' +
                '<div class="mc-nav">' +
                    '<button type="button" class="mc-arrow" data-step="-1" aria-label="previous month"' + (canBack ? '' : ' disabled') + '>' + chevron(-1) + '</button>' +
                    '<span class="mc-month">' + MONTHS[view.m] + ' ' + view.y + '</span>' +
                    '<button type="button" class="mc-arrow" data-step="1" aria-label="next month"' + (isNow ? ' disabled' : '') + '>' + chevron(1) + '</button>' +
                '</div>' +
            '</div>' +
            '<div class="mc-grid' + (step ? (step < 0 ? ' mc-in-left' : ' mc-in-right') : '') + '">' +
                ['m', 't', 'w', 't', 'f', 's', 's'].map(function(w) { return '<span class="mc-wd">' + w + '</span>'; }).join('') +
                cells +
            '</div>' +
            '<div class="mc-legend">' + legend + '</div>' +
            '<div class="mc-detail" id="mc-detail">' + detailHTML(selected) + '</div>';
    }

    function detailHTML(k) {
        if (!k || !days[k]) return '<div class="mc-hint">tap a day to see what you were listening to</div>';
        var info = days[k];
        var parts = k.split('-');
        var date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        var label = date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }).toLowerCase();
        var songs = info.songs.slice().sort(function(a, b) { return (Number(b.play_count) || 0) - (Number(a.play_count) || 0); });
        return '<div class="mc-detail-head">' + MoodFX.esc(label) +
                '<span>' + info.total + ' play' + (info.total === 1 ? '' : 's') + ' · mostly ' + MoodFX.esc(mainMood(info)) + '</span></div>' +
            songs.map(function(s) {
                var c = MoodFX.color(s.mood);
                return '<div class="mc-song" style="--mc:' + c + '">' +
                    (s.album_art ? '<img src="' + MoodFX.esc(s.album_art) + '" alt="" loading="lazy" />' : '<span class="mc-song-art"></span>') +
                    '<div class="mc-song-info">' +
                        '<div class="mc-song-title">' + MoodFX.esc(s.title) + '</div>' +
                        '<div class="mc-song-sub">' + MoodFX.esc(s.artist) + '</div>' +
                        (s.note ? '<div class="mc-song-note">“' + MoodFX.esc(s.note) + '”</div>' : '') +
                    '</div>' +
                    '<div class="mc-song-meta"><span class="mc-song-mood">' + MoodFX.esc(s.mood) + '</span>' +
                        '<span>' + (Number(s.play_count) || 0) + ' play' + (Number(s.play_count) === 1 ? '' : 's') + '</span></div>' +
                '</div>';
            }).join('');
    }

    document.addEventListener('click', function(e) {
        var box = document.getElementById('mood-calendar');
        if (!box || !box.contains(e.target)) return;
        var arrow = e.target.closest('.mc-arrow');
        if (arrow && !arrow.disabled) return move(Number(arrow.dataset.step));
        var cell = e.target.closest('.mc-filled');
        if (!cell) return;
        selected = selected === cell.dataset.day ? null : cell.dataset.day;
        box.querySelectorAll('.mc-selected').forEach(function(c) { c.classList.remove('mc-selected'); });
        if (selected) cell.classList.add('mc-selected');
        var det = document.getElementById('mc-detail');
        det.innerHTML = detailHTML(selected);
        det.classList.remove('mc-pop'); void det.offsetWidth; det.classList.add('mc-pop');
    });

    return { show: show };
})();

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
        if (!err2 && r2 && r2.data) { buildLineGraph(r2.data); MoodCalendar.show(r2.data); }
        else { MoodCalendar.show([]); var c = document.getElementById('mood-graph-container'); if (c) c.innerHTML = '<div class="stats-card-title">MOOD ACTIVITY</div><p style="color:#555;font-size:13px;">not enough data yet</p>'; }
    });
});