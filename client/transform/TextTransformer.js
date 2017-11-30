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

/*::
import type { Operation_t } from '../Operation'
*/
var Operation = require('../Operation');
var Common = require('../Common');

var transformOp0 = function (
    toTransform /*:Operation_t*/,
    transformBy /*:Operation_t*/)
{
    if (toTransform.offset > transformBy.offset) {
        if (toTransform.offset > transformBy.offset + transformBy.toRemove) {
            // simple rebase
            return Operation.create(
                toTransform.offset - transformBy.toRemove + transformBy.toInsert.length,
                toTransform.toRemove,
                toTransform.toInsert
            );
        }
        var newToRemove =
            toTransform.toRemove - (transformBy.offset + transformBy.toRemove - toTransform.offset);
        if (newToRemove < 0) { newToRemove = 0; }
        if (newToRemove === 0 && toTransform.toInsert.length === 0) { return null; }
        return Operation.create(
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
    return Operation.create(toTransform.offset, _newToRemove, toTransform.toInsert);
};

var transformOp = function (
    toTransform /*:Operation_t*/,
    transformBy /*:Operation_t*/)
{
    if (Common.PARANOIA) {
        Operation.check(toTransform);
        Operation.check(transformBy);
    }
    var result = transformOp0(toTransform, transformBy);
    if (Common.PARANOIA && result) { Operation.check(result); }
    return result;
};

module.exports = function (
    opsToTransform /*:Array<Operation_t>*/,
    opsTransformBy /*:Array<Operation_t>*/,
    doc /*:string*/ ) /*:Array<Operation_t>*/
{
    var resultOfTransformBy = doc;
    var i;
    for (i = opsTransformBy.length - 1; i >= 0; i--) {
        resultOfTransformBy = Operation.apply(opsTransformBy[i], resultOfTransformBy);
    }
    var out = [];
    for (i = opsToTransform.length - 1; i >= 0; i--) {
        var tti = opsToTransform[i];
        for (var j = opsTransformBy.length - 1; j >= 0; j--) {
            try {
                tti = transformOp(tti, opsTransformBy[j]);
            } catch (e) {
                console.error("The pluggable transform function threw an error, " +
                    "failing operational transformation");
                console.error(e.stack);
                return [];
            }
            if (!tti) {
                break;
            }
        }
        if (tti) {
            if (Common.PARANOIA) { Operation.check(tti, resultOfTransformBy.length); }
            out.unshift(tti);
        }
    }
    return out;
};
