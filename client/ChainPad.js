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

var ChainPad = {};

// hex_sha256('')
var EMPTY_STR_HASH = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

var enterChainPad = function (realtime, func) {
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
    var to = setTimeout(enterChainPad(realtime, function () {
        realtime.schedules.splice(realtime.schedules.indexOf(to), 1);
        func();
    }), timeout);
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

var sync = function (realtime) {
    if (Common.PARANOIA) { check(realtime); }
    if (realtime.syncSchedule) {
        unschedule(realtime, realtime.syncSchedule);
        realtime.syncSchedule = null;
    } else {
        // we're currently waiting on something from the server.
        return;
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
                             realtime.uncommitted,
                             realtime.best.hashOf);

    var strMsg = Message.toString(msg);

    realtime.onMessage(strMsg, function (err) {
        if (err) {
            debug(realtime, "Posting to server failed [" + err + "]");
        }
    });

    var hash = Message.hashOf(msg);

    var timeout = schedule(realtime, function () {
        debug(realtime, "Failed to send message ["+hash+"] to server");
        sync(realtime);
    }, 10000 + (Math.random() * 5000));
    realtime.pending = {
        hash: hash,
        callback: function () {
            unschedule(realtime, timeout);
            realtime.syncSchedule = schedule(realtime, function () { sync(realtime); }, 0);
        }
    };
    if (Common.PARANOIA) { check(realtime); }
};

var getMessages = function (realtime) {
    if (realtime.registered === true) { return; }
    realtime.registered = true;
    /*var to = schedule(realtime, function () {
        throw new Error("failed to connect to the server");
    }, 5000);*/
    var msg = Message.create(realtime.userName,
                             realtime.authToken,
                             realtime.channelId,
                             Message.REGISTER);
    realtime.onMessage(Message.toString(msg), function (err) {
        if (err) { throw err; }
    });
};

var create = ChainPad.create = function (userName, authToken, channelId, initialState) {

    var realtime = {
        type: 'ChainPad',

        authDoc: '',

        userName: userName,
        authToken: authToken,
        channelId: channelId,

        /** A patch representing all uncommitted work. */
        uncommitted: null,

        uncommittedDocLength: initialState.length,

        opHandlers: [],

        onMessage: function (message, callback) {
            callback("no onMessage() handler registered");
        },

        schedules: [],

        syncSchedule: null,

        registered: false,

        avgSyncTime: 100,

        // this is only used if PARANOIA is enabled.
        userInterfaceContent: undefined,

        failed: false,

        // hash and callback for previously send patch, currently in flight.
        pending: null,

        messages: {},
        messagesByParent: {},

        rootMessage: null
    };

    if (Common.PARANOIA) {
        realtime.userInterfaceContent = initialState;
    }

    var initialPatch = Patch.create(EMPTY_STR_HASH);
    if (initialState !== '') {
        var initialOp = Operation.create();
        initialOp.toInsert = initialState;
        Patch.addOperation(initialPatch, initialOp);
        realtime.authDoc = Patch.apply(initialPatch, '');
    }
    initialPatch.inverseOf = Patch.invert(initialPatch, '');
    var msg = Message.create('', '', channelId, Message.PATCH, initialPatch, '');
    msg.lastMsgHash = '0000000000000000000000000000000000000000000000000000000000000000';
    msg.hashOf = Message.hashOf(msg);
    msg.parentCount = 0;
    realtime.messages[msg.hashOf] = msg;
    realtime.rootMessage = msg;
    realtime.best = msg;
    realtime.uncommitted = Patch.create(initialPatch.inverseOf.parentHash);

    return realtime;
};

var getParent = function (realtime, message) {
    return message.parent = message.parent || realtime.messages[message.lastMsgHash];
};

var check = ChainPad.check = function(realtime) {
    Common.assert(realtime.type === 'ChainPad');
    Common.assert(typeof(realtime.authDoc) === 'string');

    Patch.check(realtime.uncommitted, realtime.authDoc.length);

    var uiDoc = Patch.apply(realtime.uncommitted, realtime.authDoc);
    if (uiDoc.length !== realtime.uncommittedDocLength) {
        Common.assert(0);
    }
    if (realtime.userInterfaceContent !== '') {
        Common.assert(uiDoc === realtime.userInterfaceContent);
    }

    var doc = realtime.authDoc;
    var patchMsg = realtime.best;
    Common.assert(patchMsg.content.inverseOf.parentHash === realtime.uncommitted.parentHash);
    var patches = [];
    do {
        patches.push(patchMsg);
        doc = Patch.apply(patchMsg.content.inverseOf, doc);
    } while ((patchMsg = getParent(realtime, patchMsg)));
    Common.assert(doc === '');
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

var isAncestorOf = function (realtime, ancestor, decendent) {
    if (!decendent || !ancestor) { return false; }
    if (ancestor === decendent) { return true; }
    return isAncestorOf(realtime, ancestor, getParent(realtime, decendent));
};

var parentCount = function (realtime, message) {
    if (typeof(message.parentCount) !== 'number') {
        message.parentCount = parentCount(realtime, getParent(realtime, message)) + 1;
    }
    return message.parentCount;
};

var applyPatch = function (realtime, author, patch) {
    if (author === realtime.userName) {
        var inverseOldUncommitted = Patch.invert(realtime.uncommitted, realtime.authDoc);
        var userInterfaceContent = Patch.apply(realtime.uncommitted, realtime.authDoc);
        if (Common.PARANOIA) {
            Common.assert(userInterfaceContent === realtime.userInterfaceContent);
        }
        realtime.uncommitted = Patch.merge(inverseOldUncommitted, patch);
        realtime.uncommitted = Patch.invert(realtime.uncommitted, userInterfaceContent);

    } else {
        realtime.uncommitted = Patch.transform(realtime.uncommitted, patch, realtime.authDoc);
    }
    realtime.uncommitted.parentHash = patch.inverseOf.parentHash;

    realtime.authDoc = Patch.apply(patch, realtime.authDoc);

    if (Common.PARANOIA) {
        realtime.userInterfaceContent = Patch.apply(realtime.uncommitted, realtime.authDoc);
    }
};

var revertPatch = function (realtime, author, patch) {
    applyPatch(realtime, author, patch.inverseOf);
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

var handleMessage = ChainPad.handleMessage = function (realtime, msgStr) {

    if (Common.PARANOIA) { check(realtime); }
    var msg = Message.fromString(msgStr);
    Common.assert(msg.channelId === realtime.channelId);

    if (msg.messageType === Message.REGISTER_ACK) {
        debug(realtime, "registered");
        realtime.registered = true;
        return;
    }

    Common.assert(msg.messageType === Message.PATCH);

    msg.hashOf = Message.hashOf(msg);

    if (realtime.pending && realtime.pending.hash === msg.hashOf) {
        realtime.pending.callback();
        realtime.pending = null;
    }

    realtime.messages[msg.hashOf] = msg;
    (realtime.messagesByParent[msg.lastMsgHash] =
        realtime.messagesByParent[msg.lastMsgHash] || []).push(msg);

    if (!isAncestorOf(realtime, realtime.rootMessage, msg)) {
        // we'll probably find the missing parent later.
        debug(realtime, "Patch [" + msg.hashOf + "] not connected to root");
        if (Common.PARANOIA) { check(realtime); }
        return;
    }

    // of this message fills in a hole in the chain which makes another patch better, swap to the
    // best child of this patch since longest chain always wins.
    msg = getBestChild(realtime, msg);
    var patch = msg.content;

    // Find the ancestor of this patch which is in the main chain, reverting as necessary
    var toRevert = [];
    var commonAncestor = realtime.best;
    if (!isAncestorOf(realtime, realtime.best, msg)) {
        var pcBest = parentCount(realtime, realtime.best);
        var pcMsg = parentCount(realtime, msg);
        if (pcBest < pcMsg
          || (pcBest === pcMsg
            && Common.compareHashes(realtime.best.hashOf, msg.hashOf) > 0))
        {
            // switch chains
            while (commonAncestor && !isAncestorOf(realtime, commonAncestor, msg)) {
                toRevert.push(commonAncestor);
                commonAncestor = getParent(realtime, commonAncestor);
            }
            Common.assert(commonAncestor);
        } else {
            debug(realtime, "Patch [" + msg.hashOf + "] chain is ["+pcMsg+"] best chain is ["+pcBest+"]");
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

    for (var i = 0; i < toRevert.length; i++) {
        authDocAtTimeOfPatch = Patch.apply(toRevert[i].content.inverseOf, authDocAtTimeOfPatch);
    }

    // toApply.length-1 because we do not want to apply the new patch.
    for (var i = 0; i < toApply.length-1; i++) {
        if (typeof(toApply[i].content.inverseOf) === 'undefined') {
            toApply[i].content.inverseOf = Patch.invert(toApply[i].content, authDocAtTimeOfPatch);
            toApply[i].content.inverseOf.inverseOf = toApply[i].content;
        }
        authDocAtTimeOfPatch = Patch.apply(toApply[i].content, authDocAtTimeOfPatch);
    }

    if (Sha.hex_sha256(authDocAtTimeOfPatch) !== patch.parentHash) {
        debug(realtime, "patch [" + msg.hashOf + "] parentHash is not valid");
        if (Common.PARANOIA) { check(realtime); }
        if (Common.TESTING) { throw new Error(); }
        delete realtime.messages[msg.hashOf];
        return;
    }

    if (!Patch.equals(Patch.simplify(patch, authDocAtTimeOfPatch), patch)) {
        debug(realtime, "patch [" + msg.hashOf + "] can be simplified");
        if (Common.PARANOIA) { check(realtime); }
        if (Common.TESTING) { throw new Error(); }
        delete realtime.messages[msg.hashOf];
        return;
    }

    patch.inverseOf = Patch.invert(patch, authDocAtTimeOfPatch);
    patch.inverseOf.inverseOf = patch;


    realtime.uncommitted = Patch.simplify(realtime.uncommitted, realtime.authDoc);
    var oldUserInterfaceContent = Patch.apply(realtime.uncommitted, realtime.authDoc);
    if (Common.PARANOIA) {
        Common.assert(oldUserInterfaceContent === realtime.userInterfaceContent);
    }

    // Derive the patch for the user's uncommitted work
    var uncommittedPatch = Patch.invert(realtime.uncommitted, realtime.authDoc);

    for (var i = 0; i < toRevert.length; i++) {
        debug(realtime, "reverting [" + toRevert[i].hashOf + "]");
        uncommittedPatch = Patch.merge(uncommittedPatch, toRevert[i].content.inverseOf);
        revertPatch(realtime, toRevert[i].userName, toRevert[i].content);
    }

    for (var i = 0; i < toApply.length; i++) {
        debug(realtime, "applying [" + toApply[i].hashOf + "]");
        uncommittedPatch = Patch.merge(uncommittedPatch, toApply[i].content);
        applyPatch(realtime, toApply[i].userName, toApply[i].content);
    }

    uncommittedPatch = Patch.merge(uncommittedPatch, realtime.uncommitted);
    uncommittedPatch = Patch.simplify(uncommittedPatch, oldUserInterfaceContent);

    realtime.uncommittedDocLength += Patch.lengthChange(uncommittedPatch);
    realtime.best = msg;

    if (Common.PARANOIA) {
        // apply the uncommittedPatch to the userInterface content.
        var newUserInterfaceContent = Patch.apply(uncommittedPatch, oldUserInterfaceContent);
        Common.assert(realtime.userInterfaceContent.length === realtime.uncommittedDocLength);
        Common.assert(newUserInterfaceContent === realtime.userInterfaceContent);
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
    var realtime = ChainPad.create(userName, authToken, channelId, initialState);
    return {
        onRemove: enterChainPad(realtime, function (handler) {
            Common.assert(typeof(handler) === 'function');
            realtime.opHandlers.unshift(function (op) {
                if (op.toDelete > 0) { handler(op.offset, op.toDelete); }
            });
        }),
        onInsert: enterChainPad(realtime, function (handler) {
            Common.assert(typeof(handler) === 'function');
            realtime.opHandlers.push(function (op) {
                if (op.toInsert.length > 0) { handler(op.offset, op.toInsert); }
            });
        }),
        remove: enterChainPad(realtime, function (offset, numChars) {
            var op = Operation.create();
            op.offset = offset;
            op.toDelete = numChars;
            doOperation(realtime, op);
        }),
        insert: enterChainPad(realtime, function (offset, str) {
            var op = Operation.create();
            op.offset = offset;
            op.toInsert = str;
            doOperation(realtime, op);
        }),
        onMessage: enterChainPad(realtime, function (handler) {
            realtime.onMessage = handler;
        }),
        message: enterChainPad(realtime, function (message) {
            handleMessage(realtime, message);
        }),
        start: enterChainPad(realtime, function () {
            getMessages(realtime);
            realtime.syncSchedule = schedule(realtime, function () { sync(realtime); });
        }),
        abort: enterChainPad(realtime, function () {
            realtime.schedules.forEach(function (s) { clearTimeout(s) });
        }),
        sync: enterChainPad(realtime, function () {
            sync(realtime);
        })
    };
};
