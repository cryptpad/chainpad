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
var CHECKPOINT   = Message.CHECKPOINT   = 4;

var check = Message.check = function(msg) {
    Common.assert(msg.type === 'Message');
    if (msg.messageType === PATCH || msg.messageType === CHECKPOINT) {
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
    if (msg.messageType === PATCH || msg.messageType === CHECKPOINT) {
        return JSON.stringify([msg.messageType, Patch.toObj(msg.content), msg.lastMsgHash]);
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
    var m = JSON.parse(str);
    if (m[0] !== CHECKPOINT && m[0] !== PATCH) { throw new Error("invalid message type " + m[0]); }
    var msg = create(m[0], Patch.fromObj(m[1]), m[2]);
    if (m[0] === CHECKPOINT) { msg.content.isCheckpoint = true; }
    return msg;
};

var hashOf = Message.hashOf = function (msg) {
    if (Common.PARANOIA) { check(msg); }
    var hash = Sha.hex_sha256(toString(msg));
    return hash;
};
