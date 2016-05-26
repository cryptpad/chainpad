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
var Common = module.exports.Common = require('./Common');
var Operation = module.exports.Operation = require('./Operation');
var Patch = module.exports.Patch = require('./Patch');
var Message = module.exports.Message = require('./Message');
var Sha = module.exports.Sha = require('./SHA256');

var ChainPad = {};

// hex_sha256('')
var EMPTY_STR_HASH = module.exports.EMPTY_STR_HASH =
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
var ZERO = '0000000000000000000000000000000000000000000000000000000000000000';

// Default number of patches between checkpoints (patches older than this will be pruned)
// default for realtime.config.checkpointInterval
var DEFAULT_CHECKPOINT_INTERVAL = 200;

// Default number of milliseconds to wait before syncing to the server
var DEFAULT_AVERAGE_SYNC_MILLISECONDS = 300;

var enterChainPad = function (realtime, func) {
    return function () {
        if (realtime.failed) { return; }
        func.apply(null, arguments);
    };
};

var debug = function (realtime, msg) {
    if (realtime.logLevel > 0) {
        console.log("[" + realtime.userName + "]  " + msg);
    }
};

var schedule = function (realtime, func, timeout) {
    if (realtime.aborted) { return; }
    if (!timeout) {
        timeout = Math.floor(Math.random() * 2 * realtime.config.avgSyncMilliseconds);
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

var onMessage = function (realtime, message, callback) {
    if (!realtime.messageHandlers.length) {
        callback("no onMessage() handler registered");
    }
    for (var i = 0; i < realtime.messageHandlers.length; i++) {
        realtime.messageHandlers[i](message, function () {
            callback.apply(null, arguments);
            callback = function () { };
        });
    }
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
            Common.assert(pending.hash === msg.hashOf);
            handleMessage(realtime, strMsg, true);
            pending.callback();
        }
    });

    msg.hashOf = msg.hashOf || Message.hashOf(msg);

    var timeout = schedule(realtime, function () {
        debug(realtime, "Failed to send message [" + msg.hashOf + "] to server");
        sync(realtime);
    }, 10000 + (Math.random() * 5000));

    if (realtime.pending) { throw new Error("there is already a pending message"); }
    realtime.pending = {
        hash: msg.hashOf,
        callback: function () {
            if (realtime.initialMessage && realtime.initialMessage.hashOf === msg.hashOf) {
                debug(realtime, "initial Ack received [" + msg.hashOf + "]");
                realtime.initialMessage = null;
            }
            unschedule(realtime, timeout);
            realtime.syncSchedule = schedule(realtime, function () { sync(realtime); }, 0);
            callback();
        }
    };
    if (Common.PARANOIA) { check(realtime); }
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
        realtime.syncSchedule = schedule(realtime, function () { sync(realtime); });
        return;
    }

    if (((parentCount(realtime, realtime.best) + 1) % realtime.config.checkpointInterval) === 0) {
        var best = realtime.best;
        debug(realtime, "Sending checkpoint");
        var cpp = Patch.createCheckpoint(realtime.authDoc,
                                         realtime.authDoc,
                                         realtime.best.content.inverseOf.parentHash);
        var cp = Message.create(Message.CHECKPOINT, cpp, realtime.best.hashOf);
        sendMessage(realtime, cp, function () {
            debug(realtime, "Checkpoint sent and accepted");
        });
        return;
    }

    var msg;
    if (realtime.best === realtime.initialMessage) {
        msg = realtime.initialMessage;
    } else {
        msg = Message.create(Message.PATCH, realtime.uncommitted, realtime.best.hashOf);
    }

    sendMessage(realtime, msg, function () {
        //debug(realtime, "patch sent");
    });
};

var create = ChainPad.create = function (config) {
    config = config || {};
    var initialState = config.initialState || '';
    config.checkpointInterval = config.checkpointInterval || DEFAULT_CHECKPOINT_INTERVAL;
    config.avgSyncMilliseconds = config.avgSyncMilliseconds || DEFAULT_AVERAGE_SYNC_MILLISECONDS;

    var realtime = {
        type: 'ChainPad',

        authDoc: '',

        config: config,

        logLevel: (typeof(config.logLevel) === 'number') ? config.logLevel : 1,

        /** A patch representing all uncommitted work. */
        uncommitted: null,

        uncommittedDocLength: initialState.length,

        patchHandlers: [],
        changeHandlers: [],

        messageHandlers: [],

        schedules: [],
        aborted: false,

        syncSchedule: null,

        registered: false,

        // this is only used if PARANOIA is enabled.
        userInterfaceContent: undefined,

        failed: false,

        // hash and callback for previously send patch, currently in flight.
        pending: null,

        messages: {},
        messagesByParent: {},

        rootMessage: null,

        userName: config.userName || 'anonymous',
    };

    if (Common.PARANOIA) {
        realtime.userInterfaceContent = initialState;
    }

    var zeroPatch = Patch.create(EMPTY_STR_HASH);
    if (initialState !== '') {
        var initialOp = Operation.create(0, 0, initialState);
        Patch.addOperation(zeroPatch, initialOp);
    }
    zeroPatch.inverseOf = Patch.invert(zeroPatch, '');
    zeroPatch.inverseOf.inverseOf = zeroPatch;
    var zeroMsg = Message.create(Message.PATCH, zeroPatch, ZERO);
    zeroMsg.hashOf = Message.hashOf(zeroMsg);
    zeroMsg.parentCount = 0;
    realtime.messages[zeroMsg.hashOf] = zeroMsg;
    (realtime.messagesByParent[zeroMsg.lastMessageHash] || []).push(zeroMsg);
    realtime.rootMessage = zeroMsg;
    realtime.best = zeroMsg;
    realtime.authDoc = initialState;
    realtime.uncommitted = Patch.create(zeroPatch.inverseOf.parentHash);

    if (Common.PARANOIA) {
        realtime.userInterfaceContent = initialState;
    }
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

    if (!Common.VALIDATE_ENTIRE_CHAIN_EACH_MSG) { return; }

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

var doPatch = ChainPad.doPatch = function (realtime, patch) {
    if (Common.PARANOIA) {
        check(realtime);
        Common.assert(Patch.invert(realtime.uncommitted).parentHash === patch.parentHash);
        realtime.userInterfaceContent = Patch.apply(patch, realtime.userInterfaceContent);
    }
    Patch.check(patch, realtime.uncommittedDocLength);
    realtime.uncommitted = Patch.merge(realtime.uncommitted, patch);
    realtime.uncommittedDocLength += Patch.lengthChange(patch);
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

var applyPatch = function (realtime, isFromMe, patch) {
    Common.assert(patch);
    Common.assert(patch.inverseOf);
    if (isFromMe && !patch.isInitialStatePatch) {
        var inverseOldUncommitted = Patch.invert(realtime.uncommitted, realtime.authDoc);
        var userInterfaceContent = Patch.apply(realtime.uncommitted, realtime.authDoc);
        if (Common.PARANOIA) {
            Common.assert(userInterfaceContent === realtime.userInterfaceContent);
        }
        realtime.uncommitted = Patch.merge(inverseOldUncommitted, patch);
        realtime.uncommitted = Patch.invert(realtime.uncommitted, userInterfaceContent);

    } else {
        realtime.uncommitted =
            Patch.transform(
                realtime.uncommitted, patch, realtime.authDoc, realtime.config.transformFunction);
    }
    realtime.uncommitted.parentHash = patch.inverseOf.parentHash;

    realtime.authDoc = Patch.apply(patch, realtime.authDoc);

    if (Common.PARANOIA) {
        Common.assert(realtime.uncommitted.parentHash === patch.inverseOf.parentHash);
        Common.assert(Sha.hex_sha256(realtime.authDoc) === realtime.uncommitted.parentHash);
        realtime.userInterfaceContent = Patch.apply(realtime.uncommitted, realtime.authDoc);
    }
};

var revertPatch = function (realtime, isFromMe, patch) {
    applyPatch(realtime, isFromMe, patch.inverseOf);
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
    if (patch.operations.length) {
        // push the uncommittedPatch out to the user interface.
        for (var i = 0; i < realtime.patchHandlers.length; i++) {
            realtime.patchHandlers[i](patch);
        }
        for (var i = 0; i < realtime.changeHandlers.length; i++) {
            for (var j = patch.operations.length; j >= 0; j--) {
                var op = patch.operations[j];
                realtime.changeHandlers[i](op.offset, op.toRemove, op.toInsert);
            }
        }
    }
};

var handleMessage = ChainPad.handleMessage = function (realtime, msgStr, isFromMe) {

    if (Common.PARANOIA) { check(realtime); }
    var msg = Message.fromString(msgStr);

    // otherwise it's a disconnect.
    if (msg.messageType !== Message.PATCH && msg.messageType !== Message.CHECKPOINT) {
        debug(realtime, "unrecognized message type " + msg.messageType);
        return;
    }

    msg.hashOf = Message.hashOf(msg);

    if (realtime.messages[msg.hashOf]) {
        debug(realtime, "Patch [" + msg.hashOf + "] is already known");
        if (Common.PARANOIA) { check(realtime); }
        return;
    }

    realtime.messages[msg.hashOf] = msg;
    (realtime.messagesByParent[msg.lastMsgHash] =
        realtime.messagesByParent[msg.lastMsgHash] || []).push(msg);

    if (!isAncestorOf(realtime, realtime.rootMessage, msg)) {
        if (realtime.rootMessage === realtime.best && msg.content.isCheckpoint) {
            // We're starting with a trucated chain from a checkpoint, we will adopt this
            // as the root message and go with it...
            var userDoc = Patch.apply(realtime.uncommitted, realtime.authDoc);
            Common.assert(!Common.PARANOIA || realtime.userInterfaceContent === userDoc);
            var fixUserDocPatch = Patch.invert(realtime.uncommitted, realtime.authDoc);
            Patch.addOperation(fixUserDocPatch,
                Operation.create(0, realtime.authDoc.length, msg.content.operations[0].toInsert));
            fixUserDocPatch =
                Patch.simplify(fixUserDocPatch, userDoc, realtime.config.operationSimplify);

            msg.parentCount = 0;
            realtime.rootMessage = realtime.best = msg;

            realtime.authDoc = msg.content.operations[0].toInsert;
            realtime.uncommitted = Patch.create(Sha.hex_sha256(realtime.authDoc));
            realtime.uncommittedDocLength = realtime.authDoc.length;
            pushUIPatch(realtime, fixUserDocPatch);

            if (Common.PARANOIA) { realtime.userInterfaceContent = realtime.authDoc; }
            return;
        } else {
            // we'll probably find the missing parent later.
            debug(realtime, "Patch [" + msg.hashOf + "] not connected to root");
            if (Common.PARANOIA) { check(realtime); }
            return;
        }
    }

    // of this message fills in a hole in the chain which makes another patch better, swap to the
    // best child of this patch since longest chain always wins.
    msg = getBestChild(realtime, msg);
    msg.isFromMe = isFromMe;
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
        Common.assert(typeof(toRevert[i].content.inverseOf) !== 'undefined');
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

    if (patch.isCheckpoint) {
        // Ok, we have a checkpoint patch.
        // If the chain length is not equal to checkpointInterval then this patch is invalid.
        var i = 0;
        var checkpointP;
        for (var m = getParent(realtime, msg); m; m = getParent(realtime, m)) {
            if (m.content.isCheckpoint) {
                if (checkpointP) {
                    checkpointP = m;
                    break;
                }
                checkpointP = m;
            }
        }
        if (checkpointP && checkpointP !== realtime.rootMessage) {
            var point = parentCount(realtime, checkpointP);
            if ((point % realtime.config.checkpointInterval) !== 0) {
                debug(realtime, "checkpoint [" + msg.hashOf + "] at invalid point [" + point + "]");
                if (Common.PARANOIA) { check(realtime); }
                if (Common.TESTING) { throw new Error(); }
                delete realtime.messages[msg.hashOf];
                return;
            }

            // Time to prune some old messages from the chain
            debug(realtime, "checkpoint [" + msg.hashOf + "]");
            for (var m = getParent(realtime, checkpointP); m; m = getParent(realtime, m)) {
                debug(realtime, "pruning [" + m.hashOf + "]");
                delete realtime.messages[m.hashOf];
                delete realtime.messagesByParent[m.hashOf];
            }
            realtime.rootMessage = checkpointP;
        }
    } else {
        var simplePatch =
            Patch.simplify(patch, authDocAtTimeOfPatch, realtime.config.operationSimplify);
        if (!Patch.equals(simplePatch, patch)) {
            debug(realtime, "patch [" + msg.hashOf + "] can be simplified");
            if (Common.PARANOIA) { check(realtime); }
            if (Common.TESTING) { throw new Error(); }
            delete realtime.messages[msg.hashOf];
            return;
        }
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
        revertPatch(realtime, toRevert[i].isFromMe, toRevert[i].content);
    }

    for (var i = 0; i < toApply.length; i++) {
        debug(realtime, "applying [" + toApply[i].hashOf + "]");
        uncommittedPatch = Patch.merge(uncommittedPatch, toApply[i].content);
        applyPatch(realtime, toApply[i].isFromMe, toApply[i].content);
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

    pushUIPatch(realtime, uncommittedPatch);

    if (Common.PARANOIA) { check(realtime); }
};

var getDepthOfState = function (content, minDepth, realtime) {
    Common.assert(typeof(content) === 'string');

    // minimum depth is an optional argument which defaults to zero
    var minDepth = minDepth || 0;

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

module.exports.create = function (conf) {
    var realtime = ChainPad.create(conf);
    var out = {
        onPatch: enterChainPad(realtime, function (handler) {
            Common.assert(typeof(handler) === 'function');
            realtime.patchHandlers.push(handler);
        }),
        patch: enterChainPad(realtime, function (patch, x, y) {
            if (typeof(patch) === 'number') {
                // Actually they meant to call realtime.change()
                out.change(patch, x, y);
                return;
            }
            doPatch(realtime, patch);
        }),

        onChange: enterChainPad(realtime, function (handler) {
            Common.assert(typeof(handler) === 'function');
            realtime.changeHandlers.push(handler);
        }),
        change: enterChainPad(realtime, function (offset, count, chars) {
            if (count === 0 && chars === '') { return; }
            doOperation(realtime, Operation.create(offset, count, chars));
        }),

        onMessage: enterChainPad(realtime, function (handler) {
            Common.assert(typeof(handler) === 'function');
            realtime.messageHandlers.push(handler);
        }),

        message: enterChainPad(realtime, function (message) {
            handleMessage(realtime, message, false);
        }),

        start: enterChainPad(realtime, function () {
            if (realtime.syncSchedule) { unschedule(realtime, realtime.syncSchedule); }
            realtime.syncSchedule = schedule(realtime, function () { sync(realtime); });
        }),

        abort: enterChainPad(realtime, function () {
            realtime.aborted = true;
            realtime.schedules.forEach(function (s) { clearTimeout(s) });
        }),

        sync: enterChainPad(realtime, function () { sync(realtime); }),

        getAuthDoc: function () { return realtime.authDoc; },

        getUserDoc: function () { return Patch.apply(realtime.uncommitted, realtime.authDoc); },

        getDepthOfState: function (content, minDepth) {
            return getDepthOfState(content, minDepth, realtime);
        }
    };
    return out;
};
