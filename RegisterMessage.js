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
var Common = require('./Common');

var RegisterMessage = module.exports;

var check = RegisterMessage.check = function(msg) {
    Common.assert(msg.type === 'RegisterMessage');
    Common.assert(typeof(msg.userName) === 'string');
    Common.assert(typeof(msg.channelId) === 'string');
};

var create = RegisterMessage.create = function (userName, channelId) {
    var msg = {
        type: 'RegisterMessage',
        userName: userName,
        channelId: channelId
    };
    if (Common.PARANOIA) { check(msg); }
    return msg;
};

var toObj = RegisterMessage.toObj = function (req) {
    return [req.userName, req.channelId];
};

var fromObj = RegisterMessage.fromObj = function (obj) {
    var out = create(obj[0], obj[1]);
    check(out);
    return out;
};
