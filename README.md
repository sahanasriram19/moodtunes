# moodtunes 🎵

A music mood journal that connects to your Spotify account. Log songs by how they make you feel, build mood-based playlists, track your listening history, and discover new music based on your taste.

Built as a personal portfolio project to explore full-stack development with real-world API integrations.

---

## Features

### Journal
- Pick a mood (happy, sad, hype, heartbreak, nostalgic, focused, chill) and search for songs via Spotify
- Log songs under that mood with an optional personal note about how you're feeling
- View your recently played tracks with timestamps and play counts
- Play counts automatically sync from Spotify when you return to the app

### Playlists
- Songs are automatically grouped into mood-based playlists
- Sync any mood playlist to a real playlist in your Spotify account with one click
- Playlists update on Spotify every time you sync

### Sessions
- Start a listening session for a chosen mood
- Get real-time song recommendations based on your most-played songs in that mood (powered by Last.fm's similarity engine + Spotify search for album art)
- Log songs as you listen during the session
- End the session to see a summary of everything you listened to

### History
- Overview stats: total songs logged, total plays, and your top mood
- "Flashback" card showing what you were listening to a month ago
- Full timeline of logged songs grouped by date
- Session history with the ability to delete sessions or individual songs

### Spotify integration
- OAuth login connects your real Spotify account
- Recently played sync, playlist creation/sync, and (for Premium users) queueing songs directly to your Spotify queue

---

## Tech stack

**Frontend**
- HTML, CSS, vanilla JavaScript (no frameworks)
- Spotify Web API (Client Credentials flow for search, OAuth for user data)
- Last.fm API for music recommendations

**Backend**
- Node.js + Express
- MySQL (via mysql2)
- JWT authentication + bcrypt password hashing
- Spotify OAuth (Authorization Code flow)

---

## Project structure

```
moodtunes-main/
├── backend/
│   ├── .env                       # environment variables (not committed)
│   ├── index.js                   # server entry point
│   ├── configs/
│   │   ├── createSchema.js
│   │   └── initTables.js
│   └── src/
│       ├── app.js                 # express app setup, CORS
│       ├── services/
│       │   └── db.js              # mysql2 connection pool
│       ├── middlewares/
│       │   ├── jwtMiddleware.js
│       │   ├── bcryptMiddleware.js
│       │   └── response.js
│       ├── models/
│       │   ├── userModel.js
│       │   ├── logModel.js
│       │   └── sessionModel.js
│       ├── controllers/
│       │   ├── userController.js
│       │   ├── logController.js
│       │   ├── sessionController.js
│       │   └── spotifyController.js
│       └── routes/
│           ├── authRoutes.js
│           ├── logRoutes.js
│           ├── sessionRoutes.js
│           ├── spotifyRoutes.js
│           └── mainRoutes.js
└── moodtunes/                      # frontend
    ├── index.html                  # journal page
    ├── playlists.html
    ├── history.html
    ├── discover.html
    ├── login.html
    ├── css/
    │   ├── style.css
    │   ├── playlists.css
    │   ├── history.css
    │   ├── discover.css
    │   └── auth.css
    └── js/
        ├── app.js                  # journal page logic
        ├── config.js               # API keys (not committed)
        ├── token.js                 # spotify client credentials token
        ├── auth.js
        ├── playlists.js
        ├── history.js
        └── discover.js
```

---

## Database schema

| Table | Description |
|---|---|
| `User` | id, username, email, password (hashed), spotify_access_token, spotify_refresh_token |
| `Log` | id, user_id, song_id, title, artist, album_art, spotify_url, mood, play_count, note, first_logged, last_logged |
| `Session` | id, user_id, mood, start_time, end_time, status |
| `SessionLog` | id, session_id, song_id, title, artist, album_art, spotify_url, played_at |
| `SpotifyPlaylist` | id, user_id, mood, playlist_id (unique on user_id + mood) |

---

## Setup

### Prerequisites
- Node.js
- MySQL Server
- A Spotify Developer account (for API credentials)
- A Last.fm API account

### 1. Clone and install

```bash
git clone <repo-url>
cd moodtunes-main/backend
npm install
```

### 2. Set up the database

```bash
cd "C:\Program Files\MySQL\MySQL Server 8.0\bin"
.\mysql -u root -p
```

```sql
CREATE DATABASE moodtunes;
```

Then run the table creation scripts:

```bash
node configs/createSchema.js
node configs/initTables.js
```

### 3. Configure environment variables

Create a `.env` file in `backend/`:

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_DATABASE=moodtunes

JWT_SECRET_KEY=your_jwt_secret
JWT_EXPIRES_IN=7d
JWT_ALGORITHM=HS256

SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
SPOTIFY_REDIRECT_URI=http://127.0.0.1:3000/api/spotify/callback

PORT=3000
```

### 4. Configure Spotify app

In your [Spotify Developer Dashboard](https://developer.spotify.com/dashboard):
- Create an app
- Add `http://127.0.0.1:3000/api/spotify/callback` as a redirect URI
- Copy the Client ID and Client Secret into `.env`

### 5. Configure frontend

Create `moodtunes/js/config.js`:

```javascript
const CONFIG = {
    SPOTIFY_CLIENT_ID: 'your_spotify_client_id',
    SPOTIFY_CLIENT_SECRET: 'your_spotify_client_secret',
    LASTFM_API_KEY: 'your_lastfm_api_key'
};
```

### 6. Run the app

Backend:
```bash
cd backend
node index.js
```

Frontend (from `moodtunes/`):
```bash
npx live-server
```

The frontend runs on `http://127.0.0.1:8080` and the backend on `http://localhost:3000`.

---

## How it works

### Authentication
Users register and log in with a username/email and password (hashed with bcrypt). A JWT is issued on login and stored in `localStorage`, then sent as a Bearer token on every API request.

### Spotify connection
After logging into moodtunes, users are redirected to Spotify to authorize the app with these scopes:

- `playlist-modify-public`
- `playlist-modify-private`
- `user-read-recently-played`
- `user-read-playback-state`
- `user-modify-playback-state`
- `user-library-read`

The resulting access and refresh tokens are stored against the user's account and refreshed automatically when they expire.

### Recommendations
During a session, moodtunes takes your most-played song in the current mood and asks Last.fm for similar tracks. Each recommended track is then searched on Spotify to retrieve its album art and link.

---

## Known limitations

- Spotify's queue and playback APIs require an active Spotify session on a device — moodtunes can add songs to your queue, but cannot force playback to start from the browser.
- Clicking a song opens Spotify directly, which means Spotify's own "continue with album" behaviour applies — this is a platform limitation, not something moodtunes controls.
- The Spotify Recommendations endpoint was deprecated for new apps in late 2024, so Last.fm is used as the recommendation source instead.

---

## Future improvements

- [ ] PWA support for installing on mobile
- [ ] Deploy frontend to GitHub Pages / Vercel
- [ ] Deploy backend to Render
- [ ] Hosted MySQL database
- [ ] Zodiac/cosmos-themed mood visualization
- [ ] Screenshots and demo walkthrough

---

## Author

Built by Sahana, a Year 2 Information Technology student, as a personal portfolio project exploring full-stack development, OAuth integrations, and music APIs.