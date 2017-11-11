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

var Operation = require('./Operation');
var Common = require('./Common');

/*::
import type { Operation_t } from './Operation';
*/

var DEFAULT_BLOCKSIZE = module.exports.DEFAULT_BLOCKSIZE = 8;

var hashScan = function (str, blockSize) {
    var out = {};
    for (var i = 0; i + blockSize <= str.length; i++) {
        var slice = str.slice(i, i + blockSize);
        (out[slice] = out[slice] || []).push(i);
    }
    return out;
};

var isCompatible = function (m1, m2) {
    if (m1.oldIndex < m2.oldIndex) {
        if (m1.oldIndex + m1.length > m2.oldIndex) { return false; }
        if (m1.newIndex + m1.length > m2.newIndex) { return false; }
    } else if (m2.oldIndex < m1.oldIndex) {
        if (m2.oldIndex + m2.length > m1.oldIndex) { return false; }
        if (m2.newIndex + m2.length > m1.newIndex) { return false; }
    } else {
        return false;
    }
    return true;
};

var isBetter = function (test, reference) {
    var testVal = (test.length * 2) - test.oldIndex - test.newIndex;
    var refVal = (reference.length * 2) - reference.oldIndex - reference.newIndex;
    return testVal > refVal;
};

var reduceMatches = function (matches) {
    matches.sort(function (a, b) { return (a.oldIndex + a.newIndex) - (b.oldIndex + b.newIndex); });
    var out = [];
    var i = 0;
    var m = matches[i++];
    if (!m) { return out; }
    while (i < matches.length) {
        var mn = matches[i++];
        if (!isCompatible(mn, m)) {
            //console.log(JSON.stringify(mn) + ' is incompatible with ' + JSON.stringify(m));
            // If mn is "better" than m, replace m with mn
            if (!isBetter(mn, m)) { continue; }
        } else {
            out.push(m);
        }
        m = mn;
    }
    out.push(m);
    return out;
};

var resolve = function (str, hash, blockSize) {
    var matches = [];
    var candidates = [];
    for (var i = 0; i + blockSize <= str.length; i++) {
        var slice = str.slice(i, i + blockSize);
        var instances = (hash[slice] || []).slice(0);
        for (var j = candidates.length - 1; j >= 0; j--) {
            var c = candidates[j];
            var ii = instances.indexOf(c.oldIndex + c.length - blockSize + 1);
            if (ii > -1) {
                c.length++;
                instances.splice(ii, 1);
            } else {
                // We're pushing all of the candidates as "matches" and then we're going to sort them
                // by length and pull out only ones which are non-intersecting because the result
                // of this function needs to be a set of sequencial non-intersecting matches.
                matches.push(candidates[j]);
                //if (candidates.length === 1) { matches.push(candidates[j]); }

                candidates.splice(j, 1);
            }
        }
        for (var k = 0; k < instances.length; k++) {
            candidates.push({
                newIndex: i,
                oldIndex: instances[k],
                length: blockSize
            });
        }
        //console.log(JSON.stringify(candidates));
    }

    // Normally we would only take one candidate, since they're equal value we just pick one and
    // use it. However since we need all possible candidates which we will feed to our reduce
    // function in order to get a list of sequencial non-intersecting matches.
    Array.prototype.push.apply(matches, candidates);
    //if (candidates[0]) { matches.push(candidates[0]); }

    return matches;
};

var matchesToOps = function (oldS, newS, matches) {
    matches.sort(function (a, b) { return a.oldIndex - b.oldIndex; });
    var oldI = 0;
    var newI = 0;
    var out = [];
    for (var i = 0; i < matches.length; i++) {
        var m = matches[i];
        out.push(Operation.create(oldI, m.oldIndex - oldI, newS.slice(newI, m.newIndex)));
        oldI = m.oldIndex + m.length;
        newI = m.newIndex + m.length;
    }
    out.push(Operation.create(oldI, oldS.length - oldI, newS.slice(newI)));
    return out.filter(function (x) { return x.toRemove || x.toInsert; });
};

var getCommonBeginning = function (oldS, newS) {
    var commonStart = 0;
    var limit = oldS.length < newS.length ? oldS.length : newS.length;
    while (oldS.charAt(commonStart) === newS.charAt(commonStart) && commonStart < limit) {
        commonStart++;
    }
    return { newIndex: 0, oldIndex: 0, length: commonStart };
};

var getCommonEnd = function (oldS, newS, commonBeginning) {
    var oldEnd = oldS.length - 1;
    var newEnd = newS.length - 1;
    var limit = Math.min(oldEnd, newEnd) - commonBeginning;
    var commonEnd = 0;
    while (oldS.charAt(oldEnd) === newS.charAt(newEnd) && limit >= 0) {
        oldEnd--;
        newEnd--;
        commonEnd++;
        limit--;
    }
    return { newIndex: newEnd + 1, oldIndex: oldEnd + 1, length: commonEnd };
};

var diff = module.exports.diff = function (
    oldS /*:string*/,
    newS /*:string*/,
    blockSize /*:?number*/ ) /*:Array<Operation_t>*/
{
    blockSize = blockSize || DEFAULT_BLOCKSIZE;
    var cb = getCommonBeginning(oldS, newS);
    if (cb.length === oldS.length && oldS.length === newS.length) { return []; }
    var ce = getCommonEnd(oldS, newS, cb.length);
    var oldST = oldS;
    var newST = newS;
    if (ce.length) {
        oldST = oldST.slice(0, ce.oldIndex+1);
        newST = newST.slice(0, ce.newIndex+1);
    }
    if (cb.length) {
        oldST = oldST.slice(cb.length);
        newST = newST.slice(cb.length);
    }
    var matches = resolve(newST, hashScan(oldST, blockSize), blockSize);
    if (cb.length) {
        for (var i = 0; i < matches.length; i++) {
            matches[i].oldIndex += cb.length;
            matches[i].newIndex += cb.length;
        }
        matches.push(cb);
    }
    if (ce.length) { matches.push(ce); }
    var reduced = reduceMatches(matches);
    var ops = matchesToOps(oldS, newS, reduced);
    if (Operation.applyMulti(ops, oldS) !== newS) {
        window.ChainPad_Diff_DEBUG = {
            oldS: oldS,
            newS: newS,
            matches: matches,
            reduced: reduced,
            ops: ops
        };
        console.log("diff did not make a sane patch, check window.ChainPad_Diff_DEBUG");
        ops = matchesToOps(oldS, newS, [cb, ce]);
        if (Operation.applyMulti(ops, oldS) !== newS) {
            throw new Error("diff is unrecoverable");
        }
    }
    return ops;
};