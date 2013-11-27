var Common = require('./Common');
var Operation = require('./Operation');

var applyReversibility = function () {
    var doc = Common.randomASCII(Math.floor(Math.random() * 2000));
    var operations = [];
    var rOperations = [];
    var docx = doc;
    for (var i = 0; i < 1000; i++) {
        operations[i] = Operation.random(docx.length);
        var out = Operation.apply(operations[i], docx);
        docx = out.doc;
        rOperations[i] = out.inverse;
    }
    for (var i = 1000-1; i >= 0; i--) {
        var out = Operation.apply(rOperations[i], docx);
        docx = out.doc;
        if (JSON.stringify(operations[i]) !== JSON.stringify(out.inverse)) {
            throw new Error("the inverse of the inverse is not the forward:\n" +
                JSON.stringify(operations[i], null, '  ') + "\n" +
                JSON.stringify(out.inverse, null, '  '));
        }
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
    var docB = Operation.apply(opAB, docA).doc;
    var opBC = Operation.random(docB.length);
    var docC = Operation.apply(opBC, docB).doc;

    if (Operation.rebase(opAB, opBC) === null) {
        var opAC = Operation.merge(opAB, opBC);
        var docC2 = docA;
        if (opAC !== null) {
            docC2 = Operation.apply(opAC, docA).doc;
        }
        if (docC2 !== docC) {
            console.log("merging:\n" +
                JSON.stringify(opAB, null, '  ') + "\n" +
                JSON.stringify(opBC, null, '  '));
            console.log("result:\n" + JSON.stringify(opAC, null, '  '));
            throw new Error();
        }
    }
};
var merge = function () {
    for (var i = 0; i  < 1000; i++) {
        mergeOne();
    }
}

var main = function () {
    applyReversibilityMany();
    toObjectFromObject();
    merge();
};
main();
