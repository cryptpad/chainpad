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
var HtmlParse = require('./HtmlParse');

var parseTag = function () {
    var testData =
        "<code yw='f$Ncv?' hag='sg4)ZyWxx%\"hy>R&amp;:LICHF1;lhgSEX$t8)9p' " +
        "igri=\"DGVNZl\Fc_.[m/S>7Hl: YH JlRw,5,<)M\z|B@26g'\" 9mdwc9='<&amp" +
        ";.`/>mb8TO4`m>fR@NL*)7/\"auS\")G4>0WNQKC|L.xODdO/(' xxx />" +
        "trailing garbage)G40W\"NQKC|L.xODdO/('";

    var expectedOut = {
        "nodeName": "code",
        "attributes": [
            [ "yw", "'f$Ncv?'" ],
            [ "hag", "'sg4)ZyWxx%\"hy>R&amp;:LICHF1;lhgSEX$t8)9p'" ],
            [ "igri", "\"DGVNZlFc_.[m/S>7Hl: YH JlRw,5,<)Mz|B@26g'\"" ],
            [ "9mdwc9", "'<&amp;.`/>mb8TO4`m>fR@NL*)7/\"auS\")G4>0WNQKC|L.xODdO/('" ],
            [ "xxx", null ]
        ],
        "endIndex": 182,
        "trailingSlash": true
    };

    var out = HtmlParse.parseTag(testData);

    //console.log(JSON.stringify(out, null, '    '));

    if (JSON.stringify(out) !== JSON.stringify(expectedOut)) { throw new Error(); }

    var asString = HtmlParse.serializeTag(out);

    if (testData.indexOf(asString) !== 0) { throw new Error(); }
};

var main = module.exports.main = function (cycles, callback) {
    parseTag();
    callback();
};
