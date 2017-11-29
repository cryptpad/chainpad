/*@flow*/
/*
 * Copyright 2014 XWiki SAS
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */
"use strict";
var Common = require('./Common');
var Operation = require('./Operation');
var nThen = require('nthen');

var applyReversibility = function () {
    var doc = Common.randomASCII(Math.floor(Math.random() * 2000));
    var operations = [];
    var rOperations = [];
    var docx = doc;
    for (var i = 0; i < 1000; i++) {
        operations[i] = Operation.random(docx.length);
        rOperations[i] = Operation.invert(operations[i], docx);
        docx = Operation.apply(operations[i], docx);
    }
    (function () {
        for (var i = 1000-1; i >= 0; i--) {
            if (rOperations[i]) {
                //var inverse = Operation.invert(rOperations[i], docx);
                docx = Operation.apply(rOperations[i], docx);
            }
            /*if (JSON.stringify(operations[i]) !== JSON.stringify(inverse)) {
                throw new Error("the inverse of the inverse is not the forward:\n" +
                    JSON.stringify(operations[i], null, '  ') + "\n" +
                    JSON.stringify(inverse, null, '  '));
            }*/
        }
    }());
    Common.assert(doc === docx);
};

var applyReversibilityMany = function (cycles, callback) {
    for (var i = 0; i < 100 * cycles; i++) {
        applyReversibility();
    }
    callback();
};

var toObjectFromObject = function (cycles, callback) {
    for (var i = 0; i < 100 * cycles; i++) {
        var op = Operation.random(Math.floor(Math.random() * 2000)+1);
        Common.assert(JSON.stringify(op) === JSON.stringify(Operation.fromObj(Operation.toObj(op))));
    }
    callback();
};

var mergeOne = function () {
    var docA = Common.randomASCII(Math.floor(Math.random() * 100)+1);
    var opAB = Operation.random(docA.length);
    var docB = Operation.apply(opAB, docA);
    var opBC = Operation.random(docB.length);
    var docC = Operation.apply(opBC, docB);

    if (Operation.shouldMerge(opAB, opBC)) {
        var opAC = Operation.merge(opAB, opBC);
        var docC2 = docA;
        try {
            if (opAC !== null) {
                docC2 = Operation.apply(opAC, docA);
            }
            Common.assert(docC2 === docC);
        } catch (e) {
            console.log("merging:\n" +
                JSON.stringify(opAB, null, '  ') + "\n" +
                JSON.stringify(opBC, null, '  '));
            console.log("result:\n" + JSON.stringify(opAC, null, '  '));
            throw e;
        }
    }
};
var merge = function (cycles, callback) {
    for (var i = 0; i  < 1000 * cycles; i++) {
        mergeOne();
    }
    callback();
};

var simplify = function (cycles, callback) {
    for (var i = 0; i  < 1000 * cycles; i++) {
        // use a very short document to cause lots of common patches.
        var docA = Common.randomASCII(Math.floor(Math.random() * 8)+1);
        var opAB = Operation.random(docA.length);
        var sopAB = Operation.simplify(opAB, docA);
        var docB = Operation.apply(opAB, docA);
        var sdocB = docA;
        if (sopAB) {
            sdocB = Operation.apply(sopAB, docA);
        }
        if (sdocB !== docB) {
            console.log(docA);
            console.log(JSON.stringify(opAB, null, '  '));
            console.log(JSON.stringify(sopAB, null, '  '));
        }
        Common.assert(sdocB === docB);
    }
    callback();
};

var emoji = function(callback) {
    var oldEmoji = "abc\uD83D\uDE00def";
    var newEmoji = "abc\uD83D\uDE11def";

    var op = Operation.create(3, 2, newEmoji);
    var sop = Operation.simplify(op, oldEmoji);

    Common.assert(sop !== null);
    if (sop !== null)
    {
        Common.assert(op.toRemove === sop.toRemove);
    }
    callback();
};

module.exports.main = function (cycles /*:number*/, callback /*:()=>void*/) {
    nThen(function (waitFor) {
        simplify(cycles, waitFor());
    }).nThen(function (waitFor) {
        applyReversibilityMany(cycles, waitFor());
    }).nThen(function (waitFor) {
        toObjectFromObject(cycles, waitFor());
    }).nThen(function (waitFor) {
        merge(cycles, waitFor());
    }).nThen(function (waitFor) {
        emoji(waitFor());
    }).nThen(callback);
};
