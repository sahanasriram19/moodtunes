const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

const mainRoutes = require('./routes/mainRoutes');
app.use('/api', mainRoutes);

module.exports = app;
