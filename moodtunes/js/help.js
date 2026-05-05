// help.js — shared help modal for all pages
function showHelpModal() {
    var existing = document.getElementById('help-modal');
    if (existing) { existing.remove(); return; }

    var modal = document.createElement('div');
    modal.id = 'help-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;';
    modal.innerHTML =
        '<div style="background:#141414;border:1px solid #2a2a2a;border-radius:16px;padding:28px;width:100%;max-width:480px;max-height:85vh;overflow-y:auto;">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">' +
                '<div style="font-size:18px;font-weight:600;color:#f0f0f0;">how to use moodtunes</div>' +
                '<button id="close-help" style="background:none;border:none;color:#888;font-size:20px;cursor:pointer;">✕</button>' +
            '</div>' +

            '<div style="margin-bottom:18px;">' +
                '<div style="font-size:13px;font-weight:600;color:#7f77dd;margin-bottom:6px;">📓 journal</div>' +
                '<div style="font-size:13px;color:#aaa;line-height:1.6;">pick a mood, then search for a song you\'re listening to. click a result to optionally add a note, then hit just play or play + save note. your recently logged songs appear below, grouped by today and yesterday. you can add or edit notes on any log, or delete it. play count is tracked automatically from spotify — every time you open a song from moodtunes, it gets counted.</div>' +
            '</div>' +

            '<div style="margin-bottom:18px;">' +
                '<div style="font-size:13px;font-weight:600;color:#7f77dd;margin-bottom:6px;">🎵 playlists</div>' +
                '<div style="font-size:13px;color:#aaa;line-height:1.6;">every mood gets its own playlist built from your logged songs. open a playlist to see all tracks, drag to reorder (works on mobile too — hold the ⠿ handle), and add or edit notes. the cover art is made from the top 4 songs in your current order. you can also sync any playlist directly to your spotify account.</div>' +
            '</div>' +

            '<div style="margin-bottom:18px;">' +
                '<div style="font-size:13px;font-weight:600;color:#7f77dd;margin-bottom:6px;">📅 history</div>' +
                '<div style="font-size:13px;color:#aaa;line-height:1.6;">see everything you\'ve logged organised by date. use the song search to look up any track and see every time you\'ve listened to it across different days. the sessions tab shows your past listening sessions with the songs you played in each one.</div>' +
            '</div>' +

            '<div style="margin-bottom:18px;">' +
                '<div style="font-size:13px;font-weight:600;color:#7f77dd;margin-bottom:6px;">📊 stats</div>' +
                '<div style="font-size:13px;color:#aaa;line-height:1.6;">see a breakdown of your listening — total plays, unique songs, days active, and your top mood. includes a mood breakdown bar chart, a when you listen time-of-day chart, your top 5 most played songs, a mood activity line graph for the last 14 days, and a flashback to songs you were playing about a month ago.</div>' +
            '</div>' +

            '<div style="margin-bottom:18px;">' +
                '<div style="font-size:13px;font-weight:600;color:#7f77dd;margin-bottom:6px;">⚡ session</div>' +
                '<div style="font-size:13px;color:#aaa;line-height:1.6;">pick a mood then hit start session to begin a listening session. once started, you\'ll get song recommendations based on your mood playlist and similar artists — click ▶ to open in spotify, or + add to log the song to your journal. hit ↻ refresh for a new set of recs. when you\'re done hit end session to see a summary of your session. sessions are saved in your history.</div>' +
            '</div>' +

            '<div style="margin-bottom:8px;">' +
                '<div style="font-size:13px;font-weight:600;color:#7f77dd;margin-bottom:6px;">✨ manage moods</div>' +
                '<div style="font-size:13px;color:#aaa;line-height:1.6;">click manage moods below the mood chips on any page to add custom moods with your own name and emoji, or delete moods you don\'t want. default moods can be deleted too. this is synced across the journal and session pages.</div>' +
            '</div>' +

            '<button id="close-help-2" style="width:100%;margin-top:20px;padding:12px;background:#7f77dd;border:none;border-radius:8px;color:#fff;font-size:14px;cursor:pointer;font-weight:600;">got it!</button>' +
        '</div>';

    document.body.appendChild(modal);
    modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
    document.getElementById('close-help').addEventListener('click', function() { modal.remove(); });
    document.getElementById('close-help-2').addEventListener('click', function() {
        localStorage.setItem('moodtunes_seen_help', '1');
        modal.remove();
    });
}

document.getElementById('help-btn').addEventListener('click', showHelpModal);

// auto-show on first ever visit (journal page only)
if (window.location.pathname.includes('index') || window.location.pathname.endsWith('/')) {
    if (!localStorage.getItem('moodtunes_seen_help')) {
        showHelpModal();
    }
}