var MongoClient = require('mongodb').MongoClient
    , format = require('util').format;
MongoClient.connect('mongodb://127.0.0.1:27017/test', function (err, db) {
    if (err) {
        throw err;
    } else {
        console.log("successfully connected to the database");
    }
    db.close();
});

//We're using the express framework and the mailgun-js wrapper
var express = require('express');

var Mailgun = require('mailgun-js');


var app = express();
//Your api key, from Mailgun’s Control Panel
var api_key = 'key-e63cfbbb0bb500d1b5428053228f6360';


//Your domain, from the Mailgun Control Panel
var domain = 'connectconcordia.tk';

//Your sending email address
var from_who = 'encs@connectconcordia.tk';

var http = require('http').Server(app);
var io = require('socket.io')(http);
var mongoose = require('mongoose');
var db = require('./database.js');

var passport = require('passport');
var flash = require('connect-flash');

var morgan = require('morgan');
//var passportSocketIo = require('passport.socketio');
var cookieParser = require('cookie-parser');
var bodyParser   = require('body-parser');
var session      = require('express-session');

var redisStore = require('connect-redis')(session);
var sessionStore = new redisStore({
    host: 'localhost',
    port: 6379,
    client: require('redis').createClient(),
    ttl: 300
});
//app.get('/', function(req, res){
//  res.sendfile('index.html');
//});
http.listen(3000, function () {
    console.log('listening on *:3000');
});

mongoose.connect(db.url);

require('./passport')(passport);

app.use(morgan('dev')); // log every request to the console
app.use(cookieParser()); // read cookies (needed for auth)
app.use(bodyParser()); // get information from html forms

app.set('view engine', 'ejs'); // set up ejs for templating

// required for passport
    app.use(session({
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
//        secure: process.env.ENVIRONMENT !== 'development' && process.env.ENVIRONMENT !== 'test',
        maxAge: 2419200000
    },
    secret: 'goodheavenslookatthetime'
}));

app.use(session({ secret: 'goodheavenslookatthetime' })); // session secret
app.use(passport.initialize());
app.use(passport.session()); // persistent login sessions
app.use(flash()); // use connect-flash for flash messages stored in session

//Create profilePictures folder
var mkdirp = require('mkdirp');
var mkdirp = require('mkdirp');
mkdirp(__dirname + '/views/ProfilePictures');

// routes ======================================================================
require('./routes.js').runApp(app, passport); // load our routes and pass in our app and fully configured passport

app.use(require('express').static('views'));

app.use(function(req, res, next) {
    if(req.url.match('./views/chat.ejs'))
       passport.session()(req, res, next)
    else
        next();
});


var users = {};
var chatDB = mongoose.createConnection(db.chat);

chatDB.on('error', function (err) {
    console.log(err.message);
});
chatDB.once('open', function () {
    console.log("mongodb connection open for chat");
});


var chatSchema = mongoose.Schema({
    sender: String,
    username: String,
    receiver: String,
    message: String,
    created: {
        type: Date,
        default: Date.now
    }
});

var chatModel = mongoose.model('Message', chatSchema);

io.on('connection', function (socket) {
    socket.on('chatMessage', function (from, msg) {
        io.emit('chatMessage', from, msg);
    });
    socket.on('notifyUser', function (user) {
        io.emit('notifyUser', user);
    });


    chatModel.find({}, function (err, docs) {
        if (err) throw err;
        console.log('sending old msgs');
        io.emit('load old msgs', docs);
    });

    socket.on('send message', function (data) {
        var newMsg = new chatModel({
            msg: data.msg,
            sender: data.sender,
            receiver: data.receiver,
            nickname: socket.nickname
        });
        newMsg.save(function (err) {
            if (err) {
                throw err;
            } else {
                io.emit('new message', {
                    msg: data.msg,
                    sender: data.sender,
                    receiver: data.receiver,
                    nickname: socket.nickname
                });
            }
        });
    });

    socket.on('new user', function (data, callback) {
        console.log('new user added: ' + data);
        if (data in users) {
            callback(false);
        } else {
            callback(true);
            socket.nickname = data;
            users[socket.nickname] = socket;
            updateNicknames();
        }
    });
    
    socket.on('disconnect', function (data) {
        if (!socket.nickname) return;
        delete users[socket.nickname];
        updateNicknames();
    });

    function updateNicknames() {
        io.emit('usernames', Object.keys(users));
    }

});

module.exports = http;