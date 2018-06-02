const express = require('express');
const bodyParser = require('body-parser')
const fs = require('fs-extra');
const multer = require('multer');
const mongoose = require('mongoose');
const User = require('./models/user');
const Course = require('./models/course');
const AWS = require('aws-sdk');


const url = `mongodb://${process.env.MLAB_DB_USER}:${process.env.MLAB_DB_PASSWORD}@ds243768.mlab.com:43768/automattendance`;
mongoose.connect(url);
mongoose.connection.on("connected", () => console.log("Connected to the " + url + " database!"));
mongoose.connection.on("error", err => console.log("Database connection error: " + err));

AWS.config.update({
	region: 'us-east-2'
});
const rekognition = new AWS.Rekognition();

const storage = multer.diskStorage({
	destination: './uploads/',
	filename: (req, file, cb) => {
		cb(null, new Date().toISOString() + '-' + file.originalname);
	}
});
const upload = multer({
	storage: storage,
	limits: { fileSize: 1024 * 1024 * 14 },
	fileFilter: (req, file, cb) => {
		if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/png')
			cb(null, true);
		else
			cb('Only jpeg/jpg or png files!', false);
	}
}); // .single / .array

const app = express();
const port = process.env.PORT || 3000;
app.use(bodyParser.urlencoded({ extended: false }))
app.set('view engine', 'ejs');
app.listen(port, () => {
    console.log(`Server started on port ${port}!`);
});


app.get('/', (req, res, next) => {
	res.render('index', { title: 'Test', message: '' });
});

app.post('/createStudent', upload.single('picture'), (req, res) => {
	if (!req.file) {
		res.render('index', { title: 'Test', message: 'Please select a picture to submit!' });
	} else {
		const user = new User({
			name: req.body.name,
			image: Buffer(fs.readFileSync(req.file.path).toString('base64'), 'base64')
		});
		fs.remove(req.file.path, (err) => {
			if (err) {
				console.log(err);
			}
		});
		user.save((err, doc, rows) => {
			if (err) {
				console.log(err);
				res.render('index', { title: 'Test', message: "Student couldn't be created... (duplicated name?)" });
			} else {
				res.render('index', { title: 'Test', message: 'Student created succesfully!!' });
			}
		});
	}
});

app.post('/createCourse', (req, res) => {
    console.log(req.body);
	const students = [];
	for (const name of req.body.students.split(',')) {
		students.push(name);
	}
	const course = new Course({
		name: req.body.name,
		students: students
	});
	course.save((err, doc, rows) => {
		if (err) {
			console.log(err);
			res.render('index', { title: 'Test', message: "Course couldn't be created... (duplicated name?)" });
		} else {
			res.render('index', { title: 'Test', message: 'Course created succesfully!!' });
		}
	});
});

app.post('/upload', upload.single('picture'), (req, res) => {
	if (!req.file) {
		res.render('index', { title: 'Test', message: 'Please select a picture to submit!' });
	} else {
		const image = Buffer(fs.readFileSync(req.file.path).toString('base64'), 'base64');
		fs.remove(req.file.path, (err) => {
			if (err) {
				console.log(err);
			}
		});
		Course.findOne({ name: req.body.name }, (err, results) => {
			if (err || results == null) {
				console.log(err);
				res.render('index', { title: 'Test', message: 'Course not found' });
			} else {
				var message = 'Students found in the image:';
				var left = results.students.length;
				for (const name of results.students) {
					User.findOne({ name: name.trim() }, (err, results) => {
						if (err) {
							console.log(err, err.stack);
						} else {
							if (results == null) {
								--left;
							} else {
								rekognition.compareFaces({ SimilarityThreshold: 70, TargetImage: { Bytes: image }, SourceImage: { Bytes: results.image } }, (err, data) => {
									if (err) {
										console.log(err);
									} else {
										if (data.FaceMatches.length > 0) {
											message = message.concat(' ', results.name);
										}
									}
									if (--left == 0) {
										res.render('index', { title: 'Test', message: message });
									}
								});
							}
						}
					});
				}
			}
		});
	}
});
