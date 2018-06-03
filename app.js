const express = require('express');
const bodyParser = require('body-parser')
const flash = require('express-flash');
const fs = require('fs-extra');
const multer = require('multer');
const passport = require('passport');
const session = require('express-session');
const ensureLoggedIn = require('connect-ensure-login').ensureLoggedIn();
const Auth0Strategy = require('passport-auth0');
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

const normalize = (str) => {
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
		else if (letter.match(/[a-z]/i))
			name += letter;
	return name.charAt(0).toUpperCase() + name.slice(1);
}
const getName = (str) => {
	var name = '';
	for (const word of str.split(' '))
		name += normalize(word);
	return name;
}
const getImage = (user) => {
	return user.image ? `data:${user.mimetype};base64,${Buffer(user.image).toString('base64')}` : '';
}
var loggedIn = false;

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
		name = getName(profile.displayName);
		User.findOneAndUpdate({ name }, { name }, { upsert: true }, (err, user) => {
			if (err)
				return done(err, false);
			if (user)
				return done(null, user);
			else
				return done(null, false);
		});
	}
));
passport.serializeUser((user, done) => {
	done(null, user);
});
passport.deserializeUser((user, done) => {
	done(null, user);
});

const app = express();
const port = process.env.PORT || 3000;
app.use(bodyParser.urlencoded({ extended: false }))
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
app.listen(port, () => {
	console.log(`Server started on port ${port}!`);
});


app.get('/', (req, res, next) => {
	res.render('index', { loggedIn });
});

app.get('/login', passport.authenticate('auth0', {}), (req, res) => {
	res.redirect("/");
});

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
		name: req.user.name,
		image: getImage(req.user),
		loggedIn
	});
});

app.post('/updateUserPicture', ensureLoggedIn, upload.single('picture'), (req, res) => {
	if (!req.file) {
		res.render('index', { title: 'Test', message: 'Please select a picture to submit!' });
	} else {
		const user = new User({
			name: req.body.name,
			mimetype: req.file.mimetype,
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
