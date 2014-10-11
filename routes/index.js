var express = require('express');
var router = express.Router();
var _ = require('underscore');
var uuid = require('node-uuid');
var request = require('request');

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
        //check if user is already registered
        usersCollection.findOne({fbId: fbUserId}, {}, function(err, user) {
            if (!err && !user) {
                //  User is not in the db. Insert the user.
                usersCollection.insert({
                    "fbId": facebookUser.id,
                    "name": facebookUser.name,
                    "token": userToken,
                    "wishlist": [],
                    "version": 0,
                    "friends": []
                }, function (err, registeredUser) {
                    if (err) {
                        return next(new Error("There was a problem adding the information to the database", err));
                    } else {
                        // Ok but now let's make all the friend associations

                        //get facebook profile picture
                        request("https://graph.facebook.com/v2.1/" + facebookUser.id + "/picture?type=square", function(err, res, body) {
                            if(err) {
                                console.log('error occurred: ' + err);
                            } else {
                                console.log(JSON.stringify(res, null, 2));
                                usersCollection.update({fbId: facebookUser.id}, {"$set":{ url: res.request.uri.href}}, function(error, document){
                                    if(error) {
                                        return next(new Error("Could not store picture url.", error));
                                    }
                                });
                            }
                        });

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

router.get("/getFriends/:fbId", function(req, res, next) {
    var fbId = req.params.fbId;
    var db = req.db;
    var users = db.get('users');

    users.findOne({"fbId": fbId}, function(err, user) {
       if(err) {
           next(new Error("Cannot get friends for user: " + fbId, err));
       } else {
           if(user) {
               users.find({fbId: { $in: user.friends }}, { "fbId": 1, "name": 1 }, function(err, friendsWithName) {
                   if (!err) {
                       var ret = friendsWithName.map(function(a) { return { fbId: a.fbId, name: a.name, url: a.url } });
                       res.json(ret);
                   } else {
                       next(new Error("Couldn't get the names of " + fbId + "'s friends (which are: "+ user.friends + ")", err));
                   }
               });
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
    var content = req.body.wish;

    if (!fbId || !content) {
        var errmsg = 'id or wish content not set (got fbId=' + fbId + ', content="' + content + '")';
        console.error(errmsg);
        res.status(500, errmsg);
        return;
    }

    withUser(fbId, req, res, function(user) {
        console.log("Found user: " + JSON.stringify(user));
        //var newWish = {
        //    id: uuid.v4(),
        //    content: content,
        //    bought: null
        //};
        var newWish = content;
        console.log("Got newWish: " + JSON.stringify(newWish) + "; setting its .id")
        newWish.id = uuid.v4();
        // Insert it back
        var users = db.get('users');
        console.log("Adding new wish for user " + user.fbId + ": " + JSON.stringify(newWish));
        users.update({fbId: fbId}, { $push: { wishlist: newWish } });
        res.send('OK');
    }, next);
});

router.post("/buyFriendWish/:myId/:friendId/:wishId", function(req, res, next) {
    var fbId = req.params.friendId;
    var buyerId = req.params.myId;
    var wishId = req.params.wishId;
    var db = req.db;
    var users = db.get('users');

    users.update({"fbId": fbId, "wishlist.id": wishId }, {"$set": {"wishlist/.$.bought": buyerId} },  function(err, wish) {
        if(err) {
            next(new Error("Error encountered looking up wish[" + wishId + "] to update", err));
        } else {
            console.log(JSON.stringify(wish, null, 2));
            res.send(200, "OK");
        }
    });
});


module.exports = router;
