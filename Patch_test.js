var Common = require('./Common');
var Operation = require('./Operation');
var Patch = require('./Patch');

// These are fuzz tests so increasing these numbers might catch more errors.
var CYCLES = 100;
var OPERATIONS = 1000;

var addOperationConst = function (origDoc, expectedDoc, operations) {
    var docx = origDoc;
    var doc = origDoc;
    var patch = Patch.create();
    
    var rebasedOps = [];
    for (var i = 0; i < operations.length; i++) {
        Patch.addOperation(patch, operations[i]);
        // sanity check
        doc = Operation.apply(operations[i], doc).doc;
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
    for (var i = 0; i < OPERATIONS; i++) {
        var op = operations[i] = Operation.random(doc.length);
        doc = Operation.apply(op, doc).doc;
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
    console.log("Merge compression ratio: " + Math.floor(opsLen / patchOpsLen) + ":1");
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
};

var main = function () {
    addOperation();
    toObjectFromObject();
    applyReversibility();
};
main();
