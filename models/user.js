const mongoose = require('mongoose');

const UserSchema = mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true
    },
    mimetype: {
        type: String
    },
    image: {
        type: Buffer
    }
}, { collection: 'users' });

const User = module.exports = mongoose.model('User', UserSchema);
