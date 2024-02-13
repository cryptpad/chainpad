/*@flow*/
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
"use strict";

var FastDiff = require('fast-diff');

var transform = function (matches) {
    var out = [];
    var offset = 0;
    var first = true;
    var current = {
        offset: 0,
        toInsert: "",
        toRemove: 0,
        type: "Operation"
    };
    matches.forEach(function (el, i) {
        if (el[0] === 0) {
            if (!first) {
                out.push(current);
                offset = current.offset + current.toRemove;
                current = {
                    offset: offset,
                    toInsert: "",
                    toRemove: 0,
                    type: "Operation"
                };
            }
            offset += el[1].length;
            current.offset = offset;
        } else if (el[0] === 1) {
            current.toInsert = el[1];
        } else {
            current.toRemove = el[1].length;
        }
        if (i === matches.length - 1 && el[0] !== 0) {
            out.push(current);
        }
        if (first) { first = false; }
    });

    return out;
};
module.exports.diff = function (oldS /*:string*/, newS /*:string*/) {
    return transform(FastDiff(oldS, newS));
};

