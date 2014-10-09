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
var Otaml = require('./Otaml');
var ValidateHtml = require('./ValidateHtml');
var RandHtml = require('./RandHtml');
var Operation = require('./Operation');

var displayOp = function (stateA, op) {
    var toRemove = stateA.substr(op.offset, op.toRemove).replace(/\n/g, '\\n');
    var toInsert = op.toInsert.replace(/\n/g, '\\n');
    console.log('{\n    offset: ' + op.offset + ',\n    toRemove: ' + op.toRemove +
        ' (``' + toRemove + "'')\n    toInsert: ``" + toInsert + "''" + "\n}\n");
};

/*
 *       A
 *     /   \
 *    /     \
 *   B       C
 *    \     /
 *     \   /
 *       D
 */
var cycle = function () {
    var text = RandHtml.randomAscii(100);
    var htmlA = RandHtml.textToHtml(text);

    var htmlB = RandHtml.textToHtml(RandHtml.alterText(text, 10));
    var opAB = Otaml.makeTextOperation(htmlA, htmlB);

    // It's possible that there is actually no difference, just continue in that case.
    if (!opAB) { return; }

    //opAB = Otaml.expandOp(htmlA, opAB);
    ValidateHtml.validate(htmlB);

    for (var i = 0; i < 100; i++) {

        var htmlC = RandHtml.textToHtml(RandHtml.alterText(text, 10));
        var opAC = Otaml.makeTextOperation(htmlA, htmlC);

        if (!opAC) { continue; }

        //opAC = Otaml.expandOp(htmlA, opAC);

        var htmlC = Operation.apply(opAC, htmlA);
        ValidateHtml.validate(htmlC);


        var opBD = Operation.clone(opAC);
        opBD = Otaml.transform(htmlA, opBD, opAB);

        if (!opBD) { continue; }

        var htmlD = Operation.apply(opBD, htmlB);

        try {
            ValidateHtml.validate(htmlD);
        } catch (e) {
            console.log("Original:\n");
            console.log(htmlA);
            console.log("\nOpAB:");
            console.log(displayOp(htmlA, opAB));
            console.log("\nStateB:\n");
            console.log(htmlB);
            console.log("\nOpAC:");
            console.log(displayOp(htmlA, opAC));
            console.log("\nStateC:\n");
            console.log(htmlC);
            console.log("\nOpBD:");
            console.log(displayOp(htmlB, opBD));
            console.log("\nFinal:");
            console.log(htmlD);
            throw e;
        }
    }
};

var testMakeHTMLOperation = function () {
    var oldval = [
        '&lt;wxw&lt;w&lt;xjsssssshsshygbqsdqsdqsdsdjsdccssdcssdsdcsdc<p><br></p><p>sdcc<br></p><ul>',
        '<li><table style="font-family: sans-serif; font-size: 14px;"><thead><tr><th>j&nbsp;</th><t',
        'h>j qcsdcqscqsd</th></tr></thead><tbody><tr><td>&nbsp;qx&lt;w&lt;x&lt;ww&lt;sds</td><td>&n',
        'bsp;<strong><em><ins>qqsdcqddqdss</ins></em></strong></td></tr></tbody></table><br></li><l',
        'i>sxssx&lt;sxq&lt;&lt;wxw&lt;&lt;wxw<br></li></ul>w&lt;xsxqs<br><ol><li><h3>ssxsxqxsqfg</h',
        '3></li><li>LHJMKh</li><li>qslcnqsdbm</li><li>q,cpqsf<span style="font-size: 1.61em; line-h',
        'eight: 1.2em;">vbjjjjjqsccqsdcxqdjhkqdcddckdcqqjkcd jnopejzadhhhj</span></li></ol><p>hjjhh',
        'ggghgg I\'m here and it seems the cursjhklor is ssdssdsdso<br></p><table><thead><tr><th>jh',
        'klhjkl&nbsp;</th><th>&nbsp;hh</th></tr></thead><tbody><tr><td>&nbsp;g</td><td>scdsqxdqsxsq',
        'xcqdscdqs <br></td></tr></tbody></table><strong>vbdazadzscc</strong> s<br><p>qsxdqsjjighug',
        'ggggihjccsd</p><p>qsxqs</p><p>sxxqss<br></p>'
    ].join('');

    var newval = [
        '&lt;wxw&lt;w&lt;xjsssssshsshygbqsdqsdqsdsdjsdccssdcssdsdcsdc<p><br></p><p>sdcc<br></p><ul>',
        '<li><table style="font-family: sans-serif; font-size: 14px;"><thead><tr><th>j&nbsp;</th><t',
        'h>j qcsdcqscqsd</th></tr></thead><tbody><tr><td>&nbsp;qx&lt;w&lt;x&lt;ww&lt;sds</td><td>&n',
        'bsp;<strong><em><ins>qqsdcqddqdss</ins></em></strong></td></tr></tbody></table><br></li><l',
        'i>sxssx&lt;sxq&lt;&lt;wxw&lt;&lt;wxw<br></li></ul>w&lt;xsxqs<br><ol><li><h3>ssxsxqxsqfg</h',
        '3></li><li>LHJMKh</li><li>qslcnqsdbm</li><li>q,cpqsfgj<span style="font-size: 1.61em; line',
        '-height: 1.2em;">vbjjjjjqsccqsdcxqdjhkqdcddckdcqqjkcd jnopejzadhhhj</span></li></ol><p>hjj',
        'hhggghgg I\'m here and it seems the cursjhklor is ssdssdsdso<br></p><table><thead><tr><th>',
        'jhklhjkl&nbsp;</th><th>&nbsp;hh</th></tr></thead><tbody><tr><td>&nbsp;g</td><td>scdsqxdqsx',
        'sqxcqdscdqs <br></td></tr></tbody></table><strong>vbdazadzscc</strong> s<br><p>qsxdqsjjigh',
        'ugggggihjccsd</p><p>qsxqs</p><p>sxxqss<br></p>'
    ].join('');

    Otaml.makeHTMLOperation(oldval, newval);
};

var main = module.exports.main = function (cycles, callback) {
    testMakeHTMLOperation();
    for (var i = 0; i < cycles * 10; i++) {
        cycle();
    }
    callback();
};
