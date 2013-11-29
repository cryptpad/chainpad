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
var Operation = require('./Operation');
var Patch = require('./Patch');
var RegisterMessage = require('./RegisterMessage');

var Message = module.exports;

var REGISTER     = Message.REGISTER     = 0;
var REGISTER_ACK = Message.REGISTER_ACK = 1;
var PATCH        = Message.PATCH        = 2;

var check = Message.check = function(msg) {
    Common.assert(msg.type === 'Message');
    Common.assert(typeof(msg.channelId) === 'string');
    Common.assert(msg.channelId.indexOf('|') === -1);
    if (msg.messageType === REGISTER) {
        RegisterMessage.check(msg.content);
    } else if (msg.messageType === PATCH) {
        Patch.check(msg.content);
    } else {
        throw new Error("invalid message type [" + msg.messageType + "]");
    }
};

var create = Message.create = function (channelId, type, content) {
    var msg = {
        type: 'Message',
        channelId: channelId,
        author: '',
        messageType: type,
        content: content
    };
    if (Common.PARANOIA) { check(msg); }
    return msg;
};

var toString = Message.toString = function (msg) {
    if (Common.PARANOIA) { check(msg); }
    var prefix = msg.messageType + ':';
    var content = '';
    if (msg.messageType === PATCH_REQ) {
        content = JSON.stringify([PATCH_REQ, RegisterMessage.toObj(msg.content)]);
    } else if (msg.messageType === PATCH) {
        content = JSON.stringify([PATCH, Patch.toObj(msg.content)]);
    }
    return msg.channelId + "|" + content.length + ':' + content;
};

var fromString = Message.fromString = function (str) {
    var matches = /^([^\|]*)\|([^|]*)\|([0-9]+):(.*)$/.exec(str);
    matches.shift();
    var channelId = decodeURIComponent(matches.shift());
    var author = decodeURIComponent(matches.shift());
    var length = matches.shift();
    var contentStrAndMore = matches.shift();
    var contentStr = contentStrAndMore.substring(0,length);
    if (contentStr.length < length) {
        return {
            result: null,
            more: str
        };
    }
    var content = JSON.parse(contentStr);
    var more = contentStr.substring(length);
    var message = Message.create(channelId, content[0], content[1]);
    message.author = author;
    // This check validates every operation in the patch.
    check(message);
    return {
        result: message,
        more: more
    };
};
