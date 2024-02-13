/*
 * Copyright 2024 XWiki SAS
 *
 * This is free software; you can redistribute it and/or modify it
 * under the terms of the GNU Lesser General Public License as
 * published by the Free Software Foundation; either version 2.1 of
 * the License, or (at your option) any later version.
 *
 * This software is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public
 * License along with this software; if not, write to the Free
 * Software Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA
 * 02110-1301 USA, or see the FSF site: http://www.fsf.org.
 */
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
