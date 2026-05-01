require('dotenv').config();

const pool = require('../src/services/db');

const SQL = `
CREATE TABLE IF NOT EXISTS User (
    id                    INT AUTO_INCREMENT PRIMARY KEY,
    username              VARCHAR(255) NOT NULL UNIQUE,
    email                 VARCHAR(255) NOT NULL UNIQUE,
    password              VARCHAR(255) NOT NULL,
    spotify_access_token  TEXT,
    spotify_refresh_token TEXT,
    created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS Log (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    user_id     INT NOT NULL,
    song_id     VARCHAR(255) NOT NULL,
    title       VARCHAR(255) NOT NULL,
    artist      VARCHAR(255) NOT NULL,
    album_art   TEXT,
    spotify_url TEXT,
    mood        VARCHAR(50) NOT NULL,
    play_count  INT DEFAULT 0,
    note        TEXT,
    first_logged TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_logged  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES User(id),
    UNIQUE KEY unique_user_song_mood (user_id, song_id, mood)
);

CREATE TABLE IF NOT EXISTS Session (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    user_id    INT NOT NULL,
    mood       VARCHAR(50) NOT NULL,
    start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    end_time   TIMESTAMP NULL,
    status     VARCHAR(20) DEFAULT 'active',
    FOREIGN KEY (user_id) REFERENCES User(id)
);

CREATE TABLE IF NOT EXISTS SessionLog (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    session_id  INT NOT NULL,
    song_id     VARCHAR(255) NOT NULL,
    title       VARCHAR(255) NOT NULL,
    artist      VARCHAR(255) NOT NULL,
    album_art   TEXT,
    spotify_url TEXT,
    played_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES Session(id)
);

CREATE TABLE IF NOT EXISTS SpotifyPlaylist (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    user_id     INT NOT NULL,
    mood        VARCHAR(50) NOT NULL,
    playlist_id VARCHAR(255) NOT NULL,
    FOREIGN KEY (user_id) REFERENCES User(id),
    UNIQUE KEY unique_user_mood (user_id, mood)
);
`;

pool.query(SQL, (err) => {
    if (err) { console.error('Error creating tables:', err); }
    else     { console.log('Tables created successfully'); }
    process.exit();
});
