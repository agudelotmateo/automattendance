const mongoose = require('mongoose');

const UserSchema = mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true
    },
    image: {
        type: Buffer,
        required: true
    }
}, { collection: 'users' });

const User = module.exports = mongoose.model('User', UserSchema);
