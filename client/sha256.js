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
var asm_sha256 = require('./sha256/exports.js');
var old = require('./SHA256.js');
var Common = require('./Common');

/*::
export type Sha256_t = string;
*/

var brokenTextEncode = function (str) {
    var out = new Uint8Array(str.length);
    for (var i = 0; i < str.length; i++) {
        out[i] = str.charCodeAt(i) & 0xff;
    }
    return out;
};

module.exports.check = function (hex /*:any*/) /*:Sha256_t*/ {
    if (typeof(hex) !== 'string') { throw new Error(); }
    if (!/[a-f0-9]{64}/.test(hex)) { throw new Error(); }
    return hex;
};

module.exports.hex_sha256 = function (d /*:string*/) /*:Sha256_t*/ {
    d = d+'';
    var ret = asm_sha256.hex(brokenTextEncode(d));
    if (Common.PARANOIA) {
        var oldHash = old.hex_sha256(d);
        if (oldHash !== ret) {
            try {
                throw new Error();
            } catch (e) {
                console.log({
                    hashErr: e,
                    badHash: d,
                    asmHasher: asm_sha256.hex,
                    oldHasher: old.hex_sha256
                });
            }
            return oldHash;
        }
    }
    return ret;
};

Object.freeze(module.exports);
