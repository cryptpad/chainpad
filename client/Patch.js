/*@flow*/
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
"use strict";
var Common = require('./Common');
var Operation = require('./Operation');
var Sha = require('./sha256');

var Patch = module.exports;

/*::
import type {
    Operation_t,
    Operation_Packed_t,
    Operation_Simplify_t,
    Operation_Transform_t
} from './Operation';
import type { Sha256_t } from './sha256';
export type Patch_t = {
    type: 'Patch',
    operations: Array<Operation_t>,
    parentHash: Sha256_t,
    isCheckpoint: boolean,
    mut: {
        inverseOf: ?Patch_t,
    }
};
export type Patch_Packed_t = Array<Operation_Packed_t|Sha256_t>;
export type Patch_Transform_t = (
    toTransform:Array<Operation_t>,
    transformBy:Array<Operation_t>,
    state0:string
) => Array<Operation_t>;
*/

var create = Patch.create = function (parentHash /*:Sha256_t*/, isCheckpoint /*:?boolean*/) {
    var out = Object.freeze({
        type: 'Patch',
        operations: [],
        parentHash: parentHash,
        isCheckpoint: !!isCheckpoint,
        mut: {
            inverseOf: undefined
        }
    });
    if (isCheckpoint) {
        out.mut.inverseOf = out;
    }
    return out;
};

var check = Patch.check = function (patch /*:any*/, docLength_opt /*:?number*/) /*:Patch_t*/ {
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
    return patch;
};

Patch.toObj = function (patch /*:Patch_t*/) {
    if (Common.PARANOIA) { check(patch); }
    var out /*:Array<Operation_Packed_t|Sha256_t>*/ = new Array(patch.operations.length+1);
    var i;
    for (i = 0; i < patch.operations.length; i++) {
        out[i] = Operation.toObj(patch.operations[i]);
    }
    out[i] = patch.parentHash;
    return out;
};

Patch.fromObj = function (obj /*:Patch_Packed_t*/, isCheckpoint /*:?boolean*/) {
    Common.assert(Array.isArray(obj) && obj.length > 0);
    var patch = create(Sha.check(obj[obj.length-1]), isCheckpoint);
    var i;
    for (i = 0; i < obj.length-1; i++) {
        patch.operations[i] = Operation.fromObj(obj[i]);
    }
    if (Common.PARANOIA) { check(patch); }
    return patch;
};

var hash = function (text) {
    return Sha.hex_sha256(text);
};

var addOperation = Patch.addOperation = function (patch /*:Patch_t*/, op /*:Operation_t*/) {
    if (Common.PARANOIA) {
        check(patch);
        Operation.check(op);
    }
    for (var i = 0; i < patch.operations.length; i++) {
        if (Operation.shouldMerge(patch.operations[i], op)) {
            var maybeOp = Operation.merge(patch.operations[i], op);
            patch.operations.splice(i,1);
            if (maybeOp === null) { return; }
            op = maybeOp;
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

Patch.createCheckpoint = function (
    parentContent /*:string*/,
    checkpointContent /*:string*/,
    parentContentHash_opt /*:?string*/)
{
    var op = Operation.create(0, parentContent.length, checkpointContent);
    if (Common.PARANOIA && parentContentHash_opt) {
        Common.assert(parentContentHash_opt === hash(parentContent));
    }
    parentContentHash_opt = parentContentHash_opt || hash(parentContent);
    var out = create(parentContentHash_opt, true);
    out.operations[0] = op;
    return out;
};

var clone = Patch.clone = function (patch /*:Patch_t*/) {
    if (Common.PARANOIA) { check(patch); }
    var out = create(patch.parentHash, patch.isCheckpoint);
    for (var i = 0; i < patch.operations.length; i++) {
        out.operations[i] = patch.operations[i];
    }
    return out;
};

Patch.merge = function (oldPatch /*:Patch_t*/, newPatch /*:Patch_t*/) {
    if (Common.PARANOIA) {
        check(oldPatch);
        check(newPatch);
    }
    if (oldPatch.isCheckpoint) {
        Common.assert(newPatch.parentHash === oldPatch.parentHash);
        if (newPatch.isCheckpoint) {
            return create(oldPatch.parentHash);
        }
        return clone(newPatch);
    } else if (newPatch.isCheckpoint) {
        return clone(oldPatch);
    }
    oldPatch = clone(oldPatch);
    for (var i = newPatch.operations.length-1; i >= 0; i--) {
        addOperation(oldPatch, newPatch.operations[i]);
    }
    return oldPatch;
};

Patch.apply = function (patch /*:Patch_t*/, doc /*:string*/)
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

Patch.lengthChange = function (patch /*:Patch_t*/)
{
    if (Common.PARANOIA) { check(patch); }
    var out = 0;
    for (var i = 0; i < patch.operations.length; i++) {
        out += Operation.lengthChange(patch.operations[i]);
    }
    return out;
};

Patch.invert = function (patch /*:Patch_t*/, doc /*:string*/)
{
    if (Common.PARANOIA) {
        check(patch);
        Common.assert(typeof(doc) === 'string');
        Common.assert(Sha.hex_sha256(doc) === patch.parentHash);
    }
    var newDoc = doc;
    var operations = new Array(patch.operations.length);
    for (var i = patch.operations.length-1; i >= 0; i--) {
        operations[i] = Operation.invert(patch.operations[i], newDoc);
        newDoc = Operation.apply(patch.operations[i], newDoc);
    }
    var opOffsets = new Array(patch.operations.length);
    (function () {
        for (var i = operations.length-1; i >= 0; i--) {
            opOffsets[i] = operations[i].offset;
            for (var j = i - 1; j >= 0; j--) {
                opOffsets[i] += operations[j].toRemove - operations[j].toInsert.length;
            }
        }
    }());
    var rpatch = create(Sha.hex_sha256(newDoc), patch.isCheckpoint);
    rpatch.operations.splice(0, rpatch.operations.length);
    for (var j = 0; j < operations.length; j++) {
        rpatch.operations[j] =
            Operation.create(opOffsets[j], operations[j].toRemove, operations[j].toInsert);
    }
    if (Common.PARANOIA) { check(rpatch); }
    return rpatch;
};

Patch.simplify = function (
    patch /*:Patch_t*/,
    doc /*:string*/,
    operationSimplify /*:Operation_Simplify_t*/ )
{
    if (Common.PARANOIA) {
        check(patch);
        Common.assert(typeof(doc) === 'string');
        Common.assert(Sha.hex_sha256(doc) === patch.parentHash);
    }
    var spatch = create(patch.parentHash);
    var newDoc = doc;
    var outOps = [];
    var j = 0;
    for (var i = patch.operations.length-1; i >= 0; i--) {
        var outOp = operationSimplify(patch.operations[i], newDoc, Operation.simplify);
        if (outOp) {
            newDoc = Operation.apply(outOp, newDoc);
            outOps[j++] = outOp;
        }
    }
    Array.prototype.push.apply(spatch.operations, outOps.reverse());
    if (!spatch.operations[0]) {
        spatch.operations.shift();
    }
    if (Common.PARANOIA) {
        check(spatch);
    }
    return spatch;
};

Patch.equals = function (patchA /*:Patch_t*/, patchB /*:Patch_t*/) {
    if (patchA.operations.length !== patchB.operations.length) { return false; }
    for (var i = 0; i < patchA.operations.length; i++) {
        if (!Operation.equals(patchA.operations[i], patchB.operations[i])) { return false; }
    }
    return true;
};

var isCheckpointOp = function (op, text) {
    return op.offset === 0 && op.toRemove === text.length && op.toInsert === text;
};

Patch.transform = function (
    toTransform /*:Patch_t*/,
    transformBy /*:Patch_t*/,
    doc /*:string*/,
    patchTransformer /*:Patch_Transform_t*/ )
{
    if (Common.PARANOIA) {
        check(toTransform, doc.length);
        check(transformBy, doc.length);
        if (Sha.hex_sha256(doc) !== toTransform.parentHash) { throw new Error("wrong hash"); }
    }
    if (toTransform.parentHash !== transformBy.parentHash) { throw new Error(); }

    var afterTransformBy = Patch.apply(transformBy, doc);
    var out = create(transformBy.mut.inverseOf
        ? transformBy.mut.inverseOf.parentHash
        : Sha.hex_sha256(afterTransformBy),
        toTransform.isCheckpoint
    );

    if (transformBy.operations.length === 0) { return clone(toTransform); }
    if (toTransform.operations.length === 0) {
        if (toTransform.isCheckpoint) { throw new Error(); }
        return out;
    }

    if (toTransform.isCheckpoint ||
        (toTransform.operations.length === 1 && isCheckpointOp(toTransform.operations[0], doc)))
    {
        throw new Error("Attempting to transform a checkpoint, this should not happen");
    }

    if (transformBy.operations.length === 1 && isCheckpointOp(transformBy.operations[0], doc)) {
        if (!transformBy.isCheckpoint) { throw new Error(); }
        return toTransform;
    }

    if (transformBy.isCheckpoint) { throw new Error(); }

    var ops = patchTransformer(toTransform.operations, transformBy.operations, doc);
    Array.prototype.push.apply(out.operations, ops);

    if (Common.PARANOIA) {
        check(out, afterTransformBy.length);
    }

    return out;
};

Patch.random = function (doc /*:string*/, opCount /*:?number*/) {
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

Object.freeze(module.exports);
