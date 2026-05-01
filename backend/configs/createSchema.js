require('dotenv').config();

const mysql = require('mysql2');

const pool = mysql.createPool({
    connectionLimit: 10,
    host:     process.env.DB_HOST,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    multipleStatements: true
});

pool.query('CREATE DATABASE IF NOT EXISTS moodtunes;', (err, results) => {
    if (err) { console.error('Error creating database:', err); }
    else     { console.log('Database created successfully'); }
    process.exit();
});
