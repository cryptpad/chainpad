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

var Operation = {};
var create = Operation.create = function () {
    return {
        type: 'Operation',
        offset: 0,
        toDelete: 0,
        toInsert: '',
    };
};
var check = Operation.check = function (op, docLength_opt) {
    Common.assert(op.type === 'Operation');
    Common.assert(Common.isUint(op.offset));
    Common.assert(Common.isUint(op.toDelete));
    Common.assert(typeof(op.toInsert) === 'string');
    Common.assert(op.toDelete > 0 || op.toInsert.length > 0);
    Common.assert(typeof(docLength_opt) !== 'number' || op.length + op.toDelete <= docLength_opt);
};

var toObj = Operation.toObj = function (op) {
    if (Common.PARANOIA) { check(op); }
    return [op.offset,op.toDelete,op.toInsert];
};

var fromObj = Operation.fromObj = function (obj) {
    Common.assert(Array.isArray(obj) && obj.length === 3);
    var op = create();
    op.offset = obj[0];
    op.toDelete = obj[1];
    op.toInsert = obj[2];
    if (Common.PARANOIA) { check(op); }
    return op;
};

var clone = Operation.clone = function (op) {
    if (Common.PARANOIA) { check(op); }
    var out = create();
    out.offset = op.offset;
    out.toDelete = op.toDelete;
    out.toInsert = op.toInsert;
    return out;
};

/**
 * @param op the operation to apply.
 * @param doc the content to apply the operation on 
 */
var apply = Operation.apply = function (op, doc)
{
    if (Common.PARANOIA) {
        check(op);
        Common.assert(typeof(doc) === 'string');
        Common.assert(op.offset + op.toDelete <= doc.length);
    }
    return doc.substring(0,op.offset) + op.toInsert + doc.substring(op.offset + op.toDelete);
};

var invert = Operation.invert = function (op, doc) {
    if (Common.PARANOIA) {
        check(op);
        Common.assert(typeof(doc) === 'string');
        Common.assert(op.offset + op.toDelete <= doc.length);
    }
    var rop = clone(op);
    rop.toInsert = doc.substring(op.offset, op.offset + op.toDelete);
    rop.toDelete = op.toInsert.length;
    return rop;
};

var lengthChange = Operation.lengthChange = function (op)
{
    if (Common.PARANOIA) { check(op); }
    return op.toInsert.length - op.toDelete;
};

/*
 * @return the merged operation OR null if the result of the merger is a noop.
 */
var merge = Operation.merge = function (oldOpOrig, newOpOrig) {
    if (Common.PARANOIA) {
        check(newOpOrig);
        check(oldOpOrig);
    }

    var newOp = clone(newOpOrig);
    var oldOp = clone(oldOpOrig);
    var offsetDiff = newOp.offset - oldOp.offset;

    if (newOp.toDelete > 0) {
        var origOldInsert = oldOp.toInsert;
        oldOp.toInsert = (
             oldOp.toInsert.substring(0,offsetDiff)
           + oldOp.toInsert.substring(offsetDiff + newOp.toDelete)
        );
        newOp.toDelete -= (origOldInsert.length - oldOp.toInsert.length);
        if (newOp.toDelete < 0) { newOp.toDelete = 0; }

        oldOp.toDelete += newOp.toDelete;
        newOp.toDelete = 0;
    }

    if (offsetDiff < 0) {
        oldOp.offset += offsetDiff;
        oldOp.toInsert = newOp.toInsert + oldOp.toInsert;

    } else if (oldOp.toInsert.length === offsetDiff) {
        oldOp.toInsert = oldOp.toInsert + newOp.toInsert;

    } else if (oldOp.toInsert.length > offsetDiff) {
        oldOp.toInsert = (
            oldOp.toInsert.substring(0,offsetDiff)
          + newOp.toInsert
          + oldOp.toInsert.substring(offsetDiff)
        );
    } else {
        throw new Error("should never happen\n" +
                        JSON.stringify([oldOpOrig,newOpOrig], null, '  '));
    }

    if (oldOp.toInsert === '' && oldOp.toDelete === 0) {
        return null;
    }
    if (Common.PARANOIA) { check(oldOp); }

    return oldOp;
};

/**
 * If the new operation deletes what the old op inserted or inserts content in the middle of
 * the old op's content or if they abbut one another, they should be merged.
 */
var shouldMerge = Operation.shouldMerge = function (oldOp, newOp) {
    if (Common.PARANOIA) {
        check(oldOp);
        check(newOp);
    }
    if (newOp.offset < oldOp.offset) {
        return (oldOp.offset <= (newOp.offset + newOp.toDelete));
    } else {
        return (newOp.offset <= (oldOp.offset + oldOp.toInsert.length));
    }
};

/**
 * Rebase newOp against oldOp.
 *
 * @param oldOp the eariler operation to have happened.
 * @param newOp the later operation to have happened (in time).
 * @return either the untouched newOp if it need not be rebased,
 *                the rebased clone of newOp if it needs rebasing, or
 *                null if newOp and oldOp must be merged.
 */
var rebase = Operation.rebase = function (oldOp, newOp) {
    if (Common.PARANOIA) {
        check(oldOp);
        check(newOp);
    }
    if (newOp.offset < oldOp.offset) { return newOp; }
    newOp = clone(newOp);
    newOp.offset += oldOp.toDelete;
    newOp.offset -= oldOp.toInsert.length;
    return newOp;
};

/**
 * this is a lossy and dirty algorithm, everything else is nice but transformation
 * has to be lossy because both operations have the same base and they diverge.
 * This could be made nicer and/or tailored to a specific data type.
 *
 * @param toTransform the operation which is converted, MUTATED
 * @param transformBy an existing operation which also has the same base.
 * @return nothing, input is mutated
 */
var transform = Operation.transform = function (toTransform, transformBy) {
    if (Common.PARANOIA) {
        check(toTransform);
        check(transformBy);
    }
    if (toTransform.offset > transformBy.offset) {
        //toTransform = clone(toTransform);
        if (toTransform.offset > transformBy.offset + transformBy.toDelete) {
            // simple rebase
            toTransform.offset -= transformBy.toDelete;
            toTransform.offset += transformBy.toInsert.length;
            return;// toTransform;
        }
        // goto the end, anything you deleted that they also deleted should be skipped.
        var newOffset = transformBy.offset + transformBy.toDelete + 1;
        toTransform.toDelete -= (newOffset - toTrandform.offset);
        if (toTransform.toDelete < 0) { toTransform.toDelete = 0; }
        toTransform.offset = newOffset;
        return;// toTransform;
    }
    if (toTransform.offset + toTransform.toDelete < transformBy.offset) {
        return;// toTransform;
    }
    //toTransform = clone(toTransform);
    toTransform.toDelete = transformBy.offset - toTransform.offset;
    return;// toTransform;
};

/** Used for testing. */
var random = Operation.random = function (docLength) {
    Common.assert(Common.isUint(docLength));
    var op = create();
    op.offset = Math.floor(Math.random() * 100000000 % docLength) || 0;
    op.toDelete = Math.floor(Math.random() * 100000000 % (docLength - op.offset)) || 0;
    do {
        op.toInsert = Common.randomASCII(Math.floor(Math.random() * 20));
    } while (op.toDelete === 0 && op.toInsert === '');
    if (Common.PARANOIA) { check(op); }
    return op;
};

module.exports = Operation;
