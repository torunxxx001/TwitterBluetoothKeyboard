"use strict";

let Twitter = require('twitter');
let http = require('http');
let cp = require('child_process');

let set_login_info = function(nconf){
	let passport = {'user': {}};

	nconf.load();
	passport.user.username = nconf.get('TWITTER_USER_NAME');
	passport.user.twitter_token = nconf.get('TWITTER_CLIENT_TOKEN');
	passport.user.twitter_token_secret = nconf.get('TWITTER_CLIENT_SECRET');
	
	return passport;
};

let configRoutes = function(app, passport, nconf) {

	app.all('*', function(req, res, next){

		if( !req.session.passport){
			req.session.passport = set_login_info(nconf);
		}
		
		next();
	});

	app.get('/boot_twitter_server', function(req, res, next){

		http.get('http://127.0.0.1:' + nconf.get('STREAM_STATUS_PORT'), (chl_res) => {
		  //プロセスが残っていたら何もしない
		  
		  res.send(JSON.stringify({'status': 'already booted'}));
			next();
		}).on('error', (e) => {
		  //残っていなかったらプロセス起動
		  
			let child = cp.spawn('node', [__dirname + '/sendstr_cli.js']);
			child.stdout.once('data', function(m) {
				res.send(JSON.stringify({'status': 'boot sucessful'}));
				next();
			});
		});
		
	});
	
	app.get('/get_login', function(req, res, next){
		let login_status = false;
		let login_user   = '';
		
		req.session.passport = set_login_info(nconf);
		
		if(req.session.passport.user.username){
			login_status = true;
			login_user   = req.session.passport.user.username;
		}
		
		res.send(JSON.stringify({'login_status': login_status, 'user': login_user}));
		
		next();
	});

	app.get('/logout', function(req, res, next){
		req.session.passport.user.username = '';
		req.session.passport.user.twitter_token = '';
		req.session.passport.user.twitter_token_secret = '';

		nconf.set('TWITTER_USER_NAME', req.session.passport.user.username);
		nconf.set('TWITTER_CLIENT_TOKEN', req.session.passport.user.twitter_token);
		nconf.set('TWITTER_CLIENT_SECRET', req.session.passport.user.twitter_token_secret);
		nconf.save();

		res.send(JSON.stringify({'status': 'ok'}));
		
		next();
	});

	app.get('/auth/twitter', passport.authenticate('twitter'));
	app.get('/auth/twitter/callback', 
		passport.authenticate('twitter', { successRedirect: '/auth_control.html',
																				failureRedirect: '/auth_control.html' }));
}

module.exports = {configRoutes: configRoutes};
