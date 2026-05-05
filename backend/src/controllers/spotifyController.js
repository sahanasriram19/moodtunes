require('dotenv').config();

const axios     = require('axios');
const userModel = require('../models/userModel');

const CLIENT_ID     = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI  = process.env.SPOTIFY_REDIRECT_URI;

// ── helpers ────────────────────────────────────────────────────────────────

function getAlbumArt(images) {
    if (!images || images.length === 0) return '';
    return (images[1] && images[1].url) ? images[1].url : images[0].url;
}

function trackToObj(track) {
    return {
        id:         track.id,
        title:      track.name,
        artist:     track.artists.map(function(a) { return a.name; }).join(', '),
        albumArt:   getAlbumArt(track.album.images),
        spotifyUrl: track.external_urls.spotify
    };
}

function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
}

// ── token management ───────────────────────────────────────────────────────

module.exports.getUserToken = (userId, callback) => {
    userModel.getSpotifyTokens({ user_id: userId }, (err, results) => {
        if (err || !results.length || !results[0].spotify_access_token) {
            return callback(new Error('Spotify not connected'));
        }
        callback(null, results[0].spotify_access_token);
    });
};

module.exports.refreshToken = (userId, callback) => {
    userModel.getSpotifyTokens({ user_id: userId }, (err, results) => {
        if (err || !results.length || !results[0].spotify_refresh_token) {
            return callback(new Error('No refresh token'));
        }
        const creds = Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64');
        axios.post('https://accounts.spotify.com/api/token',
            new URLSearchParams({ grant_type: 'refresh_token', refresh_token: results[0].spotify_refresh_token }).toString(),
            { headers: { 'Authorization': 'Basic ' + creds, 'Content-Type': 'application/x-www-form-urlencoded' } }
        )
        .then(function(r) {
            const newToken = r.data.access_token;
            userModel.saveSpotifyTokens({
                user_id: userId,
                spotify_access_token: newToken,
                spotify_refresh_token: results[0].spotify_refresh_token
            }, function(saveErr) { callback(saveErr, newToken); });
        })
        .catch(callback);
    });
};

// Wraps a Spotify API call, auto-refreshing on 401
function spotifyGet(url, userId, callback) {
    const self = module.exports;
    self.getUserToken(userId, function(err, token) {
        if (err) return callback(err);
        axios.get(url, { headers: { 'Authorization': 'Bearer ' + token } })
        .then(function(r) { callback(null, r.data); })
        .catch(function(e) {
            if (e.response && e.response.status === 401) {
                self.refreshToken(userId, function(refreshErr, newToken) {
                    if (refreshErr) return callback(refreshErr);
                    axios.get(url, { headers: { 'Authorization': 'Bearer ' + newToken } })
                    .then(function(r2) { callback(null, r2.data); })
                    .catch(callback);
                });
            } else {
                callback(e);
            }
        });
    });
}

// ── OAuth flow ─────────────────────────────────────────────────────────────

module.exports.redirectToSpotify = (req, res, next) => {
    const token = req.query.token;
    if (!token) return res.status(400).json({ message: 'No token provided' });

    const jwt = require('jsonwebtoken');
    jwt.verify(token, process.env.JWT_SECRET_KEY, function(err, decoded) {
        if (err) return res.status(401).json({ message: 'Invalid token' });

        const scope = [
            'playlist-modify-public',
            'playlist-modify-private',
            'user-read-recently-played',
            'user-read-playback-state',
            'user-modify-playback-state',
            'user-library-read'
        ].join(' ');

        const params = new URLSearchParams({
            response_type: 'code',
            client_id:     CLIENT_ID,
            scope:         scope,
            redirect_uri:  REDIRECT_URI,
            state:         decoded.userId.toString(),
            show_dialog:   'true'
        });

        res.redirect('https://accounts.spotify.com/authorize?' + params.toString());
    });
};

module.exports.handleCallback = (req, res, next) => {
    const code   = req.query.code;
    const userId = req.query.state;
    if (!code) return res.redirect('https://moodtunes-sahana.up.railway.app/index.html?spotify=error');

    const creds = Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64');
    axios.post('https://accounts.spotify.com/api/token',
        new URLSearchParams({ grant_type: 'authorization_code', code: code, redirect_uri: REDIRECT_URI }).toString(),
        { headers: { 'Authorization': 'Basic ' + creds, 'Content-Type': 'application/x-www-form-urlencoded' } }
    )
    .then(function(r) {
        userModel.saveSpotifyTokens({
            user_id: userId,
            spotify_access_token:  r.data.access_token,
            spotify_refresh_token: r.data.refresh_token
        }, function(err) {
            if (err) return res.redirect('https://moodtunes-sahana.up.railway.app/index.html?spotify=error');
            res.redirect('https://moodtunes-sahana.up.railway.app/index.html?spotify=connected');
        });
    })
    .catch(function(e) {
        console.error('Callback error:', e.response ? e.response.data : e.message);
        res.redirect('https://moodtunes-sahana.up.railway.app/index.html?spotify=error');
    });
};

// ── check connection ───────────────────────────────────────────────────────

module.exports.checkConnection = (req, res, next) => {
    userModel.getSpotifyTokens({ user_id: res.locals.userId }, (err, results) => {
        if (err) return res.status(500).json({ message: 'Internal server error' });
        const connected = results.length > 0 && !!results[0].spotify_access_token;
        res.status(200).json({ connected: connected });
    });
};

// ── recently played ────────────────────────────────────────────────────────

module.exports.getRecentlyPlayed = (req, res, next) => {
    spotifyGet('https://api.spotify.com/v1/me/player/recently-played?limit=50', res.locals.userId, function(err, data) {
        if (err) return res.status(500).json({ message: 'Failed to get recently played' });
        res.status(200).json(data.items);
    });
};

// ── mood audio feature targets ─────────────────────────────────────────────
// valence: happiness (0-1), energy: intensity (0-1),
// danceability: rhythm (0-1), acousticness (0-1), tempo: BPM

const MOOD_FEATURES = {
    happy:      { valence: 0.8,  energy: 0.7,  danceability: 0.7, acousticness: 0.2, tempo: 120 },
    sad:        { valence: 0.2,  energy: 0.3,  danceability: 0.3, acousticness: 0.6, tempo: 75  },
    hype:       { valence: 0.7,  energy: 0.9,  danceability: 0.8, acousticness: 0.1, tempo: 140 },
    heartbreak: { valence: 0.15, energy: 0.35, danceability: 0.3, acousticness: 0.5, tempo: 80  },
    nostalgic:  { valence: 0.45, energy: 0.4,  danceability: 0.4, acousticness: 0.5, tempo: 95  },
    focused:    { valence: 0.5,  energy: 0.55, danceability: 0.4, acousticness: 0.3, tempo: 110 },
    chill:      { valence: 0.55, energy: 0.35, danceability: 0.45,acousticness: 0.5, tempo: 90  },
};

// ── recommendations — uses Spotify Recommendations API with mood audio features
module.exports.getRecommendations = (req, res, next) => {
    const userId = res.locals.userId;
    const artist = req.query.artist;
    const title  = req.query.title;
    const seeds  = req.query.seeds ? req.query.seeds.split('||') : [];
    const mood   = req.query.mood || null;
    const self   = module.exports;

    if (!artist || !title) return res.status(400).json({ message: 'artist and title required' });

    const features = (mood && MOOD_FEATURES[mood.toLowerCase()]) ? MOOD_FEATURES[mood.toLowerCase()] : null;

    self.refreshToken(userId, function(refreshErr, freshToken) {
        const useToken = (!refreshErr && freshToken) ? freshToken : null;

        if (!useToken) {
            self.getUserToken(userId, function(err, storedToken) {
                if (err) return res.status(401).json({ message: 'Spotify not connected' });
                doRecs(storedToken);
            });
        } else {
            doRecs(useToken);
        }

        function doRecs(token) {
            const h = { 'Authorization': 'Bearer ' + token };

            // Step 1: resolve seed track + up to 4 seed artists to Spotify IDs
            var artistsToResolve = [artist].concat(seeds.slice(0, 4)).slice(0, 5);
            var searchPromises = artistsToResolve.map(function(a) {
                return axios.get('https://api.spotify.com/v1/search?q=' + encodeURIComponent(a) + '&type=artist&limit=1', { headers: h })
                    .then(function(r) {
                        return r.data.artists.items.length > 0 ? r.data.artists.items[0].id : null;
                    }).catch(function() { return null; });
            });

            // Also resolve the seed track ID
            var trackPromise = axios.get('https://api.spotify.com/v1/search?q=' + encodeURIComponent(title + ' ' + artist) + '&type=track&limit=1', { headers: h })
                .then(function(r) {
                    return r.data.tracks.items.length > 0 ? r.data.tracks.items[0].id : null;
                }).catch(function() { return null; });

            Promise.all([trackPromise, Promise.all(searchPromises)])
            .then(function(results) {
                var seedTrackId = results[0];
                var seedArtistIds = results[1].filter(Boolean);

                // Build seed params — Spotify allows max 5 seeds total (tracks + artists combined)
                var seedTracks  = seedTrackId ? [seedTrackId] : [];
                var seedArtists = seedArtistIds.slice(0, 5 - seedTracks.length);

                if (seedTracks.length === 0 && seedArtists.length === 0) {
                    return res.status(500).json({ message: 'Could not resolve any seed tracks or artists' });
                }

                // Step 2: call Spotify Recommendations API with mood audio targets
                var params = 'limit=30&market=SG';
                if (seedTracks.length > 0)  params += '&seed_tracks='  + seedTracks.join(',');
                if (seedArtists.length > 0) params += '&seed_artists=' + seedArtists.join(',');

                if (features) {
                    params += '&target_valence='      + features.valence;
                    params += '&target_energy='       + features.energy;
                    params += '&target_danceability=' + features.danceability;
                    params += '&target_acousticness=' + features.acousticness;
                    params += '&target_tempo='        + features.tempo;
                }

                return axios.get('https://api.spotify.com/v1/recommendations?' + params, { headers: h });
            })
            .then(function(r) {
                if (!r || !r.data || !r.data.tracks) return res.status(500).json({ message: 'No recommendations returned' });
                var tracks = r.data.tracks.map(trackToObj);
                res.status(200).json({ tracks: shuffle(tracks) });
            })
            .catch(function(e) {
                console.error('Recommendations error:', e.response ? e.response.data : e.message);
                res.status(500).json({ message: 'Failed to get recommendations' });
            });
        }
    });
};

// ── search track (for album art lookup) ───────────────────────────────────

module.exports.searchTrack = (req, res, next) => {
    const userId = res.locals.userId;
    const query  = req.query.q;
    if (!query) return res.status(400).json({ message: 'query required' });

    spotifyGet('https://api.spotify.com/v1/search?q=' + encodeURIComponent(query) + '&type=track&limit=1', userId, function(err, data) {
        if (err) return res.status(500).json({ message: 'Search failed' });
        const items = data.tracks.items;
        if (!items || items.length === 0) return res.status(404).json({ message: 'Not found' });
        const track = items[0];
        res.status(200).json({ albumArt: getAlbumArt(track.album.images), spotifyUrl: track.external_urls.spotify });
    });
};

// ── sync playlist to Spotify ───────────────────────────────────────────────

module.exports.syncPlaylist = (req, res, next) => {
    const userId = res.locals.userId;
    const mood   = req.body.mood;
    const songs  = req.body.songs;
    if (!mood || !songs) return res.status(400).json({ message: 'mood and songs required' });

    module.exports.getUserToken(userId, function(err, token) {
        if (err) return res.status(401).json({ message: 'Spotify not connected' });
        const headers = { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' };

        function getUris() {
            return songs.map(function(s) {
                const id = s.spotify_url.split('/track/')[1];
                return id ? 'spotify:track:' + id.split('?')[0] : null;
            }).filter(Boolean);
        }

        axios.get('https://api.spotify.com/v1/me', { headers: headers })
        .then(function(r) {
            const spotifyUserId = r.data.id;
            userModel.getSpotifyPlaylistId({ user_id: userId, mood: mood }, function(dbErr, rows) {
                // if table doesn't exist yet, treat it as no existing playlist
                const existingId = (!dbErr && rows && rows.length > 0) ? rows[0].playlist_id : null;

                if (existingId) {
                    // update existing
                    const uris = getUris();
                    axios.put('https://api.spotify.com/v1/playlists/' + existingId + '/tracks',
                        { uris: uris }, { headers: headers }
                    )
                    .then(function() {
                        res.status(200).json({ message: 'Playlist updated', playlist_url: 'https://open.spotify.com/playlist/' + existingId });
                    })
                    .catch(function() { res.status(500).json({ message: 'Failed to update playlist' }); });
                } else {
                    // create new
                    axios.post('https://api.spotify.com/v1/users/' + spotifyUserId + '/playlists',
                        { name: 'moodtunes — ' + mood, description: 'your ' + mood + ' playlist, built by moodtunes', public: false },
                        { headers: headers }
                    )
                    .then(function(r2) {
                        const playlistId  = r2.data.id;
                        const playlistUrl = r2.data.external_urls.spotify;
                        userModel.saveSpotifyPlaylistId({ user_id: userId, mood: mood, playlist_id: playlistId }, function() {});
                        const uris = getUris();
                        if (uris.length === 0) return res.status(200).json({ message: 'Playlist created', playlist_url: playlistUrl });
                        axios.post('https://api.spotify.com/v1/playlists/' + playlistId + '/tracks',
                            { uris: uris }, { headers: headers }
                        )
                        .then(function() { res.status(200).json({ message: 'Playlist created and synced', playlist_url: playlistUrl }); })
                        .catch(function() { res.status(500).json({ message: 'Playlist created but failed to add songs' }); });
                    })
                    .catch(function(e) {
                        console.error('Create playlist error:', e.response ? e.response.data : e.message);
                        res.status(500).json({ message: 'Failed to create playlist' });
                    });
                }
            });
        })
        .catch(function(e) {
            if (e.response && e.response.status === 401) {
                module.exports.refreshToken(userId, function(refreshErr) {
                    if (refreshErr) return res.status(401).json({ message: 'Token refresh failed' });
                    module.exports.syncPlaylist(req, res, next);
                });
            } else {
                console.error('syncPlaylist /me error:', e.response ? JSON.stringify(e.response.data) : e.message);
                res.status(500).json({ message: 'Failed to get Spotify user: ' + (e.response ? e.response.status : e.message) });
            }
        });
    });
};

// ── check premium ──────────────────────────────────────────────────────────

module.exports.checkPremium = (req, res, next) => {
    spotifyGet('https://api.spotify.com/v1/me', res.locals.userId, function(err, data) {
        if (err) return res.status(500).json({ message: 'Failed to check premium' });
        res.status(200).json({ premium: data.product === 'premium', product: data.product });
    });
};

// ── add to queue ───────────────────────────────────────────────────────────

module.exports.addToQueue = (req, res, next) => {
    const userId     = res.locals.userId;
    const spotifyUrl = req.body.spotify_url;
    if (!spotifyUrl) return res.status(400).json({ message: 'spotify_url required' });

    const parts   = spotifyUrl.split('/track/');
    const trackId = parts[1] ? parts[1].split('?')[0] : null;
    if (!trackId) return res.status(400).json({ message: 'Invalid spotify url' });

    const uri = 'spotify:track:' + trackId;

    module.exports.getUserToken(userId, function(err, token) {
        if (err) return res.status(401).json({ message: 'Spotify not connected' });

        axios.post('https://api.spotify.com/v1/me/player/queue?uri=' + encodeURIComponent(uri), {},
            { headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' } }
        )
        .then(function() { res.status(200).json({ message: 'Added to queue' }); })
        .catch(function(e) {
            if (e.response && e.response.status === 401) {
                module.exports.refreshToken(userId, function(refreshErr, newToken) {
                    if (refreshErr) return res.status(401).json({ message: 'Token refresh failed' });
                    axios.post('https://api.spotify.com/v1/me/player/queue?uri=' + encodeURIComponent(uri), {},
                        { headers: { 'Authorization': 'Bearer ' + newToken } }
                    )
                    .then(function() { res.status(200).json({ message: 'Added to queue' }); })
                    .catch(function() { res.status(500).json({ message: 'Failed to queue song' }); });
                });
            } else if (e.response && e.response.status === 403) {
                res.status(403).json({ message: 'Premium required' });
            } else {
                res.status(500).json({ message: 'Failed to queue song' });
            }
        });
    });
};
// ── manual token refresh endpoint ─────────────────────────────────────────
module.exports.refreshUserToken = (req, res, next) => {
    const userId = res.locals.userId;
    module.exports.refreshToken(userId, function(err, newToken) {
        if (err) return res.status(401).json({ message: 'Token refresh failed' });
        res.status(200).json({ message: 'Token refreshed' });
    });
};