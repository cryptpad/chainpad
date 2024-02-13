/*
 * Copyright 2024 XWiki SAS
 *
 * This is free software; you can redistribute it and/or modify it
 * under the terms of the GNU Lesser General Public License as
 * published by the Free Software Foundation; either version 2.1 of
 * the License, or (at your option) any later version.
 *
 * This software is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public
 * License along with this software; if not, write to the Free
 * Software Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA
 * 02110-1301 USA, or see the FSF site: http://www.fsf.org.
 */
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
