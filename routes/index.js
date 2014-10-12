var express = require('express');
var router = express.Router();
var _ = require('underscore');
var uuid = require('node-uuid');

var datediff = require('../datediff');

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

                // Hint: for debugging we actually allow specifying the birthday manually via POST.
                var birthday = facebookUser.birthday || req.body.birthday;
                if (!birthday) {
                    return next(new Error("You must have a birthday set up on Facebook before you can use this app."));
                }
                // birthday format is mm/dd/YYYY
                var bdSplit = birthday.split("/");
                var day = bdSplit[1];
                var month = bdSplit[0]-1;
                var year = bdSplit[2];
                var birthdayObj = new Date(year, month, day);
                usersCollection.insert({
                    "fbId": facebookUser.id,
                    "name": facebookUser.name,
                    // HACK to approximate how many days from start-of-year til this person's birthday
                    // of course this is really dependent on the current year. but this should do for now
                    "birthdayCmp": datediff.inDays(new Date(birthdayObj.getFullYear(), 0, 1), birthdayObj),
                    "birthday": birthday,
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
                        request("https://graph.facebook.com/v2.1/" + facebookUser.id + "/picture?type=large", function(err, res, body) {
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
           if (user) {
               users.find({fbId: { $in: user.friends }}, { fbId: 1, name: 1, birthday: 1, wishlist: 1, sort: [ "birthdayCmp", 'asc'] },
                   function (err, friendsWithName) {
                       console.log(friendsWithName);
                       if (!err) {
                           // How many days this year till today?
                           var todayDiff = datediff.inDays(new Date(new Date().getFullYear(), 0, 1), new Date());
                           var ret0 = _.flatten(_.partition(friendsWithName, function (p) {
                               return p.birthdayCmp >= todayDiff;
                           }));
                           var ret = _.map(ret0, function (a) {
                               return {
                                   id: a.fbId,
                                   name: a.name,
                                   birthday: a.birthday,
                                   numberOfWishes: a.wishlist.length,
                                   picture: a.url
                               }
                           });
                           res.json(ret);
                       } else {
                           next(new Error("Couldn't get the names of " + fbId + "'s friends (which are: " + user.friends + ")", err));
                       }
                   });
               // end of users.find
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
    var wish = req.body.wish;
    if (!(typeof wish === 'object')) {
        res.status(400).send("POST parameter `wish` needs to be a JSON object with fields that you want to update");
        return;
    }

    if (!fbId || !wish) {
        var errmsg = 'id or wish not set (got id=' + fbId + ', wish=' + wish + ')';
        console.error(errmsg);
        res.status(500).send(errmsg);
        return;
    }

    withUser(fbId, req, res, function(user) {
        console.log("Found user: " + JSON.stringify(user));
        var newWish = wish;
        console.log("Got newWish: " + JSON.stringify(newWish) + "; setting its .id and .bought to null");
        newWish.id = uuid.v4();
        newWish.bought = null;
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

    users.update({"fbId": fbId, "wishlist.id": wishId }, {"$set": {"wishlist.$.bought": buyerId} },  function(err, wish) {
        if(err) {
            next(new Error("Error encountered looking up wish[" + wishId + "] to update", err));
        } else {
            console.log(JSON.stringify(wish, null, 2));
            res.send(200, "OK");
        }
    });
});

router.post("/updateWish/:myId/:wishId", function(req, res, next) {
    var fbId = req.params.myId;
    var wishId = req.params.wishId;
    var changedFields = req.body.wish;
    if (!(typeof wish === 'object')) {
        res.status(400).send("POST parameter `wish` needs to be a JSON object with fields that you want to update");
        return;
    }
    var db = req.db;
    var users = db.get('users');

    doUpdate(users, {"fbId": fbId, "wishlist.id": wishId }, "wishlist.$", changedFields, function(err, wish) {
        if(err) {
            next(new Error("Error encountered looking up wish[" + wishId + "] to update", err));
        } else {
            console.log(JSON.stringify(wish, null, 2));
            res.status(200).send("OK");
        }
    });
});

router.post("/deleteWish/:myId/:wishId", function(req, res, next) {
    var fbId = req.params.myId;
    var wishId = req.params.wishId;
    var db = req.db;
    var users = db.get('users');

    console.log("fbId:" + fbId);
    console.log("wishId:" + wishId);

    users.update({fbId: fbId}, {$pull: {"wishlist": {id: wishId}}});
    res.send(200, "OK");
});

/** Updates only the `changedFields` inside the document that can be found at `objectPrefix` after running the
 * `query` on `coll`. */
var doUpdate = function(coll, query, objectPrefix, changedFields, cb) {
    var updates = {};
    _.forEach(changedFields, function(val, key) { updates[objectPrefix + "." + key] = val; });
    return coll.update(query, { $set: updates }, cb);
};

module.exports = router;
