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

var TextTransformer = require('./TextTransformer');
//var ChainPad = require('../ChainPad');
var Operation = require('../Operation');
var Common = require('../Common');

/*::
import type { Operation_t } from '../Operation';
*/

module.exports = function (
    opsToTransform /*:Array<Operation_t>*/,
    opsTransformBy /*:Array<Operation_t>*/,
    text /*:string*/ ) /*:Array<Operation_t>*/
{
    var DEBUG = Common.global.REALTIME_DEBUG = Common.global.REALTIME_DEBUG || {};

    var resultOps, text2, text3;
    try {
        // text = O (mutual common ancestor)
        // toTransform = A (your own operation)
        // transformBy = B (the incoming operation)
        // threeway merge (0, A, B)

        resultOps = TextTransformer(opsToTransform, opsTransformBy, text);

        text2 = Operation.applyMulti(opsTransformBy, text);

        text3 = Operation.applyMulti(resultOps, text2);
        try {
            JSON.parse(text3);
            return resultOps;
        } catch (e) {
            console.error(e);
            DEBUG.ot_parseError = {
                type: 'resultParseError',
                resultOps: resultOps,

                toTransform: opsToTransform,
                transformBy: opsTransformBy,

                text1: text,
                text2: text2,
                text3: text3,
                error: e
            };
            console.log('Debugging info available at `window.REALTIME_DEBUG.ot_parseError`');
        }
    } catch (x) {
        console.error(x);
        DEBUG.ot_applyError = {
            type: 'resultParseError',
            resultOps: resultOps,

            toTransform: opsToTransform,
            transformBy: opsTransformBy,

            text1: text,
            text2: text2,
            text3: text3,
            error: x
        };
        console.log('Debugging info available at `window.REALTIME_DEBUG.ot_applyError`');
    }

    // return an empty patch in case we can't do anything else
    return [];
};
