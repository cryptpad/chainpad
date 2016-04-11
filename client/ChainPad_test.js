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
var ChainPad = require('./ChainPad');
var Common = require('./Common');
var Operation = require('./Operation');
var Sha = require('./SHA256');
var nThen = require('nthen');
var TextPatcher = require('./text-patcher');

var startup = function (callback) {
    var rt = ChainPad.create('x','y','abc','abc');
    rt.abort();
    callback();
};

var runOperation = function (realtimeFacade, op) {
    if (op.toRemove > 0) {
        realtimeFacade.remove(op.offset, op.toRemove);
    }
    if (op.toInsert.length > 0) {
        realtimeFacade.insert(op.offset, op.toInsert);
    }
};

var insert = function (doc, offset, chars) {
    return doc.substring(0,offset) + chars + doc.substring(offset);
};

var remove = function (doc, offset, count) {
    return doc.substring(0,offset) + doc.substring(offset+count);
};

var runAttributeOperation = function (text, op) {
    text = remove(text, op.offset, op.toRemove);
    return insert(text, op.offset, op.toInsert);
};

var registerNode = function (name, initialDoc) {
    var rt = ChainPad.create(name,'y','abc',initialDoc);
    onMsg = rt.onMessage;
    var handlers = [];
    onMsg(function (msg) {
        setTimeout(function () {
            if (msg === ('1:y' + name.length + ':' + name + '3:abc3:[0]')) {
                // registration
                rt.message('0:3:abc3:[1]');
            } else {
                msg = msg.substring(3); //replace(/^1:y/, '');
                handlers.forEach(function (handler) { handler(msg); });
            }
        });
    });
    rt.onMessage = function (handler) {
        handlers.push(handler);
    }

    rt.doc = initialDoc;
    rt.onInsert(function (offset, chars) { rt.doc = insert(rt.doc, offset, chars); console.log('---'+rt.doc); });
    rt.onRemove(function (offset, count) { rt.doc = remove(rt.doc, offset, count); });

    return rt;
};

var editing = function (callback) {
    var doc = '';
    var rt = registerNode('editing()', '');
    var messages = 0;
    rt.onMessage(function (msg) {
        messages++;
        rt.message(msg);
    });
    rt.start();

    var i = 0;
    var to = setInterval(function () {
        if (i++ > 10) {
            clearTimeout(to);
            for (var j = 0; j < 100; j++) {
                var m = messages;
                rt.sync();
                if (m === messages) {
                    rt.abort();
                    callback();
                    return;
                }
            }
            throw new Error();
        }
        // fire off another operation
        var op = Operation.random(doc.length);
        doc = Operation.apply(op, doc);
        runOperation(rt, op);
        rt.sync();
    },1);

};

var fakeSetTimeout = function (func, time) {
    var i = time;
    var tick = function () { if (i-- <= 0) { func() } else { setTimeout(tick); } };
    setTimeout(tick);
};

var twoClientsCycle = function (callback, origDocA, origDocB) {
    var rtA = registerNode('twoClients(rtA)', origDocA);
    var rtB = registerNode('twoClients(rtB)', origDocB);
    rtA.queue = [];
    rtB.queue = [];
    var messages = 0;

    var onMsg = function (rt, msg) {
        messages+=2;
        var m = msg.replace(/^1:y/, '');
        fakeSetTimeout(function () {
            messages--;
            rtA.queue.push(m);
            fakeSetTimeout(function () { rtA.message(rtA.queue.shift()); }, Math.random() * 100);
        }, Math.random() * 100);
        fakeSetTimeout(function () {
            messages--;
            rtB.queue.push(m);
            fakeSetTimeout(function () { rtB.message(rtB.queue.shift()); }, Math.random() * 100);
        }, Math.random() * 100);
    };
    [rtA, rtB].forEach(function (rt) {
        rt.onMessage(function (msg) { onMsg(rt, msg) });
        rt.start();
    });

    var i = 0;
    var to = setInterval(function () {
        if (i++ > 100) {
            clearTimeout(to);
            var j = 0;
            var flushCounter = 0;
            var again = function () {
                if (++j > 10000) { throw new Error("never synced"); }
                rtA.sync();
                rtB.sync();
                if (messages === 0 && rtA.queue.length === 0 && rtB.queue.length === 0 && flushCounter++ > 100) {
                    console.log(rtA.doc);
                    console.log(rtB.doc);
                    Common.assert(rtA.doc === rtB.doc);
                    rtA.abort();
                    rtB.abort();
                    callback();
                    return;
                } else {
                    setTimeout(again);
                }
            };
            again();
        }

//console.log(JSON.stringify([rtA.doc, rtB.doc]));

        var rt = (Math.random() > 0.5) ? rtA : rtB;

        var op = Operation.random(rt.doc.length);
        rt.doc = Operation.apply(op, rt.doc);
        runOperation(rt, op);

        if (Math.random() > 0.8) {
            rt.sync();
        }
    },1);

};

var twoClients = function (cycles, callback) {
    var i = 0;
    var again = function () {
        if (++i >= cycles) { again = callback; }
        var docA = Common.randomASCII(Math.floor(Math.random()*20));
        var docB = Common.randomASCII(Math.floor(Math.random()*20));
        twoClientsCycle(again, docA, docB);
    };
    again();
};

var syncCycle = function (messages, finalDoc, name, callback) {
    var rt = registerNode(name, '');
    for (var i = 0; i < messages.length; i++) {
        rt.message(messages[i]);
    }
    setTimeout(function () {
        Common.assert(rt.doc === finalDoc);
        rt.abort();
        callback();
    });
};

/* QUESTION:
    what does it mean if it prints 'not connected to root'?

It's sending and receiving messages out of order, so we expect to have
state which is not connected to root. Eventually it resolves, and so it
doesn't fail. So this test is apparently correct.

*/
var outOfOrderSync = function (callback) {
    var messages = [];
    var rtA = registerNode('outOfOrderSync()', '');
    rtA.onMessage(function (msg) {
        rtA.message(msg);
        messages.push(msg);
    });
    var i = 0;
    rtA.start();

    var finish = function () {
        rtA.abort();
        var i = 0;
        var cycle = function () {
            if (i++ > 10) {
                callback();
                return;
            }
            // first sync is in order
            syncCycle(messages, rtA.doc, 'outOfOrderSync(rt'+i+')', function () {
                for (var j = 0; j < messages.length; j++) {
                    var k = Math.floor(Math.random() * messages.length);
                    var m = messages[k];
                    messages[k] = messages[j];
                    messages[j] = m;
                }
                cycle();
            });
        };
        cycle();
    };

    var again = function () {
        setTimeout( (i++ < 150) ? again : finish );
        if (i < 100) {
            var op = Operation.random(rtA.doc.length);
            rtA.doc = Operation.apply(op, rtA.doc);
            runOperation(rtA, op);
        }
        rtA.sync();
    };
    again();
};

var checkVersionInChain = function (callback) {
    var doc = '';
// create a chainpad
    var rt = registerNode('editing()', '');
    var messages = 0;
    rt.onMessage(function (msg) {
        messages++;
        rt.message(msg);
    });
    rt.start();

    var i = 0;
    var oldUserDoc;
    var to = setInterval(function () {
// on the 51st change, grab the doc
        if (i === 50) {
            oldUserDoc = rt.getUserDoc();
        }
// on the 100th random change, check whether the 50th existed before
        if (i++ > 100) {
            clearTimeout(to);
            Common.assert(rt.wasEverState(oldUserDoc));
            Common.assert(rt.wasEverState(rt.getUserDoc()))
            rt.abort();
            callback();
            return;
        }

        // fire off another operation
        var op = Operation.random(doc.length);
        doc = Operation.apply(op, doc);
        runOperation(rt, op);
        rt.sync();
    },1);

};

var whichStateIsDeeper = function (callback) {
// create a chainpad
    var rt = registerNode('editing()', '');
    var messages = 0;
    rt.onMessage(function (msg) {
        messages++;
        rt.message(msg);
    });
    rt.start();

    var doc = '',
        docO = doc,
        docA,
        docB;

    var i = 0;

    var to = setInterval(function () {
        if (i === 25) {
            // grab docO
            docO = rt.getUserDoc();
        } else if (i === 50) {
            // grab docA
            docA = rt.getUserDoc();
            console.log("Got Document A");
            console.log(docA);

            Common.assert(rt.getDepthOfState(docA) === 0);
            Common.assert(rt.getDepthOfState(docO) === 25);
        } else if (i === 75) {
            // grab docB
            docB = rt.getUserDoc();
            console.log("Got Document B");
            console.log(docB);

            // state assertions
            Common.assert(rt.getDepthOfState(docB) === 0);
            Common.assert(rt.getDepthOfState(docA) === 25);
            Common.assert(rt.getDepthOfState(docO) === 50);
        } else if (i >= 100) {
            // finish
            clearTimeout(to);

            Common.assert(rt.getDepthOfState(docB) === 25);
            Common.assert(rt.getDepthOfState(docA) === 50);
            Common.assert(rt.getDepthOfState(docO) === 75);

            rt.abort();
            callback();
            return;
        }

        i++;
        var op = Operation.random(doc.length);
        doc = Operation.apply(op,doc);
        runOperation(rt, op);
        rt.sync();
    },1);
};

var breakOT = function (cycles, callback) {
    console.log("\n\n\nbreakOt()\n\n\n");
    var i = 0;
    var seed = function (n) { return Common.randomASCII(Math.floor(Math.random() * n + 10)); };
    var SEED_LENGTH = 50;
    var again = function () {
        if (++i >= cycles) { again = callback; }

        var objA = JSON.stringify({
            a: seed(SEED_LENGTH),
            b: seed(SEED_LENGTH)
        });

        console.log(objA);

        breakOTTwoClientsCycle(again, objA, objA);
    };
    again();
};


var breakOTTwoClientsCycle = function (callback, origDocA, origDocB) {
    /* documents A and B are both valid JSON objects. */

    var rtA = registerNode('breakOTTwoClients(rtA)', '');
    var rtB = registerNode('breakOTTwoClients(rtB)', '');
    rtA.queue = [];
    rtB.queue = [];
    var messages = 0;

    var lastOperations = [];

    var onMsg = function (rt, msg) {
        messages+=2;
        var m = msg.replace(/^1:y/, '');
        fakeSetTimeout(function () {
            messages--;
            rtA.queue.push(m);
            console.log("A->B " + m);
            fakeSetTimeout(function () { rtA.message(rtA.queue.shift()); }, Math.random() * 100);
        }, Math.random() * 100);
        fakeSetTimeout(function () {
            messages--;
            rtB.queue.push(m);
            console.log("B->A " + m);
            fakeSetTimeout(function () { rtB.message(rtB.queue.shift()); }, Math.random() * 100);
        }, Math.random() * 100);
    };

    // initialize both realtime sessions
    [rtA, rtB].forEach(function (rt) {
        // patchText is a helper which determines differences and applies patches
        rt.patchText = TextPatcher.create({
            realtime: rt
        });

        // queue messages when the realtime gets them
        rt.onMessage(function (msg) { onMsg(rt, msg) });
        rt.start();
        if (rt === rtA) {
            rt.insert(0, origDocA);
        }
        rt.sync();
    });

    var i = 0;
    var to = setInterval(function () {
        if (messages) { return; }
        if (i++ > 100) {
            // using clearTimeout to clear an interval works, but it's weird
            clearTimeout(to);
            var j = 0;
            var flushCounter = 0;
            var again = function () {
                if (++j > 10000) { throw new Error("never synced"); }
                rtA.sync();
                rtB.sync();
                if (messages === 0 && rtA.queue.length === 0 && rtB.queue.length === 0 && flushCounter++ > 250) {
                    console.log(rtA.getUserDoc());
                    console.log(rtB.getUserDoc());

                    // they should be in sync, but this is failing, so they are not.
                    Common.assert(rtA.getUserDoc() === rtB.getUserDoc());
                    rtA.abort();
                    rtB.abort();
                    callback();
                    return;
                } else {
                    setTimeout(again);
                }
            };
            again();
        }

        // randomly choose one of the two clients for each step
        var RT = { a: rtA, b: rtB };
        var choice = (Math.random() > 0.5) ? 'a' : 'b';
        var rt = RT[choice];

        /*  we're using JSON for documents because it's fragile.
            if any operations or operational transformations result in
            invalid JSON, we have an indication that something is wrong. */
        try {
            if (rt.getUserDoc() === '') { return; }
            var parsed = JSON.parse(rt.getUserDoc());
        } catch (err) {
            console.log("Could not parse: %s\n", rt.getUserDoc());
            console.log("Last operations were:");
            console.log(lastOperations);
            throw new Error();
        }

        // if we parsed, we know that the last operation break the JSON, so
        // flush it and keep trying
        lastOperations = [];

        // generate a random operation to apply to one of the attributes
        var op = Operation.random(parsed[choice].length);

        // run that operation on the attribute, not the realtime
        parsed[choice] = runAttributeOperation(parsed[choice], op);

        // patchText computes and runs the patches on the stringified JSON
        lastOperations.push(rt.patchText(JSON.stringify(parsed)));

        try {
            JSON.parse(rt.getUserDoc());
        } catch (err) {
            console.log("could not parse: %s", rt.getUserDoc());

            console.log("Last operation was:");
            console.log(lastOperation);
            console.log("AuthDoc " + rt.getAuthDoc());

            throw new Error();
        }


        rt.sync();
    },0);

};

var main = module.exports.main = function (cycles, callback) {
    nThen(function (waitFor) {
        startup(waitFor());
    })
    /*
    .nThen(function (waitFor) {
        editing(waitFor());
    })*/.nThen(function (waitFor) {
        //twoClients(cycles, waitFor());
    })/*.nThen(function (waitFor) {
        outOfOrderSync(waitFor());
    }).nThen(function (waitFor) {
        checkVersionInChain(waitFor);
    }).nThen(function (waitFor) {
        whichStateIsDeeper(waitFor);
    }).nThen(function (waitFor) {
        isOperationalTransformWorking_extended(waitFor);
    })*/.nThen(function (waitFor) {
        breakOT(cycles, waitFor());
    }).nThen(callback);
};
