const mongoose = require('mongoose');

const connect = async (MONGO_URI) => {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('[Mongoose] Connected to the database');
    } catch (e) {
        console.error(`Error connecting to the database: ${e}`);
    }
}

module.exports = connect;