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
var Operation = require('./Operation');
var Patch = require('./Patch');
var Sha = require('./SHA256');

var Message = module.exports;

var REGISTER     = Message.REGISTER     = 0;
var REGISTER_ACK = Message.REGISTER_ACK = 1;
var PATCH        = Message.PATCH        = 2;
var DISCONNECT   = Message.DISCONNECT   = 3;
//var PING         = Message.PING         = 4;
//var PONG         = Message.PONG         = 5;

var check = Message.check = function(msg) {
    Common.assert(msg.type === 'Message');
    if (msg.messageType === PATCH) {
        Patch.check(msg.content);
        Common.assert(typeof(msg.lastMsgHash) === 'string');
    } else {
        throw new Error("invalid message type [" + msg.messageType + "]");
    }
};

var create = Message.create = function (type, content, lastMsgHash) {
    var msg = {
        type: 'Message',
        messageType: type,
        content: content,
        lastMsgHash: lastMsgHash
    };
    if (Common.PARANOIA) { check(msg); }
    return msg;
};

var toString = Message.toString = function (msg) {
    if (Common.PARANOIA) { check(msg); }

    if (msg.messageType === PATCH) {
        return JSON.stringify([PATCH, Patch.toObj(msg.content), msg.lastMsgHash]);
    } else {
        throw new Error();
    }
};

var discardBencode = function (msg, arr) {
    var len = msg.substring(0,msg.indexOf(':'));
    msg = msg.substring(len.length+1);
    var value = msg.substring(0,Number(len));
    msg = msg.substring(value.length);

    if (arr) { arr.push(value); }
    return msg;
};

var fromString = Message.fromString = function (str) {
    var msg = str;

if (str.charAt(0) === '[') {
    var m = JSON.parse(str);
    console.log(str);
    return create(m[0], Patch.fromObj(m[1]), m[2]);
} else {
throw new Error();


    var parts = [];
    msg = discardBencode(msg, parts);

    var userName = parts[0]; // TODO deprecate

    // cut off the channelId
    msg = discardBencode(msg, parts); // we don't actually care about channelId

    msg = discardBencode(msg, parts);
    var contentStr = parts[2];

    var content = JSON.parse(contentStr);
    var message;
    if (content[0] === PATCH) {
        message = create(userName, PATCH, Patch.fromObj(content[1]), content[2]);
    } else if ([4,5].indexOf(content[0]) !== -1 /* === PING || content[0] === PONG*/) {
        // it's a ping or pong, which we don't want to support anymore
        message = create(userName, content[0], content[1]);
    } else {
        message = create(userName, content[0]);
    }

    // This check validates every operation in the patch.
    check(message);

    return message
}
};

var hashOf = Message.hashOf = function (msg) {
    if (Common.PARANOIA) { check(msg); }
    var authToken = msg.authToken;
    msg.authToken = '';
    var hash = Sha.hex_sha256(toString(msg));
    msg.authToken = authToken;
    return hash;
};
