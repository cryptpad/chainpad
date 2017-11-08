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
var Os = require('os');

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
    g.include('./TextTransformer.js');
    g.include('./sha256.js');
    g.include('./sha256/exports.js');
    g.include('./sha256/hash.js');
    g.include('./sha256/sha256.asm.js');
    g.include('./sha256/sha256.js');
    g.include('./sha256/utils.js');

    g.export('ChainPad');
    //g.set('command', 'uglifyjs --no-copyright --m "toplevel"');
    g.render(Fs.createWriteStream('./chainpad.js'));
})();

var cycles = 1;
if (process.argv.indexOf('--cycles') !== -1) {
    cycles = process.argv[process.argv.indexOf('--cycles')+1];
    console.log("Running [" + cycles + "] test cycles");
}

var tests = [];
var timeOne = new Date().getTime();

nThen(function (waitFor) {
    var nt = nThen;
    ['./client/', './client/transform/'].forEach(function (path) {
        Fs.readdir(path, waitFor(function (err, ret) {
            if (err) { throw err; }
            ret.forEach(function (file) {
               if (/_test\.js$/.test(file)) {
                   nt = nt(function (waitFor) {
                       tests.push(file);
                       var test = require(path + file);
                       console.log("Running Test " + file);
                       test.main(cycles, waitFor());
                   }).nThen;
               }
            });
            nt(waitFor());
        }));
    });
}).nThen(function (waitFor) {
    console.log("Tests passed.");
    console.log('in ' + (new Date().getTime() - timeOne));
}).nThen(function (waitFor) {

    var g = new Glue();
    g.basepath('./client');
    g.main('AllTests.js');
    g.include('./');
    g.include('../node_modules/nthen/lib/nthen.js');
    g.remap('testNames', JSON.stringify(tests));
    g.export('AllTests');
    //g.set('command', 'uglifyjs --no-copyright --m "toplevel"');
    g.render(Fs.createWriteStream('./alltests.js'));

});
