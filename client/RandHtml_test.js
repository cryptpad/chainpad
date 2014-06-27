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
var RandHtml = require('./RandHtml');
var ValidateHtml = require('./ValidateHtml');

var MIN_CHARS = 300;
var MAX_CHARS = 3000;

var cycle = function (chars) {
    var text = RandHtml.randomAscii( (Math.random() * (MAX_CHARS - MIN_CHARS)) + MIN_CHARS );
    var html = RandHtml.textToHtml(text);
    ValidateHtml.validate(html);
};

var main = module.exports.main = function (cycles, callback) {
    for (var i = 0; i < cycles * 100; i++) {
        cycle();
        if (!(i % 10)) { console.log(i); }
    }
    callback();
};
