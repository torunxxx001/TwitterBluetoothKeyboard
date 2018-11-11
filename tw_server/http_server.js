"use strict";

let nconf = require('nconf');
let http = require('http');
let express = require('express');
let session = require('express-session');

// 設定読み取り
nconf.use('file', {file: './config/default.json'});
nconf.load();


// passport設定
let passport = require('./passport').passportInit(nconf);

// express設定
let app = express();
app.use(passport.initialize()); 
app.use(passport.session());
app.use(session({
	secret: 'test-srv-tst',
	resave: false,
	saveUninitialized: false,
	
}));
app.use(express.static(__dirname + '/public'));
app.set('views', __dirname + '/public');
app.set('view engine', 'ejs');

let routes = require('./routes');
routes.configRoutes(app, passport, nconf);

let server = http.createServer(app);
server.listen(3000);
console.log('Listening on port %d in %s mode', server.address().port, app.settings.env);
