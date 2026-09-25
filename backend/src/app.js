const express = require('express');
const cors    = require('cors');

const app = express();

app.use(cors({
    origin: [
        'https://moodtunes-rust.vercel.app',
        'http://127.0.0.1:5500',
        'http://localhost:5500'
    ],
    credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// open https://<your-backend>/api/health in a browser to check the server is up
// and that the one-log-per-day database upgrade finished
app.get('/api/health', (req, res) => {
    res.json({ ok: true, dailyLogs: require('./models/logModel').dailyLogsStatus });
});

const mainRoutes = require('./routes/mainRoutes');
app.use('/api', mainRoutes);

// any unexpected error comes back as JSON (with the CORS headers above), so the
// app can show what went wrong instead of failing to read the response
app.use((err, req, res, next) => {
    console.error(req.method + ' ' + req.originalUrl + ' failed:', err);
    if (res.headersSent) return next(err);
    res.status(500).json({ message: 'Internal server error' });
});

module.exports = app;