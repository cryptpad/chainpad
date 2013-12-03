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
        userInterfaceContent: '',

        failed: false
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
