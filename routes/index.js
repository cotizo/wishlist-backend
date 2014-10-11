var express = require('express');
var router = express.Router();


var users = [
    {
        'wishes': [],
        'name': "Me",
        'id': "0"
    },
    {
        'wishes': [
            {'id': 1, 'content': 'Text here pls.', 'state': false},
            {'id': 2, 'content': "KTHXBYE", 'state': true}
        ],
        'name': "Friend 1",
        'id': "1"
    },
    {
        'wishes': [
            {'id': 3, 'content': "TEST1", 'state': true},
            {'id': 4, 'content': "Test2", 'state': false},
            {'id': 5, 'content': "Test3", 'state': false}
        ],
        'name': "Friend 2",
        'id': "1234"
    }
];

router.post('/register', function(req, res) {
    var db = req.db;
    var fbUserId = req.body.fbId;
    var userToken = req.body.token;
    var usersCollection = db.get('users');

    //check if user is already registered
    usersCollection.insert({
        "fbId": fbUserId,
        "token": userToken
    }, function(err, document) {
        if(err) {
            throw new Error("There was a problem adding the information to the database", err);
        } else {
            res.send("OK");

            //mock friends insert
            var friendsIds = [];
            for(var i = 0 ; i < users.length; ++i) {
               friendsIds.push({"id": users[i].id});
            }

            usersCollection.find({"$or": friendsIds}, function(err, registeredFriends) {
                for(var i = 0; i < friendsIds.length; ++i) {
                    var found = registeredFriends.map(function(x) {return x.id}).indexOf(friendsIds[i].id);
                    if(found !=  -1) {
                        console.log("already registered user: " + friendsIds[i].id);
                    } else {
                        usersCollection.insert({
                           "id": friendsIds[i].id,
                            "token": null //friend not using app yet
                        }, function(err, document) {
                            if(err) {
                                console.log("could not store friend");
                            }
                        });
                    }
                }
            });
        }
    });
});

router.post('/login', function(req, res){
    var db = req.db;
    var fbUserId = req.body.fbId;
    var userToken = req.body.token;
    var users = db.get('users');

    users.findOne({fbId: fbUserId}, function(err, user) {
        if(err) {
            throw new Error("There was a problem logging in the user");
        } else {
            res.send("OK");
        }

        if(user) {
            console.log('fbId:' + user.fbId);
            console.log('token:' + user.token);
        } else {
            console.log("user logged");
        }
    })
})

router.post('/addWish', function (req, res) {
    var db = req.db;

    var userId = req.body.id;
    var content = req.body.content;

    if (!userId || !content) {
        throw new Error('id or wish content not set (got id=' + userId + ', content="' + content + '")');
    }

    var wishes = db.get('wishes');

    // Submit to the DB
    wishes.insert({
        "userId": userId,
        "wish" :[{
            "content" : content,
            "bought" : false
        }]
    }, function (err, doc) {
        if (err) {
            // If it failed, return error
            throw new Error("There was a problem adding the information to the database.", err);
        }
        else {
            res.send("OK");
        }
    });
});

router.get('/friends', function (req, res) {
    var friend1 = users[1].id;
    var friend2 = users[2].id;
    res.json([friend1, friend2]);
});

router.get('/friends/:id/list', function (req, res) {
    var friendId = req.params.id;
    for (var i=0; i < users.length; ++i) {
        if (friendId == users[i].id) {
            res.json(users[i].wishes);
            return;
        }
    }
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

router.get('/wishes/:id/list', function(req, res) {
    var db = req.db;
    var userId = req.params.id;
    if (!userId) {
        throw new Error("id not set, please set to user's internal id");
    }
    var wishes = db.get('wishes');
    wishes.find({ "_id": userId }, {}, function(e,data){
        res.json(data);
    });
});


module.exports = router;
