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
var Common = require('./Common');
var Operation = require('./Operation');
var Patch = require('./Patch');
var Message = require('./Message');
var Sha = require('./SHA256');

var ChainPad = {};

// hex_sha256('')
var EMPTY_STR_HASH = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
var ZERO =           '0000000000000000000000000000000000000000000000000000000000000000';

var enterChainPad = function (realtime, func) {
    return function () {
        if (realtime.failed) { return; }
        func.apply(null, arguments);
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

    realtime.uncommitted = Patch.simplify(
        realtime.uncommitted, realtime.authDoc, realtime.config.operationSimplify);

    if (realtime.uncommitted.operations.length === 0) {
        //debug(realtime, "No data to sync to the server, sleeping");
        realtime.syncSchedule = schedule(realtime, function () { sync(realtime); });
        return;
    }

    var msg;
    if (realtime.best === realtime.initialMessage) {
        msg = realtime.initialMessage;
    } else {
        msg = Message.create(realtime.userName,
                             realtime.authToken,
                             realtime.channelId,
                             Message.PATCH,
                             realtime.uncommitted,
                             realtime.best.hashOf);
    }

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
            if (realtime.initialMessage && realtime.initialMessage.hashOf === hash) {
                debug(realtime, "initial Ack received ["+hash+"]");
                realtime.initialMessage = null;
            }
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

var sendPing = function (realtime) {
    realtime.pingSchedule = undefined;
    realtime.lastPingTime = (new Date()).getTime();
    var msg = Message.create(realtime.userName,
                             realtime.authToken,
                             realtime.channelId,
                             Message.PING,
                             realtime.lastPingTime);
    realtime.onMessage(Message.toString(msg), function (err) {
        if (err) { throw err; }
    });
};

var onPong = function (realtime, msg) {
    if (Common.PARANOIA) {
        Common.assert(realtime.lastPingTime === Number(msg.content));
    }
    realtime.lastPingLag = (new Date()).getTime() - Number(msg.content);
    realtime.lastPingTime = 0;
    realtime.pingSchedule =
        schedule(realtime, function () { sendPing(realtime); }, realtime.pingCycle);
};

var create = ChainPad.create = function (userName, authToken, channelId, initialState, config) {

    var realtime = {
        type: 'ChainPad',

        authDoc: '',

        config: config || {},

        userName: userName,
        authToken: authToken,
        channelId: channelId,

        /** A patch representing all uncommitted work. */
        uncommitted: null,

        uncommittedDocLength: initialState.length,

        patchHandlers: [],
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

        rootMessage: null,

        /**
         * Set to the message which sets the initialState if applicable.
         * Reset to null after the initial message has been successfully broadcasted.
         */
        initialMessage: null,

        userListChangeHandlers: [],
        userList: [],

        /** The schedule() for sending pings. */
        pingSchedule: undefined,

        lastPingLag: 0,
        lastPingTime: 0,

        /** Average number of milliseconds between pings. */
        pingCycle: 5000
    };

    if (Common.PARANOIA) {
        realtime.userInterfaceContent = initialState;
    }

    var zeroPatch = Patch.create(EMPTY_STR_HASH);
    zeroPatch.inverseOf = Patch.invert(zeroPatch, '');
    zeroPatch.inverseOf.inverseOf = zeroPatch;
    var zeroMsg = Message.create('', '', channelId, Message.PATCH, zeroPatch, ZERO);
    zeroMsg.hashOf = Message.hashOf(zeroMsg);
    zeroMsg.parentCount = 0;
    realtime.messages[zeroMsg.hashOf] = zeroMsg;
    (realtime.messagesByParent[zeroMsg.lastMessageHash] || []).push(zeroMsg);
    realtime.rootMessage = zeroMsg;
    realtime.best = zeroMsg;

    if (initialState === '') {
        realtime.uncommitted = Patch.create(zeroPatch.inverseOf.parentHash);
        return realtime;
    }

    var initialOp = Operation.create(0, 0, initialState);
    var initialStatePatch = Patch.create(zeroPatch.inverseOf.parentHash);
    Patch.addOperation(initialStatePatch, initialOp);
    initialStatePatch.inverseOf = Patch.invert(initialStatePatch, '');
    initialStatePatch.inverseOf.inverseOf = initialStatePatch;

    // flag this patch so it can be handled specially.
    // Specifically, we never treat an initialStatePatch as our own,
    // we let it be reverted to prevent duplication of data.
    initialStatePatch.isInitialStatePatch = true;
    initialStatePatch.inverseOf.isInitialStatePatch = true;

    realtime.authDoc = initialState;
    if (Common.PARANOIA) {
        realtime.userInterfaceContent = initialState;
    }
    initialMessage = Message.create(realtime.userName,
                                    realtime.authToken,
                                    realtime.channelId,
                                    Message.PATCH,
                                    initialStatePatch,
                                    zeroMsg.hashOf);
    initialMessage.hashOf = Message.hashOf(initialMessage);
    initialMessage.parentCount = 1;

    realtime.messages[initialMessage.hashOf] = initialMessage;
    (realtime.messagesByParent[initialMessage.lastMessageHash] || []).push(initialMessage);

    realtime.best = initialMessage;
    realtime.uncommitted = Patch.create(initialStatePatch.inverseOf.parentHash);
    realtime.initialMessage = initialMessage;

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
    if (author === realtime.userName && !patch.isInitialStatePatch) {
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

var userListChange = function (realtime) {
    for (var i = 0; i < realtime.userListChangeHandlers.length; i++) {
        var list = [];
        list.push.apply(list, realtime.userList);
        realtime.userListChangeHandlers[i](list);
    }
};

var handleMessage = ChainPad.handleMessage = function (realtime, msgStr) {

    if (Common.PARANOIA) { check(realtime); }
    var msg = Message.fromString(msgStr);
    Common.assert(msg.channelId === realtime.channelId);

    if (msg.messageType === Message.REGISTER_ACK) {
        debug(realtime, "registered");
        realtime.registered = true;
        sendPing(realtime);
        return;
    }

    if (msg.messageType === Message.REGISTER) {
        realtime.userList.push(msg.userName);
        userListChange(realtime);
        return;
    }

    if (msg.messageType === Message.PONG) {
        onPong(realtime, msg);
        return;
    }

    if (msg.messageType === Message.DISCONNECT) {
        var idx = realtime.userList.indexOf(msg.userName);
        if (Common.PARANOIA) { Common.assert(idx > -1); }
        if (idx > -1) {
            realtime.userList.splice(idx, 1);
            userListChange(realtime);
        }
        return;
    }

    // otherwise it's a disconnect.
    if (msg.messageType !== Message.PATCH) { return; }

    msg.hashOf = Message.hashOf(msg);

    if (realtime.pending && realtime.pending.hash === msg.hashOf) {
        realtime.pending.callback();
        realtime.pending = null;
    }

    if (realtime.messages[msg.hashOf]) {
        debug(realtime, "Patch [" + msg.hashOf + "] is already known");
        if (Common.PARANOIA) { check(realtime); }
        return;
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
            && Common.strcmp(realtime.best.hashOf, msg.hashOf) > 0))
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

    var simplePatch =
        Patch.simplify(patch, authDocAtTimeOfPatch, realtime.config.operationSimplify);
    if (!Patch.equals(simplePatch, patch)) {
        debug(realtime, "patch [" + msg.hashOf + "] can be simplified");
        if (Common.PARANOIA) { check(realtime); }
        if (Common.TESTING) { throw new Error(); }
        delete realtime.messages[msg.hashOf];
        return;
    }

    patch.inverseOf = Patch.invert(patch, authDocAtTimeOfPatch);
    patch.inverseOf.inverseOf = patch;

    realtime.uncommitted = Patch.simplify(
        realtime.uncommitted, realtime.authDoc, realtime.config.operationSimplify);
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

    // push the uncommittedPatch out to the user interface.
    for (var i = 0; i < realtime.patchHandlers.length; i++) {
        realtime.patchHandlers[i](uncommittedPatch);
    }
    if (realtime.opHandlers.length) {
        for (var i = uncommittedPatch.operations.length-1; i >= 0; i--) {
            for (var j = 0; j < realtime.opHandlers.length; j++) {
                realtime.opHandlers[j](uncommittedPatch.operations[i]);
            }
        }
    }
    if (Common.PARANOIA) { check(realtime); }
};

module.exports.create = function (userName, authToken, channelId, initialState, conf) {
    Common.assert(typeof(userName) === 'string');
    Common.assert(typeof(authToken) === 'string');
    Common.assert(typeof(channelId) === 'string');
    Common.assert(typeof(initialState) === 'string');
    var realtime = ChainPad.create(userName, authToken, channelId, initialState, conf);
    return {
        onPatch: enterChainPad(realtime, function (handler) {
            Common.assert(typeof(handler) === 'function');
            realtime.patchHandlers.push(handler);
        }),
        onRemove: enterChainPad(realtime, function (handler) {
            Common.assert(typeof(handler) === 'function');
            realtime.opHandlers.unshift(function (op) {
                if (op.toRemove > 0) { handler(op.offset, op.toRemove); }
            });
        }),
        onInsert: enterChainPad(realtime, function (handler) {
            Common.assert(typeof(handler) === 'function');
            realtime.opHandlers.push(function (op) {
                if (op.toInsert.length > 0) { handler(op.offset, op.toInsert); }
            });
        }),
        remove: enterChainPad(realtime, function (offset, numChars) {
            doOperation(realtime, Operation.create(offset, numChars, ''));
        }),
        insert: enterChainPad(realtime, function (offset, str) {
            doOperation(realtime, Operation.create(offset, 0, str));
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
        }),
        getAuthDoc: function () { return realtime.authDoc; },
        getUserDoc: function () { return Patch.apply(realtime.uncommitted, realtime.authDoc); },
        onUserListChange: enterChainPad(realtime, function (handler) {
            Common.assert(typeof(handler) === 'function');
            realtime.userListChangeHandlers.push(handler);
        }),
        getLag: function () {
            if (realtime.lastPingTime) {
                return { waiting:1, lag: (new Date()).getTime() - realtime.lastPingTime };
            }
            return { waiting:0, lag: realtime.lastPingLag };
        }
    };
};
