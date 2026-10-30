// recap.js — monthly recap on the stats page
// a "wrapped"-style card for one month: plays, songs and days, your main mood and
// how the month split between moods, your top songs, when you listened most and
// your busiest day. arrows step back through earlier months. "save image" draws
// the same recap as a 1080 × 1350 picture you can share (or download).
// stats.js calls MoodRecap.show(logs) once the per-day logs have loaded.

(function() {

var MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
var DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
var allLogs = [], monthKeys = [], current = null;

function pad2(n) { return (n < 10 ? '0' : '') + n; }
function parseUTC(s) {
    if (!s) return null;
    s = String(s);
    var t = new Date(s.replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? '' : 'Z'));
    return isNaN(t) ? null : t;
}
// the local day a log belongs to (YYYY-MM-DD)
function dayOf(log) {
    if (log.log_date) return String(log.log_date).slice(0, 10);
    var t = parseUTC(log.last_logged);
    return t ? t.getFullYear() + '-' + pad2(t.getMonth() + 1) + '-' + pad2(t.getDate()) : null;
}
function plays(log) { return Math.max(1, Number(log.play_count) || 0); }
function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

// everything the recap shows, for one month ("2026-10")
function summarise(key) {
    var logs = allLogs.filter(function(l) { var d = dayOf(l); return d && d.slice(0, 7) === key; });
    var total = 0, songs = {}, days = {}, moods = {}, perDay = {};
    var times = { morning: 0, afternoon: 0, evening: 0, 'late at night': 0 };
    logs.forEach(function(l) {
        var n = plays(l), d = dayOf(l);
        total += n;
        days[d] = true;
        perDay[d] = (perDay[d] || 0) + n;
        moods[l.mood] = (moods[l.mood] || 0) + n;
        var s = songs[l.song_id] || (songs[l.song_id] = { title: l.title, artist: l.artist, art: l.album_art, mood: l.mood, plays: 0 });
        s.plays += n;
        var t = parseUTC(l.last_logged);
        if (t) {
            var h = t.getHours();
            times[h >= 5 && h < 12 ? 'morning' : h >= 12 && h < 18 ? 'afternoon' : h >= 18 && h < 22 ? 'evening' : 'late at night'] += n;
        }
    });
    var moodList = Object.keys(moods).map(function(m) { return { mood: m, plays: moods[m] }; })
        .sort(function(a, b) { return b.plays - a.plays || a.mood.localeCompare(b.mood); });
    var songList = Object.keys(songs).map(function(id) { return songs[id]; })
        .sort(function(a, b) { return b.plays - a.plays || a.title.localeCompare(b.title); });
    var peak = Object.keys(times).reduce(function(a, b) { return times[b] > times[a] ? b : a; });
    var busiest = Object.keys(perDay).sort(function(a, b) { return perDay[b] - perDay[a] || a.localeCompare(b); })[0];
    var y = Number(key.slice(0, 4)), m = Number(key.slice(5, 7)) - 1;
    return {
        key: key, year: y, month: MONTHS[m], total: total, songs: songList.length, days: Object.keys(days).length,
        moods: moodList, top: songList.slice(0, 3), peak: times[peak] ? peak : null,
        busiest: busiest ? { date: busiest, plays: perDay[busiest] } : null
    };
}

function busiestLabel(b) {
    var d = new Date(b.date + 'T12:00:00');
    return DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()].slice(0, 3);
}

// ── the card on the page ───────────────────────────────
function draw() {
    var host = document.getElementById('recap-card');
    if (!host) return;
    if (!current) { host.hidden = true; return; }
    host.hidden = false;
    var r = summarise(current);
    var esc = MoodFX.esc;
    var top = r.moods[0];
    var c = top ? MoodFX.color(top.mood) : '#9b6fc2';
    host.style.setProperty('--rc', c);
    var i = monthKeys.indexOf(current);
    var isThisMonth = current === thisMonthKey();
    var title = (isThisMonth ? 'your ' + r.month + ' so far' : 'your ' + r.month) + (r.year !== new Date().getFullYear() ? ' ' + r.year : '');

    host.innerHTML =
        '<div class="rc-head">' +
            '<button type="button" class="rc-arrow" data-step="1" aria-label="previous month"' + (i >= monthKeys.length - 1 ? ' disabled' : '') + '>‹</button>' +
            '<h2 class="rc-title" id="recap-title">' + esc(title) + '</h2>' +
            '<button type="button" class="rc-arrow" data-step="-1" aria-label="next month"' + (i <= 0 ? ' disabled' : '') + '>›</button>' +
        '</div>' +
        '<p class="rc-numbers"><b>' + r.total + '</b> ' + (r.total === 1 ? 'play' : 'plays') + ' · <b>' + r.songs + '</b> ' + (r.songs === 1 ? 'song' : 'songs') + ' · <b>' + r.days + '</b> ' + (r.days === 1 ? 'day' : 'days') + '</p>' +
        (top
            ? '<p class="rc-mood">mostly <span class="rc-mood-name" style="--mc:' + c + '">' + MoodFX.icon(MoodFX.moodIcon(top.mood)) + esc(top.mood) + '</span> <span class="rc-pct">' + Math.round(top.plays / r.total * 100) + '% of your plays</span></p>' +
              '<div class="rc-split" role="img" aria-label="' + esc(r.moods.map(function(m) { return m.mood + ' ' + Math.round(m.plays / r.total * 100) + '%'; }).join(', ')) + '">' +
                r.moods.map(function(m) { return '<span style="flex:' + m.plays + ';background:' + MoodFX.color(m.mood) + '" title="' + esc(m.mood) + '"></span>'; }).join('') +
              '</div>' +
              '<div class="rc-legend">' + r.moods.slice(0, 5).map(function(m) {
                  return '<span><i style="background:' + MoodFX.color(m.mood) + '"></i>' + esc(m.mood) + ' ' + Math.round(m.plays / r.total * 100) + '%</span>';
              }).join('') + '</div>'
            : '') +
        (r.top.length
            ? '<div class="rc-section-label">on repeat</div><ol class="rc-songs">' + r.top.map(function(s, k) {
                return '<li class="rc-song' + (k === 0 ? ' rc-first' : '') + '">' +
                    '<img src="' + esc(s.art || '') + '" alt="" />' +
                    '<span class="rc-song-text"><span class="rc-song-title">' + esc(s.title) + '</span><span class="rc-song-artist">' + esc(s.artist) + '</span></span>' +
                    '<span class="rc-song-plays">' + plural(s.plays, 'play', 'plays') + '</span>' +
                '</li>';
              }).join('') + '</ol>'
            : '') +
        '<div class="rc-facts">' +
            (r.peak ? '<p>you listened most <b>' + r.peak.replace(/^(morning|afternoon|evening)$/, 'in the $1') + '</b></p>' : '') +
            (r.busiest ? '<p>busiest day: <b>' + busiestLabel(r.busiest) + '</b>, ' + plural(r.busiest.plays, 'play', 'plays') + '</p>' : '') +
        '</div>' +
        '<div class="rc-actions"><button type="button" class="rc-save">' + MoodFX.icon('sparkles') + '<span>save as image</span></button></div>';
}

function thisMonthKey() { var t = new Date(); return t.getFullYear() + '-' + pad2(t.getMonth() + 1); }

function show(logs) {
    allLogs = Array.isArray(logs) ? logs : [];
    var keys = {};
    allLogs.forEach(function(l) { var d = dayOf(l); if (d) keys[d.slice(0, 7)] = true; });
    monthKeys = Object.keys(keys).sort().reverse();      // newest first
    if (!current || monthKeys.indexOf(current) === -1) current = monthKeys[0] || null;
    var host = document.getElementById('recap-card');
    if (!host) {
        host = document.createElement('section');
        host.id = 'recap-card';
        host.className = 'recap-card';
        host.setAttribute('aria-labelledby', 'recap-title');
        var content = document.getElementById('stats-content');
        var sentence = content && content.querySelector('.stats-sentence');
        if (sentence) sentence.insertAdjacentElement('afterend', host);
        else if (content) content.insertBefore(host, content.firstChild);
        host.addEventListener('click', function(e) {
            var a = e.target.closest('.rc-arrow');
            if (a && !a.disabled) {
                var i = monthKeys.indexOf(current) + Number(a.dataset.step);
                if (monthKeys[i]) { current = monthKeys[i]; draw(); host.querySelector('.rc-arrow[data-step="' + a.dataset.step + '"]').focus(); }
                return;
            }
            if (e.target.closest('.rc-save')) saveImage(e.target.closest('.rc-save'));
        });
    }
    draw();
}

// ── the picture ────────────────────────────────────────
function loadImage(src) {
    return new Promise(function(resolve) {
        if (!src) return resolve(null);
        var im = new Image();
        im.crossOrigin = 'anonymous';
        im.onload = function() { resolve(im); };
        im.onerror = function() { resolve(null); };
        im.src = src;
    });
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

function fitText(ctx, text, max) {
    if (ctx.measureText(text).width <= max) return text;
    while (text.length > 1 && ctx.measureText(text + '…').width > max) text = text.slice(0, -1);
    return text + '…';
}

function toColor(c) {        // canvas can't read color-mix() etc: resolve through the page
    var probe = document.createElement('span');
    probe.style.color = c;
    document.body.appendChild(probe);
    var out = getComputedStyle(probe).color;
    probe.remove();
    return out;
}

function renderImage(r) {
    var W = 1080, H = 1350, P = 84;
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var ctx = cv.getContext('2d');
    var F = '"DM Sans", "Segoe UI", system-ui, sans-serif';
    var top = r.moods[0];
    var mc = toColor(top ? MoodFX.color(top.mood) : '#9b6fc2');

    // background: deep violet, glowing in the month's main mood colour
    ctx.fillStyle = '#140b26';
    ctx.fillRect(0, 0, W, H);
    var g = ctx.createRadialGradient(W * 0.15, H * 0.05, 40, W * 0.3, H * 0.2, W * 1.1);
    g.addColorStop(0, mc.replace('rgb(', 'rgba(').replace(')', ', 0.55)'));
    g.addColorStop(0.55, 'rgba(74, 37, 112, 0.35)');
    g.addColorStop(1, 'rgba(20, 11, 38, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '500 34px ' + F;
    ctx.fillText('moodtunes', P, P + 20);
    ctx.fillStyle = '#fff';
    ctx.font = '700 84px ' + F;
    ctx.fillText(fitText(ctx, 'your ' + r.month, W - 2 * P), P, P + 140);
    ctx.font = '400 34px ' + F;
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText(plural(r.total, 'play', 'plays') + '  ·  ' + plural(r.songs, 'song', 'songs') + '  ·  ' + plural(r.days, 'day', 'days'), P, P + 205);

    var y = P + 300;
    if (top) {
        ctx.font = '400 36px ' + F;
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.fillText('mostly', P, y);
        ctx.font = '700 96px ' + F;
        ctx.fillStyle = mc;
        ctx.fillText(fitText(ctx, top.mood, W - 2 * P), P, y + 96);
        ctx.font = '400 32px ' + F;
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fillText(Math.round(top.plays / r.total * 100) + '% of your plays', P, y + 150);
        // the split bar
        var bx = P, bw = W - 2 * P, by = y + 186;
        ctx.save();
        roundRect(ctx, bx, by, bw, 22, 11);
        ctx.clip();
        r.moods.forEach(function(m) {
            var w = bw * m.plays / r.total;
            ctx.fillStyle = toColor(MoodFX.color(m.mood));
            ctx.fillRect(bx, by, w + 1, 22);
            bx += w;
        });
        ctx.restore();
        y = by + 100;
    }

    ctx.font = '600 30px ' + F;
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText('on repeat', P, y);
    y += 30;
    return Promise.all(r.top.map(function(s) { return loadImage(s.art); })).then(function(images) {
        r.top.forEach(function(s, k) {
            var size = k === 0 ? 150 : 104, x = P;
            y += 24;
            ctx.save();
            roundRect(ctx, x, y, size, size, 16);
            ctx.clip();
            if (images[k]) ctx.drawImage(images[k], x, y, size, size);
            else {
                ctx.fillStyle = 'rgba(200,176,255,0.16)'; ctx.fillRect(x, y, size, size);
                ctx.fillStyle = 'rgba(232,222,255,0.7)'; ctx.font = (size * 0.42) + 'px ' + F;
                ctx.textAlign = 'center'; ctx.fillText('♪', x + size / 2, y + size * 0.64); ctx.textAlign = 'left';
            }
            ctx.restore();
            var tx = x + size + 32, playsText = plural(s.plays, 'play', 'plays');
            // the play count sits at the right end of the title line
            ctx.font = '400 28px ' + F;
            var pw = ctx.measureText(playsText).width;
            var tw = W - P - tx - pw - 24;
            var titleY = y + (k === 0 ? 66 : 48), artistY = y + (k === 0 ? 112 : 88);
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            ctx.textAlign = 'right';
            ctx.fillText(playsText, W - P, titleY);
            ctx.textAlign = 'left';
            ctx.fillStyle = '#fff';
            ctx.font = (k === 0 ? '700 46px ' : '600 36px ') + F;
            ctx.fillText(fitText(ctx, s.title, tw), tx, titleY);
            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            ctx.font = (k === 0 ? '400 32px ' : '400 28px ') + F;
            ctx.fillText(fitText(ctx, s.artist, W - P - tx), tx, artistY);
            y += size;
        });
        y += 70;
        ctx.font = '400 32px ' + F;
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        if (r.peak) { ctx.fillText('you listened most ' + r.peak.replace(/^(morning|afternoon|evening)$/, 'in the $1'), P, y); y += 52; }
        if (r.busiest) ctx.fillText('busiest day: ' + busiestLabel(r.busiest) + ', ' + plural(r.busiest.plays, 'play', 'plays'), P, y);
        return new Promise(function(resolve) { cv.toBlob(resolve, 'image/png'); });
    });
}

function saveImage(btn) {
    if (!current || btn.disabled) return;
    var r = summarise(current);
    var label = btn.innerHTML;
    btn.disabled = true;
    btn.querySelector('span').textContent = 'making your image…';
    var ready = document.fonts && document.fonts.load ? document.fonts.load('700 40px "DM Sans"').catch(function() {}) : Promise.resolve();
    ready.then(function() { return renderImage(r); }).then(function(blob) {
        btn.disabled = false;
        btn.innerHTML = label;
        if (!blob) return MoodFX.toast('couldn’t make the image, try again');
        var name = 'moodtunes-' + r.month + '-' + r.year + '.png';
        var file = window.File ? new File([blob], name, { type: 'image/png' }) : null;
        // phones: the share sheet (save to photos, send to a friend, post a story)
        if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
            return navigator.share({ files: [file], title: 'my ' + r.month + ' on moodtunes' }).catch(function() {});
        }
        // computers: download it
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name;
        document.body.appendChild(a);
        a.click();
        setTimeout(function() { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
        MoodFX.toast('saved your ' + r.month + ' recap', r.moods[0] && r.moods[0].mood);
    }).catch(function() {
        btn.disabled = false;
        btn.innerHTML = label;
        MoodFX.toast('couldn’t make the image, try again');
    });
}

// ── insights: what your listening says, in plain words ──
// a few short observations from all your logs, shown under the recap. each one
// only appears when the data clearly backs it (enough plays, a clear lean), so
// there's no "insight" made out of two songs
function bucketOf(h) { return h >= 5 && h < 12 ? 'morning' : h >= 12 && h < 18 ? 'afternoon' : h >= 18 && h < 22 ? 'evening' : 'late at night'; }
function bucketPhrase(b) { return b === 'late at night' ? 'late at night' : 'in the ' + b; }

function insights() {
    var out = [];
    if (!allLogs.length) return out;
    var esc = MoodFX.esc;
    var moodTimes = {}, moodPlays = {}, moodWeekend = {}, total = 0, weekendTotal = 0, days = {};
    allLogs.forEach(function(l) {
        var n = plays(l), d = dayOf(l), t = parseUTC(l.last_logged);
        total += n;
        moodPlays[l.mood] = (moodPlays[l.mood] || 0) + n;
        if (d) {
            days[d] = true;
            var wd = new Date(d + 'T12:00:00').getDay();
            if (wd === 0 || wd === 6) { weekendTotal += n; moodWeekend[l.mood] = (moodWeekend[l.mood] || 0) + n; }
        }
        if (t) {
            var b = bucketOf(t.getHours());
            var mt = moodTimes[l.mood] || (moodTimes[l.mood] = {});
            mt[b] = (mt[b] || 0) + n;
        }
    });
    var moods = Object.keys(moodPlays).sort(function(a, b) { return moodPlays[b] - moodPlays[a]; });
    var tag = function(m) { return '<span class="ins-mood" style="--mc:' + MoodFX.color(m) + '">' + esc(m) + '</span>'; };

    // 1. when each mood happens: a mood with 6+ plays, over half of them in one part of the day
    moods.some(function(m) {
        if (moodPlays[m] < 6) return false;
        var mt = moodTimes[m] || {};
        var best = Object.keys(mt).sort(function(a, b) { return mt[b] - mt[a]; })[0];
        if (!best || mt[best] / moodPlays[m] < 0.5) return false;
        out.push({ icon: 'moon', html: 'you play ' + tag(m) + ' songs mostly <b>' + bucketPhrase(best) + '</b>' });
        return true;
    });

    // 2. a mood that leans to the weekend: clearly more of it on sat/sun than your usual share
    var weekendShare = total ? weekendTotal / total : 0;
    moods.some(function(m) {
        if (moodPlays[m] < 6 || weekendShare <= 0 || weekendShare >= 0.9) return false;
        var share = (moodWeekend[m] || 0) / moodPlays[m];
        if (share < 0.5 || share < weekendShare * 1.5) return false;
        out.push({ icon: 'sun', html: tag(m) + ' turns up on <b>weekends</b>: ' + Math.round(share * 100) + '% of those plays are on a saturday or sunday' });
        return true;
    });

    // 3. your biggest loop: the most plays of one song in one day (3 or more)
    var loop = allLogs.reduce(function(best, l) { return plays(l) > (best ? plays(best) : 0) ? l : best; }, null);
    if (loop && plays(loop) >= 3) {
        var ld = dayOf(loop);
        var when = ld ? new Date(ld + 'T12:00:00') : null;
        out.push({ icon: 'queue', html: 'your biggest loop: <b>' + esc(loop.title) + '</b>, ' + plays(loop) + ' plays' + (when ? ' on ' + DAYS[when.getDay()] + ' ' + when.getDate() + ' ' + MONTHS[when.getMonth()].slice(0, 3) : '') });
    }

    // 4. a streak: days in a row with something logged, up to today (or yesterday)
    var streak = 0, cur = new Date();
    var key = function(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); };
    if (!days[key(cur)]) cur.setDate(cur.getDate() - 1);
    while (days[key(cur)]) { streak++; cur.setDate(cur.getDate() - 1); }
    if (streak >= 3) out.push({ icon: 'flame', html: 'you’ve logged songs <b>' + streak + ' days in a row</b>' });

    // 5. a change of mood: this month's main mood vs last month's
    if (monthKeys.length >= 2 && monthKeys[0] === thisMonthKey()) {
        var now = summarise(monthKeys[0]), before = summarise(monthKeys[1]);
        if (now.moods[0] && before.moods[0] && now.moods[0].mood !== before.moods[0].mood && now.total >= 5) {
            out.push({ icon: 'sparkles', html: 'this month you moved from ' + tag(before.moods[0].mood) + ' to ' + tag(now.moods[0].mood) });
        }
    }
    return out.slice(0, 4);
}

function drawInsights() {
    var list = insights();
    var host = document.getElementById('insights-card');
    if (!list.length) { if (host) host.remove(); return; }
    if (!host) {
        host = document.createElement('section');
        host.id = 'insights-card';
        host.className = 'insights-card';
        host.setAttribute('aria-labelledby', 'insights-title');
        var recap = document.getElementById('recap-card');
        if (recap) recap.insertAdjacentElement('afterend', host);
        else return;
    }
    host.innerHTML = '<h2 class="ins-title" id="insights-title">what we noticed</h2><ul class="ins-list">' +
        list.map(function(i) { return '<li>' + MoodFX.icon(i.icon) + '<span>' + i.html + '</span></li>'; }).join('') + '</ul>';
}

var _show = show;
show = function(logs) { _show(logs); drawInsights(); };

window.MoodRecap = { show: show, _summarise: summarise, _render: renderImage, _insights: insights };

})();