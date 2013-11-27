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
var check = Operation.check = function (op) {
    if (!Common.PARANOIA) { return; }
    if (op.type !== 'Operation' ||
        !Common.isUint(op.offset) ||
        !Common.isUint(op.toDelete) ||
        typeof(op.toInsert) !== 'string' ||
        (op.toDelete === 0 && op.toInsert.length === 0))
    {
        throw new Error(JSON.stringify(op, null, '  ') + ' is not a valid operation');
    }
};

var toObj = Operation.toObj = function (op) {
    check(op);
    return [op.offset,op.toDelete,op.toInsert];
};

var fromObj = Operation.fromObj = function (obj) {
    Common.assert(Array.isArray(obj) && obj.length === 3);
    var op = create();
    op.offset = obj[0];
    op.toDelete = obj[1];
    op.toInsert = obj[2];
    check(op);
    return op;
};

var clone = Operation.clone = function (op) {
    check(op);
    var out = create();
    out.offset = op.offset;
    out.toDelete = op.toDelete;
    out.toInsert = op.toInsert;
    return out;
};

/**
 * @param op the operation to apply.
 * @param doc the content to apply the operation on 
 * @return an array containing the modified document and the reverse operation.
 */
var apply = Operation.apply = function (op, doc)
{
    check(op);
    Common.assert(typeof(doc) === 'string');
    Common.assert(op.offset + op.toDelete <= doc.length);
    var rop = clone(op);
    rop.toInsert = doc.substring(op.offset, op.offset + op.toDelete);
    rop.toDelete = op.toInsert.length;
    return {
        doc: doc.substring(0,op.offset) + op.toInsert + doc.substring(op.offset + op.toDelete),
        inverse: rop
    };
};

var lengthChange = Operation.lengthChange = function (op)
{
    return op.toInsert.length - op.toDelete;
};

/*
 *         |<------oldOpDelete------>|
 *         |<----oldOpInsert--->|
 * |<---------newOpDelete--------->|
 * |<-----newOpInsert---->|
 */


/*
 *         |<------oldOpDelete------>|
 *         |<----oldOpInsert--->|
 * |<---newOpDelete--->|
 * |<-----newOpInsert---->|
 *
 * 1. Merge newOpDelete with oldOpInsert
 *         |<------oldOpDelete------>|
 *         |<--ooi->|
 * |<-nod->|
 * |<-----newOpInsert---->|
 *
 * 2. Expand oldOpDelete with remaining of newOpDelete
 *         |<------oldOpDelete------>|<-nod->|
 *         |<--ooi->|
 * |<-----newOpInsert---->|
 *
 * 3. Insert newOpInsert into oldOpInsert
 *         |<------oldOpDelete------>|<-nod->|
 * |<-----newOpInsert---->|<--ooi->|
 *
 * @return the merged operation OR null if the result of the merger is a noop.
 *
var rmerge = function (oldOp, newOp) {
    check(newOp);
    check(oldOp);
    Common.assert(oldOp.offset >= newOp.offset);
    Common.assert(oldOp.offset <= (newOp.offset + newOp.toInsert.length));

    newOp = clone(newOp);
    oldOp = clone(oldOp);
//negative
    var offsetDiff = newOp.offset - oldOp.offset;

    // 1.
    if (newOp.toDelete > 0) {
        if (newOp.toDelete + offsetDiff > oldOp.toInsert.length) {
            /* newOpDelete runs over the end of oldOpInsert
             *         |<------oldOpDelete------>|
             *         |<----oldOpInsert--->|
             * |<-----------newOpDelete----------->|
             * |<-----newOpInsert---->|
             *
            var origOldInsert = oldOp.toInsert;
            oldOp.toInsert = oldOp.toInsert.substring(0,offsetDiff); // ''
            Common.assert(oldOp.toInsert.length === (offsetDiff < 0 ? offsetDiff : 0));

            newOp.toDelete -= (origOldInsert.length - oldOp.toInsert.length);
            Common.assert(newOp.toDelete > 0);

            // 2.
            oldOp.toDelete += newOp.toDelete;
            newOp.toDelete = 0;
        } else {
            /* newOpDelete deletes only part of oldOpInsert
             *         |<------oldOpDelete------>|
             *         |<----oldOpInsert--->|
             * |<---newOpDelete--->|
             * |<-----newOpInsert---->|
             *
            oldOp.toInsert = (
                 oldOp.toInsert.substring(0,offsetDiff)
               + oldOp.toInsert.substring(offsetDiff + newOp.toDelete)
            );
            newOp.toDelete = 0;
        }
    }

    // 3.
    if (oldOp.toInsert.length === offsetDiff) {
        oldOp.toInsert = oldOp.toInsert + newOp.toInsert;

    } else if (oldOp.toInsert.length > offsetDiff) {
        oldOp.toInsert = (
            oldOp.toInsert.substring(0,offsetDiff)
          + newOp.toInsert
          + oldOp.toInsert.substring(offsetDiff)
        );
    } else {
        throw new Error("should never happen");
    }

    if (oldOp.toInsert === '' && oldOp.toDelete === 0) {
        return null;
    }
    check(oldOp);
    return oldOp;
};
*/
/*
 * |<------oldOpDelete------>|
 * |<----oldOpInsert--->|
 *         |<---newOpDelete--->|
 *         |<-----newOpInsert---->|
 *
 * 1. Merge newOpDelete with oldOpInsert
 * |<------oldOpDelete------>|
 * |<-ooi->|
 *         |<-nod>|
 *         |<-----newOpInsert---->|
 *
 * 2. Expand oldOpDelete with remaining of newOpDelete
 * |<----------oldOpDelete--------->|
 * |<-ooi->|
 *         |<-----newOpInsert---->|
 *
 * 3. Insert newOpInsert into oldOpInsert
 * |<-------oldOpDelete------->|
 * |<-ooi->|<-----newOpInsert---->|
 *
 * @return the merged operation OR null if the result of the merger is a noop.
 */
var merge = Operation.merge = function (oldOp, newOp) {
    check(newOp);
    check(oldOp);
    Common.assert(newOp.offset >= oldOp.offset);
    Common.assert(newOp.offset <= (oldOp.offset + oldOp.toInsert.length));

    newOp = clone(newOp);
    oldOp = clone(oldOp);
    var offsetDiff = newOp.offset - oldOp.offset;

    // 1.
    if (newOp.toDelete > 0) {
        if (newOp.toDelete + offsetDiff > oldOp.toInsert.length) {
            /* newOpDelete runs over the end of oldOpInsert
             * |<------oldOpDelete------>|
             * |<----oldOpInsert--->|
             *         |<---newOpDelete--->|
             *         |<-----newOpInsert---->|
             */
            var origOldInsert = oldOp.toInsert;
            oldOp.toInsert = oldOp.toInsert.substring(0,offsetDiff);
            Common.assert(oldOp.toInsert.length === offsetDiff);

            newOp.toDelete -= (origOldInsert.length - oldOp.toInsert.length);
            Common.assert(newOp.toDelete > 0);

            // 2.
            oldOp.toDelete += newOp.toDelete;
            newOp.toDelete = 0;
        } else {
            /* newOpDelete deletes only part of oldOpInsert
             * |<------oldOpDelete------>|
             * |<------------------------oldOpInsert--------------------->|
             *                                |<---newOpDelete--->|
             *                                |<----------newOpInsert--------->|
             */
            oldOp.toInsert = (
                 oldOp.toInsert.substring(0,offsetDiff)
               + oldOp.toInsert.substring(offsetDiff + newOp.toDelete)
            );
            newOp.toDelete = 0;
        }
    }

    // 3.
    if (oldOp.toInsert.length === offsetDiff) {
        oldOp.toInsert = oldOp.toInsert + newOp.toInsert;

    } else if (oldOp.toInsert.length > offsetDiff) {
        oldOp.toInsert = (
            oldOp.toInsert.substring(0,offsetDiff)
          + newOp.toInsert
          + oldOp.toInsert.substring(offsetDiff)
        );
    } else {
        throw new Error("should never happen");
    }

    if (oldOp.toInsert === '' && oldOp.toDelete === 0) {
        return null;
    }
    check(oldOp);
    return oldOp;
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
    if (newOp.offset < oldOp.offset) { return newOp; }
    if (newOp.offset <= (oldOp.offset + oldOp.toInsert.length)) { return null; }
    newOp = clone(newOp);
    newOp.offset += oldOp.toDelete;
    newOp.offset -= oldOp.toInsert.length;
    return newOp;
};

/**
 * @param toTransform the operation which is converted
 * @param transformBy an existing operation which took place before toTransform
 * @return an array of operations which represent the transformed operation.
 */
var transform = Operation.transform = function (toTransform, transformBy) {
    if (toTransform.offset <= transformBy.offset) {
        if (toTransform.offset + toTransform.toDelete <= transformBy.offset) {
            // they don't touch
            return;
        }

        if (toTransform.offset + toTransform.toDelete <= transformBy.offset + transformBy.toDelete)
        {
            // they delete some of the same content, now toTransform deletes only everything up to
            // the beginning of transformBy
            toTransform.toDelete = transformBy.offset - toTransform.offset;
            return;
        }

        // toTransform deletes more than everything that transformBy deletes.
        // This is the case of Alice typing some content in a paragraph and Bob deleting the whole
        // paragraph. Algorithmically it seems right that Alice's content should stay since Bob
        // has never even had a chance to read it, let alone decide to delete it, but on the other
        // hand, Alice's work will be left in the middle of nowhere with no context and therefor
        // it is decided that Bob's deletion of the paragraph should take Alice's content along with
        // it.
        // TODO this is also the case when Alice is typing and bob is pressing delete and he
        //      reaches the first letter typed by Alice and hits delete once, maybe a better way?
        toTransform.toDelete += transformBy.toInsert.length;
        return;
    }
    // toTransform offset exceeds transformBy offset.
    throw new Error("TODO :)");
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
    check(op);
    return op;
};

module.exports = Operation;
