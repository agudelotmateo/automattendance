const mongoose = require('mongoose');

const CourseSchema = mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true
    },
    students: {
        type: [String],
        required: true
    }
}, { collection: 'courses' });

const Course = module.exports = mongoose.model('Course', CourseSchema);
