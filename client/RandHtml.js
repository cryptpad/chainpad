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
var ValidateHtml = require('./ValidateHtml');
var Sha = require('./SHA256');

var CHANCE_MAX = (1<<24);

var INPUT_LENGTH = 1000;

var OPEN_TAG_CHANCE = 0.2;
var CLOSE_TAG_CHANCE_PER_DEPTH = 0.05;

/** Chance that there will not be another (or a first) HTML attribute. */
var ATTRIBUTE_CHANCE = 0.8;

/** Chance that an attribute will have no value, eg <checkbox checked> */
var EMPTY_ATTRIBUTE_CHANCE = 0.2;

var MAX_ATTRIBUTE_NAME_LEN = 10;
var MAX_ATTRIBUTE_CONTENT_LEN = 50;

/** Chance that an attribute will be quoted with ' rather than " */
var ATTRIBUTE_SQUOTE_CHANCE = 0.5;

var VOID_TAG_SLASH_CHANCE = 0.5;

var INVALID_ATTRIBUTE_NAME_REGEX = /[^a-z0-9_-]/g;

var TEXT_CHANCE = 0.3;
var MAX_TEXT_CHARS = 20;




var escapeXML = function (s) {
    var xmlChars = {
        '<': '&lt;',
        '>': '&gt;',
        '&': '&amp;',
        '"': '&quot;',
        "'": '&#39;'
    };
    return s.replace(/[<>&"']/g, function (ch) {
        return xmlChars[ch];
    });
};

var charToNum = function (chr) {
    return chr.charCodeAt(0) - 32;
};

var rotl = function (x,b) { return ((x << b) & 0x7fffffff) | (x >>> (32 - b)); }
var mix = function (a,b) {
    out = Number('0x' + Sha.hex_sha256(a + '' + b).substring(0,7));
    return out % CHANCE_MAX;
};
var coinFlip = function (seed, chance, num) {
    var c = chance * CHANCE_MAX;
    if (c >= CHANCE_MAX) { throw new Error(); }
    var result = false;
    if (mix(seed, num) < c) { result = true; }
    return result;
};

var SQUOTE_REGEX = /[\']/g;
var DQUOTE_REGEX = /[\"]/g;
var addAttributes = function (getChars, out) {
    var attributeNames = [];
    for (var chr = getChars(1); chr; chr = getChars(1)) {
        var num = charToNum(chr);
        if (!coinFlip(2, ATTRIBUTE_CHANCE, num)) { return; }
        var nameLen = mix(3, num) % MAX_ATTRIBUTE_NAME_LEN;
        var contentLen = mix(4, num) % MAX_ATTRIBUTE_CONTENT_LEN;
        var sQuote = coinFlip(5, ATTRIBUTE_SQUOTE_CHANCE, num);
        var quote = (sQuote) ? "'" : '"';
        var name = getChars(nameLen).toLowerCase().replace(INVALID_ATTRIBUTE_NAME_REGEX, '');
        if (!name || attributeNames.indexOf(name) !== -1) { continue; }
        attributeNames.push(name);
        if (coinFlip(6, EMPTY_ATTRIBUTE_CHANCE, num)) {
            out.push(' ', name);
            continue;
        }
        var content = getChars(contentLen).replace((sQuote) ? SQUOTE_REGEX : DQUOTE_REGEX, '');
        content = content.replace(/&/g, '&amp;');
        if (!content) { continue; }
        out.push(' ', name, '=', quote, content, quote);
    }
};

var addHTML = function (getChars, out) {
    var tagStack = [];
    var currentTag = 'html';
    var elems = Elements[currentTag];
    out.push('<html>\n');
    for (var chr = getChars(1); chr; chr = getChars(1)) {
        var num = charToNum(chr);
        if (coinFlip(1, OPEN_TAG_CHANCE, num)) {
            // will become currentTag and elems if this is not a void element.
            var nextCurrentTag = elems[num % elems.length];
            var nextElems = Elements[nextCurrentTag];
            if (!nextElems) { continue; }
            out.push(new Array(tagStack.length+2).join(' '));
            out.push('<', nextCurrentTag);
            addAttributes(getChars, out);
            if (nextElems.length === 0) {
                if (coinFlip(2, VOID_TAG_SLASH_CHANCE, num)) {
                    out.push(' /');
                }
            } else {
                tagStack.push(currentTag);
                elems = nextElems;
                currentTag = nextCurrentTag;
            }
            out.push('>\n');
            continue;
        }
        if (coinFlip(2, CLOSE_TAG_CHANCE_PER_DEPTH * (tagStack.length + 1), num)) {
            out.push(new Array(tagStack.length+1).join(' '));
            out.push('</' + currentTag + '>\n');
            currentTag = tagStack.pop();
            elems = Elements[currentTag];
            if (currentTag === undefined) { return; }
        }
        if (elems.indexOf('#text') > -1 && coinFlip(3, TEXT_CHANCE, num)) {
            var contentLen = mix(4, num) % MAX_TEXT_CHARS;
            out.push(new Array(tagStack.length+2).join(' '));
            out.push(escapeXML(getChars(contentLen)));
            out.push('\n');
        }
    }

    while (currentTag) {
        out.push(new Array(tagStack.length+1).join(' '));
        out.push('</' + currentTag + '>');
        currentTag = tagStack.pop();
        out.push('\n');
    }
};


var randomAscii = module.exports.randomAscii = function (length) {
    var content = [];
    for (var i = 0; i < length; i++) {
        content[i] = String.fromCharCode( Math.floor(Math.random()*256) % 93 + 32 );
    }
    return content.join('');
};

var alterText = module.exports.alterText = function (text, maxCharsToAlter) {
    var offset = (Math.random() * 10000) % text.length;
    var toDelete = (Math.random() * 10000) % Math.min((text.length - offset), maxCharsToAlter);
    var toInsert = randomAscii((Math.random() * 10000) % maxCharsToAlter);
    return text.substring(0, offset) + toInsert + text.substring(offset + toDelete);
};

var textToHtml = module.exports.textToHtml = function (text) {
    var index = 0;
    var out = [];
    addHTML(function (count) {
        index += count;
        return text.substring(index-count, index);
    }, out);
    return out.join('');
};
