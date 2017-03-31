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

var Operation = module.exports;

/*::
export type Operation_t = {
    type: 'Operation',
    offset: number,
    toRemove: number,
    toInsert: string
};
export type Operation_Packed_t = [number, number, string];
export type Operation_Simplify_t = (Operation_t, string, typeof(Operation.simplify))=>?Operation_t;
export type Operation_Transform_t = (string, Operation_t, Operation_t)=>?Operation_t;
*/

var check = Operation.check = function (op /*:any*/, docLength_opt /*:?number*/) /*:Operation_t*/ {
    Common.assert(op.type === 'Operation');
    if (!Common.isUint(op.offset)) { throw new Error(); }
    if (!Common.isUint(op.toRemove)) { throw new Error(); }
    if (typeof(op.toInsert) !== 'string') { throw new Error(); }
    if (op.toRemove < 1 && op.toInsert.length < 1) { throw new Error(); }
    Common.assert(typeof(docLength_opt) !== 'number' || op.offset + op.toRemove <= docLength_opt);
    return op;
};

var create = Operation.create = function (
    offset /*:?number*/,
    toRemove /*:?number*/,
    toInsert /*:?string*/)
{
    var out = {
        type: 'Operation',
        offset: offset || 0,
        toRemove: toRemove || 0,
        toInsert: toInsert || '',
    };
    if (Common.PARANOIA) { check(out); }
    return Object.freeze(out);
};

var toObj = Operation.toObj = function (op /*:Operation_t*/) {
    if (Common.PARANOIA) { check(op); }
    return [op.offset,op.toRemove,op.toInsert];
};

 // Allow any as input because we assert its type internally..
var fromObj = Operation.fromObj = function (obj /*:any*/) {
    Common.assert(Array.isArray(obj) && obj.length === 3);
    return create(obj[0], obj[1], obj[2]);
};

/**
 * @param op the operation to apply.
 * @param doc the content to apply the operation on
 */
var apply = Operation.apply = function (op /*:Operation_t*/, doc /*:string*/)
{
    if (Common.PARANOIA) {
        Common.assert(typeof(doc) === 'string');
        check(op, doc.length);
    }
    return doc.substring(0,op.offset) + op.toInsert + doc.substring(op.offset + op.toRemove);
};

var invert = Operation.invert = function (op /*:Operation_t*/, doc /*:string*/) {
    if (Common.PARANOIA) {
        check(op);
        Common.assert(typeof(doc) === 'string');
        Common.assert(op.offset + op.toRemove <= doc.length);
    }
    return create(
        op.offset,
        op.toInsert.length,
        doc.substring(op.offset, op.offset + op.toRemove)
    );
};

var simplify = Operation.simplify = function (op /*:Operation_t*/, doc /*:string*/) {
    if (Common.PARANOIA) {
        check(op);
        Common.assert(typeof(doc) === 'string');
        Common.assert(op.offset + op.toRemove <= doc.length);
    }
    var rop = invert(op, doc);

    var minLen = Math.min(op.toInsert.length, rop.toInsert.length);
    var i;
    for (i = 0; i < minLen && rop.toInsert[i] === op.toInsert[i]; i++) ;
    var opOffset = op.offset + i;
    var opToRemove = op.toRemove - i;
    var opToInsert = op.toInsert.substring(i);
    var ropToInsert = rop.toInsert.substring(i);

    if (ropToInsert.length === opToInsert.length) {
        for (i = ropToInsert.length-1; i >= 0 && ropToInsert[i] === opToInsert[i]; i--) ;
        opToInsert = opToInsert.substring(0, i+1);
        opToRemove = i+1;
    }

    if (opToRemove === 0 && opToInsert.length === 0) { return null; }
    return create(opOffset, opToRemove, opToInsert);
};

var equals = Operation.equals = function (opA /*:Operation_t*/, opB /*:Operation_t*/) {
    return (opA.toRemove === opB.toRemove
        && opA.toInsert === opB.toInsert
        && opA.offset === opB.offset);
};

var lengthChange = Operation.lengthChange = function (op /*:Operation_t*/)
{
    if (Common.PARANOIA) { check(op); }
    return op.toInsert.length - op.toRemove;
};

/*
 * @return the merged operation OR null if the result of the merger is a noop.
 */
var merge = Operation.merge = function (oldOpOrig /*:Operation_t*/, newOpOrig /*:Operation_t*/) {
    if (Common.PARANOIA) {
        check(newOpOrig);
        check(oldOpOrig);
    }

    var oldOp_offset = oldOpOrig.offset;
    var oldOp_toRemove = oldOpOrig.toRemove;
    var oldOp_toInsert = oldOpOrig.toInsert;

    var newOp_offset = newOpOrig.offset;
    var newOp_toRemove = newOpOrig.toRemove;
    var newOp_toInsert = newOpOrig.toInsert;

    var offsetDiff = newOp_offset - oldOp_offset;

    if (newOp_toRemove > 0) {
        var origOldInsert = oldOp_toInsert;
        oldOp_toInsert = (
             oldOp_toInsert.substring(0,offsetDiff)
           + oldOp_toInsert.substring(offsetDiff + newOp_toRemove)
        );
        newOp_toRemove -= (origOldInsert.length - oldOp_toInsert.length);
        if (newOp_toRemove < 0) { newOp_toRemove = 0; }

        oldOp_toRemove += newOp_toRemove;
        newOp_toRemove = 0;
    }

    if (offsetDiff < 0) {
        oldOp_offset += offsetDiff;
        oldOp_toInsert = newOp_toInsert + oldOp_toInsert;

    } else if (oldOp_toInsert.length === offsetDiff) {
        oldOp_toInsert = oldOp_toInsert + newOp_toInsert;

    } else if (oldOp_toInsert.length > offsetDiff) {
        oldOp_toInsert = (
            oldOp_toInsert.substring(0,offsetDiff)
          + newOp_toInsert
          + oldOp_toInsert.substring(offsetDiff)
        );
    } else {
        throw new Error("should never happen\n" +
                        JSON.stringify([oldOpOrig,newOpOrig], null, '  '));
    }

    if (oldOp_toInsert === '' && oldOp_toRemove === 0) { return null; }

    return create(oldOp_offset, oldOp_toRemove, oldOp_toInsert);
};

/**
 * If the new operation deletes what the old op inserted or inserts content in the middle of
 * the old op's content or if they abbut one another, they should be merged.
 */
var shouldMerge = Operation.shouldMerge = function (oldOp /*:Operation_t*/, newOp /*:Operation_t*/)
{
    if (Common.PARANOIA) {
        check(oldOp);
        check(newOp);
    }
    if (newOp.offset < oldOp.offset) {
        return (oldOp.offset <= (newOp.offset + newOp.toRemove));
    } else {
        return (newOp.offset <= (oldOp.offset + oldOp.toInsert.length));
    }
};

/**
 * Rebase newOp against oldOp.
 *
 * @param oldOp the eariler operation to have happened.
 * @param newOp the later operation to have happened (in time).
 * @return either the untouched newOp if it need not be rebased,
 *                the rebased clone of newOp if it needs rebasing, or
 *                null if newOp and oldOp must be merged.
 */
var rebase = Operation.rebase = function (oldOp /*:Operation_t*/, newOp /*:Operation_t*/) {
    if (Common.PARANOIA) {
        check(oldOp);
        check(newOp);
    }
    if (newOp.offset < oldOp.offset) { return newOp; }
    return create(
        newOp.offset + oldOp.toRemove - oldOp.toInsert.length,
        newOp.toRemove,
        newOp.toInsert
    );
};

/**
 * this is a lossy and dirty algorithm, everything else is nice but transformation
 * has to be lossy because both operations have the same base and they diverge.
 * This could be made nicer and/or tailored to a specific data type.
 *
 * @param toTransform the operation which is converted
 * @param transformBy an existing operation which also has the same base.
 * @return toTransform *or* null if the result is a no-op.
 */
var transform0 = Operation.transform0 = function (
    text /*:string*/,
    toTransform /*:Operation_t*/,
    transformBy /*:Operation_t*/)
{
    if (toTransform.offset > transformBy.offset) {
        if (toTransform.offset > transformBy.offset + transformBy.toRemove) {
            // simple rebase
            return create(
                toTransform.offset - transformBy.toRemove + transformBy.toInsert.length,
                toTransform.toRemove,
                toTransform.toInsert
            );
        }
        var newToRemove =
            toTransform.toRemove - (transformBy.offset + transformBy.toRemove - toTransform.offset);
        if (newToRemove < 0) { newToRemove = 0; }
        if (newToRemove === 0 && toTransform.toInsert.length === 0) { return null; }
        return create(
            transformBy.offset + transformBy.toInsert.length,
            newToRemove,
            toTransform.toInsert
        );
    }
    // they don't touch, yay
    if (toTransform.offset + toTransform.toRemove < transformBy.offset) { return toTransform; }
    // Truncate what will be deleted...
    var _newToRemove = transformBy.offset - toTransform.offset;
    if (_newToRemove === 0 && toTransform.toInsert.length === 0) { return null; }
    return create(toTransform.offset, _newToRemove, toTransform.toInsert);
};

/**
 * @param toTransform the operation which is converted
 * @param transformBy an existing operation which also has the same base.
 * @return a modified clone of toTransform *or* toTransform itself if no change was made.
 */
var transform = Operation.transform = function (
    text /*:string*/,
    toTransform /*:Operation_t*/,
    transformBy /*:Operation_t*/,
    transformFunction /*:Operation_Transform_t*/)
{
    if (Common.PARANOIA) {
        check(toTransform);
        check(transformBy);
    }
    var result = transformFunction(text, toTransform, transformBy);
    if (Common.PARANOIA && result) { check(result); }
    return result;
};

/** Used for testing. */
var random = Operation.random = function (docLength /*:number*/) {
    Common.assert(Common.isUint(docLength));
    var offset = Math.floor(Math.random() * 100000000 % docLength) || 0;
    var toRemove = Math.floor(Math.random() * 100000000 % (docLength - offset)) || 0;
    var toInsert = '';
    do {
        toInsert = Common.randomASCII(Math.floor(Math.random() * 20));
    } while (toRemove === 0 && toInsert === '');
    return create(offset, toRemove, toInsert);
};
