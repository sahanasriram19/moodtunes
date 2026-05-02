const express = require('express');
const cors    = require('cors');

const app = express();

app.use(cors({
    origin: [
        'https://proactive-kindness-production.up.railway.app',
        'https://moodtunes-app.netlify.app',
        'https://zippy-douhua-deac4c.netlify.app',
        'http://127.0.0.1:5500',
        'http://localhost:5500'
    ],
    credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const mainRoutes = require('./routes/mainRoutes');
app.use('/api', mainRoutes);

module.exports = app;