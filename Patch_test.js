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

// These are fuzz tests so increasing these numbers might catch more errors.
var CYCLES = 10000;
var OPERATIONS = 1000;

var addOperationConst = function (origDoc, expectedDoc, operations) {
    var docx = origDoc;
    var doc = origDoc;
    var patch = Patch.create('0000000000000000000000000000000000000000000000000000000000000000');

    var rebasedOps = [];
    for (var i = 0; i < operations.length; i++) {
        Patch.addOperation(patch, operations[i]);
        // sanity check
        doc = Operation.apply(operations[i], doc);
    }
    Common.assert(doc === expectedDoc);

    var doc = Patch.apply(patch, origDoc);

    Common.assert(doc === expectedDoc);

    return patch;
};

var addOperationCycle = function () {
    var origDoc = Common.randomASCII(Math.floor(Math.random() * 5000)+1);
    var operations = [];
    var doc = origDoc;
    for (var i = 0; i < Math.floor(Math.random() * OPERATIONS) + 1; i++) {
        var op = operations[i] = Operation.random(doc.length);
        doc = Operation.apply(op, doc);
    }

    var patch = addOperationConst(origDoc, doc, operations);

    return {
        operations: operations,
        patchOps: patch.operations
    };
};

var addOperation = function () {

    var opsLen = 0;
    var patchOpsLen = 0;
    for (var i = 0; i < CYCLES; i++) {
        var out = addOperationCycle();
        opsLen += out.operations.length;
        patchOpsLen += out.patchOps.length;
    }
    var mcr = Math.floor((opsLen / patchOpsLen) * 1000) / 1000;
    console.log("Merge compression ratio: " + mcr + ":1");
};

var toObjectFromObject = function () {
    for (var i = 0; i < CYCLES; i++) {
        var patch = Patch.random(Math.floor(Math.random() * 100)+1);
        var patchObj = Patch.toObj(patch);
        var patchB = Patch.fromObj(patchObj);
        Common.assert(JSON.stringify(patch) === JSON.stringify(patchB));
    }
};

var applyReversibility = function () {
    for (var i = 0; i < CYCLES; i++) {
        var docA = Common.randomASCII(Math.floor(Math.random() * 2000));
        var patch = Patch.random(docA.length);
        var docB = Patch.apply(patch, docA);
        var docAA = Patch.apply(Patch.invert(patch, docA), docB);
        Common.assert(docAA === docA);
    }
};

var merge = function () {
    for (var i = 0; i < CYCLES; i++) {
        var docA = Common.randomASCII(Math.floor(Math.random() * 5000)+1);
        var patchAB = Patch.random(docA.length);
        var docB = Patch.apply(patchAB, docA);
        var patchBC = Patch.random(docB.length);
        var docC = Patch.apply(patchBC, docB);
        var patchAC = Patch.merge(patchAB, patchBC);
        var docC2 = Patch.apply(patchAC, docA);
        Common.assert(docC === docC2);
    }
};

var main = function () {
    addOperation();
    toObjectFromObject();
    applyReversibility();
    merge();
};
main();
