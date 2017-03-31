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
