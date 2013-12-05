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
var Realtime = require('./Realtime');
var Common = require('./Common');
var Operation = require('./Operation');
var Sha = require('./SHA256');

var startup = function () {
    var rt = Realtime.create('x','y','abc','abc');
    rt.abort();
};

var onMessage = function () {
    var rt = Realtime.create('x','y','abc','abc');
    rt.onMessage(function (msg) {
        console.log(msg);
        rt.abort();
    });
    rt.insert(3, "d");
};

var editing = function () {
    var doc = '';
    var rt = Realtime.create('x','y','abc',doc);
    var messages = 0;
    rt.onMessage(function (msg) {
        messages++;
        if (msg === '1:y1:x3:abc5:[0,0]') {
            // registration
            rt.message('0:3:abc5:[1,0]');
        } else {
            rt.message(msg.replace(/^1:y/, ''));
        }
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
                    return;
                }
            }
            throw new Error();
        }
        // fire off another operation
        var op = Operation.random(doc.length);
//console.log("OLDHASH:" + Sha.hex_sha256(doc));
        doc = Operation.apply(op, doc);
        if (op.toDelete > 0) {
            rt.remove(op.offset, op.toDelete);
        }
        if (op.toInsert.length > 0) {
            rt.insert(op.offset, op.toInsert);
        }
        rt.sync();
    });

};

var insert = function (doc, offset, chars) {
    return doc.substring(0,offset) + chars + doc.substring(offset);
};

var remove = function (doc, offset, count) {
    return doc.substring(0,offset) + doc.substring(offset+count);
};

var fakeSetTimeout = function (func, time) {
    var i = time;
    var tick = function () { if (i-- <= 0) { func() } else { process.nextTick(tick); } };
    process.nextTick(tick);
};

var twoClientsCycle = function (callback) {
    var doc = '';
    var rtA = Realtime.create('one','y','abc',doc);
    var rtB = Realtime.create('two','y','abc',doc);
    rtA.doc = rtB.doc = doc;
    rtA.queue = [];
    rtB.queue = [];
    var messages = 0;
    
    var onMsg = function (rt, msg) {
console.log(msg);
        messages++;
        if (/1:y3:[a-z]{3}3:abc5:\[0,0\]/.test(msg)) {
            // registration
            rt.message('0:3:abc5:[1,0]');
        } else {
            var m = msg.replace(/^1:y/, '');
            fakeSetTimeout(function () {
                rtA.queue.push(m);
                rtB.queue.push(m);
                fakeSetTimeout(function () { rtA.message(rtA.queue.shift()); }, Math.random() * 100);
                fakeSetTimeout(function () { rtB.message(rtB.queue.shift()); }, Math.random() * 100);
            }, Math.random() * 100);
        }
    };
    [rtA, rtB].forEach(function (rt) {
        rt.onMessage(function (msg) { onMsg(rt, msg) });
        rt.onInsert(function (offset, chars) { rt.doc = insert(rt.doc, offset, chars); });
        rt.onRemove(function (offset, count) { rt.doc = remove(rt.doc, offset, count); });
        rt.start();
    });

    var i = 0;
    var to = setInterval(function () {
        if (i++ > 100) {
            clearTimeout(to);
            var j = 0;
            var again = function () {
                if (++j > 1000) { throw new Error("never synced"); }
                process.nextTick(again);
                var m = messages;
                rtA.sync();
                rtB.sync();
                if (m === messages) {
                    console.log(rtA.doc);
                    console.log(rtB.doc);
                    Common.assert(rtA.doc === rtB.doc);
                    rtA.abort();
                    rtB.abort();
                    callback();
                    return;
                }
            };
            again();
        }

//console.log(JSON.stringify([rtA.doc, rtB.doc]));

        var rt = (Math.random() > 0.5) ? rtA : rtB;

        var op = Operation.random(rt.doc.length);
        rt.doc = Operation.apply(op, rt.doc);

        if (op.toDelete > 0) {
            rt.remove(op.offset, op.toDelete);
        }
        if (op.toInsert.length > 0) {
            rt.insert(op.offset, op.toInsert);
        }

        if (Math.random() > 0.8) {
            rt.sync();
        }
    });

};

var twoClents = function () {
    var i = 0;
    var again = function () { if (i++ < 10) { twoClientsCycle(again); } };
    again();
};

var main = function () {
    //startup();
    onMessage();
    editing();
    twoClents();
};
main();
