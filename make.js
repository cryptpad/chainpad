var Glue = require('gluejs');
var Fs = require('fs');

var g = new Glue();
g.basepath('./client');
g.main('Realtime.js');
g.include('./');
g.exclude(new RegExp('.+\\_test\\.js')) // excludes .test.js
g.export('Realtime');
//g.set('command', 'uglifyjs --no-copyright --m "toplevel"');
g.render(Fs.createWriteStream('./realtime-min.js'));
