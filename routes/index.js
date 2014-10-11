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
var wishId = 10;

router.post('/register', function(req, res) {
    var db = req.db;
    var userId = req.body.id;
    var userToken = req.body.token;
    var usersCollection = db.get('users');

    //check if user is already registered
    usersCollection.insert({
        "id": userId,
        "token": userToken
    }, function(err, document) {
        if(err) {
            res.send("There was a problem adding the information to the database");
        } else {
            res.send(200, "OK");

            //mock friends insert
            //null token for fb users who don't use the app yet
            var friendsIds = [];
            console.log("STATIC USERS:");
            for(var i = 0 ; i < users.length; ++i) {
                console.log("  " + '"' + users[i].id + '"');
                friendsIds.push({"id": users[i].id});
            }

            usersCollection.find({"$or": friendsIds}, function(err, registeredFriends) {
                for(var i = 0; i < registeredFriends.length; ++i) {
                    console.log("------------");
                    console.log("registeredFriends[" + i + "].id= " +registeredFriends[i].id);
                    console.log("registeredFriends[" + i + "].token= " +registeredFriends[i].token);
                }
            });
        }
    });
});

router.post('/login', function(req, res){
    var db = req.db;
    var userId = req.body.id;
    var userToken = req.body.token;
    var users = db.get('users');

    users.findOne({id: userId}, function(err, user) {
        if(err) {
            res.send("There was a problem logging in the user");
        } else {
            res.send(200, "OK");
        }

        if(user) {
            console.log('id:' + user.id);
            console.log('token:' + user.token);
        } else {
            console.log("user logged");
        }
    })
})

router.post('/addWish', function (req, res) {
    var db = req.db;

    var name = req.body.name;
    var content = req.body.content;

    var wishes = db.get('wishes');

    // Submit to the DB
    wishes.insert({
        "name" : name,
        "wishes" :[{
            "content" : content,
            "bought" : false
        }]
    }, function (err, doc) {
        if (err) {
            // If it failed, return error
            res.send("There was a problem adding the information to the database.");
        }
        else {
            res.send(200, "OK");
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

router.post('/friends/:friendId/list/:wishId/:state', function (req, res) {
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

router.get('/wishes', function(req, res) {
    var db = req.db;
    var collection = db.get('collection');
    collection.find({},{},function(e,data){
        res.json(data);
    });
});

router.get('/wishes/:id/list', function(req, res) {
    var db = req.db;
    var userId = req.params.id;
    var collection = db.get('collection');
    collection.find({"_id" : userId},function(e,data){
        res.json(data);
    });
});


module.exports = router;
