var express = require('express');
var router = express.Router();


//function restrict(req, res, next) {
//    if (req.session.user) {
//        next();
//    } else {
//        next (new Error('Access denied - not logged in!'));
//    }
//}

users = [];

//router.get('/logout', function(req, res){
//    // destroy the user's session to log them out
//    // will be re-created next request
//    req.session = null;
//    res.send("Logged out");
//});

router.post('/register', function(req, res, next) {
    var db = req.db;
    var fbUserId = req.body.fbId;
    var userToken = req.body.token;
    var usersCollection = db.get('users');

    var fb = req.fb;
    fb.setAccessToken(userToken);

    function get_all_my_facebook_friends( tok_or_url, callback, friends_so_far ) {

        friends_so_far = friends_so_far || [];

        if( tok_or_url.substr(0,4) == 'http' ){
            url = tok_or_url + "&limit=20&offset=" + friends_so_far.length;
        } else {
            url = 'https://graph.facebook.com/v2.1/me/friends?limit=20&access_token=' + tok_or_url;
        }

        // we are going to call this recursively, appending the users as we go
        // until facebook decides we don't have anymore friends ( so this shouldn't take long )
        // then we pass that list of friends to the callback

        console.log('fetching... ' + url);
        require('request')(
            url,
            function ( err, resp, body ) {
                var body = JSON.parse(body),
                    data = body.data;

                if ( err || body.error ) {
                    callback( err || body.error );
                } else {

                    if ( data.length > 0 ) {
                        // something was returned... keep on keepin on
                        while ( next = data.pop() ) {
                            friends_so_far.push( next );
                        }
                        get_all_my_facebook_friends( body.paging.next, callback, friends_so_far );
                    } else {
                        // we're done! call the callback!
                        callback( null, friends_so_far );
                    }
                }
            }
        );

    }

    fb.api(fbUserId, function (facebookUser) {
        if(!facebookUser || facebookUser.error) {
            console.log(!facebookUser ? 'error occurred' : facebookUser.error);
            return;
        }

        console.log("Found USER:");
        console.log(JSON.stringify(facebookUser, null, 2))

        //TODO: implement paging
//        fb.api(fbUserId + "/friends", {limit: 500}, function(facebookFriends) {
//            console.log(JSON.stringify(facebookFriends, null, 2));
//        });

        get_all_my_facebook_friends(
            userToken,
            function( err, all_my_friends ) {
                if(err) {
                    console.log(err);
                } else {
                    console.log('All my facebook friends:');
                    console.log(all_my_friends);
                    console.log(all_my_friends.length);
                }
            }
        );

        //check if user is already registered
        usersCollection.findOne({fbId: fbUserId}, {}, function(err, user) {
            if (!err && !user) {
                //  User is not in the db. Insert the user.
                usersCollection.insert({
                    "fbId": facebookUser.id,
                    "name": facebookUser.name,
                    "token": userToken,
                    "wishlist": [],
                    "friends": []
                }, function (err, registeredUser) {
                    if (err) {
                        return next(new Error("There was a problem adding the information to the database", err));
                    } else {
                        res.send("OK");

                        //mock friends insert
                        var friendsIds = [];
                        for (var i = 0; i < users.length; ++i) {
                            friendsIds.push({"id": users[i].id});
                        }

                        usersCollection.find({"$or": friendsIds}, function (err, registeredFriends) {
                            for (var i = 0; i < friendsIds.length; ++i) {
                                var found = registeredFriends.map(function (x) {
                                    return x.id
                                }).indexOf(friendsIds[i].id);
                                if (found != -1) {
                                    console.log("already registered user: " + friendsIds[i].id);
                                    usersCollection.update({_id: registeredUser._id}, {"$push": {"friends": [friendsIds[i].id]}}, function (err, document) {
                                        if (err) {
                                            console.log("cannot add user to friend list");
                                        }
                                    });
                                } else {
                                    usersCollection.insert({
                                        "fbId": friendsIds[i].id,
                                        "token": null //friend not using app yet
                                    }, function (err, userFriend) {
                                        if (err) {
                                            console.log("could not store friend");
                                        } else {
                                            usersCollection.update({_id: registeredUser._id}, {"$push": {"friends": [userFriend.fbId]}}, function (err, document) {
                                                if (err) {
                                                    console.log("cannot add user to friend list");
                                                }
                                            });
                                        }
                                    });
                                }
                            }
                        });
                    }
                }); // end user-found
            } else if (user) {
                next(new Error("User is already registered."));
            } else if (err) {
                next(new Error("Couldn't verify if user was already registered", err));
            } else
                next();
        });


    });


});

//router.post('/login', function(req, res, next){
//    var db = req.db;
//    var fbUserId = req.body.fbId;
//    var userToken = req.body.token;
//    var users = db.get('users');
//
//    if (!fbUserId) {
//        return next(new Error("Please provide fbId"));
//    }
//    console.log('fbUserId passed is: ' + fbUserId);
//
//    users.findOne({fbId: fbUserId}, function(err, user) {
//        if(err) {
//            return next(new Error("There was a problem logging in the user", err));
//        } else if (user) {
//            console.log('fbId:' + user.fbId);
//            console.log('token:' + user.token);
//
//            req.session.user = user;
//            res.send("OK");
//        } else {
//            return next(new Error("User does not exist"));
//        }
//        next();
//    })
//})

router.get("/getFriends/:fbId", function(req, res) {
    var fbId = req.params.fbId;
    var db = req.db;
    var users = db.get('users');

    users.findOne({"fbId": fbId}, function(err, user) {
       if(err) {
           console.log("Cannot get friends for user: " + fbId);
       } else {
           if(user) {
               res.json(user.friends);
           } else {
               res.send(400, "Could not find the user [" + fbId + "] in the database");
           }

       }
    });
});

router.get("/getFriendWishlist/:fbId", function(req, res, next) {
    var fbId = req.params.fbId; // friend's id
    if (!fbId) {
        return next(new Error("fbId not set, please set to user's facebook id"));
    }

    var db = req.db;
    var users = db.get('users');

    users.findOne({"fbId": fbId}, function(err, user) {
        if(err) {
            return next(new Error("Error encountered looking up fb user [" + fbId + "]"), err);
        } else {
            if(user) {
                res.json(user.wishlist);
            } else {
                res.send(400, "Could not find the user [" + fbId + "] in the database");
            }
        }
    });
});


// Passes only the user to successCb
var withUser = function(fbId, req, res, successCb, next) {
    if (!fbId) {
        return next(new Error('fbId to look up was not specified'));
    }
    var db = req.db;
    var users = db.get('users');
    users.findOne({"fbId": fbId}, function(err, user) {
        if(err) {
            next(new Error("Error encountered looking up fb user [" + fbId + "]", err));
        } else {
            if(user) {
                var ret = successCb(user);
                if (ret !== undefined)
                    next(ret);
            } else {
                res.send(400, "Could not find the user [" + fbId + "] in the database");
            }
        }
    });
};

router.post('/addWish', function (req, res, next) {
    var db = req.db;

    var fbId = req.body.fbId;
    var content = req.body.content;

    if (!fbId || !content) {
        res.status(500).send('id or wish content not set (got fbId=' + fbId + ', content="' + content + '")');
        return;
    }

    withUser(fbId, req, res, function(user) {
        console.log("Found user: " + JSON.stringify(user));
        var newWishlist = user.wishlist;
        newWishlist.push({ content: content, bought: null });
        // Insert it back
        var users = db.get('users');
        console.log("Saving new wishlist for user " + user.fbId + ": " + JSON.stringify(newWishlist));
        users.update({fbId: fbId}, { $set: { wishlist: newWishlist } });
        res.send('OK');
    }, next);
});

router.post("/buyFriendWish/:myid/:wishid", function(req, res) {
    var fbId = req.params.myid;
    var wishId = req.params.wishid;
    var db = req.db;
    var wishes = db.get('wishes');

    wishes.update({"_id": wishId}, {"$set" : {"bought": fbId }}, function(err, document) {
       if(err) {
           console.log("Could not update the buyer of the wish [" + wishId + "]" );
       } else {
           res.send(200, "OK");
       }
    });
});

router.post('/friends/:friendId/setState/:wishId/:state', function (req, res) {
    var friendId = req.params.friendId;
    var item = req.params.wishId;
    var state = req.params.state;

    // validate input
    if (state != "true" && state != "false") {
        res.send(400, "Invalid value for parameter state. Use 'true' or 'false'");
        return;
    }

    state = state === 'true'; // convert to boolean
    for (var i=0; i < users.length; ++i) { // find friend
        if (friendId == users[i].id) {
            for (var j=0; j<users[i].wishes.length; ++j) {
                if (item == users[i].wishes[j].id) {
                    users[i].wishes[j].state = state;
                    res.send(200, "OK");
                    return;
                }
            }

            res.send(200, "OK"); // executed only if there's no wish with that id
            return;
        }
    }
});

router.get('/wishes/:fbId/list', function(req, res, next) {
    var db = req.db;
    var fbUserId = req.params.fbId;
    if (!fbUserId) {
        return next(new Error("fbId not set, please set to user's facebook id"));
    }
    var wishes = db.get('wishes');
    wishes.find({ "id": fbUserId }, {}, function(e,data){
        res.json(data);
        next();
    });
});


module.exports = router;
