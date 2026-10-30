// help.js — shared help modal for all pages
// fade + slide the modal out (see #help-modal.closing in motion.css), then remove it
function closeHelpModal(modal) {
    if (!modal || modal.classList.contains('closing')) return;
    modal.classList.add('closing');
    setTimeout(function() { modal.dispatchEvent(new Event('mt-closed')); modal.remove(); }, 220);
}

function helpIcon(name) {
    return window.MoodFX ? MoodFX.icon(name) : '';
}

function showHelpModal() {
    var existing = document.getElementById('help-modal');
    if (existing) { closeHelpModal(existing); return; }

    var modal = document.createElement('div');
    modal.id = 'help-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(12,5,26,0.78);z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;';
    modal.innerHTML =
        // the card holds the colour; the layer inside it scrolls (so its edges can fade
        // without fading the card itself, see "SCROLL HINTS" in motion.css)
        '<div class="help-card" role="dialog" aria-modal="true" aria-labelledby="help-title" style="border-radius:16px;width:100%;max-width:480px;overflow:hidden;">' +
        '<div class="help-scroll" style="padding:28px;max-height:85vh;overflow-y:auto;box-sizing:border-box;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">' +
                '<h2 id="help-title" style="margin:0;font-size:18px;font-weight:600;color:#fff;">how to use moodtunes</h2>' +
                '<button id="close-help" aria-label="close" style="background:none;border:none;color:#c9bde6;font-size:20px;cursor:pointer;">✕</button>' +
            '</div>' +

            '<div style="margin-bottom:18px;">' +
                '<div class="help-heading">' + helpIcon('journal') + 'journal</div>' +
                '<div style="font-size:13px;color:#d9cff0;line-height:1.6;">pick a mood, then search for a song you\'re listening to. click a result to optionally add a note, then hit just play or play + save note. your recently logged songs appear below, grouped by today and yesterday. you can add or edit notes on any log, or delete it. notes sit beside the song title, tap a long one to read it all. play count updates automatically based on what you open from moodtunes in spotify, and each log shows the time you played it (e.g. 1:50 – 2:00 am). <b style="color:#fff;">not in your journal yet</b> lists songs you played in spotify that aren\'t in your journal. tap a mood to log one on the day you played it (with its play count), or ✕ to hide it.</div>' +
            '</div>' +

            '<div style="margin-bottom:18px;">' +
                '<div class="help-heading">' + helpIcon('playlists') + 'playlists</div>' +
                '<div style="font-size:13px;color:#d9cff0;line-height:1.6;">every mood gets its own playlist built from your logged songs. open a playlist to see all tracks, drag to reorder (hold the ⠿ handle on mobile too), and add or edit notes per song. the cover art shows the top 4 songs in the list. newly added songs go to the top, so your latest additions appear on the cover. tap <b style="color:#fff;">＋ save to spotify</b> to add it to your spotify library, named after the mood (e.g. “chill”) and with the same 4-cover picture. it then keeps itself (and its cover) up to date as you log songs, and ▶ plays the whole playlist in spotify. <b style="color:#fff;">delete playlist</b> removes the playlist together with its mood (you get a few seconds to undo). deleting a mood in manage moods does the same. your songs always stay in your history and stats, and a copy saved in spotify stays in spotify.</div>' +
            '</div>' +

            '<div style="margin-bottom:18px;">' +
                '<div class="help-heading">' + helpIcon('history') + 'history</div>' +
                '<div style="font-size:13px;color:#d9cff0;line-height:1.6;">see everything you\'ve logged organised by date. search for any song to see every day you\'ve listened to it, how many plays, and any notes you left. the sessions tab shows your past listening sessions with the songs played in each. tap <b style="color:#fff;">save to spotify</b> on one to keep it as a playlist (“session 1”, “session 2”, …). above the timeline, pick a mood or a date range (last 7 days, last 30 days, this month, or your own dates) to show only those songs, and tap <b style="color:#fff;">clear</b> to see everything again.</div>' +
            '</div>' +

            '<div style="margin-bottom:18px;">' +
                '<div class="help-heading">' + helpIcon('stats') + 'stats</div>' +
                '<div style="font-size:13px;color:#d9cff0;line-height:1.6;">a full breakdown of your listening: total plays, unique songs, days active, top mood, a mood calendar (each day shows the cover of the song you played most that day, with a strip in that day\'s mood colour; tap a day to see its songs and notes), mood breakdown bars, time-of-day chart, your top 5 most played songs, a 14-day mood activity line graph, and a flashback to songs you were playing about a month ago. at the top, <b style="color:#fff;">your month</b> sums up a month like a wrapped: your main mood and how the month split between moods, your top 3 songs, when you listened most and your busiest day. the arrows step back through earlier months, and <b style="color:#fff;">save as image</b> makes a picture you can share. under it, <b style="color:#fff;">what we noticed</b> picks out patterns in your listening, like when a mood usually happens, moods that lean to weekends, your biggest loop and your logging streak.</div>' +
            '</div>' +

            '<div style="margin-bottom:18px;">' +
                '<div class="help-heading">' + helpIcon('session') + 'session</div>' +
                '<div style="font-size:13px;color:#d9cff0;line-height:1.6;">pick a mood then hit start session to begin a listening session. once started you\'ll get song recommendations picked from the genres of the songs you\'ve logged in that mood. with spotify premium every song is added to your spotify queue, and you can save the session as a playlist (on free, save it as a playlist and play it on shuffle). ▶ plays a song, and + add puts it in your journal once it has actually played. hit ↻ refresh for a new batch. songs you play show up under <b style="color:#fff;">this session</b> as you go. end session shows a summary, where you can save the session to spotify as a playlist.</div>' +
            '</div>' +

            '<div style="margin-bottom:18px;">' +
                '<div class="help-heading">' + helpIcon('note') + 'now playing &amp; sound waves</div>' +
                '<div style="font-size:13px;color:#d9cff0;line-height:1.6;">the now playing card shows what\'s on spotify right now, with play, pause and skip. tap a mood under it to log the song in one tap, and see what\'s <b style="color:#fff;">up next</b> in your spotify queue. while a song plays, its album cover fills the page background (tinted with your mood colour) and sound waves drift across it in the colour of the art. both fade away when you pause.' +
                    (window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches
                        ? ' to make the waves follow the drums and volume, tap <b style="color:#fff;">sync waves to sound</b> on the card. in the pop-up, pick <b style="color:#fff;">entire screen</b> (or any window), switch on <b style="color:#fff;">share with system audio</b> and press share. it works with headphones too. the browser asks again on each page, so tap <b style="color:#fff;">▶ resume sync</b> after switching pages, and tap the button again to stop. moodtunes only reads the beat and loudness. nothing is recorded or seen.'
                        : ' when spotify\'s beat map is available for a song, the waves hit on its beats and follow its volume automatically.') +
                '</div>' +
            '</div>' +

            '<div style="margin-bottom:18px;">' +
                '<div class="help-heading">' + helpIcon('queue') + 'playing songs &amp; play next</div>' +
                '<div style="font-size:13px;color:#d9cff0;line-height:1.6;">▶ opens the song in the spotify app or your browser. with spotify premium, tap the <b style="color:#fff;">queue icon</b> beside ▶ (on your logs and on search results) to play a song next, after the one that\'s on now (start something playing in spotify first). on a free account the queue icon is hidden. the <b style="color:#fff;">heart</b> on the now playing card saves the song that\'s playing to your spotify liked songs (works on any account). if it asks you to reconnect spotify, that\'s a one-time step to allow it.</div>' +
            '</div>' +

            '<div style="margin-bottom:18px;">' +
                '<div class="help-heading">' + helpIcon('sparkles') + 'free vs premium spotify</div>' +
                '<div style="font-size:13px;color:#d9cff0;line-height:1.6;">' +
                    '<b style="color:#fff;">works with any spotify account</b>' +
                    '<ul style="margin:4px 0 10px 18px;padding:0;">' +
                        '<li>logging songs, notes and play counts</li>' +
                        '<li>journal, history, stats and the mood calendar</li>' +
                        '<li>mood playlists, saving them to spotify and ▶ opening them in spotify</li>' +
                        '<li>sessions and song recommendations</li>' +
                        '<li>seeing what\'s playing, the sound waves and sync to sound</li>' +
                        '<li>the heart on now playing (liked songs), one-tap logging, not logged yet and saving sessions</li>' +
                    '</ul>' +
                    '<b style="color:#fff;">needs spotify premium</b>' +
                    '<ul style="margin:4px 0 0 18px;padding:0;">' +
                        '<li>play, pause and skip on the now playing card</li>' +
                        '<li>play next (adding songs to your spotify queue)</li>' +
                    '</ul>' +
                '</div>' +
            '</div>' +

            '<div style="margin-bottom:18px;">' +
                '<div class="help-heading">' + helpIcon('sparkles') + 'manage moods</div>' +
                '<div style="font-size:13px;color:#d9cff0;line-height:1.6;">click manage moods below the mood chips on any page to add custom moods with your own name and icon, or delete any mood you don\'t want, including the default ones. changes sync across the journal and session pages.</div>' +
            '</div>' +

            // keyboard shortcuts — only worth showing on devices with a keyboard + mouse
            (window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches
                ? '<div style="margin-bottom:18px;">' +
                    '<div class="help-heading">' + helpIcon('keyboard') + 'keyboard shortcuts</div>' +
                    '<div style="font-size:13px;color:#d9cff0;line-height:2.1;">' +
                        '<kbd class="mt-kbd">1</kbd>–<kbd class="mt-kbd" style="margin-left:6px;">9</kbd> pick a mood<br>' +
                        '<kbd class="mt-kbd">/</kbd> jump to search<br>' +
                        '<kbd class="mt-kbd">esc</kbd> close a popup<br>' +
                        '<kbd class="mt-kbd">?</kbd> open this help<br>' +
                        '<kbd class="mt-kbd">tab</kbd> + <kbd class="mt-kbd">enter</kbd> reach and open any card or button' +
                    '</div>' +
                  '</div>'
                : '') +

            '<div style="margin-bottom:8px;">' +
                '<div class="help-heading">' + helpIcon('user') + 'profile</div>' +
                '<div style="font-size:13px;color:#d9cff0;line-height:1.6;">click the profile icon in the top right to see your account info, switch between themes (default, warm editorial, ocean, clean light), and log out. your chosen theme is saved and applied across all pages automatically. turn on <b style="color:#fff;">daily check-in</b> and pick a time to get a “how are you feeling?” notification on days you haven\'t logged a song yet (each device is set up on its own; on iphone, add moodtunes to your home screen first).</div>' +
            '</div>' +

            (window.MoodTour
                ? '<button id="help-tour-btn" style="width:100%;margin-top:20px;padding:11px;background:rgba(130,227,198,0.08);border:1px solid #82e3c6;border-radius:8px;color:#a6f0da;font-size:14px;cursor:pointer;font-weight:600;">show me around this page</button>'
                : '') +
            '<button id="close-help-2" style="width:100%;margin-top:10px;padding:12px;background:linear-gradient(135deg,#ff9fcf,#ffb98f);border:none;border-radius:8px;color:#2a1038;font-size:14px;cursor:pointer;font-weight:700;">got it!</button>' +
        '</div></div>';

    var opener = document.activeElement;
    document.body.appendChild(modal);
    document.getElementById('close-help').focus({ preventScroll: true });
    modal.addEventListener('mt-closed', function() { if (opener && opener.focus) opener.focus({ preventScroll: true }); });
    modal.addEventListener('click', function(e) { if (e.target === modal) closeHelpModal(modal); });
    document.getElementById('close-help').addEventListener('click', function() { closeHelpModal(modal); });
    // replay the quick intro for this page (see intro.js)
    var tourBtn = document.getElementById('help-tour-btn');
    if (tourBtn) tourBtn.addEventListener('click', function() {
        closeHelpModal(modal);
        setTimeout(function() { window.MoodTour.start(); }, 240);
    });
    document.getElementById('close-help-2').addEventListener('click', function() {
        var _user = localStorage.getItem('moodtunes_username');
        localStorage.setItem('moodtunes_seen_help_' + (_user || 'guest'), '1');
        closeHelpModal(modal);
    });
}

document.getElementById('help-btn').addEventListener('click', showHelpModal);

// the ? button: white ring and ? in every theme. it also stays on very small
// phones now, since help isn't in the profile menu any more
(function() {
    var css = document.createElement('style');
    css.textContent =
        '#help-btn{border-color:#fff !important;color:#fff !important;}' +
        '#help-btn:hover{background:rgba(255,255,255,0.12) !important;}' +
        // the guide itself: a violet card in every theme, with each section's heading
        // in one of the colours that sit well with purple (rose, peach, mint, sky, lavender)
        '#help-modal .help-card{background:linear-gradient(160deg,#3d2670 0%,#2a1850 55%,#1f1240 100%);border:1px solid rgba(200,176,255,0.24);box-shadow:inset 0 1px 0 rgba(255,255,255,0.07),0 24px 60px -24px rgba(0,0,0,0.8);color:#f6f1ff;}' +
        '#help-modal .help-scroll>div:nth-of-type(5n+2) .help-heading{color:#ff9fcf;}' +
        '#help-modal .help-scroll>div:nth-of-type(5n+3) .help-heading{color:#ffb98f;}' +
        '#help-modal .help-scroll>div:nth-of-type(5n+4) .help-heading{color:#82e3c6;}' +
        '#help-modal .help-scroll>div:nth-of-type(5n+5) .help-heading{color:#93c8ff;}' +
        '#help-modal .help-scroll>div:nth-of-type(5n+1) .help-heading{color:#d4c6ff;}' +
        '#help-modal .help-card kbd.mt-kbd{background:rgba(255,255,255,0.1);border-color:rgba(255,255,255,0.25);color:#fff;}' +
        '#help-modal #close-help-2:hover{filter:brightness(1.06);}' +
        '#help-modal #help-tour-btn:hover{background:rgba(130,227,198,0.16) !important;}' +
        '@media (max-width:360px){#help-btn{display:flex !important;align-items:center;justify-content:center;}}';
    document.head.appendChild(css);
})();

// first-time visitors get the quick guided intro instead (see intro.js); this
// full guide stays one tap away on the ? button