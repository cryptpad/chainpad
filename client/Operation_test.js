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

var applyReversibility = function () {
    var doc = Common.randomASCII(Math.floor(Math.random() * 2000));
    var operations = [];
    var rOperations = [];
    var docx = doc;
    for (var i = 0; i < 1000; i++) {
        operations[i] = Operation.random(docx.length);
        rOperations[i] = Operation.invert(operations[i], docx);
        docx = Operation.apply(operations[i], docx);
    }
    for (var i = 1000-1; i >= 0; i--) {
        if (rOperations[i]) {
            var inverse = Operation.invert(rOperations[i], docx);
            docx = Operation.apply(rOperations[i], docx);
        }
        /*if (JSON.stringify(operations[i]) !== JSON.stringify(inverse)) {
            throw new Error("the inverse of the inverse is not the forward:\n" +
                JSON.stringify(operations[i], null, '  ') + "\n" +
                JSON.stringify(inverse, null, '  '));
        }*/
    }
    Common.assert(doc === docx);
};

var applyReversibilityMany = function () {
    for (var i = 0; i < 100; i++) {
        applyReversibility();
    }
};

var toObjectFromObject = function () {
    for (var i = 0; i < 100; i++) {
        var op = Operation.random(Math.floor(Math.random() * 2000)+1);
        Common.assert(JSON.stringify(op) === JSON.stringify(Operation.fromObj(Operation.toObj(op))));
    }
};

var mergeOne = function () {
    var docA = Common.randomASCII(Math.floor(Math.random() * 100)+1);
    var opAB = Operation.random(docA.length);
    var docB = Operation.apply(opAB, docA);
    var opBC = Operation.random(docB.length);
    var docC = Operation.apply(opBC, docB);

    if (Operation.shouldMerge(opAB, opBC)) {
        var opAC = Operation.merge(opAB, opBC);
        var docC2 = docA;
        try {
            if (opAC !== null) {
                docC2 = Operation.apply(opAC, docA);
            }
            Common.assert(docC2 === docC);
        } catch (e) {
            console.log("merging:\n" +
                JSON.stringify(opAB, null, '  ') + "\n" +
                JSON.stringify(opBC, null, '  '));
            console.log("result:\n" + JSON.stringify(opAC, null, '  '));
            throw e;
        }
    }
};
var merge = function () {
    for (var i = 0; i  < 1000; i++) {
        mergeOne();
    }
};

var simplify = function () {
    for (var i = 0; i  < 1000; i++) {
        // use a very short document to cause lots of common patches.
        var docA = Common.randomASCII(Math.floor(Math.random() * 8)+1);
        var opAB = Operation.random(docA.length);
        var sopAB = Operation.simplify(opAB, docA);
        var docB = Operation.apply(opAB, docA);
        var sdocB = docA;
        if (sopAB) {
            sdocB = Operation.apply(sopAB, docA);
        }
        Common.assert(sdocB === docB);
    }
};

var main = function () {
    simplify();
    applyReversibilityMany();
    toObjectFromObject();
    merge();
};
main();
