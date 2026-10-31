const express = require('express');
const cors = require('cors');

const app = express();

app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use((req, res, next) => {
    res.set({
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'no-referrer',
        'Strict-Transport-Security': 'max-age=15552000; includeSubDomains'
    });
    next();
});

const APP_ORIGIN = (process.env.APP_URL || 'https://moodtunes-main.vercel.app').replace(/\/+$/, '');

app.use(cors({
    origin: [
        APP_ORIGIN,
        'https://moodtunes-main.vercel.app',
        'https://moodtunes-rust.vercel.app',
        'http://127.0.0.1:5500',
        'http://localhost:5500'
    ],
    credentials: true
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

app.get('/api/health', (req, res) => {
    res.json({ ok: true, dailyLogs: require('./models/logModel').dailyLogsStatus });
});

const mainRoutes = require('./routes/mainRoutes');
app.use('/api', mainRoutes);

app.use((err, req, res, next) => {
    console.error(req.method + ' ' + req.originalUrl + ' failed:', err);
    if (res.headersSent) return next(err);
    res.status(500).json({ message: 'Internal server error' });
});

module.exports = app;