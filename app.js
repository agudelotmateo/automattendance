const express = require('express');
const bodyParser = require('body-parser')
const flash = require('express-flash');
const fs = require('fs-extra');
const multer = require('multer');
const passport = require('passport');
const session = require('express-session');
const ensureLoggedIn = require('connect-ensure-login').ensureLoggedIn();
const mongoose = require('mongoose');
const User = require('./models/user');
const Course = require('./models/course');
const Auth0Strategy = require('passport-auth0');
const AWS = require('aws-sdk');


const mongoURI = `mongodb://${process.env.MLAB_DB_USER}:${process.env.MLAB_DB_PASSWORD}@ds243768.mlab.com:43768/automattendance`;
mongoose.connect(mongoURI);
mongoose.connection.on("connected", () => console.log("Connected to the database!"));
mongoose.connection.on("error", err => console.log("Database connection error: " + err));

AWS.config.update({ region: 'us-east-2' });
const rekognition = new AWS.Rekognition();

const storage = multer.diskStorage({
	destination: './uploads/',
	filename: (req, file, cb) => cb(null, new Date().toISOString() + '-' + file.originalname)
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
});

const normalize = (str, extended = false) => {
	var name = '';
	for (const letter of str)
		if (letter == 'á' || letter == 'Á')
			name += 'a';
		else if (letter == 'é' || letter == 'É')
			name += 'e';
		else if (letter == 'í' || letter == 'Í')
			name += 'i';
		else if (letter == 'ó' || letter == 'Ó')
			name += 'o';
		else if (letter == 'ú' || letter == 'Ú')
			name += 'u';
		else if (letter == 'ñ' || letter == 'Ñ')
			name += 'n';
		else if (letter.match(/[A-Z]/i))
			name += letter.toLowerCase();
		else if (letter.match(/[a-z]/i) || !isNaN(letter) || extended)
			name += letter;
	return extended ? name : name.charAt(0).toUpperCase() + name.slice(1);
}
const getName = (str) => {
	var name = '';
	for (const word of str.split(' '))
		name += normalize(word);
	return name;
}
const getImage = (image, mimetype) => {
	return image ? `data:${mimetype};base64,${Buffer(image).toString('base64')}` : '';
}
var loggedIn = false;
var currentId, currentName, currentImage, currentCourses;

passport.use(new Auth0Strategy(
	{
		domain: 'agudelotmateo.auth0.com',
		clientID: 'SraODm2taygLXEVuXnF6fDhs5LyJudMW',
		clientSecret: process.env.AUTH0_SECRET,
		callbackURL: '/callback',
		responseType: 'code',
		scope: 'openid profile'
	},
	(accessToken, refreshToken, extraParam, profile, done) => {
		User.findOne({ userId: profile.user_id }, (err, user) => {
			if (err)
				return done(err, false);
			if (user) {
				currentId = user.userId;
				currentName = user.name;
				currentImage = getImage(user.image, user.mimetype);
				return done(null, user);
			} else {
				const newUser = new User({
					userId: profile.user_id,
					name: getName(profile.user_id)
				});
				newUser.save((err, user, rows) => {
					if (err)
						return done(err, false);
					currentId = user.userId;
					currentName = user.name;
					currentImage = getImage(user.image, user.mimetype);
					return done(null, user);
				});
			}
		});
	}
));
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

const app = express();
const port = process.env.PORT || 3000;
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }))
app.use(flash());
app.set('view engine', 'ejs');
app.use(session(
	{
		secret: process.env.AUTH0_SECRET,
		resave: true,
		saveUninitialized: true
	}
));
app.use(passport.initialize());
app.use(passport.session());
app.listen(port, () => console.log(`Server started on port ${port}!`));


app.get('/', (req, res, next) => res.render('index', { loggedIn }));

app.get('/login', passport.authenticate('auth0', {}), (req, res) => res.redirect("/"));

app.get('/callback', passport.authenticate('auth0', { failureRedirect: '/failure' }), (req, res) => {
	loggedIn = true;
	req.flash('success', 'Welcome!');
	res.render('index', { loggedIn });
});

app.get('/failure', (req, res) => {
	loggedIn = false;
	req.flash('danger', 'Failed to login... Please try again!');
	res.render('index', { loggedIn });
});

app.get('/logout', (req, res) => {
	req.logout();
	loggedIn = false;
	req.flash('info', 'Successfully logged out!');
	res.render('index', { loggedIn });
});

app.get('/profile', ensureLoggedIn, (req, res) => {
	res.render('profile', {
		name: currentName,
		image: currentImage,
		loggedIn
	});
});

app.post('/updateUser', ensureLoggedIn, upload.single('picture'), (req, res) => {
	const newName = getName(req.body.name);
	if (!req.file) {
		if (newName.length <= 0) {
			req.flash('danger', 'Please enter a valid name!');
			res.render('profile', {
				name: currentName,
				image: currentImage,
				loggedIn
			});
		} else {
			if (newName === currentName) {
				req.flash('info', 'No changes were made');
				res.render('profile', {
					name: currentName,
					image: currentImage,
					loggedIn
				});
			} else {
				// update name only
				User.findOne({ name: newName }, (err, user) => {
					if (err) {
						console.log(err);
						req.flash('danger', 'Failed to update the user information... Please try again!');
						res.render('profile', {
							name: currentName,
							image: currentImage,
							loggedIn
						});
					} else if (user) {
						req.flash('danger', 'That name is already in use. Please try again using a different one!');
						res.render('profile', {
							name: currentName,
							image: currentImage,
							loggedIn
						});
					} else {
						User.update({ userId: currentId }, { name: newName }, (err, user) => {
							if (err) {
								console.log(err);
								req.flash('danger', 'Failed to update the user information... Please try again!');
								res.render('profile', {
									name: currentName,
									image: currentImage,
									loggedIn
								});
							} else {
								currentName = newName;
								req.flash('success', 'User information updated successfully!');
								res.render('profile', {
									name: newName,
									image: currentImage,
									loggedIn
								});
							}
						});
					}
				});
			}
		}
	} else {
		const newMimetype = req.file.mimetype;
		const newImage = Buffer(fs.readFileSync(req.file.path).toString('base64'), 'base64');
		fs.remove(req.file.path, (err) => {
			if (err)
				console.log(err);
		});
		if (newName.length <= 0) {
			// update picture only
			User.update({ userId: currentId }, { mimetype: newMimetype, image: newImage }, (err, user) => {
				if (err) {
					console.log(err);
					req.flash('danger', 'Failed to update the user information... Please try again!');
					res.render('profile', {
						name: currentName,
						image: currentImage,
						loggedIn
					});
				} else {
					currentImage = getImage(newImage, newMimetype);
					req.flash('success', 'User information updated successfully!');
					res.render('profile', {
						name: currentName,
						image: getImage(newImage, newMimetype),
						loggedIn
					});
				}
			});
		}
		else {
			if (newName === currentName) {
				User.update({ userId: currentId }, { mimetype: newMimetype, image: newImage }, (err, user) => {
					if (err) {
						console.log(err);
						req.flash('danger', 'Failed to update the user information... Please try again!');
						res.render('profile', {
							name: currentName,
							image: currentImage,
							loggedIn
						});
					} else {
						currentImage = getImage(newImage, newMimetype);
						req.flash('success', 'User information updated successfully!');
						res.render('profile', {
							name: currentName,
							image: getImage(newImage, newMimetype),
							loggedIn
						});
					}
				});
			} else {
				// update both picture and name
				User.findOne({ name: newName }, (err, user) => {
					if (err) {
						console.log(err);
						req.flash('danger', 'Failed to update the user information... Please try again!');
						res.render('profile', {
							name: currentName,
							image: currentImage,
							loggedIn
						});
					} else if (user) {
						req.flash('danger', 'That name is already in use. Please try again using a different one!');
						res.render('profile', {
							name: currentName,
							image: currentImage,
							loggedIn
						});
					} else {
						User.update({ userId: currentId }, { name: newName, mimetype: newMimetype, image: newImage }, (err, user) => {
							if (err) {
								console.log(err);
								req.flash('danger', 'Failed to update the user information... Please try again!');
								res.render('profile', {
									name: currentName,
									image: currentImage,
									loggedIn
								});
							} else {
								currentName = newName;
								currentImage = getImage(newImage, newMimetype);
								req.flash('success', 'User information updated successfully!');
								res.render('profile', {
									name: newName,
									image: getImage(newImage, newMimetype),
									loggedIn
								});
							}
						});
					}
				});
			}
		}
	}
});

app.get('/courses', ensureLoggedIn, (req, res) => {
	Course.find({ teacher: currentId }, (err, courses) => {
		if (err) {
			req.flash('danger', 'Failed to load courses associated to this user');
			res.render('index', { loggedIn });
		} else {
			currentCourses = courses;
			res.render('courses', { courses, loggedIn });
		}
	});
});

app.post('/createCourse', ensureLoggedIn, (req, res) => {
	const newCourseName = normalize(req.body.name, true);
	if (newCourseName.length <= 0) {
		req.flash('danger', 'Please enter a valid course name!');
		res.render('courses', { courses: currentCourses, loggedIn });
	} else {
		const newFullname = `${newCourseName}@${currentId}`;
		Course.findOne({ fullName: newFullname }, (err, course) => {
			if (err) {
				req.flash('danger', 'Failed to create the course associated to this user. Please try again!');
				res.render('courses', { courses: currentCourses, loggedIn });
			} else {
				if (course) {
					req.flash('danger', 'Course name already in use. Please try again using a different name!');
					res.render('courses', { courses: currentCourses, loggedIn });
				} else {
					const newStudents = [];
					const newStudentNames = req.body.students.split(',');
					var left = newStudentNames.length;
					var cleanName;
					for (const newStudentName of newStudentNames) {
						cleanNewStudentName = getName(newStudentName);
						if (cleanNewStudentName.length > 0) {
							newStudents.push(cleanNewStudentName);
							--left;
							if (left === 0) {
								const newCourse = new Course({
									name: newCourseName,
									teacher: currentId,
									fullName: newFullname,
									students: newStudents
								});
								newCourse.save((err, course, rows) => {
									if (err) {
										console.log(err);
										req.flash('danger', 'Failed to create the course. Please try again!');
										res.render('courses', { courses: currentCourses, loggedIn });
									} else {
										Course.find({ teacher: currentId }, (err, courses) => {
											if (err) {
												req.flash('danger', 'Failed to load courses associated to this user');
												res.render('index', { loggedIn });
											} else {
												currentCourses = courses;
												req.flash('success', 'Course added successfully!');
												res.render('courses', { courses, loggedIn });
											}
										});
									}
								});
							}
						} else {
							req.flash('danger', 'Please enter a valid list of student names!');
							res.render('courses', { courses: currentCourses, loggedIn });
						}
					}
				}
			}
		});
	}
});

app.post('/uploadPicture', upload.single('picture'), (req, res) => {
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
