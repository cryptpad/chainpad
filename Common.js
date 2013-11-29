/* vim: set expandtab ts=4 sw=4: */
/*
 * You may redistribute this program and/or modify it under the terms of
 * the GNU Lesser General Public License as published by the Free Software
 * Foundation, either version 2.1 of the License, or (at your option) any
 * later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */
var Common = {};
Common.PARANOIA = false;

var assert = Common.assert = function (expr) {
    if (!expr) { throw new Error("Failed assertion"); }
};

var isUint = Common.isUint = function (integer) {
    return (typeof(integer) === 'number') &&
        (Math.floor(integer) === integer) &&
        (integer >= 0);
};

var randomASCII = Common.randomASCII = function (length) {
    var content = [];
    for (var i = 0; i < length; i++) {
        content[i] = String.fromCharCode( Math.floor(Math.random()*256) % 94 + 32 );
    }
    return content.join('');
};

var compareHashes = Common.compareHashes = function (hashA, hashB) {
    while (hashA.length > 0) {
        var numA = new Number('0x' + hashA.substring(0,8));
        var numB = new Number('0x' + hashB.substring(0,8));
        if (numA > numB) { return 1; }
        if (numB > numA) { return -1; }
        hashA = hashA.substring(8);
        hashB = hashB.substring(8);
    }
    return 0;
};

module.exports = Common;
