var Common = require('./Common');
var Operation = require('./Operation');

var Patch = module.exports;

var create = Patch.create = function () {
    return {
        type: 'Patch',
        operations: [],
        prevPatchHash: ''
    };
};

var check = Patch.check = function (patch) {
    if (!Common.PARANOIA) { return; }
    Common.assert(patch.type === 'Patch');
    Common.assert(Array.isArray(patch.operations));
    for (var i = 0; i < patch.operations.length; i++) {
        Operation.check(patch.operations[i]);
        if (i > 0) {
            Common.assert(patch.operations[i-1].offset < patch.operations[i].offset);
        }
    }
};

var toObj = Patch.toObj = function (patch) {
    check(patch);
    var out = new Array(patch.operations.length+1);
    var i;
    for (i = 0; i < patch.operations.length; i++) {
        out[i] = Operation.toObj(patch.operations[i]);
    }
    out[i] = patch.prevPatchHash;
    return out;
};

var fromObj = Patch.fromObj = function (obj) {
    Common.assert(Array.isArray(obj) && obj.length > 0);
    var patch = create();
    var i;
    for (i = 0; i < obj.length-1; i++) {
        patch.operations[i] = Operation.fromObj(obj[i]);
    }
    patch.prevPatchHash = obj[i];
    check(patch);
    return patch;
};

var apply = Patch.apply = function (patch, doc)
{
    check(patch);
    var rops = [];
    for (var i = patch.operations.length-1; i >= 0; i--) {
        var out = Operation.apply(patch.operations[i], doc);
        doc = out.doc;
        rops[i] = out.inverse;
    }
    var rpatch = create();
    rpatch.operations = rops;
    check(rpatch);
    return doc;
};

var addOperation = Patch.addOperation = function (patch, op) {
    check(patch);
    for (var i = 0; i < patch.operations.length; i++) {
        var out = Operation.rebase(patch.operations[i], op);
        if (out === null) {
            op = Operation.merge(patch.operations[i], op);
            patch.operations.splice(i,1);
            if (op === null) {
                //console.log("operations cancelled eachother");
                return;
            }
            i--;
        } else if (out === op) {
            // op could not be rebased further, insert it here to keep the list ordered.
            patch.operations.splice(i,0,op);
            return;
        } else {
            op = out;
            // op was rebased, try rebasing it against the next operation.
        }
    }
    patch.operations.push(op);
    check(patch);
};

var random = Patch.random = function (docLength, opCount) {
    opCount = opCount || (Math.floor(Math.random() * 2000) + 1);
    var patch = create();
    while (opCount-- > 0) {
        var op = Operation.random(docLength);
        docLength += Operation.lengthChange(op);
        addOperation(patch, op);
    }
    check(patch);
    return patch;
};
