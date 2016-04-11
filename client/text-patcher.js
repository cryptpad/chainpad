/* applyChange takes:
    ctx: the context (aka the realtime)
    oldval: the old value
    newval: the new value

    it performs a diff on the two values, and generates patches
    which are then passed into `ctx.remove` and `ctx.insert`
*/
var applyChange = function(ctx, oldval, newval) {
    // Strings are immutable and have reference equality. I think this test is O(1), so its worth doing.
    if (oldval === newval) {
        return;
    }

    var commonStart = 0;
    while (oldval.charAt(commonStart) === newval.charAt(commonStart)) {
        commonStart++;
    }

    var commonEnd = 0;
    while (oldval.charAt(oldval.length - 1 - commonEnd) === newval.charAt(newval.length - 1 - commonEnd) &&
        commonEnd + commonStart < oldval.length && commonEnd + commonStart < newval.length) {
        commonEnd++;
    }

    var toRemove = 0;
    var toInsert = "";

    /*  throw some assertions in here before dropping patches into the realtime

    */

    if (oldval.length !== commonStart + commonEnd) {
        if (ctx.localChange) { ctx.localChange(true); }
        toRemove = oldval.length - commonStart - commonEnd;
        ctx.remove(commonStart, toRemove);
        console.log('removal at position: %s, length: %s', commonStart, toRemove);
        console.log("remove: [" + oldval.slice(commonStart, commonStart + toRemove) + ']');
    }
    if (newval.length !== commonStart + commonEnd) {
        if (ctx.localChange) { ctx.localChange(true); }
        toInsert = newval.slice(commonStart, newval.length - commonEnd);
        ctx.insert(commonStart, toInsert);
        console.log("insert: [" + toInsert + "]");
    }
    if (toInsert.indexOf('"') !== -1) { throw new Error(); }
    if (oldval.slice(commonStart, commonStart + toRemove).indexOf('"') !== -1) { throw new Error(); }
    return {
        type: 'Operation',
        offset: commonStart,
        toRemove: toRemove,
        toInsert: toInsert
    };
};

var create = function(config) {
    var ctx = config.realtime;

    // initial state will always fail the !== check in genop.
    // because nothing will equal this object
    var content = {};

    // *** remote -> local changes
    ctx.onPatch(function(pos, length) {
        content = ctx.getUserDoc()
    });

    // propogate()
    return function (newContent) {
        var op;
        //if (ctx.getUserDoc() !== content) { throw new Error(); }
        if (newContent !== ctx.getUserDoc()) {
            op = applyChange(ctx, ctx.getUserDoc(), newContent);
            if (ctx.getUserDoc() !== newContent) {
                console.log("Expected that: `ctx.getUserDoc() === newContent`!");
            }
            return op;
        }
        return { /// TODO: internally we represent do-nothing ops as null :)
            type: 'Operation',
            offset: 0,
            toInsert: '',
            toRemove: 0
        };
    };
};

module.exports = { create: create };
