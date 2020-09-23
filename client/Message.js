/*@flow*/
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
"use strict";
var Common = require('./Common');
//var Operation = require('./Operation');
var Patch = require('./Patch');
var Sha = require('./sha256');

var Message = module.exports;

var PATCH        = Message.PATCH        = 2;
var CHECKPOINT   = Message.CHECKPOINT   = 4;

/*::
import type { Sha256_t } from './sha256'
import type { Patch_t } from './Patch'
export type Message_Type_t = 2 | 4;
export type Message_t = {
    type: 'Message',
    messageType: Message_Type_t,
    content: Patch_t,
    lastMsgHash: Sha256_t,
    hashOf: Sha256_t,
    mut: {
        parentCount: ?number,
        isInitialMessage: boolean,
        parent: ?Message_t,

        isFromMe: ?boolean,
        time: ?number,
        author: ?string,
        serverHash: ?string,
    }
}
*/

var check = Message.check = function(msg /*:any*/) /*:Message_t*/ {
    Common.assert(msg.type === 'Message');
    Common.assert(msg.messageType === PATCH || msg.messageType === CHECKPOINT);
    Patch.check(msg.content);
    Common.assert(typeof(msg.lastMsgHash) === 'string');
    return msg;
};

var DUMMY_HASH /*:Sha256_t*/ = "";

var create = Message.create = function (
    type /*:Message_Type_t*/,
    content /*:Patch_t*/,
    lastMsgHash /*:Sha256_t*/) /*:Message_t*/
{
    var msg = {
        type: 'Message',
        messageType: type,
        content: content,
        lastMsgHash: lastMsgHash,
        hashOf: DUMMY_HASH,
        mut: {
            parentCount: undefined,
            isInitialMessage: false,
            isFromMe: false,
            parent: undefined,
            time: undefined,
            author: undefined,
            serverHash: undefined,
        }
    };
    msg.hashOf = hashOf(msg);
    if (Common.PARANOIA) { check(msg); }
    return Object.freeze(msg);
};

// $FlowFixMe doesn't like the toString()
var toString = Message.toStr = Message.toString = function (msg /*:Message_t*/) {
    if (Common.PARANOIA) { check(msg); }
    if (msg.messageType === PATCH || msg.messageType === CHECKPOINT) {
        if (!msg.content) { throw new Error(); }
        return JSON.stringify([msg.messageType, Patch.toObj(msg.content), msg.lastMsgHash]);
    } else {
        throw new Error();
    }
};

Message.fromString = function (str /*:string*/) /*:Message_t*/ {
    var obj = {};
    if (typeof(str) === "object") {
        obj = str;
        str = str.msg;
    }
    var m = JSON.parse(str);
    if (m[0] !== CHECKPOINT && m[0] !== PATCH) { throw new Error("invalid message type " + m[0]); }
    var msg = create(m[0], Patch.fromObj(m[1], (m[0] === CHECKPOINT)), m[2]);
    msg.mut.author = obj.author;
    msg.mut.time = obj.time && new Date(obj.time);
    msg.mut.serverHash = obj.serverHash;
    return Object.freeze(msg);
};

var hashOf = Message.hashOf = function (msg /*:Message_t*/) {
    if (Common.PARANOIA) { check(msg); }
    var hash = Sha.hex_sha256(toString(msg));
    return hash;
};

Object.freeze(module.exports);
