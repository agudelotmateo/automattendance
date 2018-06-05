const mongoose = require('mongoose');

const AttendanceSchema = mongoose.Schema({
    course: {
        type: String,
        required: true
    },
    label: {
        type: String,
        required: true
    },
    fullName: {
        type: String,
        required: true,
        unique: true
    },
    students: {
        type: [String],
        required: true
    },
    teacher: {
        type: String,
        required: true
    },
    date: {
        type: Date,
        required: true,
        default: Date.now
    }
}, { collection: 'attendance' });

const Attendance = module.exports = mongoose.model('Attendance', AttendanceSchema);
