"use strict";

let passport = require('passport');
let TwitterStrategy = require('passport-twitter').Strategy;

let passportInit = function(nconf){
	passport.serializeUser(function(user, done) {
		nconf.set('TWITTER_USER_NAME', user.username);
		nconf.set('TWITTER_CLIENT_TOKEN', user.twitter_token);
		nconf.set('TWITTER_CLIENT_SECRET', user.twitter_token_secret);

		nconf.save();

		done(null, user);
	});
	passport.deserializeUser(function(user, done) {
		done(err, user);
	});

	// passport-twitter設定
	passport.use(new TwitterStrategy({
	    consumerKey: nconf.get('TWITTER_CONSUMER_KEY'),
	    consumerSecret: nconf.get('TWITTER_CONSUMER_SECRET'),
	    callbackURL: nconf.get('BASE_URL') + ':' + nconf.get('LISTEN_PORT') + '/auth/twitter/callback'
	  },

	  function(token, tokenSecret, profile, done) {
	    // tokenとtoken_secretをセット
	    profile.twitter_token = token;
	    profile.twitter_token_secret = tokenSecret;

	    process.nextTick(function () {
	        return done(null, profile);
	    });
	  }
	));
	
	return passport;
}

module.exports = {passportInit: passportInit};
