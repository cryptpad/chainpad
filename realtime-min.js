(function(){function require(e,t,n){t||(t=0);var r=require.resolve(e,t),i=require.m[t][r];if(!i)throw new Error('failed to require "'+e+'" from '+n);if(i.c){t=i.c,r=i.m,i=require.m[t][i.m];if(!i)throw new Error('failed to require "'+r+'" from '+t)}return i.exports||(i.exports={},i.call(i.exports,i,i.exports,require.relative(r,t))),i.exports}require.resolve=function(e,t){var n=e,r=e+".js",i=e+"/index.js";return require.m[t][r]&&r?r:require.m[t][i]&&i?i:n},require.relative=function(e,t){return function(n){if("."!=n.charAt(0))return require(n,t,e);var r=e.split("/"),i=n.split("/");r.pop();for(var s=0;s<i.length;s++){var o=i[s];".."==o?r.pop():"."!=o&&r.push(o)}return require(r.join("/"),t,e)}};
require.m = [];
require.m[0] = {
"Fork.js": function(module, exports, require){
/* vim: set expandtab ts=4 sw=4: */
/*
 * You may redistribute this program and/or modify it under the terms of
 * the GNU Lesser General Public License as published by the Free Software
 * Foundation, either version 2.1 of the License, or (at your option) any
 * later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */
var Common = require('./Common');
var Patch = require('./Patch');

var Fork = module.exports;

var create = Patch.create = function (parent) {
    return {
        type: 'Fork',
        parent: parent,
        
    };
};

var check = Patch.check = function (patch, docLength_opt) {
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
};

var toObj = Patch.toObj = function (patch) {
    if (Common.PARANOIA) { check(patch); }
    var out = new Array(patch.operations.length+1);
    var i;
    for (i = 0; i < patch.operations.length; i++) {
        out[i] = Operation.toObj(patch.operations[i]);
    }
    out[i] = patch.parentHash;
    return out;
};

var fromObj = Patch.fromObj = function (obj) {
    Common.assert(Array.isArray(obj) && obj.length > 0);
    var patch = create();
    var i;
    for (i = 0; i < obj.length-1; i++) {
        patch.operations[i] = Operation.fromObj(obj[i]);
    }
    patch.parentHash = obj[i];
    if (Common.PARANOIA) { check(patch); }
    return patch;
};

var hash = function (text) {
    return Sha.hex_sha256(text);
};

var addOperation = Patch.addOperation = function (patch, op) {
    if (Common.PARANOIA) {
        check(patch);
        Operation.check(op);
    }
    for (var i = 0; i < patch.operations.length; i++) {
        if (Operation.shouldMerge(patch.operations[i], op)) {
            op = Operation.merge(patch.operations[i], op);
            patch.operations.splice(i,1);
            if (op === null) {
                //console.log("operations cancelled eachother");
                return;
            }
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

var clone = Patch.clone = function (patch) {
    if (Common.PARANOIA) { check(patch); }
    var out = create();
    out.parentHash = patch.parentHash;
    for (var i = 0; i < patch.operations.length; i++) {
        out.operations[i] = Operation.clone(patch.operations[i]);
    }
    return out;
};

var merge = Patch.merge = function (oldPatch, newPatch) {
    if (Common.PARANOIA) {
        check(oldPatch);
        check(newPatch);
    }
    oldPatch = clone(oldPatch);
    for (var i = newPatch.operations.length-1; i >= 0; i--) {
        addOperation(oldPatch, newPatch.operations[i]);
    }
    return oldPatch;
};

var apply = Patch.apply = function (patch, doc)
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

var lengthChange = Patch.lengthChange = function (patch)
{
    if (Common.PARANOIA) { check(patch); }
    var out = 0;
    for (var i = 0; i < patch.operations.length; i++) {
        out += Operation.lengthChange(patch.operations[i]);
    }
    return out;
};

var invert = Patch.invert = function (patch, doc)
{
    if (Common.PARANOIA) {
        check(patch);
        Common.assert(typeof(doc) === 'string');
        Common.assert(Sha.hex_sha256(doc) === patch.parentHash);
    }
    var rpatch = create();
    var newDoc = doc;
    for (var i = patch.operations.length-1; i >= 0; i--) {
        rpatch.operations[i] = Operation.invert(patch.operations[i], newDoc);
        newDoc = Operation.apply(patch.operations[i], newDoc);
    }
    for (var i = rpatch.operations.length-1; i >= 0; i--) {
        for (var j = i - 1; j >= 0; j--) {
            rpatch.operations[i].offset += rpatch.operations[j].toDelete;
            rpatch.operations[i].offset -= rpatch.operations[j].toInsert.length;
        }
    }
    rpatch.parentHash = Sha.hex_sha256(newDoc);
    if (Common.PARANOIA) { check(rpatch); }
    return rpatch;
};

var transform = Patch.transform = function (toTransform, transformBy) {
    if (Common.PARANOIA) {
        check(toTransform);
        check(transformBy);
    }
    var out = clone(toTransform);
    for (var i = out.operations.length-1; i >= 0; i--) {
        for (var j = transformBy.operations.length-1; j >= 0; j--) {
            Operation.transform(out.operations[i], transformBy.operations[j]);
        }
    }
    return out;
}

var random = Patch.random = function (docLength, opCount) {
    opCount = opCount || (Math.floor(Math.random() * 30) + 1);
    var patch = create('0000000000000000000000000000000000000000000000000000000000000000');
    while (opCount-- > 0) {
        var op = Operation.random(docLength);
        docLength += Operation.lengthChange(op);
        addOperation(patch, op);
    }
    check(patch);
    return patch;
};
},
"Patch.js": function(module, exports, require){
/* vim: set expandtab ts=4 sw=4: */
/*
 * You may redistribute this program and/or modify it under the terms of
 * the GNU Lesser General Public License as published by the Free Software
 * Foundation, either version 2.1 of the License, or (at your option) any
 * later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */
var Common = require('./Common');
var Operation = require('./Operation');
var Sha = require('./SHA256');

var Patch = module.exports;

var create = Patch.create = function (parentHash) {
    return {
        type: 'Patch',
        operations: [],
        parentHash: parentHash
    };
};

var check = Patch.check = function (patch, docLength_opt) {
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
};

var toObj = Patch.toObj = function (patch) {
    if (Common.PARANOIA) { check(patch); }
    var out = new Array(patch.operations.length+1);
    var i;
    for (i = 0; i < patch.operations.length; i++) {
        out[i] = Operation.toObj(patch.operations[i]);
    }
    out[i] = patch.parentHash;
    return out;
};

var fromObj = Patch.fromObj = function (obj) {
    Common.assert(Array.isArray(obj) && obj.length > 0);
    var patch = create();
    var i;
    for (i = 0; i < obj.length-1; i++) {
        patch.operations[i] = Operation.fromObj(obj[i]);
    }
    patch.parentHash = obj[i];
    if (Common.PARANOIA) { check(patch); }
    return patch;
};

var hash = function (text) {
    return Sha.hex_sha256(text);
};

var addOperation = Patch.addOperation = function (patch, op) {
    if (Common.PARANOIA) {
        check(patch);
        Operation.check(op);
    }
    for (var i = 0; i < patch.operations.length; i++) {
        if (Operation.shouldMerge(patch.operations[i], op)) {
            op = Operation.merge(patch.operations[i], op);
            patch.operations.splice(i,1);
            if (op === null) {
                //console.log("operations cancelled eachother");
                return;
            }
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

var clone = Patch.clone = function (patch) {
    if (Common.PARANOIA) { check(patch); }
    var out = create();
    out.parentHash = patch.parentHash;
    for (var i = 0; i < patch.operations.length; i++) {
        out.operations[i] = Operation.clone(patch.operations[i]);
    }
    return out;
};

var merge = Patch.merge = function (oldPatch, newPatch) {
    if (Common.PARANOIA) {
        check(oldPatch);
        check(newPatch);
    }
    oldPatch = clone(oldPatch);
    for (var i = newPatch.operations.length-1; i >= 0; i--) {
        addOperation(oldPatch, newPatch.operations[i]);
    }
    return oldPatch;
};

var apply = Patch.apply = function (patch, doc)
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

var lengthChange = Patch.lengthChange = function (patch)
{
    if (Common.PARANOIA) { check(patch); }
    var out = 0;
    for (var i = 0; i < patch.operations.length; i++) {
        out += Operation.lengthChange(patch.operations[i]);
    }
    return out;
};

var invert = Patch.invert = function (patch, doc)
{
    if (Common.PARANOIA) {
        check(patch);
        Common.assert(typeof(doc) === 'string');
        Common.assert(Sha.hex_sha256(doc) === patch.parentHash);
    }
    var rpatch = create();
    var newDoc = doc;
    for (var i = patch.operations.length-1; i >= 0; i--) {
        rpatch.operations[i] = Operation.invert(patch.operations[i], newDoc);
        newDoc = Operation.apply(patch.operations[i], newDoc);
    }
    for (var i = rpatch.operations.length-1; i >= 0; i--) {
        for (var j = i - 1; j >= 0; j--) {
            rpatch.operations[i].offset += rpatch.operations[j].toDelete;
            rpatch.operations[i].offset -= rpatch.operations[j].toInsert.length;
        }
    }
    rpatch.parentHash = Sha.hex_sha256(newDoc);
    if (Common.PARANOIA) { check(rpatch); }
    return rpatch;
};

var simplify = Patch.simplify = function (patch, doc)
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
        outOps[j] = Operation.simplify(patch.operations[i], newDoc);
        if (outOps[j]) {
            newDoc = Operation.apply(outOps[j], newDoc);
            j++;
        }
    }
    spatch.operations = outOps.reverse();
    if (!spatch.operations[0]) {
        spatch.operations.shift();
    }
    if (Common.PARANOIA) {
        check(spatch);
    }
    return spatch;
};

var transform = Patch.transform = function (origToTransform, transformBy, doc) {
    if (Common.PARANOIA) {
        check(origToTransform, doc.length);
        check(transformBy, doc.length);
        Common.assert(Sha.hex_sha256(doc) === origToTransform.parentHash);
    }
    Common.assert(origToTransform.parentHash === transformBy.parentHash);
    var resultOfTransformBy = apply(transformBy, doc);

    toTransform = clone(origToTransform);
    for (var i = toTransform.operations.length-1; i >= 0; i--) {
        for (var j = transformBy.operations.length-1; j >= 0; j--) {
            toTransform.operations[i] =
                Operation.transform(toTransform.operations[i], transformBy.operations[j]);
            if (!toTransform.operations[i]) {
                break;
            }
        }
        if (Common.PARANOIA && toTransform.operations[i]) {
try {
            Operation.check(toTransform.operations[i], resultOfTransformBy.length);
} catch (e) {
console.log('transform('+JSON.stringify([origToTransform,transformBy,doc], null, '  ')+');');
console.log(JSON.stringify(toTransform.operations[i]));
throw e;
}
        }
    }
    var out = create(transformBy.parentHash);
    for (var i = toTransform.operations.length-1; i >= 0; i--) {
        if (toTransform.operations[i]) {
            addOperation(out, toTransform.operations[i]);
        }
    }

    out.parentHash = Sha.hex_sha256(resultOfTransformBy);

    if (Common.PARANOIA) {
        check(out, resultOfTransformBy.length);
    }
    return out;
}

var random = Patch.random = function (doc, opCount) {
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
"Common.js": function(module, exports, require){
/* vim: set expandtab ts=4 sw=4: */
/*
 * You may redistribute this program and/or modify it under the terms of
 * the GNU Lesser General Public License as published by the Free Software
 * Foundation, either version 2.1 of the License, or (at your option) any
 * later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */
var Common = module.exports;

Common.PARANOIA = true;

var assert = Common.assert = function (expr) {
    if (!expr) { throw new Error("Failed assertion"); }
};

var isUint = Common.isUint = function (integer) {
    return (typeof(integer) === 'number') &&
        (Math.floor(integer) === integer) &&
        (integer >= 0);
};

var randomASCII = Common.randomASCII = function (length) {
    var content = [];
    for (var i = 0; i < length; i++) {
        content[i] = String.fromCharCode( Math.floor(Math.random()*256) % 57 + 65 );
    }
    return content.join('');
};

var compareHashes = Common.compareHashes = function (hashA, hashB) {
    while (hashA.length > 0) {
        var numA = new Number('0x' + hashA.substring(0,8));
        var numB = new Number('0x' + hashB.substring(0,8));
        if (numA > numB) { return 1; }
        if (numB > numA) { return -1; }
        hashA = hashA.substring(8);
        hashB = hashB.substring(8);
    }
    return 0;
};
},
"SHA256.js": function(module, exports, require){
(function (dependencies, module) {
    if (typeof define === 'function' && define.amd) {
        return define(dependencies, module);
    }
    if (typeof exports === 'object') {
        return module(exports);
    }
    module(window);
}(['exports'], function (window) {
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
    window.hex_sha256 = hex_sha256;
}());
}));
},
"Message.js": function(module, exports, require){
/* vim: set expandtab ts=4 sw=4: */
/*
 * You may redistribute this program and/or modify it under the terms of
 * the GNU Lesser General Public License as published by the Free Software
 * Foundation, either version 2.1 of the License, or (at your option) any
 * later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */
var Common = require('./Common');
var Operation = require('./Operation');
var Patch = require('./Patch');

var Message = module.exports;

var REGISTER     = Message.REGISTER     = 0;
var REGISTER_ACK = Message.REGISTER_ACK = 1;
var PATCH        = Message.PATCH        = 2;

var check = Message.check = function(msg) {
    Common.assert(msg.type === 'Message');
    Common.assert(typeof(msg.userName) === 'string');
    Common.assert(typeof(msg.authToken) === 'string');
    Common.assert(typeof(msg.channelId) === 'string');

    if (msg.messageType === PATCH) {
        Patch.check(msg.content);
    } else if (msg.messageType !== REGISTER && msg.messageType !== REGISTER_ACK) {
        throw new Error("invalid message type [" + msg.messageType + "]");
    }
};

var create = Message.create = function (userName, authToken, channelId, type, content) {
    var msg = {
        type: 'Message',
        userName: userName,
        authToken: authToken,
        channelId: channelId,
        messageType: type,
        content: content
    };
    if (Common.PARANOIA) { check(msg); }
    return msg;
};

var toString = Message.toString = function (msg) {
    if (Common.PARANOIA) { check(msg); }
    var prefix = msg.messageType + ':';
    var content = '';
    if (msg.messageType === REGISTER) {
        content = JSON.stringify([REGISTER, 0]);
    } else if (msg.messageType === PATCH) {
        content = JSON.stringify([PATCH, Patch.toObj(msg.content)]);
    }
    return msg.authToken.length + ":" + msg.authToken +
        msg.userName.length + ":" + msg.userName +
        msg.channelId.length + ":" + msg.channelId +
        content.length + ':' + content;
};

var fromString = Message.fromString = function (str) {
    var msg = str;

    var unameLen = msg.substring(0,msg.indexOf(':'));
    msg = msg.substring(unameLen.length+1);
    var userName = msg.substring(0,Number(unameLen));
    msg = msg.substring(userName.length);

    var channelIdLen = msg.substring(0,msg.indexOf(':'));
    msg = msg.substring(channelIdLen.length+1);
    var channelId = msg.substring(0,Number(channelIdLen));
    msg = msg.substring(channelId.length);

    var contentStrLen = msg.substring(0,msg.indexOf(':'));
    msg = msg.substring(contentStrLen.length+1);
    var contentStr = msg.substring(0,Number(contentStrLen));

    Common.assert(contentStr.length === Number(contentStrLen));

    var content = JSON.parse(contentStr);
    if (content[0] === PATCH) {
        content[1] = Patch.fromObj(content[1]);
    }
    var message = create(userName, '', channelId, content[0], content[1]);

    // This check validates every operation in the patch.
    check(message);

    return message
};
},
"Realtime.js": function(module, exports, require){
/* vim: set expandtab ts=4 sw=4: */
/*
 * You may redistribute this program and/or modify it under the terms of
 * the GNU Lesser General Public License as published by the Free Software
 * Foundation, either version 2.1 of the License, or (at your option) any
 * later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */
var Common = require('./Common');
var Operation = require('./Operation');
var Patch = require('./Patch');
var Message = require('./Message');
var Sha = require('./SHA256');

var Realtime = {};

// hex_sha256('')
var EMPTY_STR_HASH = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

var enterRealtime = function (realtime, func) {
    return function () {
        if (realtime.failed) { return; }
        try {
            func.apply(null, arguments);
        } catch (err) {
            realtime.failed = true;
            err.message += ' (' + realtime.userName + ')';
            throw err;
        }
    };
};

var debug = function (realtime, msg) {
    console.log("[" + realtime.userName + "]  " + msg);
};

var schedule = function (realtime, func) {
    var time = Math.floor(Math.random() * 2 * realtime.avgSyncTime);
    var to = setTimeout(enterRealtime(realtime, function () {
        realtime.schedules.splice(realtime.schedules.indexOf(to), 1);
        func();
    }), time);
    realtime.schedules.push(to);
    return to;
};

var sync = function (realtime) {
    if (realtime.syncSchedule) {
        clearTimeout(realtime.syncSchedule);
    }
    realtime.syncSchedule = schedule(realtime, function () { sync(realtime); });

    realtime.uncommitted = Patch.simplify(realtime.uncommitted, realtime.authDoc);

    if (realtime.uncommitted.operations.length === 0) {
        //debug(realtime, "No data to sync to the server, sleeping");
        return;
    }

    var msg = Message.create(realtime.userName,
                             realtime.authToken,
                             realtime.channelId,
                             Message.PATCH,
                             realtime.uncommitted);

    realtime.onMessage(Message.toString(msg), function (err) {
        if (err) {
            debug(realtime, "Posting to server failed [" + err + "]");
        }
    });
};

var getMessages = function (realtime) {
    if (realtime.registered === true) { return; }
    schedule(realtime, function () { getMessages(realtime); });
    var msg = Message.create(realtime.userName,
                             realtime.authToken,
                             realtime.channelId,
                             Message.REGISTER,
                             '');
    realtime.onMessage(Message.toString(msg), function (err) {
        if (err) {
            debug(realtime, "Requesting patches from server failed [" + err + "] try again");
        }
    });
};

var create = Realtime.create = function (userName, authToken, channelId, initialState) {

    var realtime = {
        type: 'Realtime',

        authDoc: '',

        userName: userName,

        authToken: authToken,

        channelId: channelId,

        /**
         * The reverse patches which if each are applied will carry the document back to
         * it's initial state, if the final patch is applied it will convert the document to ''
         */
        rpatches: [],

        /** A patch representing all uncommitted work. */
        uncommitted: Patch.create(EMPTY_STR_HASH),

        uncommittedDocLength: initialState.length,

        opHandlers: [],

        onMessage: function (message, callback) {
            callback("no onMessage() handler registered");
        },

        schedules: [],

        syncSchedule: null,

        registered: false,

        avgSyncTime: 10000,

        // this is only used if PARANOIA is enabled.
        userInterfaceContent: undefined,

        failed: false
    };

    if (Common.PARANOIA) {
        realtime.userInterfaceContent = initialState;
    }

    if (initialState !== '') {
        var initialPatch = realtime.uncommitted;
        var initialOp = Operation.create();
        initialOp.toInsert = initialState;
        Patch.addOperation(initialPatch, initialOp);
        realtime.authDoc = Patch.apply(initialPatch, '');
        realtime.rpatches.push(Patch.invert(initialPatch, ''));
        realtime.uncommitted = Patch.create(realtime.rpatches[0].parentHash);
    }

    return realtime;
};

var check = Realtime.check = function(realtime) {
    Common.assert(realtime.type === 'Realtime');
    Common.assert(typeof(realtime.authDoc) === 'string');
    Common.assert(Array.isArray(realtime.rpatches));

    Patch.check(realtime.uncommitted, realtime.authDoc.length);

    var uiDoc = Patch.apply(realtime.uncommitted, realtime.authDoc);
    if (uiDoc.length !== realtime.uncommittedDocLength) {
        Common.assert(0);
    }
    if (realtime.userInterfaceContent !== '') {
        Common.assert(uiDoc === realtime.userInterfaceContent);
    }

    var doc = realtime.authDoc;
    for (var i = realtime.rpatches.length-1; i >= 0; i--) {
        Patch.check(realtime.rpatches[i], doc.length);
        doc = Patch.apply(realtime.rpatches[i], doc);
    }
    Common.assert(doc === '');
};

var doOperation = Realtime.doOperation = function (realtime, op) {
    if (Common.PARANOIA) {
        check(realtime);
        realtime.userInterfaceContent = Operation.apply(op, realtime.userInterfaceContent);
    }
    Operation.check(op, realtime.uncommittedDocLength);
    Patch.addOperation(realtime.uncommitted, op);
debug(realtime, JSON.stringify(realtime.uncommitted));
    realtime.uncommittedDocLength += Operation.lengthChange(op);
};

var handleMessage = Realtime.handleMessage = function (realtime, msgStr) {
    if (Common.PARANOIA) { check(realtime); }
    var msg = Message.fromString(msgStr);
    Common.assert(msg.channelId === realtime.channelId);

    if (msg.messageType === Message.REGISTER_ACK) {
        debug(realtime, "registered");
        realtime.registered = true;
        return;
    }
debug(realtime, "msg");
    Common.assert(msg.messageType === Message.PATCH);

    var patch = msg.content;

    // First we will search for the base of this patch.
    var rollbackPatch = null;

    var hashes = [];

    var i;
    for (i = realtime.rpatches.length-1; i >= 0; i--) {
        if (patch.parentHash === realtime.rpatches[i].parentHash) {
            // Found the point where it's rooted.
            break;
        }
        if (!rollbackPatch) {
            Common.assert(realtime.rpatches[i].parentHash === realtime.uncommitted.parentHash);
            rollbackPatch = realtime.rpatches[i];
        } else {
            rollbackPatch = Patch.merge(rollbackPatch, realtime.rpatches[i]);
        }
        hashes.push(realtime.rpatches[i].parentHash);
    }

    if (rollbackPatch) {
        debug(realtime, "Rejecting patch ["+Sha.hex_sha256(JSON.stringify(patch))+"]");
        if (Common.PARANOIA) { check(realtime); }
        return;
    }

    if (i < 0 && (realtime.rpatches.length !== 0 && patch.parentHash !== EMPTY_STR_HASH)) {
        debug(realtime, "base of patch ["+Sha.hex_sha256(JSON.stringify(patch))+"] not found");
try{
        //Common.assert(msg.userName !== realtime.userName);
}catch(e){
debug(realtime, JSON.stringify(realtime.rpatches, null, '    '));
throw e;
}
        if (Common.PARANOIA) { check(realtime); }
        return;
    }

    var authDocAtTimeOfPatch = realtime.authDoc;
    var patchToApply = patch;
    if (rollbackPatch !== null) {
        if (Common.PARANOIA) {
            Common.assert(Sha.hex_sha256(authDocAtTimeOfPatch) === rollbackPatch.parentHash);
        }
try{
        authDocAtTimeOfPatch = Patch.apply(rollbackPatch, authDocAtTimeOfPatch);
}catch (e) {
debug(realtime, JSON.stringify(rollbackPatch));
debug(realtime, authDocAtTimeOfPatch);
throw e;
}
        if (Common.PARANOIA) {
            Common.assert(Sha.hex_sha256(authDocAtTimeOfPatch) === patch.parentHash);
        }
        patchToApply = Patch.merge(rollbackPatch, patch);
    }



    var rpatch = Patch.invert(patch, authDocAtTimeOfPatch);

    // Now we need to check that the hash of the result of the patch is less than that
    // of all results which it displaces
    for (var i = 0; i < hashes.length; i++) {
        if (Common.compareHashes(rpatch.parentHash, hashes[i]) > 0) {
            debug(realtime, "patch ["+Sha.hex_sha256(JSON.stringify(patch))+"] rejected");
            if (Common.PARANOIA) { check(realtime); }
            return;
        }
    }

    // ok we're really going to do this

    for (var i = 0; i < hashes.length; i++) {
        debug(realtime, "reverting [" + hashes[i] + "]");
        realtime.rpatches.pop();
    }
    debug(realtime, "applying ["+Sha.hex_sha256(JSON.stringify(patch))+"]");

    realtime.rpatches.push(rpatch);

//debug(realtime, "newhash " + rpatch.parentHash);
//debug(realtime, realtime.authDoc);

    realtime.uncommitted = Patch.simplify(realtime.uncommitted, realtime.authDoc);

    var userInterfaceContent = Patch.apply(realtime.uncommitted, realtime.authDoc);

    if (Common.PARANOIA) {
        Common.assert(userInterfaceContent === realtime.userInterfaceContent);
    }

    var inverseOldUncommitted = Patch.invert(realtime.uncommitted, realtime.authDoc);

    var oldAuthDoc = realtime.authDoc;

    // apply the patch to the authoritative document
    realtime.authDoc = Patch.apply(patchToApply, realtime.authDoc);


    // transform the uncommitted work
    realtime.uncommitted = Patch.transform(realtime.uncommitted, patchToApply, oldAuthDoc);
    realtime.uncommitted.parentHash = rpatch.parentHash;

    if (msg.userName === realtime.userName) {
        // We should not be forcing ourselves to roll anything back.
        // Wrong, we pushed our patch then received a patch from someone else re-rooting us,
        // then we received our own patch which switches us back.
        //Common.assert(patchToApply === patch);
        //Common.assert(patch.parentHash === realtime.uncommitted.parentHash);

//debug(realtime, JSON.stringify(inverseOldUncommitted) + 'xxx' + JSON.stringify(patch));
        realtime.uncommitted = Patch.merge(inverseOldUncommitted, patchToApply);
        realtime.uncommitted = Patch.invert(realtime.uncommitted, userInterfaceContent);

        realtime.uncommitted = Patch.simplify(realtime.uncommitted, realtime.authDoc);

        //realtime.uncommitted = Patch.invert(realtime.uncommitted, realtime.authDoc);
        //realtime.uncommitted = Patch.invert(realtime.uncommitted, userInterfaceContent);

//debug(realtime, JSON.stringify(realtime.uncommitted));

        if (patchToApply === patch) {
            Common.assert(realtime.uncommitted.parentHash === rpatch.parentHash);
            if (Common.PARANOIA) { check(realtime); }
            return;
        }
//debug(realtime, JSON.stringify(realtime.uncommitted));
    }

    // Derive the patch for the user's uncommitted work
    var uncommittedPatch = Patch.merge(inverseOldUncommitted, patchToApply);
    uncommittedPatch = Patch.merge(uncommittedPatch, realtime.uncommitted);

    // Retarget the length of the user interface content
    realtime.uncommittedDocLength += Patch.lengthChange(uncommittedPatch);

    if (Common.PARANOIA) {
        // apply the uncommittedPatch to the userInterface content.
        realtime.userInterfaceContent =
            Patch.apply(uncommittedPatch, realtime.userInterfaceContent);
        Common.assert(realtime.userInterfaceContent.length === realtime.uncommittedDocLength);
        debug(realtime, ">"+realtime.userInterfaceContent);
    }

    // push the uncommittedPatch out to the user interface.
    for (var i = uncommittedPatch.operations.length-1; i >= 0; i--) {
        for (var j = 0; j < realtime.opHandlers.length; j++) {
            realtime.opHandlers[j](uncommittedPatch.operations[i]);
        }
    }
    if (Common.PARANOIA) { check(realtime); }
};

module.exports.create = function (userName, authToken, channelId, initialState) {
    Common.assert(typeof(userName) === 'string');
    Common.assert(typeof(authToken) === 'string');
    Common.assert(typeof(channelId) === 'string');
    Common.assert(typeof(initialState) === 'string');
    var realtime = Realtime.create(userName, authToken, channelId, initialState);
    return {
        onRemove: enterRealtime(realtime, function (handler) {
            Common.assert(typeof(handler) === 'function');
            realtime.opHandlers.unshift(function (op) {
                if (op.toDelete > 0) { handler(op.offset, op.toDelete); }
            });
        }),
        onInsert: enterRealtime(realtime, function (handler) {
            Common.assert(typeof(handler) === 'function');
            realtime.opHandlers.push(function (op) {
                if (op.toInsert.length > 0) { handler(op.offset, op.toInsert); }
            });
        }),
        remove: enterRealtime(realtime, function (offset, numChars) {
            var op = Operation.create();
            op.offset = offset;
            op.toDelete = numChars;
            doOperation(realtime, op);
        }),
        insert: enterRealtime(realtime, function (offset, str) {
            var op = Operation.create();
            op.offset = offset;
            op.toInsert = str;
            doOperation(realtime, op);
        }),
        onMessage: enterRealtime(realtime, function (handler) {
            realtime.onMessage = handler;
        }),
        message: enterRealtime(realtime, function (message) {
            handleMessage(realtime, message);
        }),
        start: enterRealtime(realtime, function () {
            getMessages(realtime);
            sync(realtime);
        }),
        abort: enterRealtime(realtime, function () {
            realtime.schedules.forEach(function (s) { clearTimeout(s) });
        }),
        sync: enterRealtime(realtime, function () {
            sync(realtime);
        })
    };
};
},
"Operation.js": function(module, exports, require){
/* vim: set expandtab ts=4 sw=4: */
/*
 * You may redistribute this program and/or modify it under the terms of
 * the GNU Lesser General Public License as published by the Free Software
 * Foundation, either version 2.1 of the License, or (at your option) any
 * later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */
var Common = require('./Common');

var Operation = {};
var create = Operation.create = function () {
    return {
        type: 'Operation',
        offset: 0,
        toDelete: 0,
        toInsert: '',
    };
};
var check = Operation.check = function (op, docLength_opt) {
    Common.assert(op.type === 'Operation');
    Common.assert(Common.isUint(op.offset));
    Common.assert(Common.isUint(op.toDelete));
    Common.assert(typeof(op.toInsert) === 'string');
    Common.assert(op.toDelete > 0 || op.toInsert.length > 0);
    Common.assert(typeof(docLength_opt) !== 'number' || op.offset + op.toDelete <= docLength_opt);
};

var toObj = Operation.toObj = function (op) {
    if (Common.PARANOIA) { check(op); }
    return [op.offset,op.toDelete,op.toInsert];
};

var fromObj = Operation.fromObj = function (obj) {
    Common.assert(Array.isArray(obj) && obj.length === 3);
    var op = create();
    op.offset = obj[0];
    op.toDelete = obj[1];
    op.toInsert = obj[2];
    if (Common.PARANOIA) { check(op); }
    return op;
};

var clone = Operation.clone = function (op) {
    if (Common.PARANOIA) { check(op); }
    var out = create();
    out.offset = op.offset;
    out.toDelete = op.toDelete;
    out.toInsert = op.toInsert;
    return out;
};

/**
 * @param op the operation to apply.
 * @param doc the content to apply the operation on 
 */
var apply = Operation.apply = function (op, doc)
{
    if (Common.PARANOIA) {
        check(op);
        Common.assert(typeof(doc) === 'string');
        Common.assert(op.offset + op.toDelete <= doc.length);
    }
    return doc.substring(0,op.offset) + op.toInsert + doc.substring(op.offset + op.toDelete);
};

var invert = Operation.invert = function (op, doc) {
    if (Common.PARANOIA) {
        check(op);
        Common.assert(typeof(doc) === 'string');
        Common.assert(op.offset + op.toDelete <= doc.length);
    }
    var rop = clone(op);
    rop.toInsert = doc.substring(op.offset, op.offset + op.toDelete);
    rop.toDelete = op.toInsert.length;
    return rop;
};

var simplify = Operation.simplify = function (op, doc) {
    if (Common.PARANOIA) {
        check(op);
        Common.assert(typeof(doc) === 'string');
        Common.assert(op.offset + op.toDelete <= doc.length);
    }
    var rop = invert(op, doc);
    op = clone(op);

    var minLen = Math.min(op.toInsert.length, rop.toInsert.length);
    var i;
    for (i = 0; i < minLen && rop.toInsert[i] === op.toInsert[i]; i++) ;
    op.offset += i;
    op.toDelete -= i;
    op.toInsert = op.toInsert.substring(i);
    rop.toInsert = rop.toInsert.substring(i);

    if (rop.toInsert.length === op.toInsert.length) {
        for (i = rop.toInsert.length-1; i >= 0 && rop.toInsert[i] === op.toInsert[i]; i--) ;
        op.toInsert = op.toInsert.substring(0, i+1);
        op.toDelete = i+1;
    }

    if (op.toDelete === 0 && op.toInsert.length === 0) { return null; }
    return op;
};

var lengthChange = Operation.lengthChange = function (op)
{
    if (Common.PARANOIA) { check(op); }
    return op.toInsert.length - op.toDelete;
};

/*
 * @return the merged operation OR null if the result of the merger is a noop.
 */
var merge = Operation.merge = function (oldOpOrig, newOpOrig) {
    if (Common.PARANOIA) {
        check(newOpOrig);
        check(oldOpOrig);
    }

    var newOp = clone(newOpOrig);
    var oldOp = clone(oldOpOrig);
    var offsetDiff = newOp.offset - oldOp.offset;

    if (newOp.toDelete > 0) {
        var origOldInsert = oldOp.toInsert;
        oldOp.toInsert = (
             oldOp.toInsert.substring(0,offsetDiff)
           + oldOp.toInsert.substring(offsetDiff + newOp.toDelete)
        );
        newOp.toDelete -= (origOldInsert.length - oldOp.toInsert.length);
        if (newOp.toDelete < 0) { newOp.toDelete = 0; }

        oldOp.toDelete += newOp.toDelete;
        newOp.toDelete = 0;
    }

    if (offsetDiff < 0) {
        oldOp.offset += offsetDiff;
        oldOp.toInsert = newOp.toInsert + oldOp.toInsert;

    } else if (oldOp.toInsert.length === offsetDiff) {
        oldOp.toInsert = oldOp.toInsert + newOp.toInsert;

    } else if (oldOp.toInsert.length > offsetDiff) {
        oldOp.toInsert = (
            oldOp.toInsert.substring(0,offsetDiff)
          + newOp.toInsert
          + oldOp.toInsert.substring(offsetDiff)
        );
    } else {
        throw new Error("should never happen\n" +
                        JSON.stringify([oldOpOrig,newOpOrig], null, '  '));
    }

    if (oldOp.toInsert === '' && oldOp.toDelete === 0) {
        return null;
    }
    if (Common.PARANOIA) { check(oldOp); }

    return oldOp;
};

/**
 * If the new operation deletes what the old op inserted or inserts content in the middle of
 * the old op's content or if they abbut one another, they should be merged.
 */
var shouldMerge = Operation.shouldMerge = function (oldOp, newOp) {
    if (Common.PARANOIA) {
        check(oldOp);
        check(newOp);
    }
    if (newOp.offset < oldOp.offset) {
        return (oldOp.offset <= (newOp.offset + newOp.toDelete));
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
var rebase = Operation.rebase = function (oldOp, newOp) {
    if (Common.PARANOIA) {
        check(oldOp);
        check(newOp);
    }
    if (newOp.offset < oldOp.offset) { return newOp; }
    newOp = clone(newOp);
    newOp.offset += oldOp.toDelete;
    newOp.offset -= oldOp.toInsert.length;
    return newOp;
};

/**
 * this is a lossy and dirty algorithm, everything else is nice but transformation
 * has to be lossy because both operations have the same base and they diverge.
 * This could be made nicer and/or tailored to a specific data type.
 *
 * @param toTransform the operation which is converted, MUTATED
 * @param transformBy an existing operation which also has the same base.
 * @return nothing, input is mutated
 */
var transform = Operation.transform = function (toTransform, transformBy) {
    if (Common.PARANOIA) {
        check(toTransform);
        check(transformBy);
    }
    if (toTransform.offset > transformBy.offset) {
        toTransform = clone(toTransform);
        if (toTransform.offset > transformBy.offset + transformBy.toDelete) {
            // simple rebase
            toTransform.offset -= transformBy.toDelete;
            toTransform.offset += transformBy.toInsert.length;
            return toTransform;
        }
        // goto the end, anything you deleted that they also deleted should be skipped.
        var newOffset = transformBy.offset + transformBy.toInsert.length;
        toTransform.toDelete = 0; //-= (newOffset - toTransform.offset);
        if (toTransform.toDelete < 0) { toTransform.toDelete = 0; }
        toTransform.offset = newOffset;
        if (toTransform.toInsert.length === 0 && toTransform.toDelete === 0) {
            return null;
        }
        return toTransform;
    }
    if (toTransform.offset + toTransform.toDelete < transformBy.offset) {
        return toTransform;
    }
    toTransform = clone(toTransform);
    toTransform.toDelete = transformBy.offset - toTransform.offset;
    if (toTransform.toInsert.length === 0 && toTransform.toDelete === 0) {
        return null;
    }
    return toTransform;
};

/** Used for testing. */
var random = Operation.random = function (docLength) {
    Common.assert(Common.isUint(docLength));
    var op = create();
    op.offset = Math.floor(Math.random() * 100000000 % docLength) || 0;
    op.toDelete = Math.floor(Math.random() * 100000000 % (docLength - op.offset)) || 0;
    do {
        op.toInsert = Common.randomASCII(Math.floor(Math.random() * 20));
    } while (op.toDelete === 0 && op.toInsert === '');
    if (Common.PARANOIA) { check(op); }
    return op;
};

module.exports = Operation;
},
};
Realtime = require('Realtime.js');
}());