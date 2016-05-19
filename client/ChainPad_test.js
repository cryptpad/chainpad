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

var startup = function (callback) {
    var rt = ChainPad.create({
        userName: 'x',
        channelId: 'abc',
        initialState: 'abc'
    });
    rt.abort();
    callback();
};

var runOperation = function (realtimeFacade, op) {
    realtimeFacade.patch(op.offset, op.toRemove, op.toInsert);
};

var insert = function (doc, offset, chars) {
    return doc.substring(0,offset) + chars + doc.substring(offset);
};

var remove = function (doc, offset, count) {
    return doc.substring(0,offset) + doc.substring(offset+count);
};

var registerNode = function (name, initialDoc) {
    var rt = ChainPad.create({
        userName: name,
        channelId:'abc',
        initialState: initialDoc
    });
    onMsg = rt.onMessage;
    var handlers = [];
    onMsg(function (msg) {
        setTimeout(function () {
                msg = msg.replace(/^0:/,''); //substring(2); //replace(/^1:y/, '');
                handlers.forEach(function (handler) { handler(msg); });
        });
    });
    rt.onMessage = function (handler) {
        handlers.push(handler);
    }

    rt.doc = initialDoc;

    rt.onPatch(function () { rt.doc = rt.getUserDoc() });
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
            Common.assert(rt.getDepthOfState(oldUserDoc) !== -1);
            Common.assert(rt.getDepthOfState(rt.getUserDoc()) !== -1)
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

var main = module.exports.main = function (cycles, callback) {
    nThen(function (waitFor) {
        startup(waitFor());
    }).nThen(function (waitFor) {
        editing(waitFor());
    }).nThen(function (waitFor) {
        twoClients(cycles, waitFor());
    }).nThen(function (waitFor) {
        outOfOrderSync(waitFor());
    }).nThen(function (waitFor) {
        checkVersionInChain(waitFor);        
    }).nThen(function (waitFor) {
        whichStateIsDeeper(waitFor);
    }).nThen(callback);
};
