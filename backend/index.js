require('dotenv').config();

const app = require('./src/app');

const PORT = process.env.PORT || 3000;

// log unexpected async errors instead of letting them take the whole server down
process.on('unhandledRejection', (err) => {
    console.error('Unhandled promise rejection:', err);
});

app.listen(PORT, () => {
    console.log(`moodtunes server running on port ${PORT}`);
});