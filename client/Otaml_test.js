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

var makeTextOperation = function(oldval, newval) {
    if (oldval === newval) { return; }

    var begin = 0;
    for (; oldval[begin] === newval[begin]; begin++) ;

    var end = 0;
    for (var oldI = oldval.length, newI = newval.length;
         oldval[--oldI] === newval[--newI];
         end++) ;

    if (end >= oldval.length - begin) { end = oldval.length - begin; }
    if (end >= newval.length - begin) { end = newval.length - begin; }

    return Operation.create(begin,
                            oldval.length - begin - end,
                            newval.slice(begin, newval.length - end));
};

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
    var opAB = makeTextOperation(htmlA, htmlB);

    // It's possible that there is actually no difference, just continue in that case.
    if (!opAB) { return; }

    //opAB = Otaml.expandOp(htmlA, opAB);
    ValidateHtml.validate(htmlB);

    for (var i = 0; i < 100; i++) {

        var htmlC = RandHtml.textToHtml(RandHtml.alterText(text, 10));
        var opAC = makeTextOperation(htmlA, htmlC);

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

var main = module.exports.main = function (cycles, callback) {
    for (var i = 0; i < cycles * 100; i++) {
        cycle();
    }
    callback();
};
