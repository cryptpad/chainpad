(function(){
var r=function(){var e="function"==typeof require&&require,r=function(i,o,u){o||(o=0);var n=r.resolve(i,o),t=r.m[o][n];if(!t&&e){if(t=e(n))return t}else if(t&&t.c&&(o=t.c,n=t.m,t=r.m[o][t.m],!t))throw new Error('failed to require "'+n+'" from '+o);if(!t)throw new Error('failed to require "'+i+'" from '+u);return t.exports||(t.exports={},t.call(t.exports,t,t.exports,r.relative(n,o))),t.exports};return r.resolve=function(e,n){var i=e,t=e+".js",o=e+"/index.js";return r.m[n][t]&&t?t:r.m[n][o]&&o?o:i},r.relative=function(e,t){return function(n){if("."!=n.charAt(0))return r(n,t,e);var o=e.split("/"),f=n.split("/");o.pop();for(var i=0;i<f.length;i++){var u=f[i];".."==u?o.pop():"."!=u&&o.push(u)}return r(o.join("/"),t,e)}},r}();r.m = [];
r.m[0] = {
"Patch.js": function(module, exports, require){
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
var Operation = require('./Operation');
var Sha = require('./sha256');

var Patch = module.exports;

/*::
import type {
    Operation_t,
    Operation_Packed_t,
    Operation_Simplify_t,
    Operation_Transform_t
} from './Operation';
import type { Sha256_t } from './sha256';
export type Patch_t = {
    type: 'Patch',
    operations: Array<Operation_t>,
    parentHash: Sha256_t,
    isCheckpoint: boolean,
    mut: {
        inverseOf: ?Patch_t,
    }
};
export type Patch_Packed_t = Array<Operation_Packed_t|Sha256_t>;
*/

var create = Patch.create = function (parentHash /*:Sha256_t*/, isCheckpoint /*:?boolean*/) {
    var out = Object.freeze({
        type: 'Patch',
        operations: [],
        parentHash: parentHash,
        isCheckpoint: !!isCheckpoint,
        mut: {
            inverseOf: undefined
        }
    });
    if (isCheckpoint) {
        out.mut.inverseOf = out;
    }
    return out;
};

var check = Patch.check = function (patch /*:any*/, docLength_opt /*:?number*/) /*:Patch_t*/ {
    Common.assert(patch.type === 'Patch');
    Common.assert(Array.isArray(patch.operations));
    Common.assert(/^[0-9a-f]{64}$/.test(patch.parentHash));
    for (var i = patch.operations.length - 1; i >= 0; i--) {
        Operation.check(patch.operations[i], docLength_opt);
        if (i > 0) {
            Common.assert(!Operation.shouldMerge(patch.operations[i], patch.operations[i-1]));
        }
        if (typeof(docLength_opt) === 'number') {
            docLength_opt += Operation.lengthChange(patch.operations[i]);
        }
    }
    if (patch.isCheckpoint) {
        Common.assert(patch.operations.length === 1);
        Common.assert(patch.operations[0].offset === 0);
        if (typeof(docLength_opt) === 'number') {
            Common.assert(!docLength_opt || patch.operations[0].toRemove === docLength_opt);
        }
    }
    return patch;
};

var toObj = Patch.toObj = function (patch /*:Patch_t*/) {
    if (Common.PARANOIA) { check(patch); }
    var out /*:Array<Operation_Packed_t|Sha256_t>*/ = new Array(patch.operations.length+1);
    var i;
    for (i = 0; i < patch.operations.length; i++) {
        out[i] = Operation.toObj(patch.operations[i]);
    }
    out[i] = patch.parentHash;
    return out;
};

var fromObj = Patch.fromObj = function (obj /*:Patch_Packed_t*/, isCheckpoint /*:?boolean*/) {
    Common.assert(Array.isArray(obj) && obj.length > 0);
    var patch = create(Sha.check(obj[obj.length-1]), isCheckpoint);
    var i;
    for (i = 0; i < obj.length-1; i++) {
        patch.operations[i] = Operation.fromObj(obj[i]);
    }
    if (Common.PARANOIA) { check(patch); }
    return patch;
};

var hash = function (text) {
    return Sha.hex_sha256(text);
};

var addOperation = Patch.addOperation = function (patch /*:Patch_t*/, op /*:Operation_t*/) {
    if (Common.PARANOIA) {
        check(patch);
        Operation.check(op);
    }
    for (var i = 0; i < patch.operations.length; i++) {
        if (Operation.shouldMerge(patch.operations[i], op)) {
            var maybeOp = Operation.merge(patch.operations[i], op);
            patch.operations.splice(i,1);
            if (maybeOp === null) { return; }
            op = maybeOp;
            i--;
        } else {
            var out = Operation.rebase(patch.operations[i], op);
            if (out === op) {
                // op could not be rebased further, insert it here to keep the list ordered.
                patch.operations.splice(i,0,op);
                return;
            } else {
                op = out;
                // op was rebased, try rebasing it against the next operation.
            }
        }
    }
    patch.operations.push(op);
    if (Common.PARANOIA) { check(patch); }
};

var createCheckpoint = Patch.createCheckpoint = function (
    parentContent /*:string*/,
    checkpointContent /*:string*/,
    parentContentHash_opt /*:?string*/)
{
    var op = Operation.create(0, parentContent.length, checkpointContent);
    if (Common.PARANOIA && parentContentHash_opt) {
        Common.assert(parentContentHash_opt === hash(parentContent));
    }
    parentContentHash_opt = parentContentHash_opt || hash(parentContent);
    var out = create(parentContentHash_opt, true);
    out.operations[0] = op;
    return out;
};

var clone = Patch.clone = function (patch /*:Patch_t*/) {
    if (Common.PARANOIA) { check(patch); }
    var out = create(patch.parentHash, patch.isCheckpoint);
    for (var i = 0; i < patch.operations.length; i++) {
        out.operations[i] = patch.operations[i];
    }
    return out;
};

var merge = Patch.merge = function (oldPatch /*:Patch_t*/, newPatch /*:Patch_t*/) {
    if (Common.PARANOIA) {
        check(oldPatch);
        check(newPatch);
    }
    if (oldPatch.isCheckpoint) {
        Common.assert(newPatch.parentHash === oldPatch.parentHash);
        if (newPatch.isCheckpoint) {
            return create(oldPatch.parentHash);
        }
        return clone(newPatch);
    } else if (newPatch.isCheckpoint) {
        return clone(oldPatch);
    }
    oldPatch = clone(oldPatch);
    for (var i = newPatch.operations.length-1; i >= 0; i--) {
        addOperation(oldPatch, newPatch.operations[i]);
    }
    return oldPatch;
};

var apply = Patch.apply = function (patch /*:Patch_t*/, doc /*:string*/)
{
    if (Common.PARANOIA) {
        check(patch);
        Common.assert(typeof(doc) === 'string');
        Common.assert(Sha.hex_sha256(doc) === patch.parentHash);
    }
    var newDoc = doc;
    for (var i = patch.operations.length-1; i >= 0; i--) {
        newDoc = Operation.apply(patch.operations[i], newDoc);
    }
    return newDoc;
};

var lengthChange = Patch.lengthChange = function (patch /*:Patch_t*/)
{
    if (Common.PARANOIA) { check(patch); }
    var out = 0;
    for (var i = 0; i < patch.operations.length; i++) {
        out += Operation.lengthChange(patch.operations[i]);
    }
    return out;
};

var invert = Patch.invert = function (patch /*:Patch_t*/, doc /*:string*/)
{
    if (Common.PARANOIA) {
        check(patch);
        Common.assert(typeof(doc) === 'string');
        Common.assert(Sha.hex_sha256(doc) === patch.parentHash);
    }
    var newDoc = doc;
    var operations = new Array(patch.operations.length);
    for (var i = patch.operations.length-1; i >= 0; i--) {
        operations[i] = Operation.invert(patch.operations[i], newDoc);
        newDoc = Operation.apply(patch.operations[i], newDoc);
    }
    var opOffsets = new Array(patch.operations.length);
    (function () {
        for (var i = operations.length-1; i >= 0; i--) {
            opOffsets[i] = operations[i].offset;
            for (var j = i - 1; j >= 0; j--) {
                opOffsets[i] += operations[j].toRemove - operations[j].toInsert.length;
            }
        }
    }());
    var rpatch = create(Sha.hex_sha256(newDoc), patch.isCheckpoint);
    rpatch.operations.splice(0, rpatch.operations.length);
    for (var j = 0; j < operations.length; j++) {
        rpatch.operations[j] =
            Operation.create(opOffsets[j], operations[j].toRemove, operations[j].toInsert);
    }
    if (Common.PARANOIA) { check(rpatch); }
    return rpatch;
};

var simplify = Patch.simplify = function (
    patch /*:Patch_t*/,
    doc /*:string*/,
    operationSimplify /*:Operation_Simplify_t*/ )
{
    if (Common.PARANOIA) {
        check(patch);
        Common.assert(typeof(doc) === 'string');
        Common.assert(Sha.hex_sha256(doc) === patch.parentHash);
    }
    var spatch = create(patch.parentHash);
    var newDoc = doc;
    var outOps = [];
    var j = 0;
    for (var i = patch.operations.length-1; i >= 0; i--) {
        var outOp = operationSimplify(patch.operations[i], newDoc, Operation.simplify);
        if (outOp) {
            newDoc = Operation.apply(outOp, newDoc);
            outOps[j++] = outOp;
        }
    }
    Array.prototype.push.apply(spatch.operations, outOps.reverse());
    if (!spatch.operations[0]) {
        spatch.operations.shift();
    }
    if (Common.PARANOIA) {
        check(spatch);
    }
    return spatch;
};

var equals = Patch.equals = function (patchA /*:Patch_t*/, patchB /*:Patch_t*/) {
    if (patchA.operations.length !== patchB.operations.length) { return false; }
    for (var i = 0; i < patchA.operations.length; i++) {
        if (!Operation.equals(patchA.operations[i], patchB.operations[i])) { return false; }
    }
    return true;
};

var isCheckpointOp = function (op, text) {
    return op.offset === 0 && op.toRemove === text.length && op.toInsert === text;
};

var transform = Patch.transform = function (
    origToTransform /*:Patch_t*/,
    transformBy /*:Patch_t*/,
    doc /*:string*/,
    transformFunction /*:Operation_Transform_t*/ )
{
    if (Common.PARANOIA) {
        check(origToTransform, doc.length);
        check(transformBy, doc.length);
        if (Sha.hex_sha256(doc) !== origToTransform.parentHash) { throw new Error("wrong hash"); }
    }
    if (origToTransform.parentHash !== transformBy.parentHash) { throw new Error(); }
    var resultOfTransformBy = apply(transformBy, doc);

    var toTransform = clone(origToTransform);
    var text = doc;
    var out = create(transformBy.mut.inverseOf
        ? transformBy.mut.inverseOf.parentHash
        : Sha.hex_sha256(resultOfTransformBy));
    for (var i = toTransform.operations.length-1; i >= 0; i--) {
        var tti = toTransform.operations[i];
        if (isCheckpointOp(tti, text)) { continue; }
        for (var j = transformBy.operations.length-1; j >= 0; j--) {
            if (isCheckpointOp(transformBy.operations[j], text)) { console.log('cpo'); continue; }
            if (Common.DEBUG) {
                console.log(
                    ['TRANSFORM', text, tti, transformBy.operations[j]]
                );
            }
            try {
                tti = Operation.transform(text, tti, transformBy.operations[j], transformFunction);
            } catch (e) {
                console.error("The pluggable transform function threw an error, " +
                    "failing operational transformation");
                console.error(e.stack);
                return create(Sha.hex_sha256(resultOfTransformBy));
            }
            if (!tti) {
                break;
            }
        }
        if (tti) {
            if (Common.PARANOIA) { Operation.check(tti, resultOfTransformBy.length); }
            addOperation(out, tti);
        }
    }

    if (Common.PARANOIA) {
        check(out, resultOfTransformBy.length);
    }
    return out;
};

var random = Patch.random = function (doc /*:string*/, opCount /*:?number*/) {
    Common.assert(typeof(doc) === 'string');
    opCount = opCount || (Math.floor(Math.random() * 30) + 1);
    var patch = create(Sha.hex_sha256(doc));
    var docLength = doc.length;
    while (opCount-- > 0) {
        var op = Operation.random(docLength);
        docLength += Operation.lengthChange(op);
        addOperation(patch, op);
    }
    check(patch);
    return patch;
};

},
"sha256.js": function(module, exports, require){
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

},
"SHA256.js": function(module, exports, require){
/* A JavaScript implementation of the Secure Hash Algorithm, SHA-256
 * Version 0.3 Copyright Angel Marin 2003-2004 - http://anmar.eu.org/
 * Distributed under the BSD License
 * Some bits taken from Paul Johnston's SHA-1 implementation
 */
(function () {
    var chrsz = 8;  /* bits per input character. 8 - ASCII; 16 - Unicode  */
    function safe_add (x, y) {
        var lsw = (x & 0xFFFF) + (y & 0xFFFF);
        var msw = (x >> 16) + (y >> 16) + (lsw >> 16);
        return (msw << 16) | (lsw & 0xFFFF);
    }
    function S (X, n) {return ( X >>> n ) | (X << (32 - n));}
    function R (X, n) {return ( X >>> n );}
    function Ch(x, y, z) {return ((x & y) ^ ((~x) & z));}
    function Maj(x, y, z) {return ((x & y) ^ (x & z) ^ (y & z));}
    function Sigma0256(x) {return (S(x, 2) ^ S(x, 13) ^ S(x, 22));}
    function Sigma1256(x) {return (S(x, 6) ^ S(x, 11) ^ S(x, 25));}
    function Gamma0256(x) {return (S(x, 7) ^ S(x, 18) ^ R(x, 3));}
    function Gamma1256(x) {return (S(x, 17) ^ S(x, 19) ^ R(x, 10));}
    function newArray (n) {
        var a = [];
        for (;n>0;n--) {
            a.push(undefined);
        }
        return a;
    }
    function core_sha256 (m, l) {
        var K = [0x428A2F98,0x71374491,0xB5C0FBCF,0xE9B5DBA5,0x3956C25B,0x59F111F1,0x923F82A4,0xAB1C5ED5,0xD807AA98,0x12835B01,0x243185BE,0x550C7DC3,0x72BE5D74,0x80DEB1FE,0x9BDC06A7,0xC19BF174,0xE49B69C1,0xEFBE4786,0xFC19DC6,0x240CA1CC,0x2DE92C6F,0x4A7484AA,0x5CB0A9DC,0x76F988DA,0x983E5152,0xA831C66D,0xB00327C8,0xBF597FC7,0xC6E00BF3,0xD5A79147,0x6CA6351,0x14292967,0x27B70A85,0x2E1B2138,0x4D2C6DFC,0x53380D13,0x650A7354,0x766A0ABB,0x81C2C92E,0x92722C85,0xA2BFE8A1,0xA81A664B,0xC24B8B70,0xC76C51A3,0xD192E819,0xD6990624,0xF40E3585,0x106AA070,0x19A4C116,0x1E376C08,0x2748774C,0x34B0BCB5,0x391C0CB3,0x4ED8AA4A,0x5B9CCA4F,0x682E6FF3,0x748F82EE,0x78A5636F,0x84C87814,0x8CC70208,0x90BEFFFA,0xA4506CEB,0xBEF9A3F7,0xC67178F2];
        var HASH = [0x6A09E667, 0xBB67AE85, 0x3C6EF372, 0xA54FF53A, 0x510E527F, 0x9B05688C, 0x1F83D9AB, 0x5BE0CD19];
        var W = newArray(64);
        var a, b, c, d, e, f, g, h, i, j;
        var T1, T2;
        /* append padding */
        m[l >> 5] |= 0x80 << (24 - l % 32);
        m[((l + 64 >> 9) << 4) + 15] = l;
        for ( var i = 0; i<m.length; i+=16 ) {
            a = HASH[0]; b = HASH[1]; c = HASH[2]; d = HASH[3];
            e = HASH[4]; f = HASH[5]; g = HASH[6]; h = HASH[7];
            for ( var j = 0; j<64; j++) {
                if (j < 16) {
                    W[j] = m[j + i];
                } else {
                    W[j] = safe_add(safe_add(safe_add(Gamma1256(
                        W[j - 2]), W[j - 7]), Gamma0256(W[j - 15])), W[j - 16]);
                }
                T1 = safe_add(safe_add(safe_add(
                    safe_add(h, Sigma1256(e)), Ch(e, f, g)), K[j]), W[j]);
                T2 = safe_add(Sigma0256(a), Maj(a, b, c));
                h = g; g = f; f = e; e = safe_add(d, T1);
                d = c; c = b; b = a; a = safe_add(T1, T2);
            }
            HASH[0] = safe_add(a, HASH[0]); HASH[1] = safe_add(b, HASH[1]);
            HASH[2] = safe_add(c, HASH[2]); HASH[3] = safe_add(d, HASH[3]);
            HASH[4] = safe_add(e, HASH[4]); HASH[5] = safe_add(f, HASH[5]);
            HASH[6] = safe_add(g, HASH[6]); HASH[7] = safe_add(h, HASH[7]);
        }
        return HASH;
    }
    function str2binb (str) {
        var bin = Array();
        var mask = (1 << chrsz) - 1;
        for(var i = 0; i < str.length * chrsz; i += chrsz)
            bin[i>>5] |= (str.charCodeAt(i / chrsz) & mask) << (24 - i%32);
        return bin;
    }
    function binb2hex (binarray) {
        var hexcase = 0; /* hex output format. 0 - lowercase; 1 - uppercase */
        var hex_tab = hexcase ? "0123456789ABCDEF" : "0123456789abcdef";
        var str = "";
        for (var i = 0; i < binarray.length * 4; i++) {
            str += hex_tab.charAt((binarray[i>>2] >> ((3 - i%4)*8+4)) & 0xF) +
                hex_tab.charAt((binarray[i>>2] >> ((3 - i%4)*8  )) & 0xF);
        }
        return str;
    }
    function hex_sha256(s){
        return binb2hex(core_sha256(str2binb(s),s.length * chrsz));
    }
    module.exports.hex_sha256 = hex_sha256;
}());

},
"Common.js": function(module, exports, require){
/*@flow*/
/* globals localStorage */
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
var DEBUG = module.exports.DEBUG =
    (typeof(localStorage) !== 'undefined' && localStorage['ChainPad_DEBUG']);

var PARANOIA = module.exports.PARANOIA =
    (typeof(localStorage) !== 'undefined' && localStorage['ChainPad_PARANOIA']);

/* Good testing but slooooooooooow */
var VALIDATE_ENTIRE_CHAIN_EACH_MSG = module.exports.VALIDATE_ENTIRE_CHAIN_EACH_MSG =
    (typeof(localStorage) !== 'undefined' && localStorage['ChainPad_VALIDATE_ENTIRE_CHAIN_EACH_MSG']);

/* throw errors over non-compliant messages which would otherwise be treated as invalid */
var TESTING = module.exports.TESTING =
    (typeof(localStorage) !== 'undefined' && localStorage['ChainPad_TESTING']);

var assert = module.exports.assert = function (expr /*:any*/) {
    if (!expr) { throw new Error("Failed assertion"); }
};

var isUint = module.exports.isUint = function (integer /*:number*/) {
    return (typeof(integer) === 'number') &&
        (Math.floor(integer) === integer) &&
        (integer >= 0);
};

var randomASCII = module.exports.randomASCII = function (length /*:number*/) {
    var content = [];
    for (var i = 0; i < length; i++) {
        content[i] = String.fromCharCode( Math.floor(Math.random()*256) % 57 + 65 );
    }
    return content.join('');
};

var strcmp = module.exports.strcmp = function (a /*:string*/, b /*:string*/) {
    if (PARANOIA && typeof(a) !== 'string') { throw new Error(); }
    if (PARANOIA && typeof(b) !== 'string') { throw new Error(); }
    return ( (a === b) ? 0 : ( (a > b) ? 1 : -1 ) );
};

},
"Message.js": function(module, exports, require){
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
var Operation = require('./Operation');
var Patch = require('./Patch');
var Sha = require('./sha256');

var Message = module.exports;

var PATCH        = Message.PATCH        = 2;
var CHECKPOINT   = Message.CHECKPOINT   = 4;

/*::
import type { Sha256_t } from './sha256'
import type { Patch_t } from './Patch'
export type Message_Type_t = 2 | 4;
export type Message_t = {
    type: 'Message',
    messageType: Message_Type_t,
    content: Patch_t,
    lastMsgHash: Sha256_t,
    hashOf: Sha256_t,
    mut: {
        parentCount: ?number,
        isInitialMessage: boolean,
        parent: ?Message_t,
        isFromMe: boolean
    }
}
*/

var check = Message.check = function(msg /*:any*/) /*:Message_t*/ {
    Common.assert(msg.type === 'Message');
    Common.assert(msg.messageType === PATCH || msg.messageType === CHECKPOINT);
    Patch.check(msg.content);
    Common.assert(typeof(msg.lastMsgHash) === 'string');
    return msg;
};

var DUMMY_HASH /*:Sha256_t*/ = "";

var create = Message.create = function (
    type /*:Message_Type_t*/,
    content /*:Patch_t*/,
    lastMsgHash /*:Sha256_t*/) /*:Message_t*/
{
    var msg = {
        type: 'Message',
        messageType: type,
        content: content,
        lastMsgHash: lastMsgHash,
        hashOf: DUMMY_HASH,
        mut: {
            parentCount: undefined,
            isInitialMessage: false,
            isFromMe: false,
            parent: undefined
        }
    };
    msg.hashOf = hashOf(msg);
    if (Common.PARANOIA) { check(msg); }
    return Object.freeze(msg);
};

// $FlowFixMe doesn't like the toString()
var toString = Message.toString = function (msg /*:Message_t*/) {
    if (Common.PARANOIA) { check(msg); }
    if (msg.messageType === PATCH || msg.messageType === CHECKPOINT) {
        if (!msg.content) { throw new Error(); }
        return JSON.stringify([msg.messageType, Patch.toObj(msg.content), msg.lastMsgHash]);
    } else {
        throw new Error();
    }
};

var fromString = Message.fromString = function (str /*:string*/) /*:Message_t*/ {
    var m = JSON.parse(str);
    if (m[0] !== CHECKPOINT && m[0] !== PATCH) { throw new Error("invalid message type " + m[0]); }
    var msg = create(m[0], Patch.fromObj(m[1], (m[0] === CHECKPOINT)), m[2]);
    return Object.freeze(msg);
};

var hashOf = Message.hashOf = function (msg /*:Message_t*/) {
    if (Common.PARANOIA) { check(msg); }
    var hash = Sha.hex_sha256(toString(msg));
    return hash;
};

},
"ChainPad.js": function(module, exports, require){
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
var Common = module.exports.Common = require('./Common');
var Operation = module.exports.Operation = require('./Operation');
var Patch = module.exports.Patch = require('./Patch');
var Message = module.exports.Message = require('./Message');
var Sha = module.exports.Sha = require('./sha256');

var ChainPad = {};

// hex_sha256('')
var EMPTY_STR_HASH = module.exports.EMPTY_STR_HASH =
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
var ZERO = '0000000000000000000000000000000000000000000000000000000000000000';

// Default number of patches between checkpoints (patches older than this will be pruned)
// default for realtime.config.checkpointInterval
var DEFAULT_CHECKPOINT_INTERVAL = 50;

// Default number of milliseconds to wait before syncing to the server
var DEFAULT_AVERAGE_SYNC_MILLISECONDS = 300;

// By default, we allow checkpoints at any place but if this is set true, we will blow up on chains
// which have checkpoints not where we expect them to be.
var DEFAULT_STRICT_CHECKPOINT_VALIDATION = false;

var debug = function (realtime, msg) {
    if (realtime.logLevel > 0) {
        console.log("[" + realtime.userName + "]  " + msg);
    }
};

var warn = function (realtime, msg) {
    if (realtime.logLevel > 0) {
        console.error("[" + realtime.userName + "]  " + msg);
    }
};

var schedule = function (realtime, func, timeout) {
    if (realtime.aborted) { return; }
    if (!timeout) {
        timeout = Math.floor(Math.random() * 2 * realtime.config.avgSyncMilliseconds);
    }
    var to = setTimeout(function () {
        realtime.schedules.splice(realtime.schedules.indexOf(to), 1);
        func();
    }, timeout);
    realtime.schedules.push(to);
    return to;
};

var unschedule = function (realtime, schedule) {
    var index = realtime.schedules.indexOf(schedule);
    if (index > -1) {
        realtime.schedules.splice(index, 1);
    }
    clearTimeout(schedule);
};

var onMessage = function (realtime, message, callback) {
    if (!realtime.messageHandlers.length) {
        callback("no onMessage() handler registered");
    }
    realtime.messageHandlers.forEach(function (handler) {
        handler(message, function () {
            callback.apply(null, arguments);
            callback = function () { };
        });
    });
};

var sendMessage = function (realtime, msg, callback) {
    var strMsg = Message.toString(msg);

    onMessage(realtime, strMsg, function (err) {
        if (err) {
            debug(realtime, "Posting to server failed [" + err + "]");
            realtime.pending = null;
        } else {
            var pending = realtime.pending;
            realtime.pending = null;
            if (!pending) { throw new Error(); }
            Common.assert(pending.hash === msg.hashOf);
            handleMessage(realtime, strMsg, true);
            pending.callback();
        }
    });

    var timeout = schedule(realtime, function () {
        debug(realtime, "Failed to send message [" + msg.hashOf + "] to server");
        sync(realtime);
    }, 10000 + (Math.random() * 5000));

    if (realtime.pending) { throw new Error("there is already a pending message"); }
    realtime.pending = {
        hash: msg.hashOf,
        callback: function () {
            unschedule(realtime, timeout);
            realtime.syncSchedule = schedule(realtime, function () { sync(realtime); }, 0);
            callback();
        }
    };
    if (Common.PARANOIA) { check(realtime); }
};

var settle = function (realtime) {
    var onSettle = realtime.onSettle;
    realtime.onSettle = [];
    onSettle.forEach(function (handler) {
        try {
            handler();
        } catch (e) {
            warn(realtime, "Error in onSettle handler [" + e.stack + "]");
        }
    });
};

var inversePatch = function (patch) {
    if (!patch.mut.inverseOf) { throw new Error(); }
    return patch.mut.inverseOf;
};

var sync = function (realtime) {
    if (Common.PARANOIA) { check(realtime); }
    if (realtime.syncSchedule && !realtime.pending) {
        unschedule(realtime, realtime.syncSchedule);
        realtime.syncSchedule = null;
    } else {
        //debug(realtime, "already syncing...");
        // we're currently waiting on something from the server.
        return;
    }

    realtime.uncommitted = Patch.simplify(
        realtime.uncommitted, realtime.authDoc, realtime.config.operationSimplify);

    if (realtime.uncommitted.operations.length === 0) {
        //debug(realtime, "No data to sync to the server, sleeping");
        settle(realtime);
        realtime.syncSchedule = schedule(realtime, function () { sync(realtime); });
        return;
    }

    var pc = parentCount(realtime, realtime.best) + 1;
    if ((pc % realtime.config.checkpointInterval) === 0) {
        var best = realtime.best;
        debug(realtime, "Sending checkpoint (interval [" + realtime.config.checkpointInterval +
            "]) patch no [" + pc + "]");
        debug(realtime, parentCount(realtime, realtime.best));
        if (!best || !best.content || !inversePatch(best.content)) { throw new Error(); }
        var cpp = Patch.createCheckpoint(realtime.authDoc,
                                         realtime.authDoc,
                                         inversePatch(best.content).parentHash);
        var cp = Message.create(Message.CHECKPOINT, cpp, best.hashOf);
        sendMessage(realtime, cp, function () {
            debug(realtime, "Checkpoint sent and accepted");
        });
        return;
    }

    var msg;
    if (realtime.setContentPatch) {
        msg = realtime.setContentPatch;
    } else {
        msg = Message.create(Message.PATCH, realtime.uncommitted, realtime.best.hashOf);
    }

    sendMessage(realtime, msg, function () {
        //debug(realtime, "patch sent");
        if (realtime.setContentPatch) {
            debug(realtime, "initial Ack received [" + msg.hashOf + "]");
            realtime.setContentPatch = null;
        }
    });
};

var storeMessage = function (realtime, msg /*:Message_t*/) {
    Common.assert(msg.lastMsgHash);
    Common.assert(msg.hashOf);
    realtime.messages[msg.hashOf] = msg;
    (realtime.messagesByParent[msg.lastMsgHash] =
        realtime.messagesByParent[msg.lastMsgHash] || []).push(msg);
};

var forgetMessage = function (realtime, msg) {
    Common.assert(msg.lastMsgHash);
    Common.assert(msg.hashOf);
    delete realtime.messages[msg.hashOf];
    var list = realtime.messagesByParent[msg.lastMsgHash];
    Common.assert(list.indexOf(msg) > -1);
    list.splice(list.indexOf(msg), 1);
    if (list.length === 0) {
        delete realtime.messagesByParent[msg.lastMsgHash];
    }
    var children = realtime.messagesByParent[msg.hashOf];
    if (children) {
        for (var i = 0; i < children.length; i++) {
            delete children[i].mut.parent;
        }
    }
};

/*::
import type { Sha256_t } from './sha256';
import type { Patch_t } from './Patch';
import type { Message_t } from './Message';
type ChainPad_Internal_t = {
    type: 'ChainPad',
    authDoc: string,
    config: ChainPad_Config_t,
    logLevel: number,
    uncommitted: Patch_t,
    uncommittedDocLength: number,
    patchHandlers: Array<(Patch_t)=>void>,
    changeHandlers: Array<(number, number, string)=>void>,
    messageHandlers: Array<(string, ()=>void)=>void>,
    schedules: Array<number>,
    aborted: boolean,
    syncSchedule: number,
    userInterfaceContent: string,
    setContentPatch: ?Patch_t,
    pending: ?{ hash: Sha256_t, callback: ()=>void },
    messages: { [Sha256_t]: Message_t },
    messagesByParent: { [Sha256_t]: Message_t },
    rootMessage: Message_t,
    onSettle: Array<()=>void>,
    userName: string,
    best: Message_t
};
*/

var create = ChainPad.create = function (config /*:ChainPad_Config_t*/) {

    var zeroPatch = Patch.create(EMPTY_STR_HASH);
    zeroPatch.mut.inverseOf = Patch.invert(zeroPatch, '');
    zeroPatch.mut.inverseOf.mut.inverseOf = zeroPatch;
    var zeroMsg = Message.create(Message.PATCH, zeroPatch, ZERO);
    zeroMsg.mut.parentCount = 0;
    zeroMsg.mut.isInitialMessage = true;
    var best = zeroMsg;

    var initMsg;
    if (config.initialState !== '') {
        var initPatch = Patch.create(EMPTY_STR_HASH);
        Patch.addOperation(initPatch, Operation.create(0, 0, config.initialState));
        initPatch.mut.inverseOf = Patch.invert(initPatch, '');
        initPatch.mut.inverseOf.mut.inverseOf = initPatch;
        initMsg = Message.create(Message.PATCH, initPatch, zeroMsg.hashOf);
        initMsg.mut.isInitialMessage = true;
        best = initMsg;
    }

    var realtime = {
        type: 'ChainPad',

        authDoc: config.initialState,

        config: config,

        logLevel: config.logLevel,

        /** A patch representing all uncommitted work. */
        uncommitted: Patch.create(inversePatch(best.content).parentHash),

        uncommittedDocLength: config.initialState.length,

        patchHandlers: [],
        changeHandlers: [],

        messageHandlers: [],

        schedules: [],
        aborted: false,

        syncSchedule: -1,

        // this is only used if PARANOIA is enabled.
        userInterfaceContent: config.initialState,

        // If we want to set the content to a particular thing, this patch will be sent across the
        // wire. If the patch is not accepted we will not try to recover it. This is used for
        // setting initial state.
        setContentPatch: initMsg,

        // hash and callback for previously send patch, currently in flight.
        pending: undefined,

        messages: {},
        messagesByParent: {},

        rootMessage: zeroMsg,

        onSettle: [],

        userName: config.userName,

        best: best
    };
    storeMessage(realtime, zeroMsg);
    if (initMsg) {
        storeMessage(realtime, initMsg);
    }
    return realtime;
};

var getParent = function (realtime, message) {
    var parent = message.mut.parent = message.mut.parent || realtime.messages[message.lastMsgHash];
    return parent;
};

var check = ChainPad.check = function(realtime) {
    Common.assert(realtime.type === 'ChainPad');
    Common.assert(typeof(realtime.authDoc) === 'string');

    Patch.check(realtime.uncommitted, realtime.authDoc.length);

    var uiDoc = Patch.apply(realtime.uncommitted, realtime.authDoc);
    Common.assert(uiDoc.length === realtime.uncommittedDocLength);
    if (realtime.userInterfaceContent !== '') {
        Common.assert(uiDoc === realtime.userInterfaceContent);
    }

    if (!Common.VALIDATE_ENTIRE_CHAIN_EACH_MSG) { return; }

    var doc = realtime.authDoc;
    var patchMsg = realtime.best;
    Common.assert(inversePatch(patchMsg.content).parentHash === realtime.uncommitted.parentHash);
    var patches = [];
    do {
        patches.push(patchMsg);
        doc = Patch.apply(inversePatch(patchMsg.content), doc);
    } while ((patchMsg = getParent(realtime, patchMsg)));
    if (realtime.rootMessage.content.isCheckpoint) {
        if (doc !== realtime.rootMessage.content.operations[0].toInsert) { throw new Error(); }
    } else if (doc !== '') { throw new Error(); }
    while ((patchMsg = patches.pop())) {
        doc = Patch.apply(patchMsg.content, doc);
    }
    Common.assert(doc === realtime.authDoc);
};

var doOperation = ChainPad.doOperation = function (realtime, op) {
    if (Common.PARANOIA) {
        check(realtime);
        realtime.userInterfaceContent = Operation.apply(op, realtime.userInterfaceContent);
    }
    Operation.check(op, realtime.uncommittedDocLength);
    Patch.addOperation(realtime.uncommitted, op);
    realtime.uncommittedDocLength += Operation.lengthChange(op);
};

var doPatch = ChainPad.doPatch = function (realtime, patch) {
    if (Common.PARANOIA) {
        check(realtime);
        Common.assert(Patch.invert(realtime.uncommitted, realtime.authDoc).parentHash ===
            patch.parentHash);
        realtime.userInterfaceContent = Patch.apply(patch, realtime.userInterfaceContent);
    }
    Patch.check(patch, realtime.uncommittedDocLength);
    realtime.uncommitted = Patch.merge(realtime.uncommitted, patch);
    realtime.uncommittedDocLength += Patch.lengthChange(patch);
};

var isAncestorOf = function (realtime, ancestor, decendent) {
    if (!ancestor) { return false; }
    for (;;) {
        if (!decendent) { return false; }
        if (ancestor === decendent) { return true; }
        decendent = getParent(realtime, decendent);
    }
};

var parentCount = function (realtime, message) {
    if (typeof(message.mut.parentCount) === 'number') { return message.mut.parentCount; }
    var msgs = [];
    for (; (typeof(message.mut.parentCount) !== 'number'); message = getParent(realtime, message)) {
        if (!message) {
            if (message === realtime.rootMessage) {
                throw new Error("root message does not have parent count");
            }
            throw new Error("parentCount called on unlinked message");
        }
        msgs.unshift(message);
    }
    var pc = message.mut.parentCount;
    for (var i = 0; i < msgs.length; i++) {
        msgs[i].mut.parentCount = ++pc;
    }
    return pc;
};

var applyPatch = function (realtime, isFromMe, patch) {
    Common.assert(patch);
    if (isFromMe) {
        // Case 1: We're applying a patch which we originally created (yay our work was accepted)
        //         We will merge the inverse of the patch with our uncommitted work in order that
        //         we do not try to commit that work over again.
        // Case 2: We're reverting a patch which had originally come from us, a.k.a. we're applying
        //         the inverse of that patch.
        //
        // In either scenario, we want to apply the inverse of the patch we are applying, to the
        // uncommitted work. Whatever we "add" to the authDoc we "remove" from the uncommittedWork.
        //
        Common.assert(patch.parentHash === realtime.uncommitted.parentHash);
        realtime.uncommitted = Patch.merge(inversePatch(patch), realtime.uncommitted);

    } else {
        // It's someone else's patch which was received, we need to *transform* out uncommitted
        // work over their patch in order to preserve intent as much as possible.
        realtime.uncommitted =
            Patch.transform(
                realtime.uncommitted, patch, realtime.authDoc, realtime.config.transformFunction);
    }
    Common.assert(realtime.uncommitted.parentHash === inversePatch(patch).parentHash);

    realtime.authDoc = Patch.apply(patch, realtime.authDoc);

    if (Common.PARANOIA) {
        Common.assert(realtime.uncommitted.parentHash === inversePatch(patch).parentHash);
        Common.assert(Sha.hex_sha256(realtime.authDoc) === realtime.uncommitted.parentHash);
        realtime.userInterfaceContent = Patch.apply(realtime.uncommitted, realtime.authDoc);
    }
};

var revertPatch = function (realtime, isFromMe, patch) {
    applyPatch(realtime, isFromMe, inversePatch(patch));
};

var getBestChild = function (realtime, msg) {
    var best = msg;
    (realtime.messagesByParent[msg.hashOf] || []).forEach(function (child) {
        Common.assert(child.lastMsgHash === msg.hashOf);
        child = getBestChild(realtime, child);
        if (parentCount(realtime, child) > parentCount(realtime, best)) { best = child; }
    });
    return best;
};

var pushUIPatch = function (realtime, patch) {
    if (!patch.operations.length) { return; }
    // push the uncommittedPatch out to the user interface.
    realtime.patchHandlers.forEach(function (handler) { handler(patch); });
    realtime.changeHandlers.forEach(function (handler) {
        patch.operations.forEach(function (op) {
            handler(op.offset, op.toRemove, op.toInsert);
        });
    });
};

var validContent = function (realtime, contentGetter) {
    try {
        return realtime.config.validateContent(contentGetter());
    } catch (e) {
        warn(realtime, "Error in content validator [" + e.stack + "]");
    }
    return false;
};

var forEachParent = function (realtime, patch, callback) {
    for (var m = getParent(realtime, patch); m; m = getParent(realtime, m)) {
        if (callback(m) === false) { return; }
    }
};

var mkInverse = function (patch, content) {
    if (patch.mut.inverseOf) { return; }
    var inverse = patch.mut.inverseOf = Patch.invert(patch, content);
    inverse.mut.inverseOf = patch;
};

var handleMessage = ChainPad.handleMessage = function (realtime, msgStr, isFromMe) {

    if (Common.PARANOIA) { check(realtime); }
    var msg = Message.fromString(msgStr);

    if (Common.DEBUG) { debug(realtime, JSON.stringify([msg.hashOf, msg.content.operations])); }

    if (realtime.messages[msg.hashOf]) {
        if (realtime.setContentPatch && realtime.setContentPatch.hashOf === msg.hashOf) {
            // We got the initial state patch, channel already has a pad, no need to send it.
            realtime.setContentPatch = null;
        } else {
            debug(realtime, "Patch [" + msg.hashOf + "] is already known");
        }
        if (Common.PARANOIA) { check(realtime); }
        return;
    }

    if (msg.content.isCheckpoint &&
        !validContent(realtime, function () { return msg.content.operations[0].toInsert; }))
    {
        // If it's not a checkpoint, we verify it later on...
        debug(realtime, "Checkpoint [" + msg.hashOf + "] failed content validation");
        return;
    }

    storeMessage(realtime, msg);

    if (!isAncestorOf(realtime, realtime.rootMessage, msg)) {
        if (msg.content.isCheckpoint && realtime.best.mut.isInitialMessage) {
            // We're starting with a trucated chain from a checkpoint, we will adopt this
            // as the root message and go with it...
            debug(realtime, 'applying checkpoint [' + msg.hashOf + ']');
            var userDoc = Patch.apply(realtime.uncommitted, realtime.authDoc);
            Common.assert(!Common.PARANOIA || realtime.userInterfaceContent === userDoc);
            var fixUserDocPatch = Patch.invert(realtime.uncommitted, realtime.authDoc);
            Patch.addOperation(fixUserDocPatch,
                Operation.create(0, realtime.authDoc.length, msg.content.operations[0].toInsert));
            fixUserDocPatch =
                Patch.simplify(fixUserDocPatch, userDoc, realtime.config.operationSimplify);

            msg.mut.parentCount = 0;
            realtime.rootMessage = realtime.best = msg;

            realtime.authDoc = msg.content.operations[0].toInsert;
            realtime.uncommitted = Patch.create(Sha.hex_sha256(realtime.authDoc));
            realtime.uncommittedDocLength = realtime.authDoc.length;
            pushUIPatch(realtime, fixUserDocPatch);

            if (Common.PARANOIA) { realtime.userInterfaceContent = realtime.authDoc; }
            return;
        } else {
            // we'll probably find the missing parent later.
            debug(realtime, "Patch [" + msg.hashOf + "] not connected to root (parent: [" +
                msg.lastMsgHash + "])");
            if (Common.PARANOIA) { check(realtime); }
            return;
        }
    }

    // of this message fills in a hole in the chain which makes another patch better, swap to the
    // best child of this patch since longest chain always wins.
    msg = getBestChild(realtime, msg);
    msg.mut.isFromMe = isFromMe;
    var patch = msg.content;

    // Find the ancestor of this patch which is in the main chain, reverting as necessary
    var toRevert = [];
    var commonAncestor = realtime.best;
    if (!isAncestorOf(realtime, realtime.best, msg)) {
        var pcBest = parentCount(realtime, realtime.best);
        var pcMsg = parentCount(realtime, msg);
        if (pcBest < pcMsg
          || (pcBest === pcMsg
            && Common.strcmp(realtime.best.hashOf, msg.hashOf) > 0))
        {
            // switch chains
            while (commonAncestor && !isAncestorOf(realtime, commonAncestor, msg)) {
                toRevert.push(commonAncestor);
                commonAncestor = getParent(realtime, commonAncestor);
            }
            Common.assert(commonAncestor);
            debug(realtime, "Patch [" + msg.hashOf + "] better than best chain, switching");
        } else {
            debug(realtime, "Patch [" + msg.hashOf + "] chain is [" + pcMsg + "] best chain is [" +
                pcBest + "]");
            if (Common.PARANOIA) { check(realtime); }
            return;
        }
    }

    // Find the parents of this patch which are not in the main chain.
    var toApply = [];
    var current = msg;
    do {
        toApply.unshift(current);
        current = getParent(realtime, current);
        Common.assert(current);
    } while (current !== commonAncestor);


    var authDocAtTimeOfPatch = realtime.authDoc;

    toRevert.forEach(function (tr) {
        authDocAtTimeOfPatch = Patch.apply(inversePatch(tr.content), authDocAtTimeOfPatch);
    });

    toApply.forEach(function (ta, i) {
        // toApply.length-1 because we do not want to apply the new patch.
        if (i === toApply.length - 1) { return; }
        mkInverse(ta.content, authDocAtTimeOfPatch);
        authDocAtTimeOfPatch = Patch.apply(ta.content, authDocAtTimeOfPatch);
    });

    var headAtTimeOfPatch = realtime.best;
    if (toApply.length > 1) {
        headAtTimeOfPatch = toApply[toApply.length-2];
        Common.assert(headAtTimeOfPatch);
    } else if (toRevert.length) {
        headAtTimeOfPatch = getParent(realtime, toRevert[toRevert.length-1]);
        Common.assert(headAtTimeOfPatch);
    }
    Common.assert(inversePatch(headAtTimeOfPatch.content).parentHash);
    Common.assert(!Common.PARANOIA ||
        inversePatch(headAtTimeOfPatch.content).parentHash ===
            Sha.hex_sha256(authDocAtTimeOfPatch));

    if (inversePatch(headAtTimeOfPatch.content).parentHash !== patch.parentHash) {
        debug(realtime, "patch [" + msg.hashOf + "] parentHash is not valid");
        if (Common.PARANOIA) { check(realtime); }
        if (Common.TESTING) { throw new Error(); }
        forgetMessage(realtime, msg);
        return;
    }

    if (patch.isCheckpoint) {
        // Ok, we have a checkpoint patch.
        // If the chain length is not equal to checkpointInterval then this patch is invalid.
        var checkpointP;
        forEachParent(realtime, msg, function (m) {
            if (m.content.isCheckpoint) {
                if (checkpointP) {
                    checkpointP = m;
                    return false;
                }
                checkpointP = m;
            }
        });
        if (checkpointP && checkpointP !== realtime.rootMessage) {
            var point = parentCount(realtime, checkpointP);
            if (realtime.config.strictCheckpointValidation &&
                (point % realtime.config.checkpointInterval) !== 0)
            {
                debug(realtime, "checkpoint [" + msg.hashOf + "] at invalid point [" + point + "]");
                if (Common.PARANOIA) { check(realtime); }
                if (Common.TESTING) { throw new Error(); }
                forgetMessage(realtime, msg);
                return;
            }

            // Time to prune some old messages from the chain
            debug(realtime, "checkpoint [" + msg.hashOf + "]");
            forEachParent(realtime, checkpointP, function (m) {
                debug(realtime, "pruning [" + m.hashOf + "]");
                forgetMessage(realtime, m);
            });
            realtime.rootMessage = checkpointP;
        }
    } else {
        var simplePatch =
            Patch.simplify(patch, authDocAtTimeOfPatch, realtime.config.operationSimplify);
        if (!Patch.equals(simplePatch, patch)) {
            debug(realtime, "patch [" + msg.hashOf + "] can be simplified");
            if (Common.PARANOIA) { check(realtime); }
            if (Common.TESTING) { throw new Error(); }
            forgetMessage(realtime, msg);
            return;
        }

        if (!validContent(realtime,
            function () { return Patch.apply(patch, authDocAtTimeOfPatch); }))
        {
            debug(realtime, "Patch [" + msg.hashOf + "] failed content validation");
            return;
        }
    }

    mkInverse(patch, authDocAtTimeOfPatch);

    realtime.uncommitted = Patch.simplify(
        realtime.uncommitted, realtime.authDoc, realtime.config.operationSimplify);
    var oldUserInterfaceContent = Patch.apply(realtime.uncommitted, realtime.authDoc);
    if (Common.PARANOIA) {
        Common.assert(oldUserInterfaceContent === realtime.userInterfaceContent);
    }

    // Derive the patch for the user's uncommitted work
    var uncommittedPatch = Patch.invert(realtime.uncommitted, realtime.authDoc);

    toRevert.forEach(function (tr) {
        debug(realtime, "reverting [" + tr.hashOf + "]");
        if (tr.mut.isFromMe) {
            debug(realtime, "reverting patch 'from me' [" + JSON.stringify(tr.content.operations) + "]");
        }
        uncommittedPatch = Patch.merge(uncommittedPatch, inversePatch(tr.content));
        revertPatch(realtime, tr.mut.isFromMe, tr.content);
    });

    toApply.forEach(function (ta) {
        debug(realtime, "applying [" + ta.hashOf + "]");
        uncommittedPatch = Patch.merge(uncommittedPatch, ta.content);
        applyPatch(realtime, ta.mut.isFromMe, ta.content);
    });

    uncommittedPatch = Patch.merge(uncommittedPatch, realtime.uncommitted);
    uncommittedPatch = Patch.simplify(
        uncommittedPatch, oldUserInterfaceContent, realtime.config.operationSimplify);

    realtime.uncommittedDocLength += Patch.lengthChange(uncommittedPatch);
    realtime.best = msg;

    if (Common.PARANOIA) {
        // apply the uncommittedPatch to the userInterface content.
        var newUserInterfaceContent = Patch.apply(uncommittedPatch, oldUserInterfaceContent);
        Common.assert(realtime.userInterfaceContent.length === realtime.uncommittedDocLength);
        Common.assert(newUserInterfaceContent === realtime.userInterfaceContent);
    }

    pushUIPatch(realtime, uncommittedPatch);

    if (!realtime.uncommitted.operations.length) {
        settle(realtime);
    }

    if (Common.PARANOIA) { check(realtime); }
};

var getDepthOfState = function (content, minDepth, realtime) {
    Common.assert(typeof(content) === 'string');

    // minimum depth is an optional argument which defaults to zero
    minDepth = minDepth || 0;

    if (minDepth === 0 && realtime.authDoc === content) {
        return 0;
    }

    var hash = Sha.hex_sha256(content);

    var patchMsg = realtime.best;
    var depth = 0;

    do {
        if (depth < minDepth) {
            // you haven't exceeded the minimum depth
        } else {
            //console.log("Exceeded minimum depth");
            // you *have* exceeded the minimum depth
            if (patchMsg.content.parentHash === hash) {
                // you found it!
                return depth + 1;
            }
        }
        depth++;
    } while ((patchMsg = getParent(realtime, patchMsg)));
    return -1;
};

var getContentAtState = function (realtime, msg) {
    var patches = [ msg ];
    while (patches[0] !== realtime.rootMessage) {
        var parent = getParent(realtime, patches[0]);
        if (!parent) {
            return { error: 'not connected to root', doc: undefined };
        }
        patches.unshift(parent);
    }
    var doc = '';
    if (realtime.rootMessage.content.operations.length) {
        Common.assert(realtime.rootMessage.content.operations.length === 1);
        doc = realtime.rootMessage.content.operations[0].toInsert;
    }
    for (var i = 1; i < patches.length; i++) {
        doc = Patch.apply(patches[i].content, doc);
    }
    return { error: undefined, doc: doc };
};

var wrapMessage = function (realtime, msg) {
    return Object.freeze({
        type: 'Block',
        hashOf: msg.hashOf,
        lastMsgHash: msg.lastMsgHash,
        isCheckpoint: !!msg.content.isCheckpoint,
        getParent: function () {
            var parentMsg = getParent(realtime, msg);
            if (parentMsg) { return wrapMessage(realtime, parentMsg); }
        },
        getContent: function () { return getContentAtState(realtime, msg); },
        getPatch: function () { return Patch.clone(msg.content); },
        getInversePatch: function () { return Patch.clone(inversePatch(msg.content)); },
        equals: function (block, msgOpt) {
            if (msgOpt) { return msg === msgOpt; }
            Common.assert(block.type === 'Block');
            return block.equals(null, msg);
        }
    });
};

/*::
import type { Operation_Simplify_t, Operation_Transform_t } from './Operation';
export type ChainPad_Config_t = {
    initialState: string,
    checkpointInterval: number,
    avgSyncMilliseconds: number,
    strictCheckpointValidation: boolean,
    operationSimplify: Operation_Simplify_t,
    logLevel: number,
    transformFunction: Operation_Transform_t,
    userName: string,
    validateContent: (string)=>boolean
};
*/

var mkConfig = function (config) {
    config = config || {};
    return Object.freeze({
        initialState: config.initialState || '',
        checkpointInterval: config.checkpointInterval || DEFAULT_CHECKPOINT_INTERVAL,
        avgSyncMilliseconds: config.avgSyncMilliseconds || DEFAULT_AVERAGE_SYNC_MILLISECONDS,
        strictCheckpointValidation: config.strictCheckpointValidation ||
            DEFAULT_STRICT_CHECKPOINT_VALIDATION,
        operationSimplify: config.operationSimplify || Operation.simplify,
        logLevel: (typeof(config.logLevel) === 'number') ? config.logLevel : 1,
        transformFunction: config.transformFunction || Operation.transform0,
        userName: config.userName || 'anonymous',
        validateContent: config.validateContent || function () { return true; }
    });
};

module.exports.create = function (conf /*:Object*/) {
    var realtime = ChainPad.create(mkConfig(conf));
    var out = {
        onPatch: function (handler /*:(Patch_t)=>void*/) {
            Common.assert(typeof(handler) === 'function');
            realtime.patchHandlers.push(handler);
        },
        patch: function (patch /*:Patch_t|number*/, x /*:?number*/, y /*:?string*/) {
            if (typeof(patch) === 'number') {
                // Actually they meant to call realtime.change()
                if (!x || !y) { throw new Error(); }
                out.change(patch, x, y);
                return;
            }
            doPatch(realtime, patch);
        },

        onChange: function (handler /*:(number, number, string)=>void*/) {
            Common.assert(typeof(handler) === 'function');
            realtime.changeHandlers.push(handler);
        },

        change: function (offset /*:number*/, count /*:number*/, chars /*:string*/) {
            if (count === 0 && chars === '') { return; }
            doOperation(realtime, Operation.create(offset, count, chars));
        },

        onMessage: function (handler /*:(string, ()=>void)=>void*/) {
            Common.assert(typeof(handler) === 'function');
            realtime.messageHandlers.push(handler);
        },

        message: function (message /*:string*/) {
            handleMessage(realtime, message, false);
        },

        start: function () {
            if (realtime.syncSchedule) { unschedule(realtime, realtime.syncSchedule); }
            realtime.syncSchedule = schedule(realtime, function () { sync(realtime); });
        },

        abort: function () {
            realtime.aborted = true;
            realtime.schedules.forEach(function (s) { clearTimeout(s); });
        },

        sync: function () {
            sync(realtime);
        },

        getAuthDoc: function () { return realtime.authDoc; },

        getUserDoc: function () { return Patch.apply(realtime.uncommitted, realtime.authDoc); },

        getDepthOfState: function (content /*:string*/, minDepth /*:?number*/) {
            return getDepthOfState(content, minDepth, realtime);
        },

        onSettle: function (handler /*:()=>void*/) {
            Common.assert(typeof(handler) === 'function');
            realtime.onSettle.push(handler);
        },

        getAuthBlock: function () {
            return wrapMessage(realtime, realtime.best);
        },

        getBlockForHash: function (hash /*:string*/) {
            Common.assert(typeof(hash) === 'string');
            var msg = realtime.messages[hash];
            if (msg) { return wrapMessage(realtime, msg); }
        },

        _: undefined
    };
    if (Common.DEBUG) {
        out._ = realtime;
    }
    return out;
};

},
"Operation.js": function(module, exports, require){
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

},
"sha256/hash.js": function(module, exports, require){
var Utils = require('./utils.js');

function hash_reset () {
    this.result = null;
    this.pos = 0;
    this.len = 0;

    this.asm.reset();

    return this;
}

function hash_process ( data ) {
    if ( this.result !== null )
        throw new IllegalStateError("state must be reset before processing new data");

    if ( Utils.is_string(data) )
        data = Utils.string_to_bytes(data);

    if ( Utils.is_buffer(data) )
        data = new Uint8Array(data);

    if ( !Utils.is_bytes(data) )
        throw new TypeError("data isn't of expected type");

    var asm = this.asm,
        heap = this.heap,
        hpos = this.pos,
        hlen = this.len,
        dpos = 0,
        dlen = data.length,
        wlen = 0;

    while ( dlen > 0 ) {
        wlen = Utils._heap_write( heap, hpos+hlen, data, dpos, dlen );
        hlen += wlen;
        dpos += wlen;
        dlen -= wlen;

        wlen = asm.process( hpos, hlen );

        hpos += wlen;
        hlen -= wlen;

        if ( !hlen ) hpos = 0;
    }

    this.pos = hpos;
    this.len = hlen;

    return this;
}

function hash_finish () {
    if ( this.result !== null )
        throw new IllegalStateError("state must be reset before processing new data");

    this.asm.finish( this.pos, this.len, 0 );

    this.result = new Uint8Array(this.HASH_SIZE);
    this.result.set( this.heap.subarray( 0, this.HASH_SIZE ) );

    this.pos = 0;
    this.len = 0;

    return this;
}

module.exports.hash_reset = hash_reset;
module.exports.hash_process = hash_process;
module.exports.hash_finish = hash_finish;

},
"sha256/utils.js": function(module, exports, require){
//var FloatArray = global.Float64Array || global.Float32Array; // make PhantomJS happy

var string_to_bytes = module.exports.string_to_bytes = function( str, utf8 ) {
    utf8 = !!utf8;

    var len = str.length,
        bytes = new Uint8Array( utf8 ? 4*len : len );

    for ( var i = 0, j = 0; i < len; i++ ) {
        var c = str.charCodeAt(i);

        if ( utf8 && 0xd800 <= c && c <= 0xdbff ) {
            if ( ++i >= len ) throw new Error( "Malformed string, low surrogate expected at position " + i );
            c = ( (c ^ 0xd800) << 10 ) | 0x10000 | ( str.charCodeAt(i) ^ 0xdc00 );
        }
        else if ( !utf8 && c >>> 8 ) {
            throw new Error("Wide characters are not allowed.");
        }

        if ( !utf8 || c <= 0x7f ) {
            bytes[j++] = c;
        }
        else if ( c <= 0x7ff ) {
            bytes[j++] = 0xc0 | (c >> 6);
            bytes[j++] = 0x80 | (c & 0x3f);
        }
        else if ( c <= 0xffff ) {
            bytes[j++] = 0xe0 | (c >> 12);
            bytes[j++] = 0x80 | (c >> 6 & 0x3f);
            bytes[j++] = 0x80 | (c & 0x3f);
        }
        else {
            bytes[j++] = 0xf0 | (c >> 18);
            bytes[j++] = 0x80 | (c >> 12 & 0x3f);
            bytes[j++] = 0x80 | (c >> 6 & 0x3f);
            bytes[j++] = 0x80 | (c & 0x3f);
        }
    }

    return bytes.subarray(0, j);
};

var hex_to_bytes = module.exports.hex_to_bytes = function( str ) {
    var len = str.length;
    if ( len & 1 ) {
        str = '0'+str;
        len++;
    }
    var bytes = new Uint8Array(len>>1);
    for ( var i = 0; i < len; i += 2 ) {
        bytes[i>>1] = parseInt( str.substr( i, 2), 16 );
    }
    return bytes;
};

var base64_to_bytes = module.exports.base64_to_bytes = function( str ) {
    return string_to_bytes( atob( str ) );
};

var bytes_to_string = module.exports.bytes_to_string = function( bytes, utf8 ) {
    utf8 = !!utf8;

    var len = bytes.length,
        chars = new Array(len);

    for ( var i = 0, j = 0; i < len; i++ ) {
        var b = bytes[i];
        if ( !utf8 || b < 128 ) {
            chars[j++] = b;
        }
        else if ( b >= 192 && b < 224 && i+1 < len ) {
            chars[j++] = ( (b & 0x1f) << 6 ) | (bytes[++i] & 0x3f);
        }
        else if ( b >= 224 && b < 240 && i+2 < len ) {
            chars[j++] = ( (b & 0xf) << 12 ) | ( (bytes[++i] & 0x3f) << 6 ) | (bytes[++i] & 0x3f);
        }
        else if ( b >= 240 && b < 248 && i+3 < len ) {
            var c = ( (b & 7) << 18 ) | ( (bytes[++i] & 0x3f) << 12 ) | ( (bytes[++i] & 0x3f) << 6 ) | (bytes[++i] & 0x3f);
            if ( c <= 0xffff ) {
                chars[j++] = c;
            }
            else {
                c ^= 0x10000;
                chars[j++] = 0xd800 | (c >> 10);
                chars[j++] = 0xdc00 | (c & 0x3ff);
            }
        }
        else {
            throw new Error("Malformed UTF8 character at byte offset " + i);
        }
    }

    var str = '',
        bs = 16384;
    for ( var _i = 0; _i < j; _i += bs ) {
        str += String.fromCharCode.apply( String, chars.slice( _i, _i+bs <= j ? _i+bs : j ) );
    }

    return str;
};

var bytes_to_hex = module.exports.bytes_to_hex = function( arr ) {
    var str = '';
    for ( var i = 0; i < arr.length; i++ ) {
        var h = ( arr[i] & 0xff ).toString(16);
        if ( h.length < 2 ) str += '0';
        str += h;
    }
    return str;
};

var bytes_to_base64 = module.exports.bytes_to_base64 = function( arr ) {
    return btoa( bytes_to_string(arr) );
};

var pow2_ceil = module.exports.pow2_ceil = function( a ) {
    a -= 1;
    a |= a >>> 1;
    a |= a >>> 2;
    a |= a >>> 4;
    a |= a >>> 8;
    a |= a >>> 16;
    a += 1;
    return a;
};

var is_number = module.exports.is_number = function( a ) {
    return ( typeof a === 'number' );
};

var is_string = module.exports.is_string = function( a ) {
    return ( typeof a === 'string' );
};

var is_buffer = module.exports.is_buffer = function( a ) {
    return ( a instanceof ArrayBuffer );
};

var is_bytes = module.exports.is_bytes = function( a ) {
    return ( a instanceof Uint8Array );
};

var is_typed_array = module.exports.is_typed_array = function( a ) {
    return ( a instanceof Int8Array ) || ( a instanceof Uint8Array )
        || ( a instanceof Int16Array ) || ( a instanceof Uint16Array )
        || ( a instanceof Int32Array ) || ( a instanceof Uint32Array )
        || ( a instanceof Float32Array )
        || ( a instanceof Float64Array );
};

var _heap_init = module.exports._heap_init = function( constructor, options ) {
    var heap = options.heap,
        size = heap ? heap.byteLength : options.heapSize || 65536;

    if ( size & 0xfff || size <= 0 )
        throw new Error("heap size must be a positive integer and a multiple of 4096");

    heap = heap || new constructor( new ArrayBuffer(size) );

    return heap;
};

var _heap_write = module.exports._heap_write = function( heap, hpos, data, dpos, dlen ) {
    var hlen = heap.length - hpos,
        wlen = ( hlen < dlen ) ? hlen : dlen;

    heap.set( data.subarray( dpos, dpos+wlen ), hpos );

    return wlen;
};

},
"sha256/sha256.js": function(module, exports, require){
var Utils = require('./utils.js');
var Hash = require('./hash.js');
var Asm = require('./sha256.asm.js');

var _sha256_block_size = 64,
    _sha256_hash_size = 32;

function sha256_constructor ( options ) {
    options = options || {};

    this.heap = Utils._heap_init( Uint8Array, options );
    this.asm = options.asm || Asm.sha256_asm( { Uint8Array: Uint8Array }, null, this.heap.buffer );

    this.BLOCK_SIZE = _sha256_block_size;
    this.HASH_SIZE = _sha256_hash_size;

    this.reset();
}

sha256_constructor.BLOCK_SIZE = _sha256_block_size;
sha256_constructor.HASH_SIZE = _sha256_hash_size;
var sha256_prototype = sha256_constructor.prototype;
sha256_prototype.reset =   Hash.hash_reset;
sha256_prototype.process = Hash.hash_process;
sha256_prototype.finish =  Hash.hash_finish;

var sha256_instance = null;

function get_sha256_instance () {
    if ( sha256_instance === null ) sha256_instance = new sha256_constructor( { heapSize: 0x100000 } );
    return sha256_instance;
}

module.exports.get_sha256_instance = get_sha256_instance;
module.exports.sha256_constructor = sha256_constructor;

},
"sha256/exports.js": function(module, exports, require){
var Sha256 = require('./sha256.js');
var Utils = require('./utils.js');

/**
 * SHA256 exports
 */

function sha256_bytes ( data ) {
    if ( data === undefined ) throw new SyntaxError("data required");
    return Sha256.get_sha256_instance().reset().process(data).finish().result;
}

function sha256_hex ( data ) {
    var result = sha256_bytes(data);
    return Utils.bytes_to_hex(result);
}

function sha256_base64 ( data ) {
    var result = sha256_bytes(data);
    return Utils.bytes_to_base64(result);
}

Sha256.sha256_constructor.bytes = sha256_bytes;
Sha256.sha256_constructor.hex = sha256_hex;
Sha256.sha256_constructor.base64 = sha256_base64;

//exports.SHA256 = sha256_constructor;
module.exports = Sha256.sha256_constructor;

},
"sha256/sha256.asm.js": function(module, exports, require){
module.exports.sha256_asm = function sha256_asm ( stdlib, foreign, buffer ) {
    "use asm";

    // SHA256 state
    var H0 = 0, H1 = 0, H2 = 0, H3 = 0, H4 = 0, H5 = 0, H6 = 0, H7 = 0,
        TOTAL0 = 0, TOTAL1 = 0;

    // HMAC state
    var I0 = 0, I1 = 0, I2 = 0, I3 = 0, I4 = 0, I5 = 0, I6 = 0, I7 = 0,
        O0 = 0, O1 = 0, O2 = 0, O3 = 0, O4 = 0, O5 = 0, O6 = 0, O7 = 0;

    // I/O buffer
    var HEAP = new stdlib.Uint8Array(buffer);

    function _core ( w0, w1, w2, w3, w4, w5, w6, w7, w8, w9, w10, w11, w12, w13, w14, w15 ) {
        w0 = w0|0;
        w1 = w1|0;
        w2 = w2|0;
        w3 = w3|0;
        w4 = w4|0;
        w5 = w5|0;
        w6 = w6|0;
        w7 = w7|0;
        w8 = w8|0;
        w9 = w9|0;
        w10 = w10|0;
        w11 = w11|0;
        w12 = w12|0;
        w13 = w13|0;
        w14 = w14|0;
        w15 = w15|0;

        var a = 0, b = 0, c = 0, d = 0, e = 0, f = 0, g = 0, h = 0,
            t = 0;

        a = H0;
        b = H1;
        c = H2;
        d = H3;
        e = H4;
        f = H5;
        g = H6;
        h = H7;

        // 0
        t = ( w0 + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x428a2f98 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 1
        t = ( w1 + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x71374491 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 2
        t = ( w2 + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0xb5c0fbcf )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 3
        t = ( w3 + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0xe9b5dba5 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 4
        t = ( w4 + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x3956c25b )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 5
        t = ( w5 + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x59f111f1 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 6
        t = ( w6 + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x923f82a4 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 7
        t = ( w7 + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0xab1c5ed5 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 8
        t = ( w8 + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0xd807aa98 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 9
        t = ( w9 + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x12835b01 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 10
        t = ( w10 + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x243185be )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 11
        t = ( w11 + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x550c7dc3 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 12
        t = ( w12 + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x72be5d74 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 13
        t = ( w13 + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x80deb1fe )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 14
        t = ( w14 + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x9bdc06a7 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 15
        t = ( w15 + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0xc19bf174 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 16
        w0 = t = ( ( w1>>>7  ^ w1>>>18 ^ w1>>>3  ^ w1<<25 ^ w1<<14 ) + ( w14>>>17 ^ w14>>>19 ^ w14>>>10 ^ w14<<15 ^ w14<<13 ) + w0 + w9 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0xe49b69c1 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 17
        w1 = t = ( ( w2>>>7  ^ w2>>>18 ^ w2>>>3  ^ w2<<25 ^ w2<<14 ) + ( w15>>>17 ^ w15>>>19 ^ w15>>>10 ^ w15<<15 ^ w15<<13 ) + w1 + w10 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0xefbe4786 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 18
        w2 = t = ( ( w3>>>7  ^ w3>>>18 ^ w3>>>3  ^ w3<<25 ^ w3<<14 ) + ( w0>>>17 ^ w0>>>19 ^ w0>>>10 ^ w0<<15 ^ w0<<13 ) + w2 + w11 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x0fc19dc6 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 19
        w3 = t = ( ( w4>>>7  ^ w4>>>18 ^ w4>>>3  ^ w4<<25 ^ w4<<14 ) + ( w1>>>17 ^ w1>>>19 ^ w1>>>10 ^ w1<<15 ^ w1<<13 ) + w3 + w12 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x240ca1cc )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 20
        w4 = t = ( ( w5>>>7  ^ w5>>>18 ^ w5>>>3  ^ w5<<25 ^ w5<<14 ) + ( w2>>>17 ^ w2>>>19 ^ w2>>>10 ^ w2<<15 ^ w2<<13 ) + w4 + w13 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x2de92c6f )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 21
        w5 = t = ( ( w6>>>7  ^ w6>>>18 ^ w6>>>3  ^ w6<<25 ^ w6<<14 ) + ( w3>>>17 ^ w3>>>19 ^ w3>>>10 ^ w3<<15 ^ w3<<13 ) + w5 + w14 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x4a7484aa )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 22
        w6 = t = ( ( w7>>>7  ^ w7>>>18 ^ w7>>>3  ^ w7<<25 ^ w7<<14 ) + ( w4>>>17 ^ w4>>>19 ^ w4>>>10 ^ w4<<15 ^ w4<<13 ) + w6 + w15 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x5cb0a9dc )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 23
        w7 = t = ( ( w8>>>7  ^ w8>>>18 ^ w8>>>3  ^ w8<<25 ^ w8<<14 ) + ( w5>>>17 ^ w5>>>19 ^ w5>>>10 ^ w5<<15 ^ w5<<13 ) + w7 + w0 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x76f988da )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 24
        w8 = t = ( ( w9>>>7  ^ w9>>>18 ^ w9>>>3  ^ w9<<25 ^ w9<<14 ) + ( w6>>>17 ^ w6>>>19 ^ w6>>>10 ^ w6<<15 ^ w6<<13 ) + w8 + w1 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x983e5152 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 25
        w9 = t = ( ( w10>>>7  ^ w10>>>18 ^ w10>>>3  ^ w10<<25 ^ w10<<14 ) + ( w7>>>17 ^ w7>>>19 ^ w7>>>10 ^ w7<<15 ^ w7<<13 ) + w9 + w2 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0xa831c66d )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 26
        w10 = t = ( ( w11>>>7  ^ w11>>>18 ^ w11>>>3  ^ w11<<25 ^ w11<<14 ) + ( w8>>>17 ^ w8>>>19 ^ w8>>>10 ^ w8<<15 ^ w8<<13 ) + w10 + w3 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0xb00327c8 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 27
        w11 = t = ( ( w12>>>7  ^ w12>>>18 ^ w12>>>3  ^ w12<<25 ^ w12<<14 ) + ( w9>>>17 ^ w9>>>19 ^ w9>>>10 ^ w9<<15 ^ w9<<13 ) + w11 + w4 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0xbf597fc7 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 28
        w12 = t = ( ( w13>>>7  ^ w13>>>18 ^ w13>>>3  ^ w13<<25 ^ w13<<14 ) + ( w10>>>17 ^ w10>>>19 ^ w10>>>10 ^ w10<<15 ^ w10<<13 ) + w12 + w5 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0xc6e00bf3 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 29
        w13 = t = ( ( w14>>>7  ^ w14>>>18 ^ w14>>>3  ^ w14<<25 ^ w14<<14 ) + ( w11>>>17 ^ w11>>>19 ^ w11>>>10 ^ w11<<15 ^ w11<<13 ) + w13 + w6 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0xd5a79147 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 30
        w14 = t = ( ( w15>>>7  ^ w15>>>18 ^ w15>>>3  ^ w15<<25 ^ w15<<14 ) + ( w12>>>17 ^ w12>>>19 ^ w12>>>10 ^ w12<<15 ^ w12<<13 ) + w14 + w7 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x06ca6351 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 31
        w15 = t = ( ( w0>>>7  ^ w0>>>18 ^ w0>>>3  ^ w0<<25 ^ w0<<14 ) + ( w13>>>17 ^ w13>>>19 ^ w13>>>10 ^ w13<<15 ^ w13<<13 ) + w15 + w8 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x14292967 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 32
        w0 = t = ( ( w1>>>7  ^ w1>>>18 ^ w1>>>3  ^ w1<<25 ^ w1<<14 ) + ( w14>>>17 ^ w14>>>19 ^ w14>>>10 ^ w14<<15 ^ w14<<13 ) + w0 + w9 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x27b70a85 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 33
        w1 = t = ( ( w2>>>7  ^ w2>>>18 ^ w2>>>3  ^ w2<<25 ^ w2<<14 ) + ( w15>>>17 ^ w15>>>19 ^ w15>>>10 ^ w15<<15 ^ w15<<13 ) + w1 + w10 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x2e1b2138 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 34
        w2 = t = ( ( w3>>>7  ^ w3>>>18 ^ w3>>>3  ^ w3<<25 ^ w3<<14 ) + ( w0>>>17 ^ w0>>>19 ^ w0>>>10 ^ w0<<15 ^ w0<<13 ) + w2 + w11 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x4d2c6dfc )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 35
        w3 = t = ( ( w4>>>7  ^ w4>>>18 ^ w4>>>3  ^ w4<<25 ^ w4<<14 ) + ( w1>>>17 ^ w1>>>19 ^ w1>>>10 ^ w1<<15 ^ w1<<13 ) + w3 + w12 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x53380d13 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 36
        w4 = t = ( ( w5>>>7  ^ w5>>>18 ^ w5>>>3  ^ w5<<25 ^ w5<<14 ) + ( w2>>>17 ^ w2>>>19 ^ w2>>>10 ^ w2<<15 ^ w2<<13 ) + w4 + w13 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x650a7354 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 37
        w5 = t = ( ( w6>>>7  ^ w6>>>18 ^ w6>>>3  ^ w6<<25 ^ w6<<14 ) + ( w3>>>17 ^ w3>>>19 ^ w3>>>10 ^ w3<<15 ^ w3<<13 ) + w5 + w14 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x766a0abb )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 38
        w6 = t = ( ( w7>>>7  ^ w7>>>18 ^ w7>>>3  ^ w7<<25 ^ w7<<14 ) + ( w4>>>17 ^ w4>>>19 ^ w4>>>10 ^ w4<<15 ^ w4<<13 ) + w6 + w15 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x81c2c92e )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 39
        w7 = t = ( ( w8>>>7  ^ w8>>>18 ^ w8>>>3  ^ w8<<25 ^ w8<<14 ) + ( w5>>>17 ^ w5>>>19 ^ w5>>>10 ^ w5<<15 ^ w5<<13 ) + w7 + w0 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x92722c85 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 40
        w8 = t = ( ( w9>>>7  ^ w9>>>18 ^ w9>>>3  ^ w9<<25 ^ w9<<14 ) + ( w6>>>17 ^ w6>>>19 ^ w6>>>10 ^ w6<<15 ^ w6<<13 ) + w8 + w1 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0xa2bfe8a1 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 41
        w9 = t = ( ( w10>>>7  ^ w10>>>18 ^ w10>>>3  ^ w10<<25 ^ w10<<14 ) + ( w7>>>17 ^ w7>>>19 ^ w7>>>10 ^ w7<<15 ^ w7<<13 ) + w9 + w2 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0xa81a664b )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 42
        w10 = t = ( ( w11>>>7  ^ w11>>>18 ^ w11>>>3  ^ w11<<25 ^ w11<<14 ) + ( w8>>>17 ^ w8>>>19 ^ w8>>>10 ^ w8<<15 ^ w8<<13 ) + w10 + w3 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0xc24b8b70 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 43
        w11 = t = ( ( w12>>>7  ^ w12>>>18 ^ w12>>>3  ^ w12<<25 ^ w12<<14 ) + ( w9>>>17 ^ w9>>>19 ^ w9>>>10 ^ w9<<15 ^ w9<<13 ) + w11 + w4 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0xc76c51a3 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 44
        w12 = t = ( ( w13>>>7  ^ w13>>>18 ^ w13>>>3  ^ w13<<25 ^ w13<<14 ) + ( w10>>>17 ^ w10>>>19 ^ w10>>>10 ^ w10<<15 ^ w10<<13 ) + w12 + w5 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0xd192e819 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 45
        w13 = t = ( ( w14>>>7  ^ w14>>>18 ^ w14>>>3  ^ w14<<25 ^ w14<<14 ) + ( w11>>>17 ^ w11>>>19 ^ w11>>>10 ^ w11<<15 ^ w11<<13 ) + w13 + w6 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0xd6990624 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 46
        w14 = t = ( ( w15>>>7  ^ w15>>>18 ^ w15>>>3  ^ w15<<25 ^ w15<<14 ) + ( w12>>>17 ^ w12>>>19 ^ w12>>>10 ^ w12<<15 ^ w12<<13 ) + w14 + w7 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0xf40e3585 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 47
        w15 = t = ( ( w0>>>7  ^ w0>>>18 ^ w0>>>3  ^ w0<<25 ^ w0<<14 ) + ( w13>>>17 ^ w13>>>19 ^ w13>>>10 ^ w13<<15 ^ w13<<13 ) + w15 + w8 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x106aa070 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 48
        w0 = t = ( ( w1>>>7  ^ w1>>>18 ^ w1>>>3  ^ w1<<25 ^ w1<<14 ) + ( w14>>>17 ^ w14>>>19 ^ w14>>>10 ^ w14<<15 ^ w14<<13 ) + w0 + w9 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x19a4c116 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 49
        w1 = t = ( ( w2>>>7  ^ w2>>>18 ^ w2>>>3  ^ w2<<25 ^ w2<<14 ) + ( w15>>>17 ^ w15>>>19 ^ w15>>>10 ^ w15<<15 ^ w15<<13 ) + w1 + w10 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x1e376c08 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 50
        w2 = t = ( ( w3>>>7  ^ w3>>>18 ^ w3>>>3  ^ w3<<25 ^ w3<<14 ) + ( w0>>>17 ^ w0>>>19 ^ w0>>>10 ^ w0<<15 ^ w0<<13 ) + w2 + w11 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x2748774c )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 51
        w3 = t = ( ( w4>>>7  ^ w4>>>18 ^ w4>>>3  ^ w4<<25 ^ w4<<14 ) + ( w1>>>17 ^ w1>>>19 ^ w1>>>10 ^ w1<<15 ^ w1<<13 ) + w3 + w12 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x34b0bcb5 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 52
        w4 = t = ( ( w5>>>7  ^ w5>>>18 ^ w5>>>3  ^ w5<<25 ^ w5<<14 ) + ( w2>>>17 ^ w2>>>19 ^ w2>>>10 ^ w2<<15 ^ w2<<13 ) + w4 + w13 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x391c0cb3 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 53
        w5 = t = ( ( w6>>>7  ^ w6>>>18 ^ w6>>>3  ^ w6<<25 ^ w6<<14 ) + ( w3>>>17 ^ w3>>>19 ^ w3>>>10 ^ w3<<15 ^ w3<<13 ) + w5 + w14 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x4ed8aa4a )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 54
        w6 = t = ( ( w7>>>7  ^ w7>>>18 ^ w7>>>3  ^ w7<<25 ^ w7<<14 ) + ( w4>>>17 ^ w4>>>19 ^ w4>>>10 ^ w4<<15 ^ w4<<13 ) + w6 + w15 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x5b9cca4f )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 55
        w7 = t = ( ( w8>>>7  ^ w8>>>18 ^ w8>>>3  ^ w8<<25 ^ w8<<14 ) + ( w5>>>17 ^ w5>>>19 ^ w5>>>10 ^ w5<<15 ^ w5<<13 ) + w7 + w0 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x682e6ff3 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 56
        w8 = t = ( ( w9>>>7  ^ w9>>>18 ^ w9>>>3  ^ w9<<25 ^ w9<<14 ) + ( w6>>>17 ^ w6>>>19 ^ w6>>>10 ^ w6<<15 ^ w6<<13 ) + w8 + w1 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x748f82ee )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 57
        w9 = t = ( ( w10>>>7  ^ w10>>>18 ^ w10>>>3  ^ w10<<25 ^ w10<<14 ) + ( w7>>>17 ^ w7>>>19 ^ w7>>>10 ^ w7<<15 ^ w7<<13 ) + w9 + w2 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x78a5636f )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 58
        w10 = t = ( ( w11>>>7  ^ w11>>>18 ^ w11>>>3  ^ w11<<25 ^ w11<<14 ) + ( w8>>>17 ^ w8>>>19 ^ w8>>>10 ^ w8<<15 ^ w8<<13 ) + w10 + w3 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x84c87814 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 59
        w11 = t = ( ( w12>>>7  ^ w12>>>18 ^ w12>>>3  ^ w12<<25 ^ w12<<14 ) + ( w9>>>17 ^ w9>>>19 ^ w9>>>10 ^ w9<<15 ^ w9<<13 ) + w11 + w4 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x8cc70208 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 60
        w12 = t = ( ( w13>>>7  ^ w13>>>18 ^ w13>>>3  ^ w13<<25 ^ w13<<14 ) + ( w10>>>17 ^ w10>>>19 ^ w10>>>10 ^ w10<<15 ^ w10<<13 ) + w12 + w5 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0x90befffa )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 61
        w13 = t = ( ( w14>>>7  ^ w14>>>18 ^ w14>>>3  ^ w14<<25 ^ w14<<14 ) + ( w11>>>17 ^ w11>>>19 ^ w11>>>10 ^ w11<<15 ^ w11<<13 ) + w13 + w6 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0xa4506ceb )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 62
        w14 = t = ( ( w15>>>7  ^ w15>>>18 ^ w15>>>3  ^ w15<<25 ^ w15<<14 ) + ( w12>>>17 ^ w12>>>19 ^ w12>>>10 ^ w12<<15 ^ w12<<13 ) + w14 + w7 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0xbef9a3f7 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        // 63
        w15 = t = ( ( w0>>>7  ^ w0>>>18 ^ w0>>>3  ^ w0<<25 ^ w0<<14 ) + ( w13>>>17 ^ w13>>>19 ^ w13>>>10 ^ w13<<15 ^ w13<<13 ) + w15 + w8 )|0;
        t = ( t + h + ( e>>>6 ^ e>>>11 ^ e>>>25 ^ e<<26 ^ e<<21 ^ e<<7 ) +  ( g ^ e & (f^g) ) + 0xc67178f2 )|0;
        h = g; g = f; f = e; e = ( d + t )|0; d = c; c = b; b = a;
        a = ( t + ( (b & c) ^ ( d & (b ^ c) ) ) + ( b>>>2 ^ b>>>13 ^ b>>>22 ^ b<<30 ^ b<<19 ^ b<<10 ) )|0;

        H0 = ( H0 + a )|0;
        H1 = ( H1 + b )|0;
        H2 = ( H2 + c )|0;
        H3 = ( H3 + d )|0;
        H4 = ( H4 + e )|0;
        H5 = ( H5 + f )|0;
        H6 = ( H6 + g )|0;
        H7 = ( H7 + h )|0;
    }

    function _core_heap ( offset ) {
        offset = offset|0;

        _core(
            HEAP[offset|0]<<24 | HEAP[offset|1]<<16 | HEAP[offset|2]<<8 | HEAP[offset|3],
            HEAP[offset|4]<<24 | HEAP[offset|5]<<16 | HEAP[offset|6]<<8 | HEAP[offset|7],
            HEAP[offset|8]<<24 | HEAP[offset|9]<<16 | HEAP[offset|10]<<8 | HEAP[offset|11],
            HEAP[offset|12]<<24 | HEAP[offset|13]<<16 | HEAP[offset|14]<<8 | HEAP[offset|15],
            HEAP[offset|16]<<24 | HEAP[offset|17]<<16 | HEAP[offset|18]<<8 | HEAP[offset|19],
            HEAP[offset|20]<<24 | HEAP[offset|21]<<16 | HEAP[offset|22]<<8 | HEAP[offset|23],
            HEAP[offset|24]<<24 | HEAP[offset|25]<<16 | HEAP[offset|26]<<8 | HEAP[offset|27],
            HEAP[offset|28]<<24 | HEAP[offset|29]<<16 | HEAP[offset|30]<<8 | HEAP[offset|31],
            HEAP[offset|32]<<24 | HEAP[offset|33]<<16 | HEAP[offset|34]<<8 | HEAP[offset|35],
            HEAP[offset|36]<<24 | HEAP[offset|37]<<16 | HEAP[offset|38]<<8 | HEAP[offset|39],
            HEAP[offset|40]<<24 | HEAP[offset|41]<<16 | HEAP[offset|42]<<8 | HEAP[offset|43],
            HEAP[offset|44]<<24 | HEAP[offset|45]<<16 | HEAP[offset|46]<<8 | HEAP[offset|47],
            HEAP[offset|48]<<24 | HEAP[offset|49]<<16 | HEAP[offset|50]<<8 | HEAP[offset|51],
            HEAP[offset|52]<<24 | HEAP[offset|53]<<16 | HEAP[offset|54]<<8 | HEAP[offset|55],
            HEAP[offset|56]<<24 | HEAP[offset|57]<<16 | HEAP[offset|58]<<8 | HEAP[offset|59],
            HEAP[offset|60]<<24 | HEAP[offset|61]<<16 | HEAP[offset|62]<<8 | HEAP[offset|63]
        );
    }

    // offset — multiple of 32
    function _state_to_heap ( output ) {
        output = output|0;

        HEAP[output|0] = H0>>>24;
        HEAP[output|1] = H0>>>16&255;
        HEAP[output|2] = H0>>>8&255;
        HEAP[output|3] = H0&255;
        HEAP[output|4] = H1>>>24;
        HEAP[output|5] = H1>>>16&255;
        HEAP[output|6] = H1>>>8&255;
        HEAP[output|7] = H1&255;
        HEAP[output|8] = H2>>>24;
        HEAP[output|9] = H2>>>16&255;
        HEAP[output|10] = H2>>>8&255;
        HEAP[output|11] = H2&255;
        HEAP[output|12] = H3>>>24;
        HEAP[output|13] = H3>>>16&255;
        HEAP[output|14] = H3>>>8&255;
        HEAP[output|15] = H3&255;
        HEAP[output|16] = H4>>>24;
        HEAP[output|17] = H4>>>16&255;
        HEAP[output|18] = H4>>>8&255;
        HEAP[output|19] = H4&255;
        HEAP[output|20] = H5>>>24;
        HEAP[output|21] = H5>>>16&255;
        HEAP[output|22] = H5>>>8&255;
        HEAP[output|23] = H5&255;
        HEAP[output|24] = H6>>>24;
        HEAP[output|25] = H6>>>16&255;
        HEAP[output|26] = H6>>>8&255;
        HEAP[output|27] = H6&255;
        HEAP[output|28] = H7>>>24;
        HEAP[output|29] = H7>>>16&255;
        HEAP[output|30] = H7>>>8&255;
        HEAP[output|31] = H7&255;
    }

    function reset () {
        H0 = 0x6a09e667;
        H1 = 0xbb67ae85;
        H2 = 0x3c6ef372;
        H3 = 0xa54ff53a;
        H4 = 0x510e527f;
        H5 = 0x9b05688c;
        H6 = 0x1f83d9ab;
        H7 = 0x5be0cd19;
        TOTAL0 = TOTAL1 = 0;
    }

    function init ( h0, h1, h2, h3, h4, h5, h6, h7, total0, total1 ) {
        h0 = h0|0;
        h1 = h1|0;
        h2 = h2|0;
        h3 = h3|0;
        h4 = h4|0;
        h5 = h5|0;
        h6 = h6|0;
        h7 = h7|0;
        total0 = total0|0;
        total1 = total1|0;

        H0 = h0;
        H1 = h1;
        H2 = h2;
        H3 = h3;
        H4 = h4;
        H5 = h5;
        H6 = h6;
        H7 = h7;
        TOTAL0 = total0;
        TOTAL1 = total1;
    }

    // offset — multiple of 64
    function process ( offset, length ) {
        offset = offset|0;
        length = length|0;

        var hashed = 0;

        if ( offset & 63 )
            return -1;

        while ( (length|0) >= 64 ) {
            _core_heap(offset);

            offset = ( offset + 64 )|0;
            length = ( length - 64 )|0;

            hashed = ( hashed + 64 )|0;
        }

        TOTAL0 = ( TOTAL0 + hashed )|0;
        if ( TOTAL0>>>0 < hashed>>>0 ) TOTAL1 = ( TOTAL1 + 1 )|0;

        return hashed|0;
    }

    // offset — multiple of 64
    // output — multiple of 32
    function finish ( offset, length, output ) {
        offset = offset|0;
        length = length|0;
        output = output|0;

        var hashed = 0,
            i = 0;

        if ( offset & 63 )
            return -1;

        if ( ~output )
            if ( output & 31 )
                return -1;

        if ( (length|0) >= 64 ) {
            hashed = process( offset, length )|0;
            if ( (hashed|0) == -1 )
                return -1;

            offset = ( offset + hashed )|0;
            length = ( length - hashed )|0;
        }

        hashed = ( hashed + length )|0;
        TOTAL0 = ( TOTAL0 + length )|0;
        if ( TOTAL0>>>0 < length>>>0 ) TOTAL1 = ( TOTAL1 + 1 )|0;

        HEAP[offset|length] = 0x80;

        if ( (length|0) >= 56 ) {
            for ( i = (length+1)|0; (i|0) < 64; i = (i+1)|0 )
                HEAP[offset|i] = 0x00;

            _core_heap(offset);

            length = 0;

            HEAP[offset|0] = 0;
        }

        for ( i = (length+1)|0; (i|0) < 59; i = (i+1)|0 )
            HEAP[offset|i] = 0;

        HEAP[offset|56] = TOTAL1>>>21&255;
        HEAP[offset|57] = TOTAL1>>>13&255;
        HEAP[offset|58] = TOTAL1>>>5&255;
        HEAP[offset|59] = TOTAL1<<3&255 | TOTAL0>>>29;
        HEAP[offset|60] = TOTAL0>>>21&255;
        HEAP[offset|61] = TOTAL0>>>13&255;
        HEAP[offset|62] = TOTAL0>>>5&255;
        HEAP[offset|63] = TOTAL0<<3&255;
        _core_heap(offset);

        if ( ~output )
            _state_to_heap(output);

        return hashed|0;
    }

    function hmac_reset () {
        H0 = I0;
        H1 = I1;
        H2 = I2;
        H3 = I3;
        H4 = I4;
        H5 = I5;
        H6 = I6;
        H7 = I7;
        TOTAL0 = 64;
        TOTAL1 = 0;
    }

    function _hmac_opad () {
        H0 = O0;
        H1 = O1;
        H2 = O2;
        H3 = O3;
        H4 = O4;
        H5 = O5;
        H6 = O6;
        H7 = O7;
        TOTAL0 = 64;
        TOTAL1 = 0;
    }

    function hmac_init ( p0, p1, p2, p3, p4, p5, p6, p7, p8, p9, p10, p11, p12, p13, p14, p15 ) {
        p0 = p0|0;
        p1 = p1|0;
        p2 = p2|0;
        p3 = p3|0;
        p4 = p4|0;
        p5 = p5|0;
        p6 = p6|0;
        p7 = p7|0;
        p8 = p8|0;
        p9 = p9|0;
        p10 = p10|0;
        p11 = p11|0;
        p12 = p12|0;
        p13 = p13|0;
        p14 = p14|0;
        p15 = p15|0;

        // opad
        reset();
        _core(
            p0 ^ 0x5c5c5c5c,
            p1 ^ 0x5c5c5c5c,
            p2 ^ 0x5c5c5c5c,
            p3 ^ 0x5c5c5c5c,
            p4 ^ 0x5c5c5c5c,
            p5 ^ 0x5c5c5c5c,
            p6 ^ 0x5c5c5c5c,
            p7 ^ 0x5c5c5c5c,
            p8 ^ 0x5c5c5c5c,
            p9 ^ 0x5c5c5c5c,
            p10 ^ 0x5c5c5c5c,
            p11 ^ 0x5c5c5c5c,
            p12 ^ 0x5c5c5c5c,
            p13 ^ 0x5c5c5c5c,
            p14 ^ 0x5c5c5c5c,
            p15 ^ 0x5c5c5c5c
        );
        O0 = H0;
        O1 = H1;
        O2 = H2;
        O3 = H3;
        O4 = H4;
        O5 = H5;
        O6 = H6;
        O7 = H7;

        // ipad
        reset();
        _core(
            p0 ^ 0x36363636,
            p1 ^ 0x36363636,
            p2 ^ 0x36363636,
            p3 ^ 0x36363636,
            p4 ^ 0x36363636,
            p5 ^ 0x36363636,
            p6 ^ 0x36363636,
            p7 ^ 0x36363636,
            p8 ^ 0x36363636,
            p9 ^ 0x36363636,
            p10 ^ 0x36363636,
            p11 ^ 0x36363636,
            p12 ^ 0x36363636,
            p13 ^ 0x36363636,
            p14 ^ 0x36363636,
            p15 ^ 0x36363636
        );
        I0 = H0;
        I1 = H1;
        I2 = H2;
        I3 = H3;
        I4 = H4;
        I5 = H5;
        I6 = H6;
        I7 = H7;

        TOTAL0 = 64;
        TOTAL1 = 0;
    }

    // offset — multiple of 64
    // output — multiple of 32
    function hmac_finish ( offset, length, output ) {
        offset = offset|0;
        length = length|0;
        output = output|0;

        var t0 = 0, t1 = 0, t2 = 0, t3 = 0, t4 = 0, t5 = 0, t6 = 0, t7 = 0,
            hashed = 0;

        if ( offset & 63 )
            return -1;

        if ( ~output )
            if ( output & 31 )
                return -1;

        hashed = finish( offset, length, -1 )|0;
        t0 = H0, t1 = H1, t2 = H2, t3 = H3, t4 = H4, t5 = H5, t6 = H6, t7 = H7;

        _hmac_opad();
        _core( t0, t1, t2, t3, t4, t5, t6, t7, 0x80000000, 0, 0, 0, 0, 0, 0, 768 );

        if ( ~output )
            _state_to_heap(output);

        return hashed|0;
    }

    // salt is assumed to be already processed
    // offset — multiple of 64
    // output — multiple of 32
    function pbkdf2_generate_block ( offset, length, block, count, output ) {
        offset = offset|0;
        length = length|0;
        block = block|0;
        count = count|0;
        output = output|0;

        var h0 = 0, h1 = 0, h2 = 0, h3 = 0, h4 = 0, h5 = 0, h6 = 0, h7 = 0,
            t0 = 0, t1 = 0, t2 = 0, t3 = 0, t4 = 0, t5 = 0, t6 = 0, t7 = 0;

        if ( offset & 63 )
            return -1;

        if ( ~output )
            if ( output & 31 )
                return -1;

        // pad block number into heap
        // FIXME probable OOB write
        HEAP[(offset+length)|0]   = block>>>24;
        HEAP[(offset+length+1)|0] = block>>>16&255;
        HEAP[(offset+length+2)|0] = block>>>8&255;
        HEAP[(offset+length+3)|0] = block&255;

        // finish first iteration
        hmac_finish( offset, (length+4)|0, -1 )|0;
        h0 = t0 = H0, h1 = t1 = H1, h2 = t2 = H2, h3 = t3 = H3, h4 = t4 = H4, h5 = t5 = H5, h6 = t6 = H6, h7 = t7 = H7;
        count = (count-1)|0;

        // perform the rest iterations
        while ( (count|0) > 0 ) {
            hmac_reset();
            _core( t0, t1, t2, t3, t4, t5, t6, t7, 0x80000000, 0, 0, 0, 0, 0, 0, 768 );
            t0 = H0, t1 = H1, t2 = H2, t3 = H3, t4 = H4, t5 = H5, t6 = H6, t7 = H7;

            _hmac_opad();
            _core( t0, t1, t2, t3, t4, t5, t6, t7, 0x80000000, 0, 0, 0, 0, 0, 0, 768 );
            t0 = H0, t1 = H1, t2 = H2, t3 = H3, t4 = H4, t5 = H5, t6 = H6, t7 = H7;

            h0 = h0 ^ H0;
            h1 = h1 ^ H1;
            h2 = h2 ^ H2;
            h3 = h3 ^ H3;
            h4 = h4 ^ H4;
            h5 = h5 ^ H5;
            h6 = h6 ^ H6;
            h7 = h7 ^ H7;

            count = (count-1)|0;
        }

        H0 = h0;
        H1 = h1;
        H2 = h2;
        H3 = h3;
        H4 = h4;
        H5 = h5;
        H6 = h6;
        H7 = h7;

        if ( ~output )
            _state_to_heap(output);

        return 0;
    }

    return {
        // SHA256
        reset: reset,
        init: init,
        process: process,
        finish: finish,

        // HMAC-SHA256
        hmac_reset: hmac_reset,
        hmac_init: hmac_init,
        hmac_finish: hmac_finish,

        // PBKDF2-HMAC-SHA256
        pbkdf2_generate_block: pbkdf2_generate_block
    }
}

}
};
ChainPad = r("ChainPad.js");}());
