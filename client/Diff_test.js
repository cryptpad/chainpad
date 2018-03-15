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
var Diff = require('./Diff');
var Patch = require('./Patch');
var Sha = require('./sha256');
var nThen = require('nthen');

var operationEquals = function (opA, opB, doc) {
    if (opA.toRemove !== opB.toRemove) { return false; }
    if (opA.offset === opB.offset) {
        if (opA.toInsert !== opB.toInsert) { return false; }
    }
    var docA = Operation.apply(opA, doc);
    var docB = Operation.apply(opB, doc);
    return docA === docB;
};

var die = function (n) { return Math.floor(Math.random() * n); };
var choose = function (A) { return A[die(A.length)]; };

var words = [
    'pewpewpew',
    'bangpew',
    'boomboom',
    'foobang',
    'pewbangpew',
    'bangbang',
    'boombang',
];

var chooseThreeWords = function () {
    var i = 3;
    var s = '';
    while (i--) { s += choose(words); }
    return s;
};

var lowEntropyRandomOp = function (docLength) {
    Common.assert(Common.isUint(docLength));
    var offset = die(docLength);
    var toRemove = die(docLength - offset);
    var toInsert = '';
    do {
        toInsert = chooseThreeWords();
    } while (toRemove === 0 && toInsert === '');
    return Operation.create(offset, toRemove, toInsert);
};

var fuzzCycle = function (doc, hash) {
    if (!doc) { throw new Error('!doc'); }
    var ops = [];
    var lastOp;
    for (;;) {
        if (!doc || doc.length === 0) { throw new Error("NO GOOD"); }
        var op = lowEntropyRandomOp(10); //doc.length); // Operation.random(10);
        if (lastOp) {
            op = Operation.create(
                op.offset + lastOp.offset + lastOp.toRemove + 10,
                op.toRemove,
                op.toInsert
            );
        }
        if (op.offset + op.toRemove > doc.length) { break; }
        op = Operation.simplify(op, doc);
        if (!op) { continue; }
        ops.push(lastOp = op);
    }
    var p = Patch.create(hash);
    Array.prototype.push.apply(p.operations, ops);
    var doc2 = Patch.apply(p, doc);
    //console.log(doc2);

    var ops2 = Diff.diff(doc, doc2);

    var ok = true;
    var i;
    if (ops.length === ops2.length) {
        for (i = 0; i < ops.length; i++) {
            if (operationEquals(ops[i], ops2[i], doc)) { continue; }
            ok = false;
        }
    }
    /*
    if (ok) { return; }

    for (i = 0; i < Math.max(ops.length, ops2.length); i++) {
        if (ops[i] && ops2[i] && operationEquals(ops[i], ops2[i], doc)) { continue; }
        if (ops[i]) {
            console.log(1);
            console.log(JSON.stringify(ops[i]));
            console.log(JSON.stringify(Operation.invert(ops[i], doc)));
        }
        if (ops2[i]) {
            console.log(2);
            console.log(JSON.stringify(ops2[i]));
            console.log(JSON.stringify(Operation.invert(ops2[i], doc)));
        }
        console.log();
    }
    throw new Error();*/
};

var fuzz = function (cycles, callback) {
    for (var i = 0; i < 10; i++) {
        var doc = chooseThreeWords();
        //console.log('DOC');
        //console.log(doc);
        //Math.random() * Common.randomASCII(Math.random() * 9000 + 1000);
        var hash = Sha.hex_sha256(doc);
        for (var j = 0; j < cycles; j++) {
            fuzzCycle(doc, hash);
        }
    }
    callback();
};

module.exports.main = function (cycles /*:number*/, callback /*:()=>void*/) {
    console.log('diff test');
    nThen(function (waitFor) {
        fuzz(100 || cycles, waitFor());
    }).nThen(callback);
};
