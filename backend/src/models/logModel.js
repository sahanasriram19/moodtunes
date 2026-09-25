const pool = require('../services/db');

// ── one log per song + mood + day ────────────────────────────────────────────
// every day gets its own row (log_date = the user's local calendar day), and
// play_count only goes up when a song is played from moodtunes.
//
// this upgrades the Log table automatically the first time the backend starts:
//  1. adds the log_date column and fills it in for existing rows
//  2. merges any duplicate rows for the same song + mood + day
//  3. swaps the old one-row-per-song rule for one-row-per-song-per-day
// DEFAULT_TZ_OFFSET (e.g. +08:00) is only used to date the existing rows and for
// requests that don't say which timezone they're in.
const DEFAULT_TZ_OFFSET = process.env.DEFAULT_TZ_OFFSET || '+08:00';

function offsetSeconds(tz) {
    const m = /^([+-])(\d{2}):?(\d{2})$/.exec(String(tz).trim());
    if (!m) return 8 * 3600;
    return (m[1] === '-' ? -1 : 1) * (parseInt(m[2], 10) * 3600 + parseInt(m[3], 10) * 60);
}
module.exports.DEFAULT_OFFSET_SECONDS = offsetSeconds(DEFAULT_TZ_OFFSET);

// shown at /api/health, so you can check the upgrade without digging through logs
module.exports.dailyLogsStatus = 'upgrading';

async function upgradeToDailyLogs() {
    const db = pool.promise();
    // (LOWER() because some MySQL hosts store table names in lower case)
    const [[col]] = await db.query(
        "SELECT COUNT(*) AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND LOWER(TABLE_NAME) = 'log' AND COLUMN_NAME = 'log_date'");
    if (!col.n) {
        await db.query('ALTER TABLE Log ADD COLUMN log_date DATE NULL');
        console.log('Log: added log_date column');
    }
    // date existing rows by their last play, in DEFAULT_TZ_OFFSET. worked out from
    // the raw unix time so the database's own timezone setting doesn't matter
    await db.query(
        "UPDATE Log SET log_date = DATE(DATE_ADD('1970-01-01 00:00:00', INTERVAL (UNIX_TIMESTAMP(COALESCE(last_logged, first_logged, NOW())) + ?) SECOND)) WHERE log_date IS NULL",
        [module.exports.DEFAULT_OFFSET_SECONDS]);

    const indexExists = async (name) => {
        const [[r]] = await db.query(
            "SELECT COUNT(*) AS n FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND LOWER(TABLE_NAME) = 'log' AND INDEX_NAME = ?", [name]);
        return r.n > 0;
    };

    if (!(await indexExists('unique_user_song_day'))) {
        // merge duplicates (same song + mood + day) into the oldest row first
        await db.query(
            'UPDATE Log l JOIN (' +
            '  SELECT MIN(id) AS keep_id, SUM(play_count) AS plays, MIN(first_logged) AS first_at, MAX(last_logged) AS last_at, MAX(note) AS any_note' +
            '  FROM Log GROUP BY user_id, song_id, mood, log_date HAVING COUNT(*) > 1' +
            ') d ON l.id = d.keep_id' +
            " SET l.play_count = d.plays, l.first_logged = d.first_at, l.last_logged = d.last_at, l.note = IF(l.note IS NULL OR l.note = '', d.any_note, l.note)");
        const [del] = await db.query(
            'DELETE l FROM Log l JOIN (' +
            '  SELECT MIN(id) AS keep_id, user_id, song_id, mood, log_date' +
            '  FROM Log GROUP BY user_id, song_id, mood, log_date HAVING COUNT(*) > 1' +
            ') d ON l.user_id = d.user_id AND l.song_id = d.song_id AND l.mood = d.mood AND l.log_date = d.log_date AND l.id <> d.keep_id');
        if (del.affectedRows) console.log('Log: merged ' + del.affectedRows + ' duplicate same-day rows');
        await db.query('ALTER TABLE Log MODIFY log_date DATE NOT NULL');
        await db.query('ALTER TABLE Log ADD UNIQUE KEY unique_user_song_day (user_id, song_id, mood, log_date)');
        console.log('Log: one row per song + mood + day');
    }
    // the old rule allowed only ONE row per song + mood ever, which blocked a new day's log
    if (await indexExists('unique_user_song_mood')) {
        await db.query('ALTER TABLE Log DROP INDEX unique_user_song_mood');
        console.log('Log: removed the one-row-per-song rule');
    }
}

const dailyLogsReady = upgradeToDailyLogs().then(() => {
    module.exports.dailyLogsStatus = 'ready';
}).catch((err) => {
    module.exports.dailyLogsStatus = 'failed: ' + err.message;
    console.error('Log table upgrade failed:', err.message);
});

// ── grouped: one row per unique song+mood, total plays summed ───────────────
// used by: journal recently played, playlists, discover, session recs

module.exports.selectAllByUser = (data, callback) => {
    pool.query(
        'SELECT song_id, user_id, title, artist, album_art, spotify_url, mood,' +
        ' SUM(play_count) as play_count, MAX(last_logged) as last_logged,' +
        ' MIN(id) as id, MAX(note) as note' +
        ' FROM Log WHERE user_id = ?' +
        ' GROUP BY song_id, user_id, title, artist, album_art, spotify_url, mood' +
        ' ORDER BY MAX(last_logged) DESC, MIN(id) DESC',
        [data.user_id], callback
    );
};

module.exports.selectByMood = (data, callback) => {
    pool.query(
        'SELECT song_id, user_id, title, artist, album_art, spotify_url, mood,' +
        ' SUM(play_count) as play_count, MAX(last_logged) as last_logged,' +
        ' MIN(id) as id, MAX(note) as note' +
        ' FROM Log WHERE user_id = ? AND mood = ?' +
        ' GROUP BY song_id, user_id, title, artist, album_art, spotify_url, mood' +
        ' ORDER BY SUM(play_count) DESC, MAX(last_logged) DESC, MIN(id) DESC',
        [data.user_id, data.mood], callback
    );
};

// ── per day: all raw rows ────────────────────────────────────────────────────
// used by: history timeline, song search

module.exports.selectAllByUserPerDay = (data, callback) => {
    pool.query(
        'SELECT * FROM Log WHERE user_id = ? ORDER BY last_logged DESC, id DESC',
        [data.user_id], callback
    );
};

// ── today and yesterday only — for journal recently played ───────────────────
module.exports.selectRecentTwoDays = (data, callback) => {
    dailyLogsReady.then(() => pool.query(
        'SELECT * FROM Log WHERE user_id = ? AND log_date >= ? ORDER BY last_logged DESC, id DESC',
        [data.user_id, data.since_date],
        (err, rows) => {
            // if the upgrade couldn't run, still show the journal (last 48 hours)
            if (err && err.code === 'ER_BAD_FIELD_ERROR') {
                return pool.query(
                    'SELECT * FROM Log WHERE user_id = ? AND last_logged >= NOW() - INTERVAL 48 HOUR ORDER BY last_logged DESC, id DESC',
                    [data.user_id], callback);
            }
            callback(err, rows);
        }
    ));
};

// ── record a play ────────────────────────────────────────────────────────────
// adds `plays` (1, or 0 when a song is only added to the journal) to that song's
// row for the given day, creating the row if it's the first time that day.
// one atomic statement, so a quick double tap can't create two rows.
module.exports.recordPlay = (data, callback) => {
    dailyLogsReady.then(() => pool.query(
        'INSERT INTO Log (user_id, song_id, title, artist, album_art, spotify_url, mood, play_count, note, log_date, last_logged)' +
        ' VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())' +
        ' ON DUPLICATE KEY UPDATE' +
        '  play_count = play_count + VALUES(play_count),' +
        '  last_logged = IF(VALUES(play_count) > 0, NOW(), last_logged),' +
        "  note = IF(VALUES(note) <> '', VALUES(note), note)",
        [data.user_id, data.song_id, data.title, data.artist, data.album_art, data.spotify_url, data.mood,
         data.plays, data.note || '', data.log_date],
        callback
    ));
};

// the most recent log of a song + mood — used to replay a song that's already in the journal
module.exports.selectLatestForSong = (data, callback) => {
    pool.query(
        'SELECT title, artist, album_art, spotify_url FROM Log WHERE user_id = ? AND song_id = ? AND mood = ? ORDER BY last_logged DESC, id DESC LIMIT 1',
        [data.user_id, data.song_id, data.mood], callback
    );
};

// ── loops: repeats of a song you opened from moodtunes ─────────────────────
// opening a song from the app starts a "launch". afterwards, each time spotify
// plays that same song again in an unbroken run (repeat / loop), it counts as one
// more play. the run ends at the first different song. one open launch per user.
pool.query(
    `CREATE TABLE IF NOT EXISTS PlayLaunch (
        id               INT AUTO_INCREMENT PRIMARY KEY,
        user_id          INT NOT NULL,
        song_id          VARCHAR(255) NOT NULL,
        mood             VARCHAR(50) NOT NULL,
        tz_offset        INT NOT NULL DEFAULT 0,
        launched_ms      BIGINT NOT NULL,
        counted_until_ms BIGINT NOT NULL,
        started          TINYINT NOT NULL DEFAULT 0,
        is_open          TINYINT NOT NULL DEFAULT 1,
        FOREIGN KEY (user_id) REFERENCES User(id),
        KEY launch_user_open (user_id, is_open)
    )`,
    (err) => { if (err) console.error('PlayLaunch table setup failed:', err.message); }
);

// a new launch ends any earlier one (you've moved on to another song)
module.exports.startLaunch = (data, callback) => {
    pool.query('UPDATE PlayLaunch SET is_open = 0 WHERE user_id = ? AND is_open = 1', [data.user_id], (err) => {
        if (err) return callback(err);
        pool.query(
            'INSERT INTO PlayLaunch (user_id, song_id, mood, tz_offset, launched_ms, counted_until_ms) VALUES (?, ?, ?, ?, ?, ?)',
            [data.user_id, data.song_id, data.mood, data.tz_offset, data.launched_ms, data.launched_ms], callback);
    });
};

module.exports.getOpenLaunch = (data, callback) => {
    pool.query('SELECT * FROM PlayLaunch WHERE user_id = ? AND is_open = 1 ORDER BY id DESC LIMIT 1', [data.user_id], callback);
};

// moves a launch forward. only succeeds if nobody else moved it first
// (e.g. two open tabs syncing at once), so a repeat can't be counted twice
module.exports.advanceLaunch = (data, callback) => {
    pool.query(
        'UPDATE PlayLaunch SET counted_until_ms = ?, started = ?, is_open = ? WHERE id = ? AND counted_until_ms = ? AND started = ?',
        [data.until_ms, data.started ? 1 : 0, data.is_open ? 1 : 0, data.id, data.old_until_ms, data.old_started ? 1 : 0],
        callback);
};

// ── update note ──────────────────────────────────────────────────────────────

module.exports.updateNote = (data, callback) => {
    pool.query(
        'UPDATE Log SET note = ? WHERE id = ? AND user_id = ?',
        [data.note, data.id, data.user_id], callback
    );
};

// updates the most recent row for a song+mood — used by playlists
module.exports.updateNoteLatest = (data, callback) => {
    pool.query(
        'UPDATE Log SET note = ? WHERE user_id = ? AND song_id = ? AND mood = ? ORDER BY last_logged DESC LIMIT 1',
        [data.note, data.user_id, data.song_id, data.mood], callback
    );
};

// ── delete ───────────────────────────────────────────────────────────────────

module.exports.deleteLog = (data, callback) => {
    pool.query(
        'DELETE FROM Log WHERE id = ? AND user_id = ?',
        [data.id, data.user_id], callback
    );
};
// ── stats queries ────────────────────────────────────────────────────────────
module.exports.getStats = (data, callback) => {
    pool.query(`
        SELECT
            COUNT(*) as total_logs,
            SUM(play_count) as total_plays,
            COUNT(DISTINCT song_id) as unique_songs,
            COUNT(DISTINCT DATE(last_logged)) as days_active,
            COUNT(DISTINCT mood) as moods_used
        FROM Log WHERE user_id = ?
    `, [data.user_id], callback);
};

module.exports.getMoodBreakdown = (data, callback) => {
    pool.query(`
        SELECT mood, SUM(play_count) as total_plays, COUNT(*) as song_count
        FROM Log WHERE user_id = ?
        GROUP BY mood ORDER BY total_plays DESC, mood ASC
    `, [data.user_id], callback);
};

module.exports.getTopSongs = (data, callback) => {
    pool.query(`
        SELECT title, artist, album_art, spotify_url, SUM(play_count) as total_plays, mood
        FROM Log WHERE user_id = ?
        GROUP BY song_id, title, artist, album_art, spotify_url, mood
        ORDER BY total_plays DESC, title ASC, artist ASC, mood ASC LIMIT 5
    `, [data.user_id], callback);
};

module.exports.getTimeOfDay = (data, callback) => {
    pool.query(`
        SELECT
            SUM(CASE WHEN HOUR(last_logged) BETWEEN 5 AND 11 THEN play_count ELSE 0 END) as morning,
            SUM(CASE WHEN HOUR(last_logged) BETWEEN 12 AND 17 THEN play_count ELSE 0 END) as afternoon,
            SUM(CASE WHEN HOUR(last_logged) BETWEEN 18 AND 21 THEN play_count ELSE 0 END) as evening,
            SUM(CASE WHEN HOUR(last_logged) >= 22 OR HOUR(last_logged) < 5 THEN play_count ELSE 0 END) as late_night
        FROM Log WHERE user_id = ?
    `, [data.user_id], callback);
};

module.exports.getFlashback = (data, callback) => {
    pool.query(`
        SELECT title, artist, album_art, spotify_url, mood, SUM(play_count) as total_plays,
               MIN(last_logged) as played_at
        FROM Log
        WHERE user_id = ?
          AND last_logged BETWEEN DATE_SUB(NOW(), INTERVAL 37 DAY) AND DATE_SUB(NOW(), INTERVAL 30 DAY)
        GROUP BY song_id, title, artist, album_art, spotify_url, mood
        ORDER BY total_plays DESC, title ASC, artist ASC, mood ASC LIMIT 5
    `, [data.user_id], callback);
};