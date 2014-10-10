var express = require('express');
var router = express.Router();

var users = [
    {
        'wishes': [],
        'name': "Me",
        'id': 0
    },
    {
        'wishes': [
            {'id': 1, 'content': 'Text here pls.', 'state': false},
            {'id': 2, 'content': "KTHXBYE", 'state': true}
        ],
        'name': "Friend 1",
        'id': 1
    },
    {
        'wishes': [
            {'id': 3, 'content': "TEST1", 'state': true},
            {'id': 4, 'content': "Test2", 'state': false},
            {'id': 5, 'content': "Test3", 'state': false}
        ],
        'name': "Friend 2",
        'id': 2
    }
];
var wishId = 10;

router.post('/wish', function (req, res) {
    var me = users[0];
    var wish = req.body;
    wishId = wishId + 1; // generate a new wish Id, normally handled by database
    wish.id = wishId;
    wish.state = false;
    me.wishes.push(wish);
    res.send(200, "OK");
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

module.exports = router;
