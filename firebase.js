var Firebase = require('firebase');
var myRootRef = new Firebase('https://vivid-heat-8309.firebaseIO.com/');
myRootRef.set("hello world!");