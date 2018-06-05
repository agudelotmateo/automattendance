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
const Attendance = require('./models/attendance');
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

const normalize = (str) => {
	var name = '';
	for (const letter of str)
		if (letter === 'á')
			name += 'a';
		else if (letter === 'Á')
			name += 'A';
		else if (letter === 'é')
			name += 'e';
		else if (letter === 'É')
			name += 'E';
		else if (letter === 'í')
			name += 'i';
		else if (letter === 'Í')
			name += 'I';
		else if (letter === 'ó')
			name += 'o';
		else if (letter === 'Ó')
			name += 'O';
		else if (letter === 'ú')
			name += 'u';
		else if (letter === 'Ú')
			name += 'U';
		else if (letter === 'ñ')
			name += 'n';
		else if (letter === 'Ñ')
			name += 'N'
		else if (letter.match(/[a-z]/i) || !isNaN(letter))
			name += letter;
	return name;
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
var currentId, currentName, currentImage, currentCourses, currentAttendances;

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

app.use(express.static(__dirname + '/views'));

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
	if (loggedIn) {
		req.flash('info', 'Successfully logged out!');
		loggedIn = false;
	}
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
				req.flash('info', 'NO changes were made');
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
			console.log(err);
			req.flash('danger', 'Failed to load courses associated to this user');
			res.render('index', { loggedIn });
		} else {
			currentCourses = courses;
			res.render('courses', { courses, loggedIn });
		}
	});
});

app.post('/createCourse', ensureLoggedIn, (req, res) => {
	const newCourseName = req.body.name.trim();
	if (newCourseName.length <= 0) {
		req.flash('danger', 'Please enter a valid course name!');
		res.render('courses', { courses: currentCourses, loggedIn });
	} else {
		const newFullname = `${newCourseName}@${currentId}`;
		Course.findOne({ fullName: newFullname }, (err, course) => {
			if (err) {
				console.log(err);
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
							if (--left === 0) {
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
												console.log(err);
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

app.post('/deleteCourse', ensureLoggedIn, (req, res) => {
	const newFullname = `${req.body.name.trim()}@${currentId}`;
	Course.find({ fullName: newFullname }, (err, courses) => {
		if (err) {
			console.log(err);
			req.flash('danger', 'Failed to delete the course. Please try again!');
			res.render('courses', { courses: currentCourses, loggedIn });
		} else if (courses.length <= 0) {
			req.flash('info', 'Such course does NOT exist. NO changes were made');
			res.render('courses', { courses: currentCourses, loggedIn });
		} else {
			Course.deleteMany({ fullName: newFullname }, (err, course) => {
				if (err) {
					console.log(err);
					req.flash('danger', 'Failed to delete the course. Please try again!');
					res.render('courses', { courses: currentCourses, loggedIn });
				} else {
					Course.find({ teacher: currentId }, (err, courses) => {
						if (err) {
							console.log(err);
							req.flash('danger', 'Failed to load courses associated to this user');
							res.render('index', { loggedIn });
						} else {
							currentCourses = courses;
							req.flash('success', 'Course deleted successfully!');
							res.render('courses', { courses, loggedIn });
						}
					});
				}
			});
		}
	});
});

app.get('/attendance', ensureLoggedIn, (req, res) => {
	Course.find({ teacher: currentId }, (err, courses) => {
		if (err) {
			console.log(err);
			req.flash('danger', 'Failed to load courses associated to this user');
			res.render('index', { loggedIn });
		} else {
			currentCourses = courses;
			Attendance.find({teacher: currentId}, (err, attendances) => {
				if (err) {
					req.flash('danger', 'Failed to load attendance registers associated to this user');
					res.render('index', { loggedIn });
				} else {
					currentAttendances = attendances;
					res.render('attendance', { courses, attendances, loggedIn });
				}
			});
		}
	});
});

app.get('/registers', ensureLoggedIn, (req, res) => {
	Course.find({ teacher: currentId }, (err, courses) => {
		if (err) {
			console.log(err);
			req.flash('danger', 'Failed to load courses associated to this user');
			res.render('index', { loggedIn });
		} else {
			currentCourses = courses;
			Attendance.find({teacher: currentId}, (err, attendances) => {
				if (err) {
					req.flash('danger', 'Failed to load attendance registers associated to this user');
					res.render('index', { loggedIn });
				} else {
					currentAttendances = attendances;
					res.render('registers', { courses, attendances, loggedIn });
				}
			});
		}
	});
});

app.post('/manageAttendance', ensureLoggedIn, upload.single('picture'), (req, res) => {
	if (!req.file) {
		req.flash('danger', 'Please select a picture to submit!');
		res.render('attendance', { courses: currentCourses, attendances: currentAttendances, loggedIn });
	} else {
		const newCourseName = req.body.name.trim();
		if (newCourseName.length <= 0) {
			req.flash('danger', 'Please enter a valid course name!');
			res.render('attendance', { courses: currentCourses, attendances: currentAttendances, loggedIn });
		} else {
			const newCourseFullName = `${newCourseName}@${currentId}`;
			Course.find({ fullName: newCourseFullName }, (err, courses) => {
				if (err) {
					console.log(err);
					req.flash('danger', 'Failed to process the picture. Please try again!');
					res.render('attendance', { courses: currentCourses, attendances: currentAttendances, loggedIn });
				} else if (courses.length <= 0) {
					req.flash('info', 'Such course does NOT exist. NO processing was made');
					res.render('attendance', { courses: currentCourses, attendances: currentAttendances, loggedIn });
				} else {
					const image = Buffer(fs.readFileSync(req.file.path).toString('base64'), 'base64');
					fs.remove(req.file.path, (err) => {
						if (err)
							console.log(err);
					});
					var foundStudentNames = [];
					var studentNames = courses[0].students;
					var left = studentNames.length;
					for (const currentStudentName of studentNames) {
						User.find({ name: currentStudentName }, (err, users) => {
							if (err) {
								console.log(err);
							} else if (users.length <= 0) {
								--left;
							} else {
								rekognition.compareFaces(
									{
										SimilarityThreshold: 70,
										TargetImage: { Bytes: image },
										SourceImage: { Bytes: users[0].image }
									}, (err, data) => {
										if (err) {
											console.log(err);
										} else {
											if (data.FaceMatches.length > 0)
												foundStudentNames.push(currentStudentName);
										}
										if (--left === 0) {
											const newLabel = req.body.label.trim();
											const newAttendanceFullName = `${newLabel}@${newCourseFullName}`;
											Attendance.find({ fullName: newAttendanceFullName }, (err, attendances) => {
												if (err) {
													console.log(err);
													req.flash('danger', 'Failed to process the picture. Please try again!');
													res.render('attendance', { courses: currentCourses, attendances: currentAttendances, loggedIn });
												} else {
													if (attendances.length <= 0) {
														const newAttendance = new Attendance({
															course: newCourseName,
															label: newLabel,
															fullName: newAttendanceFullName,
															students: foundStudentNames,
															teacher: currentId
														});
														newAttendance.save((err, course, rows) => {
															if (err) {
																console.log(err);
																req.flash('danger', 'Failed to process the picture. Please try again!');
																res.render('attendance', { courses: currentCourses, attendances: currentAttendances, loggedIn });
															} else {
																Attendance.find({teacher: currentId}, (err, attendances) => {
																	if (err) {
																		console.log(err);
																		req.flash('danger', 'Failed to process the picture. Please try again!');
																		res.render('attendance', { courses: currentCourses, attendances: currentAttendances, loggedIn });
																	} else {
																		currentAttendances = attendances;
																		req.flash('success', `Picture processed successfully under new label (${newLabel})!`);
																		res.render('attendance', { courses: currentCourses, attendances, loggedIn });
																	}
																});
															}
														});
													} else {
														const combined = Array.from(new Set(foundStudentNames.concat(attendances[0].students)));
														Attendance.update({ fullName: newAttendanceFullName }, { students: combined }, (err, attendance) => {
															if (err) {
																console.log(err);
																req.flash('danger', 'Failed to process the picture. Please try again!');
																res.render('attendance', { courses: currentCourses, attendances: currentAttendances, loggedIn });
															} else {
																Attendance.find({teacher: currentId}, (err, attendances) => {
																	if (err) {
																		req.flash('danger', 'Failed to process the picture. Please try again!');
																		res.render('attendance', { courses: currentCourses, attendances: currentAttendances, loggedIn });
																	} else {
																		currentAttendances = attendances;
																		req.flash('success', `Picture processed successfully under existing label (${newLabel})!`);
																		res.render('attendance', { courses: currentCourses, attendances, loggedIn });
																	}
																});
															}
														});
													}
												}
											});
										}
									});
							}
						});
					}
				}
			});
		}
	}
});
