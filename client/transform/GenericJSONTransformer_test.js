
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
var NaiveJSONTransformer = require("./NaiveJSONTransformer");
//var TextTransformer = require('./TextTransformer');
var Diff = require('../Diff');
var Sortify = require("json.sortify");
var Operation = require('../Operation');

var assertions = 0;
var failed = false;
var failedOn;
var failMessages = [];

var ASSERTS = [];

var runASSERTS = function (jsonTransformer) {
    ASSERTS.forEach(function (f, index) {
        f.f(index + 1, jsonTransformer);
    });
};

var assert = function (test, msg, expected, skipIfNaive) {
    ASSERTS.push({
        f: function (i, jsonTransformer) {
            if (skipIfNaive && jsonTransformer === NaiveJSONTransformer) {
                console.log("Skipping " + msg + " because it fails with NaiveJSONTransformer");
                return;
            }
            console.log("Running " + msg);
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

var clone = function (x) { return JSON.parse(JSON.stringify(x)); };
var deepEqual = function (x, y) { return Sortify(x) === Sortify(y); };

var basicTest = function (obj) {
    assert(function (expected, jsonTransformer) {
        var s_O = obj.doc;
        var s_ttf = obj.s_toTransform;
        var s_tfb = obj.s_transformBy;
        var toTransform = Diff.diff(s_O, s_ttf);
        var transformBy = Diff.diff(s_O, s_tfb);
        var transformed = jsonTransformer(toTransform, transformBy, s_O);    
        var temp = Operation.applyMulti(transformed, s_tfb);
        if (obj.comment) {
            console.log();
            console.log(obj.comment);
            console.log();
        }
        if (temp === expected) { return true; }
        return temp;
    }, obj.name, obj.expected, obj.skipIfNaive || false);
};

(function () {
    var O = { a: 5 };
    var A = { a: 6 };
    var B = { a: 7 };
    basicTest({
        doc: Sortify(O),
        s_toTransform: Sortify(B),
        s_transformBy: Sortify(A),
        expected: Sortify({a: 6}),
        name: "replace->replace (Case #1 Conflicting)",
        skipIfNaive: true
    });
}());

// independent replace -> replace
(function () {
    var O = {x:5};
    var A = {x:7};
    var B = {x:5, y: 9};
    basicTest({
        doc: Sortify(O),
        s_toTransform: Sortify(B),
        s_transformBy: Sortify(A),
        expected: Sortify({
            x: 7,
            y: 9
        }),
        name: "Expected transform to result in two operations",
    });
}());

(function () {
    var O = {
        x: 5,
    };
    var A = {
        x: 5,
        y: [
            "one",
            "two",
        ]
    };
    var B = {z: 23};
    basicTest({
        doc: Sortify(O),
        s_toTransform: Sortify(B),
        s_transformBy: Sortify(A),
        expected: Sortify({
            y: ["one", "two"],
            z: 23
        }),
        name: "wat",
        skipIfNaive: true
    });
}());

(function () {
    var O = [[]];
    var A = [[1]];
    var B = [[2]];
    basicTest({
        doc: Sortify(O),
        s_toTransform: Sortify(B),
        s_transformBy: Sortify(A),
        expected: Sortify([[1, 2]]),
        name: "Expected A to take precedence over B when both push",
        skipIfNaive: true
    });
}());

(function () {
    var O = [{x: 5}];

    var A = clone(O);
    A.unshift("unshifted"); // ["unshifted",{"x":5}]

    var B = clone(O);
    B[0].x = 7; // [{"x":7}]

    basicTest({
        doc: Sortify(O),
        s_toTransform: Sortify(B),
        s_transformBy: Sortify(A),
        expected: Sortify([ "unshifted", { x: 7} ]),
        name: "Expected unshift to result in a splice operation"
    });
}());

(function () {
    var O = { };
    var A = {x:5};
    var B = {y: 7};
    basicTest({
        doc: Sortify(O),
        s_toTransform: Sortify(B),
        s_transformBy: Sortify(A),
        expected: Sortify({x:5, y: 7}),
        name: "replace->replace (Case #1 No conflict)",
        skipIfNaive: true
    });
}());

(function () { // simple merge with deletions
    var O = {z: 17};
    var A = {x:5};
    var B = {y: 7};
    basicTest({
        doc: Sortify(O),
        s_toTransform: Sortify(B),
        s_transformBy: Sortify(A),
        expected: Sortify({x:5, y: 7}),
        name: "simple merge with deletions",
        skipIfNaive: true
    });
}());

// remove->remove
(function () {
    var O = { x: 5, };
    var A = {};
    var B = {};
    basicTest({
        doc: Sortify(O),
        s_toTransform: Sortify(B),
        s_transformBy: Sortify(A),
        expected: Sortify({}),
        name: "Identical removals should be deduplicated"
    });
}());

// replace->remove
(function () {
    var O = {
        x: 5,
    };
    var A = {
        x: 7,
    };
    var B = { };
    basicTest({
        doc: Sortify(O),
        s_toTransform: Sortify(B),
        s_transformBy: Sortify(A),
        expected: Sortify({x: 7}),
        name: "replacements should override removals. (Case #2)",
        skipIfNaive: true // outputs the right thing but makes a stack trace.
    });
}());

// replace->splice
(function () {
    var O = [{x:5}];
    var A = clone(O);
    A[0].x = 7;
    var B = clone(O);
    B.unshift(3);

    basicTest({
        doc: Sortify(O),
        s_toTransform: Sortify(B),
        s_transformBy: Sortify(A),
        expected: Sortify([3, {x: 7}]),
        name: "replace->splice (Case #3)"
    });
}());

// remove->replace
(function () {
    var O = { x: 5, };
    var A = { };
    var B = { x: 7, };
    basicTest({
        doc: Sortify(O),
        s_toTransform: Sortify(B),
        s_transformBy: Sortify(A),
        expected: Sortify({x:7}),
        name: "removals should not override replacements. (Case #4)",
        skipIfNaive: true
    });
}());

// remove->remove
(function () {
    var O = { x: 5, };
    var A = {};
    var B = {};
    basicTest({
        doc: Sortify(O),
        s_toTransform: Sortify(B),
        s_transformBy: Sortify(A),
        expected: Sortify({}),
        name: "identical removals should be deduped. (Case #5)"
    });
}());

// remove->splice
// TODO
(function () {
    var O = [{x:5}];
    var A = [{}];
    var B = [2, {x: 5}];
    basicTest({
        doc: Sortify(O),
        s_toTransform: Sortify(B),
        s_transformBy: Sortify(A),
        expected: Sortify([2, {}]),
        name: "remove->splice (Case #6)"
    });
}());

(function () {
    var O = [
        {
            x:5,
        }
    ];

    var A = clone(O);
    A.unshift(7);

    var B = clone(O);

    basicTest({
        doc: Sortify(O),
        s_toTransform: Sortify(B),
        s_transformBy: Sortify(A),
        expected: Sortify([ 7, { x:5 } ]),
        name: "splice->replace (Case #7)"
    });
}());

// splice->remove
(function () {
    var O = [
        1,
        {
            x: 5,
        }
    ];

    var A = [
        1,
        2,
        {
            x: 5,
        }
    ];

    var B = [
        1,
        {}
    ];
    basicTest({
        doc: Sortify(O),
        s_toTransform: Sortify(B),
        s_transformBy: Sortify(A),
        expected: Sortify([1, 2, {}]),
        name: "splice->remove (Case #8)"
    });
}());

basicTest({
    doc: '[]', s_toTransform: '["two"]', s_transformBy: '["one"]', expected: '["one","two"]',
    name: "splice->splice (Case #9)",
    skipIfNaive: true
});

(function () {
    var O = {
        x: [],
        y: { },
        z: "pew",
    };

    var A = clone(O);
    var B = clone(O);

    A.x.push("a");
    B.x.push("b");

    A.y.a = 5;
    B.y.a = 7;

    A.z = "bang";
    B.z = "bam!";

    basicTest({
        doc: Sortify(O),
        s_toTransform: Sortify(B),
        s_transformBy: Sortify(A),
        expected: Sortify({
            x: ['a', 'b'],
            y: {
                a: 5,
            },
            z: 'bam!bang',
        }),
        name: "Incorrect merge",
        //comment: 'Caleb: Without the arbitor, the string is just "bang"',
        skipIfNaive: true
    });
}());

assert(function (expected, jsonTransformer) {
    var O = '[]';
    var A = '["a"]';
    var B = '["b"]';

    var actual = jsonTransformer(
        Diff.diff(O, B),
        Diff.diff(O, A),
        O
    );

    //console.log(Operation.applyMulti(actual, A));

    if (!deepEqual(actual, expected)) { return actual; }
    return true;
}, "ot is incorrect", 
    [ { type: 'Operation', offset: 4, toInsert: ',"b"', toRemove: 0 } ],
true); // skipIfNaive

assert(function (E, jsonTransformer) {
    var O = Sortify(['pewpew']);
    var A = Sortify(['pewpew bang']);

    var o_A = Diff.diff(O, A);

    var B = Sortify(['powpow']);
    var o_B = Diff.diff(O, B);

    var actual = jsonTransformer(o_A, o_B, O); //, true);

    var R = Operation.applyMulti(o_B, O);
    R = Operation.applyMulti(actual, R);

    if (R !== E) {
        return R;
    }

    return true;
}, "transforming concurrent edits to a single string didn't work", '["powpow bang"]');

assert(function (expected, jsonTransformer) {
    var O = '{}';
    var A = Diff.diff(O, Sortify({y: 7}));
    var B = Diff.diff(O, Sortify({x: 5}));

    var actual = jsonTransformer(A, B, O);

    var temp = Operation.applyMulti(A, O);
    temp = Operation.applyMulti(actual, temp);

    try { JSON.parse(temp); }
    catch (e) { return temp; }

    if (!deepEqual(actual, expected)) {
        console.log(actual);
        console.log(expected);
        return actual;
    }
    return true;
}, 'ot on empty maps is incorrect (#1)', [ {
    // this is incorrect! // FIXME
    type: 'Operation', toInsert: ',"y":7', toRemove: 0, offset: 6
} ], true); // skipIfNaive

assert(function (expected, jsonTransformer) {
    var O = '{}';
    var A = Diff.diff(O, Sortify({x: 7}));
    var B = Diff.diff(O, Sortify({y: 5}));

    var actual = jsonTransformer(A, B, O);

    var temp = Operation.applyMulti(A, O);
    temp = Operation.applyMulti(actual, temp);

    try { JSON.parse(temp); }
    catch (e) {
        console.log(temp);
        throw e;
    }

    if (!deepEqual(actual, expected)) {
        return actual;
    }
    return true;
}, 'ot on empty maps is incorrect (#2)',
    [ { type: 'Operation', toInsert: 'x":7,"', toRemove: 0, offset: 2 } ],
true); // skipIfNaive

var checkTransform = function (O, A, B, E, M) {
    assert(function (expected, jsonTransformer) {
        var s_O = Sortify(O);

        var o_a = Diff.diff(s_O, Sortify(A));
        var o_b = Diff.diff(s_O, Sortify(B));

        var o_c = jsonTransformer(o_b, o_a, s_O);

        var doc = Operation.applyMulti(o_a, s_O);
        doc = Operation.applyMulti(o_c, doc);

        var result;
        try { result = JSON.parse(doc); }
        catch (e) { return e; }

        if (!deepEqual(result, E)) {
            return result;
        }
        return true;
    }, M || "", E);
};

var goesBothWays = function (O, A, B, E, M) {
    checkTransform(O, A, B, E, M);
    checkTransform(O, B, A, E, M);
};

goesBothWays(
    ['BODY', {}, [
        ['P', {}, [['BR', {}, []]],
        ['P', {}, ['quick red fox']]
    ]]],
    ['BODY', {}, [
        ['P', {}, [['BR', {}, []]],
        ['P', {}, ['The quick red fox']]
    ]]],

    ['BODY', {}, [
        ['P', {}, [['BR', {}, []]],
        ['P', {}, ['quick red fox jumped over the lazy brown dog']]
    ]]],

    ['BODY', {}, [
        ['P', {}, [['BR', {}, []]],
        ['P', {},
            [ 'The quick red fox jumped over the lazy brown dog'],
        ]
    ]]],

    'ot on the same paragraph failed');


assert(function (E, jsonTransformer) {
    // define a parent state and create a string representation of it
    var O = ['BODY', {}, [
        ['P', {}, ['the quick red']]
    ]];
    var s_O = Sortify(O);

    // append text into a text node
    var A = JSON.parse(s_O);
    A[2][0][2][0] = 'the quick red fox';

    // insert a new paragraph at the top
    var B = JSON.parse(s_O);
    B[2].unshift(['P', {}, [
        'pewpew',
    ]]);

    // infer necessary text operations
    var o_A = Diff.diff(s_O, Sortify(A));
    var o_B = Diff.diff(s_O, Sortify(B));

    // construct a transformed text operation which takes into account the fact
    // that we are working with JSON
    var o_X = jsonTransformer(o_A, o_B, s_O);

    if (!o_X) {
        console.log(o_A);
        console.log(o_B);
        console.log(o_X);
        throw new Error("Expected ot to result in a patch");
    }

    // apply both ops to the original document in the right order
    var doc = Operation.applyMulti(o_B, s_O);
    doc = Operation.applyMulti(o_X, doc);

    // parse the result
    var parsed = JSON.parse(doc);

    // make sure it checks out
    if (!deepEqual(parsed, E)) { return parsed; }
    return true;
}, "failed to transform paragraph insertion and text node update in hyperjson",
    ['BODY', {}, [
        ['P', {}, ['pewpew']],
        ['P', {}, ['the quick red fox']],
    ]]
);

assert(function (E, jsonTransformer) {
    var O = ['BODY', {},
        ['P', {}, [
            ['STRONG', {}, ['bold']]
        ]]
    ];
    var s_O = Sortify(O);

    var A = JSON.parse(s_O);
    A[2][2][0] = 'pewpew';
    var s_A = Sortify(A);

    var d_A = Diff.diff(s_O, s_A);

    var B = JSON.parse(s_O);
    B[2][2][0][2] = 'bolded text';

    var s_B = Sortify(B);
    var d_B = Diff.diff(s_O, s_B);

    var ops = jsonTransformer(d_B, d_A, s_O);

    if (!ops.length) {
        /*  Your outgoing operation was cancelled by the incoming one
            so just apply the incoming one and DEAL WITH IT */
        var temp = Operation.applyMulti(d_A, s_O);
        if (temp !== Sortify(E)) { return temp; }
        return true;
    }
}, "failed OT on removing parent branch",
    ['BODY', {},
        ['P', {}, ["pewpew"]]
    ],
true); // skipIfNaive -> it outputs the right thing but it makes a stack trace.

assert(function (expected, jsonTransformer) {
    var s_O = '["BODY",{},["P",{},["pewpew pezpew"]]]';

    var toTransform = [ { type: "Operation", offset: 27, toRemove: 0, toInsert: "pew" } ];
    var transformBy = [ { type: "Operation", offset: 33, toRemove: 1, toInsert: 'z' } ];

    var d_C = jsonTransformer(toTransform, transformBy, s_O);

    //var s_A = Operation.applyMulti(toTransform, s_O);
    var s_B = Operation.applyMulti(transformBy, s_O);

    var temp = Operation.applyMulti(d_C, s_B);

    if (temp !== expected) { return temp; }
    return true;
}, "failed ot with 2 operations in the same text node",
'["BODY",{},["P",{},["pewpewpew pezpez"]]]');

basicTest({
    doc: '["BODY",{},["P",{},["pewpew pezpew end"]]]',
    s_toTransform: '["BODY",{},["P",{},["pewpewpew pezpew end"]]]',
    s_transformBy: '["BODY",{},["P",{},["pewpe pezpez"," end"]]]',
    expected: '["BODY",{},["P",{},["pewpe pezpez","pewpewpew pezpew end"]]]',
    name: "failed ot with concurrent operations in the same text nod",
    skipIfNaive: true,
    comment: [
        'TODO This test is passing but only to document the behavior of JSON-OT',
        'Yanns expected output of this test is: ["BODY",{},["P",{},["pewpewpew pezpez"," end"]]]',
        'NaiveJSONTransformer results in:       ["BODY",{},["P",{},["pewpe pezpez","pew end"]]]',
        'The output is:                         ["BODY",{},["P",{},["pewpe pezpez","pewpewpew pezpew end"]]]'
    ].join('\n')
});

basicTest({
    doc: '["a"]', s_toTransform: '["b"]', s_transformBy: '["c"]', expected: '["bc"]',
    name: "multiple intersecting array splices (replace replace)",
});

basicTest({
    doc: '["a","b"]', s_toTransform: '["a","c"]', s_transformBy: '["a","d"]', expected: '["a","cd"]',
    name: "multiple intersecting array splices (replace replace) with element before",
});

basicTest({
    doc: '["b","a"]', s_toTransform: '["c","a"]', s_transformBy: '["b","a"]', expected: '["c","a"]',
    name: "multiple intersecting array splices (replace replace) with element after"
});

basicTest({
    doc: '["a"]', s_toTransform: '["b"]', s_transformBy: '["a","c"]', expected: '["b","c"]',
    name: "multiple intersecting array splices (replace push)"
});

basicTest({
    doc: '["a"]', s_toTransform: '["a","c"]', s_transformBy: '["b"]', expected: '["b","c"]',
    name: "multiple intersecting array splices (push replace)"
});

basicTest({
    doc: '["a"]', s_toTransform: '["a","b"]', s_transformBy: '["a","c"]', expected: '["a","c","b"]',
    name: "multiple intersecting array splices (push push)",
    skipIfNaive: true
});

basicTest({
    doc: '["a"]', s_toTransform: '[]', s_transformBy: '["b"]', expected: '[]',
    name: "multiple intersecting array splices (remove replace)",
    skipIfNaive: true
});

basicTest({
    doc: '["a"]', s_toTransform: '["b"]', s_transformBy: '[]', expected: '[]',
    name: "multiple intersecting array splices (replace remove)",
    skipIfNaive: true
});

basicTest({
    doc: '["a"]', s_toTransform: '[]', s_transformBy: '["a","c"]', expected: '["c"]',
    name: "multiple intersecting array splices (remove push)",
    // expected value was set to an incorrect value, but we now produce the correct value
    // this test has since been un-stubbed
    comment: 'Caleb: This should result in ["c"]',
    skipIfNaive: true
});

basicTest({
    doc: '["a"]', s_toTransform: '[]', s_transformBy: '["c","a"]', expected: '["c"]',
    name: "multiple intersecting array splices (remove unshift)",
    skipIfNaive: true
});

module.exports.main = function (cycles /*:number*/, callback /*:()=>void*/) {
    runASSERTS(SmartJSONTransformer);
    if (failed) {
        console.log("\n%s assertions passed and %s failed", assertions, failMessages.length);
        throw new Error();
    }
    console.log("[SUCCESS] %s tests passed", assertions);

    runASSERTS(NaiveJSONTransformer);
    if (failed) {
        console.log("\n%s assertions passed and %s failed", assertions, failMessages.length);
        throw new Error();
    }
    console.log("[SUCCESS] %s tests passed", assertions);
    callback();
};
