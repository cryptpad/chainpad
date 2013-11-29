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

var sync = function (realTime) {
    var schedule = Math.floor(Math.random() * 2000);

    if (realtime.uncommitted.operations.length === 0) {
        console.log("No data to sync to the server, sleeping for " + schedule + "ms");
        setTimeout(function () { sync(realTime); }, schedule);
        return;
    }

    var msg = Message.create(realtime.channelId, Message.PATCH, realtime.uncommitted);
    realTime.onMessage(msg.toString(), function (err) {
        if (err) {
            console.log("Posting to server failed [" + err + "]");
        }
        setTimeout(function () { sync(realTime); }, schedule);
    });
};

var getMessages = function (realtime) {
    var msg = Message.create(realtime.channelId, Message.PATCH_REQ, uncommitted.parentHash);
    realTime.onMessage(msg.toString(), function (err) {
        if (err) {
            var schedule = Math.floor(Math.random() * 10000);
            console.log("Requesting patches from server failed [" + err + "] try again in " +
                        schedule + "ms");
            setTimeout(function () { getMessages(realTime); }, schedule);
        }
    });
};

var create = Realtime.create = function (channelId, initialState) {
    var initialPatch =
        Patch.create('0000000000000000000000000000000000000000000000000000000000000000');
    var initialOp = Operation.create();
    initialOp.toInsert = initialState;
    Patch.addOperation(initialPatch, initialOp);
    var patchOut = Patch.apply(initialPatch, '');

    var realTime = {
        type: 'Realtime',
        authDoc: patchOut.result,

        channelId: channelId,

        /**
         * The reverse patches which if each are applied will carry the document back to
         * it's initial state, if the final patch is applied it will convert the document to ''
         */
        rpatches: [patchOut.inverse],

        /** A patch representing all uncommitted work. */
        uncommitted: Patch.create(patchOut.inverse.parentHash),

        uncommittedDocLength: initialState.length,

        opHandlers: [],
        onMessage: function (message, callback) {
            callback("no onMessage() handler registered");
        }
    };

    sync(realTime);
};

var check = Realtime.check = function(realtime) {
    Common.assert(realtime.type === 'Realtime');
    Common.assert(typeof(realtime.authDoc) === 'string');
    Common.assert(Array.isArray(realtime.patches));

    var doc = '';
    for (var i = 0; i < patches.length; i++) {
        Patch.check(realtime.patches[i], doc.length);
        doc = Patch.apply(realtime.patches[i], doc).result;
    }
    Common.assert(doc === authDoc);

    Patch.check(realtime.uncommitted, doc.length);
    doc = Patch.apply(uncommitted, doc).result;
    Common.assert(doc.length === realtime.uncommittedDocLength);
};

var doOperation = Realtime.doOperation = function (realtime, op) {
    if (Common.PARANOIA) { check(realtime); }
    Operation.check(op, realtime.uncommittedDocLength);
    Patch.addOperation(realtime.uncommitted, op);
    realtime.uncommittedDocLength += Operation.lengthChange(op);
};

var onOperation = Realtime.onOperation = function (realtime, handler) {
    if (Common.PARANOIA) { check(realtime); }
    realtime.opHandlers.push(handler);
};

var handleMessage = Realtime.handleMessage = function (realtime, msgStr) {
    var msg = Message.fromString(msgStr);
    Common.assert(msg.channelId === realtime.channelId);

    // TODO: maybe in the future we would support true p2p?
    Common.assert(msg.messageType === Message.PATCH);

    var patch = msg.content;
    var hash = Patch.hashOf(patch);
    var toApply = [];
    for (var i = realtime.rpatches.length-1; i >= 0; i--) {
        if (hash === rpatches[i].parentHash) {
            toApply.push(patch);
            break;
        }
        if (Common.compareHashes(hash, rpatches[i].parentHash) > 0) {
            console.log("patch [" + hash + "] rejected");
            return;
        }
        toApply.push(rpatches[i]);
    }
    if (toApply[toApply.legnth-1] !== patch) {
        console.log("base of patch [" + hash + "] not found");
        return;
    }

    // merge into one grand patch
    var patchToApply = toApply.shift();
    for (var i = 0; i < toApply.length; i++) {
        patchToApply = Patch.merge(patchToApply, toApply[i]);
    }

    var inverseOldUncommitted = Patch.invert(realtime.uncommitted, realtime.authDoc);

// TODO: not if it's the user's own work.
    // transform the uncommitted work
    realtime.uncommitted = Patch.transform(realtime.uncommitted, patchToApply);
    realtime.uncommitted.parentHash = hash;

    // apply the patch to the authoritative document
    realtime.authDoc = Patch.apply(patchToApply, realtime.authDoc);

    // Derive the patch for the user's uncommitted work
    var uncommittedPatch = Patch.merge(inverseOldUncommitted, patchToApply);
    uncommittedPatch = Patch.merge(uncommittedPatch, realtime.uncommitted);

    // push the uncommittedPatch out to the user interface.
    for (var i = uncommittedPatch.operations.length; i >= 0; i--) {
        for (var j = 0; i < realtime.opHandlers.length; j++) {
            realtime.opHandlers[j](uncommittedPatch.operations[i]);
        }
    }
};

module.exports.Realtime = function () {
    var realtime = Realtime.create();
    var out = {};
    out.onRemove = function (handler) {
        onOperation(realtime, function (op) {
            if (op.toDelete > 0) { handler(op.offset, op.toDelete); }
        });
    };
    out.onInsert = function (handler) {
        onOperation(realtime, function (op) {
            if (op.toInsert.length > 0) { handler(op.offset, op.toInsert); }
        });
    };
    out.remove = function (offset, numChars) {
        var op = Operation.create();
        op.offset = offset;
        op.toDelete = numChars;
        doOperation(realtime, op);
    };
    out.insert = function (offset, str) {
        var op = Operation.create();
        op.offset = offset;
        op.toInsert = str;
        doOperation(realtime, op);
    };
    out.onMessage = function (handler) {
        realtime.onMessage = handler;
        getMessages(realtime);
    };
};
