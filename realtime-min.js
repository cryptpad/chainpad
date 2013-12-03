(function(){function require(e,t,n){t||(t=0);var r=require.resolve(e,t),i=require.m[t][r];if(!i)throw new Error('failed to require "'+e+'" from '+n);if(i.c){t=i.c,r=i.m,i=require.m[t][i.m];if(!i)throw new Error('failed to require "'+r+'" from '+t)}return i.exports||(i.exports={},i.call(i.exports,i,i.exports,require.relative(r,t))),i.exports}require.resolve=function(e,t){var n=e,r=e+".js",i=e+"/index.js";return require.m[t][r]&&r?r:require.m[t][i]&&i?i:n},require.relative=function(e,t){return function(n){if("."!=n.charAt(0))return require(n,t,e);var r=e.split("/"),i=n.split("/");r.pop();for(var s=0;s<i.length;s++){var o=i[s];".."==o?r.pop():"."!=o&&r.push(o)}return require(r.join("/"),t,e)}};
require.m = [];
require.m[0] = {
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
        content[i] = String.fromCharCode( Math.floor(Math.random()*256) % 94 + 32 );
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
        try {
            func.apply(null, arguments);
        } catch (err) {
            realtime.schedules.forEach(function (s) { clearTimeout(s) });
            err.message += ' username [' + realtime.userName + ']';
            throw err;
        }
    };
};

var schedule = function (realtime, func) {
    var time = Math.floor(Math.random() * 2 * realtime.avgSyncTime);
    var to = setTimeout(enterRealtime(realtime, function () {
        realtime.schedules.splice(realtime.schedules.indexOf(to), 1);
        func();
    }), time);
    realtime.schedules.push(to);
};

var sync = function (realtime) {
    schedule(realtime, function () { sync(realtime); });
    if (realtime.uncommitted.operations.length === 0) {
        //console.log("No data to sync to the server, sleeping");
        return;
    }

    var msg = Message.create(realtime.userName,
                             realtime.authToken,
                             realtime.channelId,
                             Message.PATCH,
                             realtime.uncommitted);

    realtime.onMessage(Message.toString(msg), function (err) {
        if (err) {
            console.log("Posting to server failed [" + err + "]");
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
            console.log("Requesting patches from server failed [" + err + "] try again");
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

        registered: false,

        avgSyncTime: 200,

        // this is only used if PARANOIA is enabled.
        userInterfaceContent: ''
    };

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
    Common.assert(uiDoc.length === realtime.uncommittedDocLength);
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
console.log("OPERATION");
    Operation.check(op, realtime.uncommittedDocLength);
    Patch.addOperation(realtime.uncommitted, op);
    realtime.uncommittedDocLength += Operation.lengthChange(op);
};

var handleMessage = Realtime.handleMessage = function (realtime, msgStr) {
    var msg = Message.fromString(msgStr);
    Common.assert(msg.channelId === realtime.channelId);

    if (msg.messageType === Message.REGISTER_ACK) {
        console.log("registered");
        realtime.registered = true;
        return;
    }

    Common.assert(msg.messageType === Message.PATCH);

    var patch = msg.content;
    // TODO: We calculate the hash of the patch twice, once to invert it.
    //var hash = Patch.hashOf(patch);

    // First we will search for the base of this patch.
    var rollbackPatch = null;

    var hashes = [];
    var nextHash = realtime.uncommitted.parentHash;
    for (var i = realtime.rpatches.length-1;;) {
        if (patch.parentHash === nextHash) {
            // Found the point where it's rooted.
            break;
        }
        nextHash = realtime.rpatches[i].parentHash;
        if (!rollbackPatch) {
            rollbackPatch = realtime.rpatches[i];
        } else {
            rollbackPatch = Patch.merge(rollbackPatch, realtime.rpatches[i]);
        }
        hashes.push(nextHash);
        i--;
        if (i < 0) {
            console.log("base [" + patch.parentHash + "] of patch not found");
            return;
        }
    }

    var authDocAtTimeOfPatch = realtime.authDoc;
    var patchToApply = patch;
    if (rollbackPatch !== null) {
        authDocAtTimeOfPatch = Patch.apply(rollbackPatch, authDocAtTimeOfPatch);
        if (Common.PARANOIA) {
            Common.assert(Sha.hex_sha256(authDocAtTimeOfPatch) === rollbackPatch.parentHash);
        }
        patchToApply = Patch.merge(rollbackPatch, patch);
    }

    var rpatch = Patch.invert(patch, authDocAtTimeOfPatch);

    // Now we need to check that the hash of the result of the patch is less than that
    // of all results which it displaces
    for (var i = 0; i < hashes.length; i++) {
        if (Common.compareHashes(rpatch.parentHash, hashes[i]) > 0) {
            console.log("patch [" + rpatch.parentHash + "] rejected");
            return;
        }
    }

    // ok we're really going to do this
    realtime.rpatches.push(rpatch);
//console.log("newhash " + rpatch.parentHash);
//console.log(realtime.authDoc);
    var inverseOldUncommitted = Patch.invert(realtime.uncommitted, realtime.authDoc);

    // apply the patch to the authoritative document
    realtime.authDoc = Patch.apply(patchToApply, realtime.authDoc);

    if (msg.userName === realtime.userName) {
        // We should not be forcing ourselves to roll anything back.
        Common.assert(patchToApply === patch);
        Common.assert(patch.parentHash === realtime.uncommitted.parentHash);

//console.log(JSON.stringify(inverseOldUncommitted) + 'xxx' + JSON.stringify(patch));
        realtime.uncommitted = Patch.merge(inverseOldUncommitted, patch);
        realtime.uncommitted = Patch.invert(realtime.uncommitted, realtime.authDoc);
        Common.assert(realtime.uncommitted.parentHash === rpatch.parentHash);
//console.log(JSON.stringify(realtime.uncommitted));
        return;
    }

    // transform the uncommitted work
    realtime.uncommitted = Patch.transform(realtime.uncommitted, patchToApply);
    realtime.uncommitted.parentHash = rpatch.parentHash;

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
        console.log(">"+realtime.userInterfaceContent);
    }

    // push the uncommittedPatch out to the user interface.
    for (var i = uncommittedPatch.operations.length-1; i >= 0; i--) {
        for (var j = 0; j < realtime.opHandlers.length; j++) {
            realtime.opHandlers[j](uncommittedPatch.operations[i]);
        }
    }
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
        setAvgSyncTime: enterRealtime(realtime, function (time) {
            Common.assert(typeof(time) === 'number' && time >= 0);
            realtime.avgSyncTime = time;
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

    if (JSON.stringify(oldOpOrig) === JSON.stringify(newOpOrig)) {
        return null;
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
        //toTransform = clone(toTransform);
        if (toTransform.offset > transformBy.offset + transformBy.toDelete) {
            // simple rebase
            toTransform.offset -= transformBy.toDelete;
            toTransform.offset += transformBy.toInsert.length;
            return;// toTransform;
        }
        // goto the end, anything you deleted that they also deleted should be skipped.
        var newOffset = transformBy.offset + transformBy.toDelete + 1;
        toTransform.toDelete -= (newOffset - toTrandform.offset);
        if (toTransform.toDelete < 0) { toTransform.toDelete = 0; }
        toTransform.offset = newOffset;
        return;// toTransform;
    }
    if (toTransform.offset + toTransform.toDelete < transformBy.offset) {
        return;// toTransform;
    }
    //toTransform = clone(toTransform);
    toTransform.toDelete = transformBy.offset - toTransform.offset;
    return;// toTransform;
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