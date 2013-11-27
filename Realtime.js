var Common = require('./Common');
var Operation = require('./Operation');
var Patch = require('./Patch');

var create = Realtime.create = function () {
    return {
        type: 'Realtime',
        origDoc: '',
        authDoc: '',
        patches: [],
        uncommitted: []
    };
};

var check = Realtime.check = function(ctx) {
    if (!Common.PARANOIA) { return; }
    Common.assert(ctx.type === 'Realtime');
    Common.assert(typeof(ctx.origDoc) === 'string');
    Common.assert(typeof(ctx.authDoc) === 'string');
    Common.assert(Array.isArray(ctx.patches));
    for (var i = 0; i < patches.length; i++) {
        
    }
    Common.assert(Array.isArray(ctx.uncommitted));
};
