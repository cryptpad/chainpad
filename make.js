var Glue = require('gluejs');
var Fs = require('fs');

require('./client/Operation_test');
require('./client/Patch_test');
require('./client/ChainPad_test');
console.log("Tests passed.");

var g = new Glue();
g.basepath('./client');
g.main('ChainPad.js');
g.include('./');

// excludes .test.js
g.exclude(new RegExp('.+\\_test\\.js'));

g.export('ChainPad');
//g.set('command', 'uglifyjs --no-copyright --m "toplevel"');
g.render(Fs.createWriteStream('./chainpad.js'));
