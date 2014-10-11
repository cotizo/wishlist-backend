var express = require('express');
var router = express.Router();
var _ = require('underscore');


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



    fb.api(fbUserId, function (facebookUser) {
        if(!facebookUser || facebookUser.error) {
            console.log(!facebookUser ? 'error occurred' : facebookUser.error);
            return;
        }

        console.log("Attempting to register the Facebook user: id=" + fbUserId + " name=" + facebookUser.name + " username=" + facebookUser.username);
//        console.log(JSON.stringify(facebookUser, null, 2));

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
                        // Ok but now let's make all the friend associations

                        usersCollection.find({}, function(err, allRegisteredUsers) {
                            // This must not be a for loop! :) Trust meh
                            _.each(allRegisteredUsers, function(potentialFriend) {

                                if(potentialFriend.fbId != fbUserId) {
                                    console.log("Registering ["+ fbUserId +"]: Checking whether registered user " + potentialFriend.name + " [" + potentialFriend.fbId + "] is a friend");
                                    var currentRegisteredUserId = potentialFriend.fbId;
                                    fb.api(fbUserId + "/friends/" + potentialFriend.fbId, function(friend) {
                                        if(!friend || friend.error || friend.type == 'OAuthException') {
                                            console.log(!friend ? 'error occurred' : friend.error);
                                            return;
                                        }

//                                        console.log("/" + fbUserId + "/friends/" + currentRegisteredUserId + " returned " + JSON.stringify(friend, null, 2));
//                                        console.log("Length of .data: " + friend.data.length);

                                        if(friend.data.length > 0) {
                                            if(friend.data[0].id == currentRegisteredUserId) {
                                                //they are friends
                                                //update both friends lists
                                                usersCollection.update({fbId: currentRegisteredUserId}, {"$push": {"friends": fbUserId }}, function (err, document) {
                                                    if (err) {
                                                        return next(new Error("Could not add user [" + fbUserId + "] as friend of user [" + currentRegisteredUserId + "]", err));
                                                    } else {
                                                        usersCollection.update({fbId: fbUserId}, {"$push": {"friends": currentRegisteredUserId}}, function(err, document) {
                                                            if(err) {
                                                                return next(new Error("Could not add user [" + currentRegisteredUserId+ "] as friend of user [" + fbUserId + "]", err));
                                                            }
                                                        });
                                                    }
                                                });
                                            }
                                        } else {
                                            console.log("Users [" + fbUserId + "] and [" + currentRegisteredUserId + "] are not friends!");
                                        }

                                    });
                                }
                            });
                            res.send("OK");
                        })
                    }
                }); // end user-found
            } else if (user) {
                res.send("OK");
                return;
                // next(new Error("User is already registered."));
            } else if (err) {
                next(new Error("Couldn't verify if user was already registered", err));
            } else
                next(); // pink unicorns hate boolean logic
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
                res.json([]);
                // res.send(404, "Could not find the user [" + fbId + "] in the database");
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

    var fbId = req.body.id;
    var content = req.body.content;

    if (!fbId || !content) {
        var errmsg = 'id or wish content not set (got fbId=' + fbId + ', content="' + content + '")';
        console.error(errmsg);
        res.status(500, errmsg);
        return;
    }

    withUser(fbId, req, res, function(user) {
        console.log("Found user: " + JSON.stringify(user));
        var newWish = { content: content, bought: null };
        // Insert it back
        var users = db.get('users');
        console.log("Adding new wish for user " + user.fbId + ": " + JSON.stringify(newWish));
        users.update({fbId: fbId}, { $push: { wishlist: newWish } });
        res.send('OK');
    }, next);
});

// Broken - wishes
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
    wishes.find({ "id": fbUserId }, {}, function(e, data){
        if (e) { console.error(e); res.send(400); return; } // cause it's okay to test for errors.
        res.json(data);
        next();
    });
});


module.exports = router;
