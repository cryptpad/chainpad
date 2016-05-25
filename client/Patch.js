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
var Common = require('./Common');
var Operation = require('./Operation');
var Sha = require('./SHA256');

var Patch = module.exports;

var create = Patch.create = function (parentHash) {
    return {
        type: 'Patch',
        operations: [],
        parentHash: parentHash,
        isCheckpoint: false
    };
};

var check = Patch.check = function (patch, docLength_opt) {
    Common.assert(patch.type === 'Patch');
    Common.assert(Array.isArray(patch.operations));
    Common.assert(/^[0-9a-f]{64}$/.test(patch.parentHash));
    for (var i = patch.operations.length - 1; i >= 0; i--) {
        Operation.check(patch.operations[i], docLength_opt);
        if (i > 0) {
            Common.assert(!Operation.shouldMerge(patch.operations[i], patch.operations[i-1]));
        }
        if (typeof(docLength_opt) === 'number') {
            docLength_opt += Operation.lengthChange(patch.operations[i]);
        }
    }
    if (patch.isCheckpoint) {
        Common.assert(patch.operations.length === 1);
        Common.assert(patch.operations[0].offset === 0);
        if (typeof(docLength_opt) === 'number') {
            Common.assert(!docLength_opt || patch.operations[0].toRemove === docLength_opt);
        }
    }
};

var toObj = Patch.toObj = function (patch) {
    if (Common.PARANOIA) { check(patch); }
    var out = new Array(patch.operations.length+1);
    var i;
    for (i = 0; i < patch.operations.length; i++) {
        out[i] = Operation.toObj(patch.operations[i]);
    }
    out[i] = patch.parentHash;
    return out;
};

var fromObj = Patch.fromObj = function (obj) {
    Common.assert(Array.isArray(obj) && obj.length > 0);
    var patch = create();
    var i;
    for (i = 0; i < obj.length-1; i++) {
        patch.operations[i] = Operation.fromObj(obj[i]);
    }
    patch.parentHash = obj[i];
    if (Common.PARANOIA) { check(patch); }
    return patch;
};

var hash = function (text) {
    return Sha.hex_sha256(text);
};

var addOperation = Patch.addOperation = function (patch, op) {
    if (Common.PARANOIA) {
        check(patch);
        Operation.check(op);
    }
    for (var i = 0; i < patch.operations.length; i++) {
        if (Operation.shouldMerge(patch.operations[i], op)) {
            op = Operation.merge(patch.operations[i], op);
            patch.operations.splice(i,1);
            if (op === null) {
                //console.log("operations cancelled eachother");
                return;
            }
            i--;
        } else {
            var out = Operation.rebase(patch.operations[i], op);
            if (out === op) {
                // op could not be rebased further, insert it here to keep the list ordered.
                patch.operations.splice(i,0,op);
                return;
            } else {
                op = out;
                // op was rebased, try rebasing it against the next operation.
            }
        }
    }
    patch.operations.push(op);
    if (Common.PARANOIA) { check(patch); }
};

var createCheckpoint = Patch.createCheckpoint =
    function (parentContent, checkpointContent, parentContentHash_opt)
{
    var op = Operation.create(0, parentContent.length, checkpointContent);
    if (Common.PARANOIA && parentContentHash_opt) {
        Common.assert(parentContentHash_opt === hash(parentContent));
    }
    parentContentHash_opt = parentContentHash_opt || hash(parentContent);
    var out = create(parentContentHash_opt);
    addOperation(out, op);
    out.isCheckpoint = true;
    return out;
};

var clone = Patch.clone = function (patch) {
    if (Common.PARANOIA) { check(patch); }
    var out = create();
    out.parentHash = patch.parentHash;
    for (var i = 0; i < patch.operations.length; i++) {
        out.operations[i] = Operation.clone(patch.operations[i]);
    }
    return out;
};

var merge = Patch.merge = function (oldPatch, newPatch) {
    if (Common.PARANOIA) {
        check(oldPatch);
        check(newPatch);
    }
    oldPatch = clone(oldPatch);
    for (var i = newPatch.operations.length-1; i >= 0; i--) {
        addOperation(oldPatch, newPatch.operations[i]);
    }
    return oldPatch;
};

var apply = Patch.apply = function (patch, doc)
{
    if (Common.PARANOIA) {
        check(patch);
        Common.assert(typeof(doc) === 'string');
        Common.assert(Sha.hex_sha256(doc) === patch.parentHash);
    }
    var newDoc = doc;
    for (var i = patch.operations.length-1; i >= 0; i--) {
        newDoc = Operation.apply(patch.operations[i], newDoc);
    }
    return newDoc;
};

var lengthChange = Patch.lengthChange = function (patch)
{
    if (Common.PARANOIA) { check(patch); }
    var out = 0;
    for (var i = 0; i < patch.operations.length; i++) {
        out += Operation.lengthChange(patch.operations[i]);
    }
    return out;
};

var invert = Patch.invert = function (patch, doc)
{
    if (Common.PARANOIA) {
        check(patch);
        Common.assert(typeof(doc) === 'string');
        Common.assert(Sha.hex_sha256(doc) === patch.parentHash);
    }
    var rpatch = create();
    var newDoc = doc;
    for (var i = patch.operations.length-1; i >= 0; i--) {
        rpatch.operations[i] = Operation.invert(patch.operations[i], newDoc);
        newDoc = Operation.apply(patch.operations[i], newDoc);
    }
    for (var i = rpatch.operations.length-1; i >= 0; i--) {
        for (var j = i - 1; j >= 0; j--) {
            rpatch.operations[i].offset += rpatch.operations[j].toRemove;
            rpatch.operations[i].offset -= rpatch.operations[j].toInsert.length;
        }
    }
    rpatch.parentHash = Sha.hex_sha256(newDoc);
    if (Common.PARANOIA) { check(rpatch); }
    return rpatch;
};

var simplify = Patch.simplify = function (patch, doc, operationSimplify)
{
    if (Common.PARANOIA) {
        check(patch);
        Common.assert(typeof(doc) === 'string');
        Common.assert(Sha.hex_sha256(doc) === patch.parentHash);
    }
    operationSimplify = operationSimplify || Operation.simplify;
    var spatch = create(patch.parentHash);
    var newDoc = doc;
    var outOps = [];
    var j = 0;
    for (var i = patch.operations.length-1; i >= 0; i--) {
        outOps[j] = operationSimplify(patch.operations[i], newDoc, Operation.simplify);
        if (outOps[j]) {
            newDoc = Operation.apply(outOps[j], newDoc);
            j++;
        }
    }
    spatch.operations = outOps.reverse();
    if (!spatch.operations[0]) {
        spatch.operations.shift();
    }
    if (Common.PARANOIA) {
        check(spatch);
    }
    return spatch;
};

var equals = Patch.equals = function (patchA, patchB) {
    if (patchA.operations.length !== patchB.operations.length) { return false; }
    for (var i = 0; i < patchA.operations.length; i++) {
        if (!Operation.equals(patchA.operations[i], patchB.operations[i])) { return false; }
    }
    return true;
};

var transform = Patch.transform = function (origToTransform, transformBy, doc, transformFunction) {
    if (Common.PARANOIA) {
        check(origToTransform, doc.length);
        check(transformBy, doc.length);
        Common.assert(Sha.hex_sha256(doc) === origToTransform.parentHash);
    }
    Common.assert(origToTransform.parentHash === transformBy.parentHash);
    var resultOfTransformBy = apply(transformBy, doc);

    var toTransform = clone(origToTransform);
    var text = doc;
    for (var i = toTransform.operations.length-1; i >= 0; i--) {
        for (var j = transformBy.operations.length-1; j >= 0; j--) {
            try {
                toTransform.operations[i] = Operation.transform(text,
                                                                toTransform.operations[i],
                                                                transformBy.operations[j],
                                                                transformFunction);
            } catch (e) {
                console.error("The pluggable transform function threw an error, " +
                    "failing operational transformation");
                return create(Sha.hex_sha256(resultOfTransformBy));
            }
            if (!toTransform.operations[i]) {
                break;
            }
        }
        if (Common.PARANOIA && toTransform.operations[i]) {
            Operation.check(toTransform.operations[i], resultOfTransformBy.length);
        }
    }
    var out = create(transformBy.parentHash);
    for (var i = toTransform.operations.length-1; i >= 0; i--) {
        if (toTransform.operations[i]) {
            addOperation(out, toTransform.operations[i]);
        }
    }

    out.parentHash = Sha.hex_sha256(resultOfTransformBy);

    if (Common.PARANOIA) {
        check(out, resultOfTransformBy.length);
    }
    return out;
};

var random = Patch.random = function (doc, opCount) {
    Common.assert(typeof(doc) === 'string');
    opCount = opCount || (Math.floor(Math.random() * 30) + 1);
    var patch = create(Sha.hex_sha256(doc));
    var docLength = doc.length;
    while (opCount-- > 0) {
        var op = Operation.random(docLength);
        docLength += Operation.lengthChange(op);
        addOperation(patch, op);
    }
    check(patch);
    return patch;
};
