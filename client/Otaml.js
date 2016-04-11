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

var Common = require('./Common');
var HtmlParse = require('./HtmlParse');
var Operation = require('./Operation');
var Sha = require('./SHA256');

var makeTextOperation = module.exports.makeTextOperation = function(oldval, newval)
{
    if (oldval === newval) { return; }

    var begin = 0;
    for (; oldval[begin] === newval[begin]; begin++) ;

    var end = 0;
    for (var oldI = oldval.length, newI = newval.length;
         oldval[--oldI] === newval[--newI];
         end++) ;

    if (end >= oldval.length - begin) { end = oldval.length - begin; }
    if (end >= newval.length - begin) { end = newval.length - begin; }

    return {
        type: 'Operation',
        offset: begin,
        toRemove: oldval.length - begin - end,
        toInsert: newval.slice(begin, newval.length - end),
    };
};

var VOID_TAG_REGEX = new RegExp('^(' + [
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

// Get the offset of the previous open/close/void tag.
// returns the offset of the opening angle bracket.
var getPreviousTagIdx = function (data, idx)
{
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
var getTagName = function (data, offset)
{
    if (data[offset] !== '<') { throw new Error(); }
    // Match ugly tags like <   /   xxx>
    // or <   xxx  y="z" >
    var m = data.substring(offset).match(/^(<[\s\/]*)([a-zA-Z0-9_-]+)/);
    if (!m) { throw new Error("could not get tag name"); }
    if (m[1].indexOf('/') !== -1) { return '/'+m[2]; }
    return m[2];
};

/**
 * Get the previous non-void opening tag.
 *
 * @param data the document html
 * @param ctx an empty map for the first call, the same element thereafter.
 * @return an array containing the offset of the open bracket for the begin tag and the
 *         the offset of the open bracket for the matching end tag.
 */
var getPreviousNonVoidTag = function (data, ctx)
{
    for (;;) {
        if (typeof(ctx.offsets) === 'undefined') {
            // ' ' is an invalid html element name so it will never match anything.
            ctx.offsets = [ { idx: data.length, name: ' ' } ];
            ctx.idx = data.length;
        }

        var prev = ctx.idx = getPreviousTagIdx(data, ctx.idx);
        if (prev === -1) {
            if (ctx.offsets.length > 1) { throw new Error(); }
            return [ 0, data.length ];
        }
        var prevTagName = getTagName(data, prev);

        if (prevTagName[0] === '/') {
            ctx.offsets.push({ idx: prev, name: prevTagName.substring(1) });
        } else if (prevTagName === ctx.offsets[ctx.offsets.length-1].name) {
            var os = ctx.offsets.pop();
            return [ prev, os.idx ];
        } else if (!VOID_TAG_REGEX.test(prevTagName)) {
            throw new Error();
        }
    }
};

var indexOfSkipQuoted = function (haystack, needle)
{
    var os = 0;
    for (;;) {
        var dqi = haystack.indexOf('"');
        var sqi = haystack.indexOf("'");
        var needlei = haystack.indexOf(needle);
        if (needlei === -1) { return -1; }
        if (dqi > -1 && dqi < sqi && dqi < needlei) {
            dqi = haystack.indexOf('"', dqi+1);
            if (dqi === -1) { throw new Error(); }
            haystack = haystack.substring(dqi+1);
            os += dqi+1;
        } else if (sqi > -1 && sqi < needlei) {
            sqi = haystack.indexOf('"', sqi+1);
            if (sqi === -1) { throw new Error(); }
            haystack = haystack.substring(sqi+1);
            os += sqi+1;
        } else {
            return needlei + os;
        }
    }
};

var tagWidth = module.exports.tagWidth = function (nodeOuterHTML)
{
    if (nodeOuterHTML.length < 2 || nodeOuterHTML[1] === '!' || nodeOuterHTML[0] !== '<') {
        return 0;
    }
    return indexOfSkipQuoted(nodeOuterHTML, '>') + 1;
};

var makeHTMLOperation = module.exports.makeHTMLOperation = function (oldval, newval)
{
    var op = makeTextOperation(oldval, newval);
    if (!op) { return; }

    var end = op.offset + op.toRemove;
    var lastTag;
    var tag;
    var ctx = {};
    do {
        lastTag = tag;
        tag = getPreviousNonVoidTag(oldval, ctx);
    } while (tag[0] > op.offset || tag[1] < end);

    if (lastTag
        && end < lastTag[0]
        && op.offset > tag[0] + tagWidth(oldval.substring(tag[0])))
    {
        // plain old text operation.
        if (op.toRemove && oldval.substr(op.offset, op.toRemove).indexOf('<') !== -1) {
            throw new Error();
        }
        return op;
    }

    op.offset = tag[0];
    op.toRemove = tag[1] - tag[0];
    op.toInsert = newval.slice(tag[0], newval.length - (oldval.length - tag[1]));

    return op;
};

/**
 * Expand an operation to cover enough HTML that any naive transformation
 * will result in correct HTML.
 */
var expandOp = module.exports.expandOp = function (html, op) {
return op;
    if (Common.PARANOIA && typeof(html) !== 'string') { throw new Error(); }
    var ctx = {};
    for (;;) {
        var elem = HtmlParse.getPreviousElement(html, ctx);
        // reached the end, this should not happen...
        if (!elem) { throw new Error(JSON.stringify(op)); }
        if (elem.openTagIndex <= op.offset) {
            var endIndex = html.indexOf('>', elem.closeTagIndex) + 1;
            if (!endIndex) { throw new Error(); }
            if (endIndex >= op.offset + op.toRemove) {
                var newHtml = Operation.apply(op, html);
                var newEndIndex = endIndex - op.toRemove + op.toInsert.length;
                var out = Operation.create(elem.openTagIndex,
                                           endIndex - elem.openTagIndex,
                                           newHtml.substring(elem.openTagIndex, newEndIndex));
                if (Common.PARANOIA) {
                    var test = Operation.apply(out, html);
                    if (test !== newHtml) {
                        throw new Error(test + '\n\n\n' + newHtml + '\n\n' + elem.openTagIndex + '\n\n' + newEndIndex);
                    }
                    if (out.toInsert[0] !== '<') { throw new Error(); }
                    if (out.toInsert[out.toInsert.length - 1] !== '>') { throw new Error(); }
                }
                return out;
            }
        }
        //console.log(elem);
    }
};

var transformB = function (html, toTransform, transformBy) {

    var transformByEndOffset = transformBy.offset + transformBy.toRemove;
    if (toTransform.offset > transformByEndOffset) {
        // simple rebase
        toTransform.offset -= transformBy.toRemove;
        toTransform.offset += transformBy.toInsert.length;
        return toTransform;
    }

    var toTransformEndOffset = toTransform.offset + toTransform.toRemove;

    if (transformBy.offset > toTransformEndOffset) {
        // we're before them, no transformation needed.
        return toTransform;
    }

    // so we overlap, we're just going to revert one and apply the other.
    // The one which affects more content should probably be applied.
    var toRevert = toTransform;
    var toApply = transformBy;
    var swap = function () {
        var x = toRevert;
        toRevert = toApply;
        toApply = x;
    };

    if (toTransform.toInsert.length > transformBy.toInsert.length) {
        swap();
    } else if (toTransform.toInsert.length < transformBy.toInsert.length) {
        // fall through
    } else if (toTransform.toRemove > transformBy.toRemove) {
        swap();
    } else if (toTransform.toRemove < transformBy.toRemove) {
        // fall through
    } else {
        if (Operation.equals(toTransform, transformBy)) { return null; }
        // tie-breaker: we just strcmp the JSON.
        if (Common.strcmp(JSON.stringify(toTransform), JSON.stringify(transformBy)) < 0) { swap(); }
    }

    var inverse = Operation.invert(toRevert, html);
    if (Common.PARANOIA) {
        var afterToRevert = Operation.apply(toRevert, html);

    }
    if (Common.PARANOIA && !Operation.shouldMerge(inverse, toApply)) { throw new Error(); }
    var out = Operation.merge(inverse, toApply);
};

var transform = module.exports.transform = function (html, toTransform, transformBy) {

    return transformB(html, toTransform, transformBy);
/*
    toTransform = Operation.clone(toTransform);
    toTransform = expandOp(html, toTransform);

    transformBy = Operation.clone(transformBy);
    transformBy = expandOp(html, transformBy);

    if (toTransform.offset >= transformBy.offset) {
        if (toTransform.offset >= transformBy.offset + transformBy.toRemove) {
            // simple rebase
            toTransform.offset -= transformBy.toRemove;
            toTransform.offset += transformBy.toInsert.length;
            return toTransform;
        }

        // They deleted our begin offset...

        var toTransformEndOffset = toTransform.offset + toTransform.toRemove;
        var transformByEndOffset = transformBy.offset + transformBy.toRemove;
        if (transformByEndOffset >= toTransformEndOffset) {
            // They also deleted our end offset, lets forget we wrote anything because
            // whatever it was, they deleted it's context.
            return null;
        }

        // goto the end, anything you deleted that they also deleted should be skipped.
        var newOffset = transformBy.offset + transformBy.toInsert.length;
        toTransform.toRemove = 0; //-= (newOffset - toTransform.offset);
        if (toTransform.toRemove < 0) { toTransform.toRemove = 0; }
        toTransform.offset = newOffset;
        if (toTransform.toInsert.length === 0 && toTransform.toRemove === 0) {
            return null;
        }
        return toTransform;
    }
    if (toTransform.offset + toTransform.toRemove < transformBy.offset) {
        return toTransform;
    }
    toTransform.toRemove = transformBy.offset - toTransform.offset;
    if (toTransform.toInsert.length === 0 && toTransform.toRemove === 0) {
        return null;
    }
    return toTransform;
*/
};
