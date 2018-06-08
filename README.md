# Automatic Attendance

*Automatic Attendance* is a web app that automatically manages class attendance for you using face recognition! Take a look: [automattendance.herokuapp.com](http://automattendance.herokuapp.com/)



## Technologies

The main technologies used in the development of this application are [Node.js v8.11.2](https://nodejs.org/en/) for the server-side logic, [MongoDB](https://www.mongodb.com/) for the data persistance, [EJS](http://ejs.co/) for the front end, [Auth0](https://auth0.com/) for the authentication, [Amazon Rekognition](https://aws.amazon.com/rekognition/) for the face recognition and [Heroku](https://www.heroku.com/) and [mLab](https://mlab.com/) for the deployment.


## Running locally

First things first: you must properly set the following environment variables:

- AWS_ACCESS_KEY_ID
- AWS_SECRET_ACCESS_KEY
- MLAB_DB_USER
- MLAB_DB_PASSWORD
- AUTH0_SECRET

A few other things to keep in mind:

- The AWS credentials need access to Amazon Rekognition (only)
- The MongoDB database at mLat must be named `automattendance`
- The Auth0 callback URLs must be set accordingly

Then it's pretty simple: 

- Download the files

    > $ git clone https://github.com/agudelotmateo/automattendance.git

- Change directory to the downloaded files folder

    > $ cd automattendance

- Install the required dependencies (automatically)

    > $ npm install

- Run the application

    > $ npm start



## Development process

### Face recognition

The first step in the development of this application was to get the face recognition part of it ready. There are a few things to consider here: we had to do the processing locally (we didn't have access to [AWS](https://aws.amazon.com/)), the most widely known libraries for local image processing are available in [Python](https://www.python.org/), and face recognition requires a previous step of face detection, so both must be performed well. 

Amazon Rekognition claims to be a *"Deep learning-based image and video analysis"* so we initially tried with [OpenCV](https://opencv.org/)'s [Deep Neural Networks module](https://github.com/opencv/opencv/tree/master/samples/dnn/face_detector) using the training data from [an online tutorial](https://www.pyimagesearch.com/2018/02/26/face-detection-with-opencv-and-deep-learning/) for the face detection step, but the detection rate was awful. We then tried using the classic classifiers from the [official OpenCV's tutorial for face detection](https://docs.opencv.org/3.4.1/d7/d8b/tutorial_py_face_detection.html) and the results with a *scale factor* of 1.1 and a minimum of 5 *neighbors* were good enough for our use case, although with some false positives. 

For the face recognition step we followed the [official OpenCV's tutorial for face recognition](https://docs.opencv.org/3.4.1/da/d60/tutorial_face_main.html) but *none* of the 3 methods offered (*Eigenfaces*, *Fisherfaces* and *Local Binary Patterns Histograms (LBPH)*) produced even decent results. At this point we realized that we had to try Amazon Rekognition, so we managed to get an AWS account and found that this service performs both the face detection and the face recognition steps really well so we went with it. As an example, we used one picture of 16 of the people in the picture (the picture is from their ID so it might be outdated) on the following image: 

![Original Image](/images/psl.jpg)

All 3 OpenCV's methods recognized 0 faces in it (this is expected as a minimum of 10 images of the face of the person to be recognized are expected and we gave only one). Amazon Rekognition recognized 9 of them:

![Image with detected faces](/images/psl_aws.jpg)

This is a pretty decent result considering the faces given and the quality of the picture. 


### Data persistance

Initially we didn't have access to AWS so our only known choice was mLab, which at the same time means MongoDB. We now have access to AWS but in order to minimize the potential cost we will keep all the data at mLab until the free tier no longer supports our load. 

Storing the user info and all that was pretty simple, but storing the user's image was not. Luckily enough, MongoDB supports the *binary* data type which is a format the images can be send to Amazon Rekognition's API in.


### Authentication

To make it easy for the user to login and offer a better authentication in general we chose Auth0. It integrates very well with Node.js and particularly [Express](https://expressjs.com/) with the use of [Passport.js](http://www.passportjs.org/). Login through [Facebook](https://www.facebook.com/) and [Google](https://www.google.com/) accounts are currently available, as well as the the classic email/password. 


### Implementation

All of us had experience with Node.js, AWS offers a [JavaScript API](https://aws.amazon.com/sdk-for-node-js/) and Node.js integrates very well with MongoDB through [mongoose](http://mongoosejs.com/) so we didn't hesitate.

We didn't have much experience with any of the named technologies though, so the process was slow and full of silly problems: the new Express.js that doesn't include the body parser, the body parser itself, multer for *multipart/form-data*, saving the session data, protecting routes, storing the pictures in binary and the composed keys in MongoDB, displaying binary images to the front end, setting up Auth0 correctly with Passport.js, doing the logic inside callback functions without early returns for implicit renderings, the asynchronous executions of for loops and many others.


### Deployment

Heroku works well with Node.js deployments even in the free tier so this was our first option. AWS might offer better but we are not considering moving by now. The project though, given the set up, is pretty easy to migrate. 
