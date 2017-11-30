/*@flow*/
/* globals localStorage, window */
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

module.exports.global = (function () {
    if (typeof(self) !== 'undefined') { return self; }
    if (typeof(global) !== 'undefined') { return global; }
    if (typeof(window) !== 'undefined') { return window; }
    throw new Error("no self, nor global, nor window");
}());

var cfg = function (name) {
    if (typeof(localStorage) !== 'undefined' && localStorage[name]) {
        return localStorage[name];
    }
    // flow thinks global may be undefined
    return module.exports.global[name];
};

var PARANOIA = module.exports.PARANOIA = cfg("ChainPad_PARANOIA");

/* Good testing but slooooooooooow */
module.exports.VALIDATE_ENTIRE_CHAIN_EACH_MSG = cfg("ChainPad_VALIDATE_ENTIRE_CHAIN_EACH_MSG");

/* throw errors over non-compliant messages which would otherwise be treated as invalid */
module.exports.TESTING = cfg("ChainPad_TESTING");

module.exports.assert = function (expr /*:any*/) {
    if (!expr) { throw new Error("Failed assertion"); }
};

module.exports.isUint = function (integer /*:number*/) {
    return (typeof(integer) === 'number') &&
        (Math.floor(integer) === integer) &&
        (integer >= 0);
};

module.exports.randomASCII = function (length /*:number*/) {
    var content = [];
    for (var i = 0; i < length; i++) {
        content[i] = String.fromCharCode( Math.floor(Math.random()*256) % 57 + 65 );
    }
    return content.join('');
};

module.exports.strcmp = function (a /*:string*/, b /*:string*/) {
    if (PARANOIA && typeof(a) !== 'string') { throw new Error(); }
    if (PARANOIA && typeof(b) !== 'string') { throw new Error(); }
    return ( (a === b) ? 0 : ( (a > b) ? 1 : -1 ) );
};

Object.freeze(module.exports);
