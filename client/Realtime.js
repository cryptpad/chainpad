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

var schedule = function (realtime, func, timeout) {
    if (!timeout) {
        timeout = Math.floor(Math.random() * 2 * realtime.avgSyncTime);
    }
    var to = setTimeout(enterRealtime(realtime, function () {
        realtime.schedules.splice(realtime.schedules.indexOf(to), 1);
        func();
    }), timeout);
    realtime.schedules.push(to);
    return to;
};

var unschedule = function (realtime, schedule) {
    var index = realtime.schedules.indexOf(schedule);
    Common.assert(index > -1);
    realtime.schedules.splice(index, 1);
    clearTimeout(schedule);
};

var sync = function (realtime) {
    if (realtime.syncSchedule) {
clearTimeout(realtime.syncSchedule);
        //unschedule(realtime, realtime.syncSchedule);
    }

    realtime.uncommitted = Patch.simplify(realtime.uncommitted, realtime.authDoc);

    if (realtime.uncommitted.operations.length === 0) {
        //debug(realtime, "No data to sync to the server, sleeping");
        realtime.syncSchedule = schedule(realtime, function () { sync(realtime); });
        return;
    }

    var msg = Message.create(realtime.userName,
                             realtime.authToken,
                             realtime.channelId,
                             Message.PATCH,
                             realtime.uncommitted);

    var strMsg = Message.toString(msg);

    debug(realtime, "Sending patch [" + Message.hashOf(msg) + "]");

    realtime.onMessage(strMsg, function (err) {
        if (err) {
            debug(realtime, "Posting to server failed [" + err + "]");
        }
        //clearTimeout(realtime.syncSchedule);

    });
        realtime.syncSchedule = schedule(realtime, function () { sync(realtime); });
/*
    realtime.syncSchedule = schedule(realtime, function () {
        debug(realtime, "Failed to send message to server");
        sync(realtime);
    }, 1000 + (Math.random() * 5000));
*/
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
        debug(realtime, "Rejecting patch ["+Message.hashOf(msg)+"]");
        if (Common.PARANOIA) { check(realtime); }
        return;
    }

    if (i < 0 && (realtime.rpatches.length !== 0 && patch.parentHash !== EMPTY_STR_HASH)) {
        debug(realtime, "base of patch ["+Message.hashOf(msg)+"] not found");
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
            debug(realtime, "patch ["+Message.hashOf(msg)+"] rejected");
            if (Common.PARANOIA) { check(realtime); }
            return;
        }
    }

    // ok we're really going to do this

    for (var i = 0; i < hashes.length; i++) {
        debug(realtime, "reverting [" + hashes[i] + "]");
        realtime.rpatches.pop();
    }
    debug(realtime, "applying ["+Message.hashOf(msg)+"]");

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
