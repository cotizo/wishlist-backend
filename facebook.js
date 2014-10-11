// Facebook
var FB = require('fb');

// Load config
var config = require('config');
if(!config.facebook.appId || !config.facebook.appSecret) {
    throw new Error('facebook appId and appSecret required in config.js');
}

// TODO need to FB.setAccessToken(...) for developing (get your access token at
// https://developers.facebook.com/tools/explorer )
//
// although what should happen is we'd be given an oauth token by the android
// app instead...

module.exports = FB;
