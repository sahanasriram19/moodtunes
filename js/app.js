// ============================================
// MOODTUNES - app.js
// Handles mood selection, spotify search,
// and song picking.
// token.js handles the spotify token separately.
// ============================================


// === STEP 1: OUR APP'S MEMORY ===
// These variables store the current state of the app.

var selectedMood = null;   // stores which mood chip is selected e.g. "happy"
var selectedSong = null;   // stores which song the user clicked from search results


// === STEP 2: FIND OUR HTML ELEMENTS ===
// We grab each element from the HTML once and store them.

var chips = document.querySelectorAll('.chip');                // all 7 mood buttons
var logBtn = document.getElementById('log-btn');               // the + log song button
var songSearch = document.getElementById('song-search');       // the search input box
var searchResults = document.getElementById('search-results'); // dropdown results area
var logsList = document.getElementById('logs-list');           // where logged songs appear


// === STEP 3: MOOD CHIP SELECTION ===
// When a mood chip is clicked:
// - remove "selected" from all chips
// - add "selected" to the one that was clicked
// - save the mood to selectedMood

chips.forEach(function(chip) {
  chip.addEventListener('click', function() {

    // remove selected from every chip
    chips.forEach(function(c) {
      c.classList.remove('selected');
    });

    // add selected to the clicked chip
    chip.classList.add('selected');

    // save which mood was picked
    selectedMood = chip.dataset.mood;

    console.log('mood selected:', selectedMood);
  });
});


// === STEP 4: SEARCH SPOTIFY ===
// Takes what the user typed and asks Spotify for matching songs.
// Returns a list of up to 5 tracks.
// Uses spotifyToken from token.js

async function searchSpotify(query) {
  // build the search url with the query
  var url = 'https://api.spotify.com/v1/search?q=' + encodeURIComponent(query) + '&type=track&limit=5';

  // send request to spotify with our token attached
  var response = await fetch(url, {
    headers: {
      'Authorization': 'Bearer ' + spotifyToken // spotifyToken comes from token.js
    }
  });

  // convert response to usable data
  var data = await response.json();

  // return just the array of tracks
  return data.tracks.items;
}


// === STEP 5: SHOW SEARCH RESULTS ===
// Takes the array of tracks from Spotify and creates
// a card for each one in the results dropdown.

function showResults(tracks) {
  // clear previous results
  searchResults.innerHTML = '';

  // if nothing came back from spotify show a message
  if (tracks.length === 0) {
    searchResults.innerHTML = '<p style="color:#666; font-size:13px;">no results found</p>';
    return;
  }

  // loop through each track spotify returned
  for (var i = 0; i < tracks.length; i++) {
    var track = tracks[i];

    // get album art url — spotify gives 3 sizes, index 1 is medium
    var albumArt = '';
    if (track.album.images.length > 0) {
      albumArt = track.album.images[1].url;
    }

    // get artist name — join multiple artists with a comma
    var artistName = track.artists.map(function(a) {
      return a.name;
    }).join(', ');

    // create a div for this result
    var item = document.createElement('div');
    item.classList.add('result-item');

    // fill the div with album art, song name, artist name
    item.innerHTML =
      '<img src="' + albumArt + '" alt="album art" />' +
      '<div>' +
        '<div class="result-title">' + track.name + '</div>' +
        '<div class="result-artist">' + artistName + '</div>' +
      '</div>';

    // when user clicks this result, save it as the selected song
    item.addEventListener('click', function(t, art, artist) {
      return function() {
        pickSong(t, art, artist);
      };
    }(track, albumArt, artistName));

    // add this card to the results dropdown
    searchResults.appendChild(item);
  }
}


// === STEP 6: PICK A SONG ===
// Called when user clicks a search result.
// Saves the song details and updates the search box.

function pickSong(track, albumArt, artistName) {
  // save the selected song as an object
  selectedSong = {
    id: track.id,
    title: track.name,
    artist: artistName,
    albumArt: albumArt
  };

  // update the input box to show the picked song
  songSearch.value = track.name + ' — ' + artistName;

  // clear the dropdown
  searchResults.innerHTML = '';

  console.log('song picked:', selectedSong.title);
}


// === STEP 7: LISTEN FOR TYPING IN SEARCH BOX ===
// Every time the user types, we wait 500ms then search.
// Waiting stops us from calling Spotify on every keypress.
// This technique is called debouncing.

var searchTimer = null; // stores our timer

songSearch.addEventListener('input', function() {
  var query = songSearch.value.trim(); // get what was typed

  // cancel the previous timer on every keypress
  clearTimeout(searchTimer);

  // if box is empty clear results and stop
  if (query.length === 0) {
    searchResults.innerHTML = '';
    return;
  }

  // wait 500ms after they stop typing then search
  searchTimer = setTimeout(function() {
    searchSpotify(query).then(function(tracks) {
      showResults(tracks);
    });
  }, 300);
});


// === STEP 8: START THE APP ===
// Fetch the spotify token as soon as the page loads.
// Defined in token.js, called here.

getSpotifyToken();

// === STEP 9: LOG A SONG ===
// Called when user clicks the "+ log song" button.
// Does 3 things:
// 1. Checks a mood and song are selected
// 2. Saves the entry to localStorage
// 3. Re-renders the logs list on screen

logBtn.addEventListener('click', function() {

  // check a mood has been picked
  if (!selectedMood) {
    alert('please pick a mood first!');
    return;
  }

  // check a song has been picked from the dropdown
  if (!selectedSong) {
    alert('please search and select a song first!');
    return;
  }

  // save the log entry
  saveLog(selectedSong, selectedMood);

  // clear the search box ready for next entry
  songSearch.value = '';
  selectedSong = null;

  // refresh the logs list on screen
  renderLogs();
});


// === STEP 10: SAVE A LOG TO LOCALSTORAGE ===
// localStorage stores data in the browser permanently.
// We store all logs as an array of objects.
// Each time we add a new log we:
// 1. Get the existing logs array
// 2. Check if this song+mood combo already exists
// 3. If yes — increment the count and update the date
// 4. If no — add a brand new entry

function saveLog(song, mood) {
  // get existing logs from localStorage
  // JSON.parse converts the stored string back into an array
  // if nothing is stored yet, start with an empty array
  var logs = JSON.parse(localStorage.getItem('moodtunes_logs') || '[]');

  // check if this exact song has already been logged under this mood
  var existing = null;
  for (var i = 0; i < logs.length; i++) {
    if (logs[i].songId === song.id && logs[i].mood === mood) {
      existing = logs[i];
      break;
    }
  }

  if (existing) {
    // song already logged under this mood — just increment count and update date
    existing.count = existing.count + 1;
    existing.lastLogged = new Date().toISOString(); // save current date and time
  } else {
    // brand new entry — add it to the front of the array
    var newLog = {
      songId: song.id,
      title: song.title,
      artist: song.artist,
      albumArt: song.albumArt,
      mood: mood,
      count: 1,
      firstLogged: new Date().toISOString(), // when it was first logged
      lastLogged: new Date().toISOString()   // when it was last logged
    };
    logs.unshift(newLog); // unshift adds to the front so newest shows first
  }

  // save the updated array back to localStorage
  // JSON.stringify converts the array into a string for storage
  localStorage.setItem('moodtunes_logs', JSON.stringify(logs));

  console.log('saved!', song.title, 'under', mood);
}


// === STEP 11: RENDER THE LOGS LIST ===
// Reads all logs from localStorage and builds
// a card for each one in the #logs-list div.
// This runs on page load and after every new log.

function renderLogs() {
  // get logs from localStorage
  var logs = JSON.parse(localStorage.getItem('moodtunes_logs') || '[]');

  // clear the current list
  logsList.innerHTML = '';

  // if no logs yet show a message
  if (logs.length === 0) {
    logsList.innerHTML = '<p style="color:#666; font-size:14px;">no songs logged yet — pick a mood and search for a song!</p>';
    return;
  }

  // loop through each log and build a card
  for (var i = 0; i < logs.length; i++) {
    var log = logs[i];

    // format the date nicely
    var date = formatDate(log.lastLogged);

    // build the card div
    var card = document.createElement('div');
    card.classList.add('log-card');

    card.innerHTML =
      '<img class="song-art" src="' + log.albumArt + '" alt="album art" />' +
      '<div class="song-info">' +
        '<div class="song-title">' + log.title + '</div>' +
        '<div class="song-artist">' + log.artist + '</div>' +
        '<div class="log-meta">' +
          '<span class="mood-badge">' + log.mood + '</span>' +
          '<span class="plays-text">logged ' + log.count + ' time' + (log.count > 1 ? 's' : '') + '</span>' +
          '<span class="date-text">' + date + '</span>' +
        '</div>' +
      '</div>';

    // add the card to the logs list
    logsList.appendChild(card);
  }
}


// === STEP 12: FORMAT DATE ===
// Takes an ISO date string and returns
// a readable string like "today", "yesterday", or "Apr 20"

function formatDate(isoString) {
  var logDate = new Date(isoString);
  var today = new Date();

  // check if it was today
  if (logDate.toDateString() === today.toDateString()) {
    return 'today';
  }

  // check if it was yesterday
  var yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (logDate.toDateString() === yesterday.toDateString()) {
    return 'yesterday';
  }

  // otherwise show the date e.g. "Apr 20"
  return logDate.toLocaleDateString('en-SG', { month: 'short', day: 'numeric' });
}


// === STEP 13: LOAD LOGS ON PAGE START ===
// When the page loads, render any existing logs
// so they show up straight away.

renderLogs();