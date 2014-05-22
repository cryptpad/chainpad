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

var g = new Glue();
g.basepath('./client');
g.main('ChainPad.js');
g.include('./');

// excludes .test.js
g.exclude(new RegExp('.+\\_test\\.js'));

g.export('ChainPad');
//g.set('command', 'uglifyjs --no-copyright --m "toplevel"');
g.render(Fs.createWriteStream('./chainpad.js'));

require('./client/Operation_test');
require('./client/Patch_test');
require('./client/ChainPad_test');
console.log("Tests passed.");
