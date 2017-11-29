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
//var ChainPad = require('./ChainPad');
var TextTransformer = require('./transform/TextTransformer');

// These are fuzz tests so increasing this number might catch more errors.
var OPERATIONS = 1000;

var addOperationConst = function (origDoc, expectedDoc, operations) {
    //var docx = origDoc;
    var doc = origDoc;
    var patch = Patch.create(Sha.hex_sha256(origDoc));

    //var rebasedOps = [];
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
      TextTransformer
    );

    var p2 = [
        "74065c145b0455b4a48249fdf9a04cf0e3fbcb6d175435851723c976fc6db2b4",
        [ [ 10, 5, "" ] ]
    ];

    Patch.transform(convert(p2), convert(p2), "SofyheYQWsva[NLAGkB", TextTransformer);
};

var transform = function (cycles, callback) {
    transformStatic();
    for (var i = 0; i < 100 * cycles; i++) {
        var docA = Common.randomASCII(Math.floor(Math.random() * 100)+1);
        var patchAB = Patch.random(docA);
        var patchAC = Patch.random(docA);
        var patchBC = Patch.transform(patchAC, patchAB, docA, TextTransformer);
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

module.exports.main = function (cycles /*:number*/, callback /*:()=>void*/) {
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
    }).nThen(callback);
};
