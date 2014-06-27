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
var VOID_TAG_REGEX = module.exports.VOID_TAG_REGEX = new RegExp('^(' + [
    'area',
    'base',
    'br',
    'col',
    'hr',
    'img',
    'input',
    'link',
    'meta',
    'param',
    'command',
    'keygen',
    'source',
].join('|') + ')$');

/**
 * Get the offset of the previous open/close/void tag.
 * returns the offset of the opening angle bracket.
 */
var getPreviousTagIdx = module.exports.getPreviousTagIdx = function (data, idx) {
    if (idx === 0) { return -1; }
    idx = data.lastIndexOf('>', idx);
    // The html tag from hell:
    // < abc def="g<hi'j >" k='lm"nopw>"qrstu"<vw'   >
    for (;;) {
        var mch = data.substring(0,idx).match(/[<"'][^<'"]*$/);
        if (!mch) { return -1; }
        if (mch[0][0] === '<') { return mch.index; }
        idx = data.lastIndexOf(mch[0][0], mch.index-1);
    }
};

/**
 * Get the name of an HTML tag with leading / if the tag is an end tag.
 *
 * @param data the html text
 * @param offset the index of the < bracket.
 * @return the tag name with possible leading slash.
 */
var getTagName = module.exports.getTagName = function (data, offset) {
    if (data[offset] !== '<') { throw new Error(); }
    // Match ugly tags like <   /   xxx>
    // or <   xxx  y="z" >
    var m = data.substring(offset).match(/^(<[\s\/]*)([a-zA-Z0-9_-]+)/);
    if (!m) { throw new Error("could not get tag name"); }
    if (m[1].indexOf('/') !== -1) { return '/'+m[2]; }
    return m[2];
};

/**
 * Get the previous void or opening tag.
 *
 * @param data the document html
 * @param ctx an empty map for the first call, the same element thereafter.
 * @return an object containing openTagIndex: the offset of the < bracket for the begin tag,
 *         closeTagIndex: the the offset of the < bracket for the matching end tag, and
 *         nodeName: the element name.
 *         If the element is a void element, the second value in the array will be -1.
 */
var getPreviousElement = module.exports.getPreviousElement = function (data, ctx) {
    for (;;) {
        if (typeof(ctx.offsets) === 'undefined') {
            // ' ' is an invalid html element name so it will never match anything.
            ctx.offsets = [ { idx: data.length, name: ' ' } ];
            ctx.idx = data.length;
        }

        var prev = ctx.idx = getPreviousTagIdx(data, ctx.idx);
        if (prev === -1) {
            if (ctx.offsets.length > 1) { throw new Error(); }
            return null;
        }
        var prevTagName = getTagName(data, prev);

        if (prevTagName[0] === '/') {
            ctx.offsets.push({ idx: prev, name: prevTagName.substring(1) });
        } else if (prevTagName === ctx.offsets[ctx.offsets.length-1].name) {
            var os = ctx.offsets.pop();
            return { openTagIndex: prev, closeTagIndex: os.idx, nodeName: prevTagName };
        } else if (!VOID_TAG_REGEX.test(prevTagName)) {
            throw new Error("unmatched tag [" + prevTagName + "] which is not a void tag");
        } else {
            return { openTagIndex: prev, closeTagIndex: -1, nodeName: prevTagName };
        }
    }
};

/**
 * Given a piece of HTML text which begins at the < of a non-close tag,
 * give the index within that content which contains the matching >
 * character skipping > characters contained within attributes.
 */
var getEndOfTag = module.exports.getEndOfTag = function (html) {
    var arr = html.match(/['">][^"'>]*/g);
    var q = null;
    var idx = html.indexOf(arr[0]);
    for (var i = 0; i < arr.length; i++) {
        if (!q) {
            q = arr[i][0];
            if (q === '>') { return idx; }
        } else if (q === arr[i][0]) {
            q = null;
        }
        idx += arr[i].length;
    }
    throw new Error("Could not find end of tag");
};


var ParseTagState = {
    OUTSIDE: 0,
    NAME: 1,
    VALUE: 2,
    SQUOTE: 3,
    DQUOTE: 4,
};

var parseTag = module.exports.parseTag = function (html) {
    if (html[0] !== '<') { throw new Error("Must be the beginning of a tag"); }

    var out = {
        nodeName: null,
        attributes: [],
        endIndex: -1,
        trailingSlash: false
    };

    if (html.indexOf('>') < html.indexOf(' ') || html.indexOf(' ') === -1) {
        out.endIndex = html.indexOf('>');
        out.nodeName = html.substring(1, out.endIndex);
        return out;
    }

    out.nodeName = html.substring(1, html.indexOf(' '));

    if (html.indexOf('<' + out.nodeName + ' ') !== 0) {
        throw new Error("Nonstandard beginning of tag [" +
            html.substring(0, 30) + '] for nodeName [' + out.nodeName + ']');
    }
    var i = 1 + out.nodeName.length + 1;

    var state = ParseTagState.OUTSIDE;
    var name = [];
    var value = [];
    var pushAttribute = function () {
        out.attributes.push([name.join(''), value.join('')]);
        name = [];
        value = [];
    };
    for (; i < html.length; i++) {
        var chr = html[i];
        switch (state) {
            case ParseTagState.OUTSIDE: {
                if (chr === '/') {
                    out.trailingSlash = true;
                } else if (chr.match(/[a-zA-Z0-9_-]/)) {
                    state = ParseTagState.NAME;
                    if (name.length > 0) { throw new Error(); }
                    name.push(chr);
                } else if (chr === '>') {
                    out.endIndex = i;
                    return out;
                } else if (chr === ' ') {
                    // fall through
                } else {
                    throw new Error();
                }
                continue;
            }
            case ParseTagState.NAME: {
                if (chr.match(/[a-zA-Z0-9_-]/)) {
                    name.push(chr);
                } else if (chr === '=') {
                    state = ParseTagState.VALUE;
                } else if (chr === '/' || chr === ' ') {
                    if (chr === '/') {
                        out.trailingSlash = true;
                    }
                    out.attributes.push([name.join(''), null]);
                    name = [];
                    state = ParseTagState.OUTSIDE;
                } else if (chr === '>') {
                    out.attributes.push([name.join(''), null]);
                    name = [];
                    out.endIndex = i;
                    return out;
                } else {
                    throw new Error("bad character [" + chr + "] in name [" + name.join('') + "]");
                }
                continue;
            }
            case ParseTagState.VALUE: {
                value.push(chr);
                if (chr === '"') {
                    state = ParseTagState.DQUOTE;
                } else if (chr === "'") {
                    state = ParseTagState.SQUOTE;
                } else {
                    throw new Error();
                }
                continue;
            }
            case ParseTagState.SQUOTE: {
                value.push(chr);
                if (chr === "'") {
                    pushAttribute();
                    state = ParseTagState.OUTSIDE;
                }
                continue;
            }
            case ParseTagState.DQUOTE: {
                value.push(chr);
                if (chr === '"') {
                    pushAttribute();
                    state = ParseTagState.OUTSIDE;
                }
                continue;
            }
        }
    }

    throw new Error("reached end of file while parsing");
};

var serializeTag = module.exports.serializeTag = function (tag) {
    var out = ['<', tag.nodeName];
    for (var i = 0; i < tag.attributes.length; i++) {
        var att = tag.attributes[i];
        if (att[1] === null) {
            out.push(' ', att[0]);
        } else {
            out.push(' ', att[0], '=', att[1]);
        }
    }
    if (tag.trailingSlash) {
        out.push(' /');
    }
    out.push('>');
    return out.join('');
};
