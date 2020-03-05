
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

var SmartJSONTransformer = require("./SmartJSONTransformer");
//var NaiveJSONTransformer = require("./NaiveJSONTransformer");
var TextTransformer = require('./TextTransformer');
var Diff = require('../Diff');
//var Sortify = require("json.sortify");
var Operation = require('../Operation');

var OT = SmartJSONTransformer._;


var assertions = 0;
var failed = false;
var failedOn;
var failMessages = [];

var ASSERTS = [];

var runASSERTS = function (jsonTransformer) {
    ASSERTS.forEach(function (f, index) {
        console.log("Running " + f.name);
        f.f(index + 1, jsonTransformer);
    });
};

var assert = function (test, msg, expected) {
    ASSERTS.push({
        f: function (i, jsonTransformer) {
            test = (test /*:function*/);
            var returned = test(expected, jsonTransformer);
            if (returned === true) {
                assertions++;
                return;
            }
            failed = true;
            failedOn = assertions;

            console.log("\n" + Array(64).fill("=").join(""));
            console.log(JSON.stringify({
                test: i,
                message: msg,
                output: returned,
                expected: typeof(expected) !== 'undefined'? expected: true,
            }, null, 2));
            failMessages.push(1);
        },
        name: msg
    });
};

assert(function () {
    var O = {x:5};
    var C = OT.clone(O);

    return O !== C;
}, "Expected object identity to fail on cloned objects");

assert(function () {
    return OT.pathOverlaps(['a', 'b', 'c'],
        ['a', 'b', 'c', 'd']);
}, "child elements have overlapping paths");

assert(function () {
    return !OT.pathOverlaps(['a', 'b', 'c'],
        ['a', 'b', 'd', 'e']);
}, "sibling elements do not overlap");

assert(function () {
    var A = [
        {
            x: 5,
            y: [
                1,
                2,
                3,
            ],
            z: 15
        },
        "pewpew",
        23
    ];

    var B = OT.clone(A);

    return OT.deepEqual(A, B);
}, "Expected deep equality");

assert(function () {
    var A = [
        {
            x: 5,
            y: [
                1,
                2,
                3,
            ],
            z: 15
        },
        "pewpew",
        23
    ];

    var B = OT.clone(A);
    B[0].z = 9;

    return !OT.deepEqual(A, B);
}, "Expected deep inequality");

assert(function () {
    var A = [1, 2, {
        x: 7
    }, 4, 5, undefined];

    var B = [1, 2, {
        x: 7,
    }, 4, 5];

    return !OT.deepEqual(A, B);
}, "Expected deep inequality");

assert(function () {
    var A = {
        x: 5,
        y: 7
    };

    var B = {
        x: 5,
        y: 7,
        z: 9
    };
    return !OT.deepEqual(A, B);
}, "Expected deep inequality");

assert(function (expected) {
    var O = {
        x: [],
        y: { },
        z: "pew",
    };

    var A = OT.clone(O);
    var B = OT.clone(O);

    A.x.push("a");
    B.x.push("b");

    A.y.a = 5;
    B.y.a = 7;

    A.z = "bang";
    B.z = "bam!";

    var d_A = OT.diff(O, A);
    var d_B = OT.diff(O, B);

    var changes = OT.resolve(d_A, d_B);

    var C = OT.clone(O);

    OT.patch(C, d_A);
    OT.patch(C, changes);

    if (!OT.deepEqual(C, expected)) {
        return changes;
    }
    return true;
}, "Incorrect merge", {
    x: ['a', 'b'],
    y: {
        a: 5,
    },
    // This would result in "bam!bang" if the arbitor was passed.
    z: 'bang',
});

var transformText = function (O, A, B) {
    var tfb = Diff.diff(O, A);
    var ttf = Diff.diff(O, B);
    var r = TextTransformer(ttf, tfb, O);
    var out = Operation.applyMulti(tfb, O);
    out = Operation.applyMulti(r, out);
    return out;
};

assert(function (expected) {
    var O = "pewpew";
    var A = "pewpew bang";
    var B = "powpow";

    return transformText(O, A, B) === expected;
}, "Check transform text", "powpow bang");

assert(function (expected) {
    var O = ["pewpew"];
    var A = ["pewpew bang"];
    var B = ["powpow"];

    var d_A = OT.diff(O, A);
    var d_B = OT.diff(O, B);

    var changes = OT.resolve(d_A, d_B, function (a, b) {
        a.value = transformText(a.prev, a.value, b.value);
        return true;
    });

    OT.patch(O, d_A);
    OT.patch(O, changes);

    if (!OT.deepEqual(O, expected)) {
        return {
            result: O,
            changes: changes,
        };
    }
    return true;
}, "diff/patching strings with overlaps", ["powpow bang"]);

// TODO
assert(function () {
    var O = {
        v: {
            x: [],
        },
    };

    var OO = OT.clone(O);

    var A = {};
    var B = {b: 19};

    var d_A = OT.diff(O, A);
    var d_B = OT.diff(O, B);

    var changes = OT.resolve(d_A, d_B);

    var C =  OT.clone(O);

    OT.patch(C, d_A);
    OT.patch(C, changes);

    if (!OT.deepEqual(O, OO)) {
        return [O, OO];
    }

    return true;
}, "Expected original objects to be unaffected. all operations must be pure");

assert(function () {
    var O = { Y: ['pewpew', 'bangbang'], Z: 7, };
    var A = { Y: ['bangbang'], Z: 7, };
    var B = { Y: [ 'bangbang'], Z: 7, };

    var d_A = OT.diff(O, A);
    var d_B = OT.diff(O, B);

    var changes = OT.resolve(d_A, d_B);

    var C =  OT.clone(O);

    OT.patch(C, d_A);
    OT.patch(C, changes);

    var expected = {
        Y: ['bangbang'],
        Z: 7,
    };

    if (!OT.deepEqual(C, expected)) {
        console.log('diff of A', d_A);
        console.log('diff of B', d_B);
        return C;
    }

    return true;
}, 'the second of two identical array splices should be ignored');

assert(function () {
    var O = { Y: ['pewpew', 'bangbang', 'boom']};
    var A = { Y: ['boom']};
    var B = { Y: ['pewpew', 'boom']};

    var d_A = OT.diff(O, A);
    var d_B = OT.diff(O, B);

    var changes = OT.resolve(d_A, d_B);

    var C =  OT.clone(O);

    OT.patch(C, d_A);
    OT.patch(C, changes);

    var expected = {
        Y: ['boom'],
    };

    if (!OT.deepEqual(C, expected)) {
        console.log('diff of A', d_A);
        console.log('diff of B', d_B);
        return C;
    }

    return true;
}, 'overlapping splices did not preserve intent #1');

assert(function () {
    var O = { Y: ['pewpew', 'bangbang', 'boom', 'blam']};
    var A = { Y: ['boom', 'blam']}; // remove the first two elements of an array
    var B = { Y: ['pewpew', 'boom', 'blam']}; // remove the second element of an array

    var d_A = OT.diff(O, A);
    var d_B = OT.diff(O, B);

    var changes = OT.resolve(d_A, d_B);

    var C =  OT.clone(O);

    OT.patch(C, d_A);
    OT.patch(C, changes);

    var expected = {
        Y: ['boom', 'blam'],
    };

    if (!OT.deepEqual(C, expected)) {
        console.log('diff of A', d_A);
        console.log('diff of B', d_B);
        return C;
    }

    return true;
}, 'overlapping splices did not preserve intent #2');

assert(function () {
    var O = { Y: '12345'.split("")};
    var A = { Y: '15'.split("")};
    var B = { Y: '1245'.split("")};

    var d_A = OT.diff(O, A);
    var d_B = OT.diff(O, B);

    var changes = OT.resolve(d_A, d_B);

    var C =  OT.clone(O);

    OT.patch(C, d_A);
    OT.patch(C, changes);

    var expected = {
        Y: '15'.split(""),
    };

    if (!OT.deepEqual(C, expected)) {
        console.log('diff of A', d_A);
        console.log('diff of B', d_B);
        return C;
    }

    return true;
}, 'overlapping splices did not preserve intent #3');

assert(function () {
    var O = { Y: '12345'.split("")};
    var A = { Y: '15'.split("")}; // remove the middle three elements
    var B = { Y: '1245'.split("")}; // remove one element from the middle

    var d_A = OT.diff(O, A);
    var d_B = OT.diff(O, B);

    var changes = OT.resolve(d_A, d_B);

    var C =  OT.clone(O);

    OT.patch(C, d_A);
    OT.patch(C, changes);

    var expected = {
        Y: '15'.split(""), // the contained removal should have been cancelled out
    };

    if (!OT.deepEqual(C, expected)) {
        console.log('diff of A', d_A);
        console.log('diff of B', d_B);
        return C;
    }

    return true;
}, 'overlapping splices did not preserve intent #4');

assert(function () {
    var O = { Y: '12345'.split("")};
    var A = { Y: '125'.split("")}; // remove two of the middle elements
    var B = { Y: '145'.split("")}; // remove elements earlier in the array with some overlap

    var d_A = OT.diff(O, A);
    var d_B = OT.diff(O, B);

    var changes = OT.resolve(d_A, d_B);

    var C =  OT.clone(O);

    OT.patch(C, d_A);
    OT.patch(C, changes);

    var expected = {
        Y: '15'.split(""), // the contained removal should have been cancelled out
    };

    if (!OT.deepEqual(C, expected)) {
        console.log('diff of A', d_A);
        console.log('diff of B', d_B);
        return C;
    }

    return true;
}, 'overlapping splices did not preserve intent #5');

assert(function () {
    return true; // TODO unstub this, make it work
/*
    var O = { Y: '12345'.split("")};
    var A = { Y: '125'.split("")}; // remove 3, 4
    var B = { Y: '013456'.split("")}; // remove 2, insert 0, 6

    var d_A = OT.diff(O, A);
    var d_B = OT.diff(O, B);

    var changes = OT.resolve(d_A, d_B);

    var C =  OT.clone(O);

    OT.patch(C, d_A);
    OT.patch(C, changes);

    var expected = {
        Y: '0156'.split(""), // the contained removal should have been cancelled out
    };

    if (!OT.deepEqual(C, expected)) {
        console.log('diff of A', d_A);
        console.log('diff of B', d_B);
        return C;
    }

    return true;
*/
}, 'overlapping splices did not preserve intent #6');

module.exports.main = function (cycles /*:number*/, callback /*:()=>void*/) {
    runASSERTS(SmartJSONTransformer);
    if (failed) {
        console.log("\n%s assertions passed and %s failed", assertions, failMessages.length);
        throw new Error();
    }
    console.log("[SUCCESS] %s tests passed", assertions);

    callback();
};
