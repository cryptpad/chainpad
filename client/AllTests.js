/* globals document */
"use strict";
var testNames = require('testNames');
var nThen = require('nthen');

var cycles = 1;

if (typeof(document) !== 'undefined') {
    var textArea = document.getElementById('log-textarea');
    console.log = function (x) {
        textArea.value = textArea.value + x + '\n';
        textArea.scrollTop = textArea.scrollHeight;
    };
}

var timeOne = new Date().getTime();

var nt = nThen;
testNames.forEach(function (file) {
    nt = nt(function (waitFor) {
        var test = require(file);
        console.log("\n\nRunning Test " + file + "\n\n");
        nThen(function (waitFor) {
            test.main(cycles, waitFor());
        }).nThen(function () {
            console.log("\n\nCompleted Test " + file + "\n\n");
        }).nThen(waitFor());
    }).nThen;
});

nt(function () {
    console.log('Done');
    console.log('in ' + (new Date().getTime() - timeOne));
});
