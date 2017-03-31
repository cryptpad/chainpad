var DATA = new Array(300).fill(
    "The researchers demonstrated that their new battery cells have at least three times as " +
    "much energy density as today’s lithium-ion batteries"
).join('');

var old = require('../SHA256.js');
var asm = require('./exports.js');

var res;
var t0 = (+new Date());
for (var i = 0; i < 1000; i++) { res = old.hex_sha256(DATA); }
console.log('old ' + res + '  ' + ((+new Date()) - t0));

var t0 = (+new Date());
for (var i = 0; i < 1000; i++) { asm.hex(DATA); }
console.log('new ' + res + '  ' + ((+new Date()) - t0));
