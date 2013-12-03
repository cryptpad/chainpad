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
    rt.setAvgSyncTime(0);
    
    rt.onMessage(function (msg) {
        if (msg === '1:y1:x3:abc5:[0,0]') {
            // registration
            rt.message('0:3:abc5:[1,0]');
        } else {
            rt.message(msg.replace(/^1:y/, ''));
        }
    });
    rt.start();

setInterval(function () {
        // fire off another operation
        process.nextTick(function () {
            var op = Operation.random(doc.length);
console.log("OLDHASH:" + Sha.hex_sha256(doc));
            doc = Operation.apply(op, doc);
            if (op.toDelete > 0) {
                rt.remove(op.offset, op.toDelete);
            }
            if (op.toInsert.length > 0) {
                rt.insert(op.offset, op.toInsert);
            }
        });
}, 1000);

};

var main = function () {
    //startup();
    onMessage();

    editing();
};
main();
