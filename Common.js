var Common = {};
Common.PARANOIA = true;

var assert = Common.assert = function (expr) {
    if (!expr) { throw new Error("Failed assertion"); }
};

var isUint = Common.isUint = function (integer) {
    return (typeof(integer) === 'number') &&
        (Math.floor(integer) === integer) &&
        (integer >= 0);
};

var randomASCII = Common.randomASCII = function (length) {
    var content = [];
    for (var i = 0; i < length; i++) {
        content[i] = String.fromCharCode( Math.floor(Math.random()*256) % 94 + 32 );
    }
    return content.join('');
};

module.exports = Common;
