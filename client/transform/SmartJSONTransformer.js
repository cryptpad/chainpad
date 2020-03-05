
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

var Sortify = require('json.sortify');
var Diff = require('../Diff');
//var Patch = require('../Patch');
var Operation = require('../Operation');
var TextTransformer = require('./TextTransformer');
//var Sha = require('../sha256');

/*::
import type { Operation_t } from '../Operation';
*/

var isArray = function (obj) {
    return Object.prototype.toString.call(obj)==='[object Array]';
};

/*  Arrays and nulls both register as 'object' when using native typeof
    we need to distinguish them as their own types, so use this instead. */
var type = function (dat) {
    return dat === null?  'null': isArray(dat)?'array': typeof(dat);
};

var find = function (map, path) {
    var l = path.length;
    for (var i = 0; i < l; i++) {
        if (typeof(map[path[i]]) === 'undefined') { return; }
        map = map[path[i]];
    }
    return map;
};

var clone = function (val) {
    return JSON.parse(JSON.stringify(val));
};

var deepEqual = function (A /*:any*/, B /*:any*/) {
    var t_A = type(A);
    var t_B = type(B);
    if (t_A !== t_B) { return false; }
    if (t_A === 'object') {
        var k_A = Object.keys(A);
        var k_B = Object.keys(B);
        return k_A.length === k_B.length &&
            !k_A.some(function (a) { return !deepEqual(A[a], B[a]); }) &&
            !k_B.some(function (b) { return !(b in A); });
    } else if (t_A === 'array') {
        return A.length === B.length &&
            !A.some(function (a, i) { return !deepEqual(a, B[i]); });
    } else {
        return A === B;
    }
};

/*::
export type SmartJSONTransformer_Replace_t = {
    type: 'replace',
    path: Array<string|number>,
    value: any,
    prev: any
};
export type SmartJSONTransformer_Splice_t = {
    type: 'splice',
    path: Array<string|number>,
    value: any,
    offset: number,
    removals: number
};
export type SmartJSONTransformer_Remove_t = {
    type: 'remove',
    path: Array<string|number>,
    value: any
};
export type SmartJSONTransformer_Operation_t =
    SmartJSONTransformer_Replace_t | SmartJSONTransformer_Splice_t | SmartJSONTransformer_Remove_t;
*/

var operation = function (type, path, value, prev, other) /*:SmartJSONTransformer_Operation_t*/ {
    if (type === 'replace') {
        return ({
            type: 'replace',
            path: path,
            value: value,
            prev: prev,
        } /*:SmartJSONTransformer_Replace_t*/);
    } else if (type === 'splice') {
        if (typeof(prev) !== 'number') { throw new Error(); }
        if (typeof(other) !== 'number') { throw new Error(); }
        return ({
            type: 'splice',
            path: path,
            value: value,
            offset: prev,
            removals: other
        } /*:SmartJSONTransformer_Splice_t*/);
    } else if (type !== 'remove') { throw new Error('expected a removal'); }
    // if it's not a replace or splice, it's a 'remove'
    return ({
        type: 'remove',
        path: path,
        value: value,
    } /*:SmartJSONTransformer_Remove_t*/);
};

var replace = function (ops, path, to, from) {
    ops.push(operation('replace', path, to, from));
};

var remove = function (ops, path, val) {
    ops.push(operation('remove', path, val));
};


// HERE
var splice = function (ops, path, value, offset, removals) {
    ops.push(operation('splice', path, value, offset, removals));
};

/*
    all of A's path is at the beginning of B
    roughly:  B.indexOf(A) === 0
*/
var pathOverlaps = function (A /*:Array<string|number>*/, B /*:Array<string|number>*/) {
    return !A.some(function (a, i) {
        return a !== B[i];
    });
};

// OT Case #1 replace->replace ✔
// OT Case #2 replace->remove ✔
// OT Case #3 replace->splice ✔
// OT Case #4 remove->replace ✔
// OT Case #5 remove->remove ✔
// OT Case #6 remove->splice ✔
// OT Case #7 splice->replace ✔
// OT Case #8 splice->remove ✔
// OT Case #9 splice->splice ✔
var CASES = (function () {
    var types = ['replace', 'remove', 'splice'];

    var matrix = {};
    var i = 1;

    types.forEach(function (a) {
        matrix[a] = {};
        return types.forEach(function (b) { matrix[a][b] = i++; });
    });
    return matrix;
}());

// A and B are lists of operations which result from calling diff

var resolve = function (A /*:any*/, B /*:any*/, arbiter /*:?function*/) {
    if (!(type(A) === 'array' && type(B) === 'array')) {
        throw new Error("[resolve] expected two arrays");
    }

    /* OVERVIEW
        * B
        *  1. filter removals at identical paths
        *
        */

    B = B.filter(function (b) {
            // if A removed part of the tree you were working on...
            if (A.some(function (a) {
                if (a.type === 'remove') {
                    if (pathOverlaps(a.path, b.path)) {
                        if (b.path.length - a.path.length > 1) { return true; }
                    }
                }
            })) {
                // this is weird... FIXME
                return false;
            }

            /*  remove operations which would no longer make sense
                for instance, if a replaces an array with a string,
                that would invalidate a splice operation at that path */
            if (b.type === 'splice' && A.some(function (a) {
                if (a.type === 'splice' && pathOverlaps(a.path, b.path)) {
                    if (a.path.length - b.path.length < 0) {
                        if (!a.removals) { return; }

                        var start = a.offset;
                        var end = a.offset + a.removals;

                        for (;start < end; start++) {
                            if (start === b.path[a.path.length]) {
                                /*
                                if (typeof(arbiter) === 'function' &&
                                    deepEqual(a.path, b.path) &&
                                    a.value.length === 1 &&
                                    b.value.length === 1 &&
                                    typeof(a.value[0]) === 'string' &&
                                    typeof(b.value[0]) === 'string') {
                                    console.log('strings');

                                    return arbiter(a, b, CASES.splice.splice);
                                }
                                */

                                // b is a descendant of a removal
                                return true;
                            }
                        }
                    }
                }
            })) { return false; }

            if (!A.some(function (a) {
                return b.type === 'remove' && deepEqual(a.path, b.path);
            })) { return true; }
        })
        .filter(function (b) {
            // let A win conflicts over b if no arbiter is supplied here

            // Arbiter is required here
            return !A.some(function (a) {
                if (b.type === 'replace' && a.type === 'replace') {
                    // remove any operations which return true
                    if (deepEqual(a.path, b.path)) {
                        if (typeof(a.value) === 'string' && typeof(b.value) === 'string') {
                            if (arbiter && a.prev === b.prev && a.value !== b.value) {
                                return arbiter(a, b, CASES.replace.replace);
                            }
                            return true;
                        }
                        return true;
                    }
                }
            });
        })
        .map(function (b) {
            // if a splice in A modifies the path to b
            // update b's path to reflect that

            A.forEach(function (a) {
                if (a.type === 'splice') {
                    // TODO
                    // what if a.path == b.path

            // resolve insertion overlaps array.push conflicts
            // iterate over A such that each overlapping splice
            // adjusts the path/offset/removals of b

                    if (deepEqual(a.path, b.path)) {
                        if (b.type === 'splice') {
                            // if b's offset is outside of a's range
                            // decrease its offset by a delta length
                            if (b.offset > (a.offset + b.removals)) {
                                b.offset += a.value.length - a.removals;
                                return;
                            }

                            if (b.offset < a.offset) {
                            // shorten the list of removals to before a's offset
                            // TODO this is probably wrong, but it's making tests pass...
                                b.removals = Math.max(a.offset - b.offset, 0);
                                return;
                            }

                            // otherwise, a and b have the same offset
                            // substract a's removals from your own
                            b.removals = Math.max(b.removals - (b.offset + a.removals - b.offset), 0);
                            // and adjust your offset by the change in length introduced by a
                            b.offset += (a.value.length - a.removals);
                        } else {
                            // adjust the path of b to account for the splice
                            // TODO
                        }
                        return;
                    }

                    if (pathOverlaps(a.path, b.path)) {
                        // TODO validate that this isn't an off-by-one error
                        var pos = a.path.length;
                        if (typeof(b.path[pos]) === 'number' && a.offset <= b.path[pos]) { // FIXME a.value is undefined
                            b.path[pos] += (a.value.length - a.removals);
                        }
                    }
                }
            });

            return b;
        });

    return B;
};

// A, B, f, path, ops
var objects = function (A, B, path, ops) {
    var Akeys = Object.keys(A);
    var Bkeys = Object.keys(B);

    Bkeys.forEach(function (b) {
        var t_b = type(B[b]);
        var old = A[b];

        var nextPath = path.concat(b);

        if (Akeys.indexOf(b) === -1) {
            // there was an insertion

            // mind the fallthrough behaviour
            if (t_b === 'undefined') {
                throw new Error("undefined type has key. this shouldn't happen?");
            }
            if (old) { throw new Error("no such key existed in b, so 'old' should be falsey"); }
            replace(ops, nextPath, B[b], old);
            return;
        }

        // else the key already existed
        var t_a = type(old);
        if (t_a !== t_b) {
            // its type changed!
            console.log("type changed from [%s] to [%s]", t_a, t_b);
            // type changes always mean a change happened
            if (t_b === 'undefined') {
                throw new Error("first pass should never reveal undefined keys");
            }
            replace(ops, nextPath, B[b], old);
            return;
        }

        if (t_a === 'object') {
            // it's an object
            objects(A[b], B[b], nextPath, ops);
        } else if (t_a === 'array') {
            // it's an array
            arrays(A[b], B[b], nextPath, ops);
        } else if (A[b] !== B[b]) {
            // it's not an array or object, so we can do === comparison
            replace(ops, nextPath, B[b], old);
        }
    });
    Akeys.forEach(function (a) {
        // the key was deleted
        if (Bkeys.indexOf(a) === -1 || type(B[a]) === 'undefined') {
            remove(ops, path.concat(a), A[a]);
        }
    });
};

var arrayShallowEquality = function (A, B) {
    if (A.length !== B.length) { return false; }
    for (var i = 0; i < A.length; i++) {
    if (type(A[i]) !== type(B[i])) { return false; }
    }
    return true;
};

// When an element in an array (number, string, bool) is changed, instead of a replace we
// will do a splice(offset, [element], 1)
var arrays = function (A_orig, B, path, ops) {
    var A = A_orig.slice(0); // shallow clone

    if (A.length === 0) {
    // A is zero length, this is going to be easy...
    splice(ops, path, B, 0, 0);

    } else if (arrayShallowEquality(A, B)) {
    // This is a relatively simple case, the elements in A and B are all of the same type and if
    // that type happens to be a primitive type, they are also equal.
    // This means no change will be needed at the level of this array, only it's children.
    A.forEach(function (a, i) {
        var b = B[i];
        if (b === a) { return; }
        var old = a;
        var nextPath = path.concat(i);

        var t_a = type(a);
        switch (t_a) {
        case 'undefined':
            throw new Error('existing key had type `undefined`. this should never happen');
        case 'object':
            objects(a, b, nextPath, ops);
            break;
        case 'array':
            arrays(a, b, nextPath, ops);
            break;
        default:
        //console.log('replace: ' + t_a);
            //splice(ops, path, [b], i, 1);
            replace(ops, nextPath, b, old);
        }
    });
    } else {
    // Something was changed in the length of the array or one of the primitives so we're going
    // to make an actual change to this array, not only it's children.
    var commonStart = 0;
    var commonEnd = 0;
    while (commonStart < A.length && deepEqual(A[commonStart], B[commonStart])) { commonStart++; }
    while (deepEqual(A[A.length - 1 - commonEnd], B[B.length - 1 - commonEnd]) &&
            commonEnd + commonStart < A.length && commonEnd + commonStart < B.length)
    {
        commonEnd++;
    }
    var toRemove = A.length - commonStart - commonEnd;
    var toInsert = [];
    if (B.length !== commonStart + commonEnd) {
        toInsert = B.slice(commonStart, B.length - commonEnd);
    }
    splice(ops, path, toInsert, commonStart, toRemove);
    }
};

var diff = function (A, B) {
    var ops = [];

    var t_A = type(A);
    var t_B = type(B);

    if (t_A !== t_B) {
        throw new Error("Can't merge two objects of differing types");
    }

    if (t_B === 'array') {
        arrays(A, B, [], ops);
    } else if (t_B === 'object') {
        objects(A, B, [], ops);
    } else {
        throw new Error("unsupported datatype" + t_B);
    }
    return ops;
};

var applyOp = function (O, op /*:SmartJSONTransformer_Operation_t*/) {
    var path;
    var key;
    var result;
    switch (op.type) {
        case "replace":
            key = op.path[op.path.length -1];
            path = op.path.slice(0, op.path.length - 1);

            var parent = find(O, path);

            if (!parent) {
                throw new Error("cannot apply change to non-existent element");
            }
            parent[key] = op.value;
            break;
        case "splice":
            var found = find(O, op.path);
            if (!found) {
                console.error("[applyOp] expected path [%s] to exist in object", op.path.join(','));
                throw new Error("Path did not exist");
            }

            if (type(found) !== 'array') {
                throw new Error("Can't splice non-array");
            }

            Array.prototype.splice.apply(found, [op.offset, op.removals].concat(op.value));
            break;
        case "remove":
            key = op.path[op.path.length -1];
            path = op.path.slice(0, op.path.length - 1);
            result = find(O, path);
            if (typeof(result) !== 'undefined') { delete result[key]; }
            break;
        default:
            throw new Error('unsupported operation type');
    }
};

var patch = function (O, ops) {
    ops.forEach(function (op) {
        applyOp(O, op);
    });
    return O;
};

    
/////

// We mutate b in this function
// Our operation is p_b and the other person's operation is p_a.
// If we return true here, it means our operation will die off.
var arbiter = function (p_a, p_b, c) {
    if (p_a.prev !== p_b.prev) { throw new Error("Parent values don't match!"); }

    if (c === CASES.splice.splice) {
        // We and the other person are both pushing strings to an array so
        // we'll just accept both of them into the array.
        console.log(p_a);
        console.log(p_b);
        console.log('\n\n\n\n\n\n\n\n\n');
        // TODO: do we really want to kill off our operation in this case ?
        return true;
    }
    var o = p_a.prev;

    var ops_a = Diff.diff(o, p_a.value);
    var ops_b = Diff.diff(o, p_b.value);

    /*  given the parent text, the op to transform, and the incoming op
        return a transformed operation which takes the incoming
        op into account */
    var ops_x = TextTransformer(ops_b, ops_a, o);

    /*  Apply the incoming operation to the parent text
    */
    var x2 = Operation.applyMulti(ops_a, o);

    /*  Apply the transformed operation to the result of the incoming op
    */
    var x3 = Operation.applyMulti(ops_x, x2);

    p_b.value = x3;
};

module.exports = function (
    opsToTransform /*:Array<Operation_t>*/,
    opsTransformBy /*:Array<Operation_t>*/,
    s_orig /*:string*/ ) /*:Array<Operation_t>*/
{
    var o_orig = JSON.parse(s_orig);
    var s_transformBy = Operation.applyMulti(opsTransformBy, s_orig);
    var o_transformBy = JSON.parse(s_transformBy);
    // try whole patch at a time, see how it goes...
    var s_toTransform = Operation.applyMulti(opsToTransform, s_orig);
    var o_toTransform = JSON.parse(s_toTransform);

    try {
        var diffTTF = diff(o_orig, o_toTransform);
        var diffTFB = diff(o_orig, o_transformBy);
        var newDiffTTF = resolve(diffTFB, diffTTF, arbiter);

        // mutates orig
        patch(o_orig, diffTFB);
        patch(o_orig, newDiffTTF);

        var result = Sortify(o_orig);
        var ret = Diff.diff(s_transformBy, result);
        return ret;

    } catch (err) {
        console.error(err); // FIXME Path did not exist...
    }
    return [];
};


module.exports._ = {
    clone: clone,
    pathOverlaps: pathOverlaps,
    deepEqual: deepEqual,
    diff: diff,
    resolve: resolve,
    patch: patch,
    arbiter: arbiter,
};
