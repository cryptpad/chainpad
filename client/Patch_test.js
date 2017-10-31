/*@flow*/
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
"use strict";
var Common = require('./Common');
var Operation = require('./Operation');
var Patch = require('./Patch');
var Sha = require('./sha256');
var nThen = require('nthen');

// These are fuzz tests so increasing this number might catch more errors.
var OPERATIONS = 1000;

var addOperationConst = function (origDoc, expectedDoc, operations) {
    var docx = origDoc;
    var doc = origDoc;
    var patch = Patch.create(Sha.hex_sha256(origDoc));

    var rebasedOps = [];
    for (var i = 0; i < operations.length; i++) {
        Patch.addOperation(patch, operations[i]);
        // sanity check
        doc = Operation.apply(operations[i], doc);
    }
    Common.assert(doc === expectedDoc);

    doc = Patch.apply(patch, origDoc);

    Common.assert(doc === expectedDoc);

    return patch;
};

var addOperationCycle = function () {
    var origDoc = Common.randomASCII(Math.floor(Math.random() * 5000)+1);
    var operations = [];
    var doc = origDoc;
    for (var i = 0; i < Math.floor(Math.random() * OPERATIONS) + 1; i++) {
        var op = operations[i] = Operation.random(doc.length);
        doc = Operation.apply(op, doc);
    }

    var patch = addOperationConst(origDoc, doc, operations);

    return {
        operations: operations,
        patchOps: patch.operations
    };
};

var addOperation = function (cycles, callback) {

    var opsLen = 0;
    var patchOpsLen = 0;
    for (var i = 0; i < 100 * cycles; i++) {
        var out = addOperationCycle();
        opsLen += out.operations.length;
        patchOpsLen += out.patchOps.length;
    }
    var mcr = Math.floor((opsLen / patchOpsLen) * 1000) / 1000;
    console.log("Merge compression ratio: " + mcr + ":1");
    callback();
};

var toObjectFromObject = function (cycles, callback) {
    for (var i = 0; i < cycles * 100; i++) {
        var docA = Common.randomASCII(Math.floor(Math.random() * 100)+1);
        var patch = Patch.random(docA);
        var patchObj = Patch.toObj(patch);
        var patchB = Patch.fromObj(patchObj);
        Common.assert(JSON.stringify(patch) === JSON.stringify(patchB));
    }
    callback();
};

var applyReversibility = function (cycles, callback) {
    for (var i = 0; i < cycles * 100; i++) {
        var docA = Common.randomASCII(Math.floor(Math.random() * 2000));
        var patch = Patch.random(docA);
        var docB = Patch.apply(patch, docA);
        var docAA = Patch.apply(Patch.invert(patch, docA), docB);
        Common.assert(docAA === docA);
    }
    callback();
};

var merge = function (cycles, callback) {
    for (var i = 0; i < cycles * 100; i++) {
        var docA = Common.randomASCII(Math.floor(Math.random() * 5000)+1);
        var patchAB = Patch.random(docA);
        var docB = Patch.apply(patchAB, docA);
        var patchBC = Patch.random(docB);
        var docC = Patch.apply(patchBC, docB);
        var patchAC = Patch.merge(patchAB, patchBC);
        var docC2 = Patch.apply(patchAC, docA);
        Common.assert(docC === docC2);
    }
    callback();
};

var convert = function (p) {
    var out = Patch.create(p[0]);
    p[1].forEach(function (o) { out.operations.push(Operation.create.apply(null, o)); });
    return out;
};

var transformStatic = function () {
    var p0 = [
        "0349d89ef3eeca9b7e2b7b8136d8ffe43206938d7c5df37cb3600fc2cd1df235",
        [ [4, 63, "VAPN]Z[bwdn\\OvP"], [ 88, 2, "" ] ]
    ];
    var p1 = [
        "0349d89ef3eeca9b7e2b7b8136d8ffe43206938d7c5df37cb3600fc2cd1df235",
        [ [ 0, 92, "[[fWjLRmIVZV[BiG^IHqDGmCuooPE" ] ]
    ];

    Patch.transform(
      convert(p0),
      convert(p1),
      "_VMsPV\\PNXjQiEoTdoUHYxZALnDjB]onfiN[dBP[vqeGJJZ\\vNaQ`\\Y_jHNnrHOoFN^UWrWjCKoKe" +
          "D[`nosFrM`EpY\\Ib",
      Operation.transform0
    );

    var p2 = [
        "74065c145b0455b4a48249fdf9a04cf0e3fbcb6d175435851723c976fc6db2b4",
        [ [ 10, 5, "" ] ]
    ];

    Patch.transform(convert(p2), convert(p2), "SofyheYQWsva[NLAGkB", Operation.transform0);
};

var transform = function (cycles, callback) {
    transformStatic();
    for (var i = 0; i < 100 * cycles; i++) {
        var docA = Common.randomASCII(Math.floor(Math.random() * 100)+1);
        var patchAB = Patch.random(docA);
        var patchAC = Patch.random(docA);
        var patchBC = Patch.transform(patchAC, patchAB, docA, Operation.transform0);
        var docB = Patch.apply(patchAB, docA);
        Patch.apply(patchBC, docB);
    }
    callback();
};

var simplify = function (cycles, callback) {
    for (var i = 0; i  < 100 * cycles; i++) {
        // use a very short document to cause lots of common patches.
        var docA = Common.randomASCII(Math.floor(Math.random() * 50)+1);
        var patchAB = Patch.random(docA);
        var spatchAB = Patch.simplify(patchAB, docA, Operation.simplify);
        var docB = Patch.apply(patchAB, docA);
        var sdocB = Patch.apply(spatchAB, docA);
        Common.assert(sdocB === docB);
    }
    callback();
};

var transform2 = function (cb) {
    var O = "[\"BODY\",{\"class\":\"cke_editable cke_editable_themed cke_contents_" +
        "ltr cke_show_borders\",\"contenteditable\":\"true\",\"spellcheck\":\"fal" +
        "se\"},[[\"P\",{},[\" The quick red fox jumps over the lazy brown dog" +
        ". The quick red fox jumps over 2 people typing on the same line " +
        "at the same time. here ?\",[\"BR\",{},[]]]],[\"P\",{},[\"imtypingve th" +
        "is is a testroverneu sjnn this is a tes\",[\"BR\",{},[]]]],[\"P\",{}," +
        "[\"Let me put my cursor in front of yours....\"]],[\"P\",{},[\"typewi" +
        "hhyubf.sihiuhubmnbubihf.joktype behind me on the same line\",[\"BR" +
        "\",{},[]]]],[\"P\",{},[\"iinininiivrvjkni;nin;iniooooooooooooooonnnn" +
        "nnnnnnnnnnfrwoinfiwnugnkxuffwop  fihirhgoxhg...eejrngvkxxxxxxxxf" +
        "ijgbjbokw,dmgbofssfiogohxxx:)  here this is a test this is a tes" +
        "t this is a test hmm it to mostly work. I don't see any corsor  " +
        "jung seems\",[\"BR\",{},[]]]],[\"P\",{},[\"This is a test\",[\"BR\",{},[]" +
        "]]],[\"P\",{},[\"The quick red fox jumps over the lazy hello world " +
        "this is a test brown dog. The quick ryrown dog. The quick red fo" +
        "x jumps over the lazy brown dog. The quick red fox jumps over th" +
        "e lazy brown dog. The quick red  bezdaver te lh ps ofoumx j this" +
        " is a tstThThTh\",[\"BR\",{},[]]]],[\"P\",{},[\"The quick red fox jump" +
        "s over the lazy brown dog. The quic The quick red fox jumps over" +
        " the lazy lazy browo The quick red fox jumps over the lazy brown" +
        " dog. The quick red fox jumps over the lazy brown dog. The quick" +
        " red fox jumps over the lazy brown dog. The quick red fox jumps " +
        "over the lazy brown dog. The quick red fox jumps over the lazy b" +
        "rown dog. The quick red fox jumps over the lazy brown dog. The q" +
        "uick red fox jumps over the lazy brown dog. The quick red fox ju" +
        "mps over the lazg brown dog. The quick red fox jumps over the la" +
        "zy brown dog. The.quick red fox jumps over the lazy brown dog. T" +
        "he quick red fox jumps over the lazy brown dog. The quick red fo" +
        "x jumps over the lazy brown dog.nTh  quick red fox jumps over th" +
        "e lazy brown dog. The quick red passing trains that have no name" +
        ", switchyards full of old black men and graveyards full of ruste" +
        "d automobiles. this is a test hello world this is a est, test te" +
        "st test, yes this is a test. Riding on the city of new orleans, " +
        "illinois central, monday morning rail. fifteen cars and fifteen " +
        "restless riders, three conductors and twenty four sacks of mail." +
        " All along the southbound oddessy the train pulls out of kankeke" +
        "e and moves along past houses, farms and fields Happy days. \",[\"" +
        "BR\",{},[]]]],[\"P\",{},[\"This is a test\"]],[\"P\",{},[[\"BR\",{},[]]]]" +
        ",[\"P\",{},[\" The quick red fox jumps over the lazy brown dog. The" +
        " quick red fox jumps over the lazy brown dog. The quick red fox " +
        "jumps over the lazy brown dog. The quick red fox jumps over the " +
        "lazy brown dog. The quick red fox jumps over the lazy brown dog." +
        " The quick red fox jumps ovethis isazy brown dog. The quick red " +
        "fox jumps over the lazy brown dog. The quick red fox jumps over " +
        "the lazy brown dog. The quick red fox jumps over the lazy brown " +
        "do a test hello world this is a test hello this is a test world " +
        "hello this i test The quick red fox jumps over the lazy brown do" +
        "g. The quick red fox jumps over the lazy brown dog. The quick re" +
        "d fox jumps over the lazy brown dog. The quick red fox jumps ove" +
        "r the lazy brown dog. The quick red fox jumps over the lazy brow" +
        "n dog. The quick red fox jumps ovethis is a test hello world thi" +
        "s is a test hello this is a test world hello this i The quick re" +
        "d fox jumps over the lazy brown dog. The quick red fox jumps ove" +
        "r the lazy brown dog. The quick red fox jumps over the lazy brow" +
        "n dog. The quick red fox jumps over the lazy brown dog. The quic" +
        "k red fox jumps over the lazy brown dog. The quick red fox jumps" +
        " over ththis is a test hello world this is a test hello this is " +
        "a  The quick red fox jumps over the lazy brown dog. The quick re" +
        "d fox jumps over the lazy brown dog. The quick red fox jumps ove" +
        "r the lazy brown test The quick red fox jumps over the la world " +
        "the quick brown fox jumped over the lazy do The quick red fox ju" +
        "mps over the lazy brown dog. The quick red fox jumps over the la" +
        "zy brown dog. The quick red fox jumps over the lazy brown dog. T" +
        "he quick red fox jumps over the lazy brown dog. The quick red fo" +
        "x jumps over the lazy brown dog. The quick red fox jumps ovethis" +
        " isazy brown dog. The quick red fox jumps over the lazy brown do" +
        "g. The quick red fox jumps over the lazy brown dog. The quick re" +
        "d fox jumps over the lazy brown do a test hello world this is a " +
        "test hello this is a test world hello this i test The quick red " +
        "fox jumps over the lazy brown dog. The quick red fox jumps over " +
        "the lazy brown dog. The quick red fox jumps over the lazy brown " +
        "dog. The quick red fox jumps over the lazy brown dog. The quick " +
        "red fox jumps over the lazy brown dog. The quick red fox jumps o" +
        "vethis is a test hello world this is a test hello this is a test" +
        " world hello this i The quick red fox jumps over the lazy brown " +
        "dog. The quick red fox jumps over the lazy brown dog. The quick " +
        "red fox jumps over the lazy brown dog. The quick red fox jumps o" +
        "ver the lazy brown dog. The quick red fox jumps over the lazy br" +
        "own dog. The quick red fox jumps over ththis is a test hello wor" +
        "ld this is a test hello this is a  The quick red fox jumps over " +
        "the lazy brown dog. The quick red fox jumps over the lazy brown " +
        "dog. The quick red fox jumps over the lazy brown dog.test world " +
        "the quick brown fox jumped over the lazy dog- hello this is test" +
        " hello world hello world this i s atest this is a test the quick" +
        " brown fox jumped over the lazy dog\",[\"BR\",{},[]]]],[\"P\",{},[[\"B" +
        "R\",{},[]]]],[\"P\",{},[\" The quick red fox jumps oveThise lazy bro" +
        "wn dog. The quick red fox jumps over the l is brown dog. The qui" +
        "ck red fox jumps over the lazy brown dog. The quick red The qui " +
        "The quick red fox jumps oveThise lazy brown dog. The quick red f" +
        "ox jumps over the lazy  is The quick red fox jumps over thThis i" +
        "s a test hello wo\",[\"BR\",{},[]]]],[\"P\",{},[\" The quick red fox j" +
        "umps over the lazy brown dog. The quick red fox jumps over the l" +
        "azy brown dog. The quick red fox jumps over the lazy brown dog. " +
        "The quick red fox jumps over the lazy brown dog. The quick red f" +
        "ox jumps over the lazy brown dog. The quick red fox jumps over t" +
        "he lazy brown dThis this is a test test this is a test hello wor" +
        "ld this is a  The quick red fox jumps over the lazy brown dog. T" +
        "he quick red fox jumps over the lazy brown dog. The quick red fo" +
        "x jumps over the lazy brown dog. The qui The thi sis a test this" +
        " this is a tetest hello world this is a tes\",\" quick red fox jum" +
        "ps over the lazy brown dog. The quick red fox jumps over the laz" +
        "y brown dog. The quick red fox jumps over the lazy brown dog. Th" +
        "e quick red fox jumps over the lazy brown dog. The quick red fox" +
        " jumps over test test test test hello worl this is a test hello " +
        "hello world this is atest\",[\"BR\",{},[]]]]],{\"metadata\":{\"default" +
        "Title\":\"Rich text - Mon, October 9, 2017\",\"title\":\"Rich text - M" +
        "on, October 9, 2017\",\"type\":\"pad\",\"users\":{\"27db49daedfaff042bb7" +
        "86d7140793ea\":{\"name\":\"\",\"netfluxId\":\"27db49daedfaff042bb786d714" +
        "0793ea\",\"uid\":\"36e2f7d190eabe5499aa0c2a622e27c6\"},\"9c019d52e0fcb" +
        "e1d7293237b57eaccf8\":{\"name\":\"\",\"netfluxId\":\"9c019d52e0fcbe1d729" +
        "3237b57eaccf8\",\"uid\":\"e27be495a398226daf3da500ebbe997b\"}}}}]";

    var transformBy = convert([
        "53bdf623408e00f19aebd8a436d47d6b2c0e2b16b103498afd169910967814ee",
        [ [6312,0,"ck"], [6313,0," "], [6379,3,""] ]
    ]);
    
    var toTransform = convert([
        "53bdf623408e00f19aebd8a436d47d6b2c0e2b16b103498afd169910967814ee",
        [ [6375,8,'"," '] ]
    ]);

    var res = Patch.transform(
        toTransform,
        transformBy,
        O,
        function (text, toTransform, transformBy) {
            var result = Operation.transform0(text, toTransform, transformBy);
            var resultTest = Operation.apply(result, text);
            JSON.parse(resultTest);
            return result;
        }
    );
    JSON.parse(Patch.apply(res, O));

    cb();
};

var main = module.exports.main = function (cycles /*:number*/, callback /*:()=>void*/) {
    nThen(function (waitFor) {
        simplify(cycles, waitFor());
    }).nThen(function (waitFor) {
        transform(cycles, waitFor());
    }).nThen(function (waitFor) {
        addOperation(cycles, waitFor());
    }).nThen(function (waitFor) {
        toObjectFromObject(cycles, waitFor());
    }).nThen(function (waitFor) {
        applyReversibility(cycles, waitFor());
    }).nThen(function (waitFor) {
        merge(cycles, waitFor());
    }).nThen(function (waitFor) {
        transform2(waitFor());
    }).nThen(callback);
};
