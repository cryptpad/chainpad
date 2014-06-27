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
var ValidateHtml = require('./ValidateHtml');

var VALID = [
    "<i><b>xxx</b></i>"
];

var INVALID = [
    "<html><div>html cannot contain div, only head and body</div></html>",
    "<i><b>close tags are out of order</i></b>",
    "<p>stray < bracket</p>",
    "<p><i>stray</i> < bracket2</p>",
    "<p><i>stray</i><strong> < </strong>bracket3</p>",
    "<p><i>stray</i><strong>angle</strong> < <i>bracket4</i></p>",
    "<p><i>stray</i><strong>angle</strong><i> < </i><i>bracket5</i></p>",
];

var main = module.exports.main = function (cycles, callback) {
    for (var i = 0; i < INVALID.length; i++) {
        try {
            ValidateHtml.validate(INVALID[i]);
        } catch (e) {
            //console.log(e.message);
            continue;
        }
        throw new Error("expected validation failure on [" + INVALID[i] + "]");
    }
    for (var i = 0; i < VALID.length; i++) {
        ValidateHtml.validate(VALID[i]);
    }
    callback();
};
