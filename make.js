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
var Glue = require('gluejs');
var Fs = require('fs');
var nThen = require('nthen');

(function buildChainpad() {
    var g = new Glue();
    g.basepath('./client');
    g.main('ChainPad.js');
    g.include('./ChainPad.js');
    g.include('./Message.js');
    g.include('./SHA256.js');
    g.include('./Common.js');
    g.include('./Patch.js');
    g.include('./Operation.js');

    g.export('ChainPad');
    //g.set('command', 'uglifyjs --no-copyright --m "toplevel"');
    g.render(Fs.createWriteStream('./chainpad.js'));
})();

(function buildOtaml() {
    var g = new Glue();
    g.basepath('./client');
    g.main('Otaml.js');
    g.include('./Otaml.js');
    g.include('./SHA256.js');
    g.include('./Common.js');
    g.include('./Operation.js');
    g.include('./HtmlParse.js');

    g.export('Otaml');
    //g.set('command', 'uglifyjs --no-copyright --m "toplevel"');
    g.render(Fs.createWriteStream('./otaml.js'));
})();



var cycles = 1;
if (process.argv.indexOf('--cycles') !== -1) {
    cycles = process.argv[process.argv.indexOf('--cycles')+1];
    console.log("Running [" + cycles + "] test cycles");
}

var nt = nThen;
nThen(function (waitFor) {
    ['./client/'].forEach(function (path) {
        Fs.readdir(path, waitFor(function (err, ret) {
            if (err) { throw err; }
            ret.forEach(function (file) {
               if (/_test\.js/.test(file)) {
                   nt = nt(function (waitFor) {
                       var test = require(path + file);
                       console.log("Running Test " + path + file);
                       test.main(cycles, waitFor());
                   }).nThen;
               }
            });
        }));
    });
}).nThen(function (waitFor) {
    nt(waitFor());
}).nThen(function (waitFor) {
    console.log("Tests passed.");
});
