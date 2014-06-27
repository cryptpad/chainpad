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
var Elements = require('./Elements');
var HtmlParse = require('./HtmlParse');

/**
 * @param tag the content between the initial < character and the terminal >
 *        character for an html tag.
 * @return true if and only if the content of the tag seems valid (we're not
 *         the W3C, a lot of invalid crap will be allowed, we're looking to
 *         validate the overall structure.)
 */
var assertValidTag = module.exports.assertValidTag = function (tag) {
    var spaceIdx = tag.indexOf(' ');
    var nodeName = tag;
    if (spaceIdx !== -1) { nodeName = tag.substring(0,spaceIdx); }
    if (!Elements[nodeName]) { throw new Error(); }
    if (nodeName === tag) { return; }

    var structure = HtmlParse.parseTag(tag);
    for (var i = 0; i < structure.attributes.length; i++) {
        if (structure.attributes.lastIndexOf(structure.attributes[i]) !== i) { throw new Error(); }
    }
    if (tag.length !== structure.endIndex+1) { throw new Error(); }
    var tagB = HtmlParse.serializeTag(structure);
    if (tagB !== tag) { throw new Error(); }
};

var validate = module.exports.validate = function (html) {
    var ctx = {};
    var elemArray = [];
    for (;;) {
        var elem = HtmlParse.getPreviousElement(html, ctx);
        // reached the end
        if (!elem) { break; }
        elemArray.push(elem);
        //console.log(JSON.stringify(elem));
    }
    for (var i = 0; i < elemArray.length-1; i++) {
        // Check that the element's parent is a valid parent for this element type.
        if (elemArray[i+1].closeTagIndex <= elemArray[i].closeTagIndex) { continue; }
        if (elemArray[i+1].closeTagIndex < elemArray[i].openTagIndex) { continue; }
        if (Elements[elemArray[i+1].nodeName].indexOf(elemArray[i].nodeName) === -1) {
            throw new Error(elemArray[i+1].nodeName + " cannot contain " + elemArray[i].nodeName);
        }
    }

    for (var i = 0; i < elemArray.length; i++) {
        // Verify that parsing and serializing the open tag yields the same result.
        var beginningAtTag = html.substring(elemArray[i].openTagIndex);
        var structure = elemArray[i].structure = HtmlParse.parseTag(beginningAtTag);
        //console.log(JSON.stringify(structure));
        var serialized = HtmlParse.serializeTag(structure);
        if (beginningAtTag.indexOf(serialized) !== 0) { throw new Error(); }
        //console.log();
        //console.log(serialized);
        //console.log(beginningAtTag.substring(0, structure.endIndex));
        if (serialized.length !== structure.endIndex+1) {
            throw new Error(serialized.length + '  ' + structure.endIndex);
        }
    }

    // verify that whatever text falls between nodes is properly escaped.
    var remainingHtml = html;
    var textContent = [];
    while (remainingHtml !== '') {
        var best = 0;
        var index = -1;
        for (var i = 0; i < elemArray.length; i++) {
            if (elemArray[i].openTagIndex > index &&
                elemArray[i].openTagIndex < remainingHtml.length)
            {
                index = elemArray[i].openTagIndex;
                best = i;
            }
            if (elemArray[i].closeTagIndex > index &&
                elemArray[i].closeTagIndex < remainingHtml.length)
            {
                index = elemArray[i].closeTagIndex;
                best = i;
            }
        }
        if (remainingHtml[index] !== '<') { throw new Error(remainingHtml.substring(index)); }
        var endIndex = 0;
        if (remainingHtml[index+1] === '/') {
            endIndex = remainingHtml.indexOf('>', index);
        } else {
            if (elemArray[best].openTagIndex !== index) { throw new Error(); }
            endIndex = index + elemArray[best].structure.endIndex;
        }
        textContent.push(remainingHtml.substring(endIndex+1));
        remainingHtml = remainingHtml.substring(0, index);
    }
    //console.log(textContent);
    textContent = textContent.join('');
    if (/[<>]/.test(textContent)) {
        throw new Error("invalid characters in html ["+textContent+"]");
    }
};
