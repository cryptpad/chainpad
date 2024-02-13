/*
 * Copyright 2024 XWiki SAS
 *
 * This is free software; you can redistribute it and/or modify it
 * under the terms of the GNU Lesser General Public License as
 * published by the Free Software Foundation; either version 2.1 of
 * the License, or (at your option) any later version.
 *
 * This software is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public
 * License along with this software; if not, write to the Free
 * Software Foundation, Inc., 51 Franklin St, Fifth Floor, Boston, MA
 * 02110-1301 USA, or see the FSF site: http://www.fsf.org.
 */
var Sha256 = require('./sha256.js');
var Utils = require('./utils.js');

/**
 * SHA256 exports
 */

function sha256_bytes ( data ) {
    if ( data === undefined ) throw new SyntaxError("data required");
    return Sha256.get_sha256_instance().reset().process(data).finish().result;
}

function sha256_hex ( data ) {
    var result = sha256_bytes(data);
    return Utils.bytes_to_hex(result);
}

function sha256_base64 ( data ) {
    var result = sha256_bytes(data);
    return Utils.bytes_to_base64(result);
}

Sha256.sha256_constructor.bytes = sha256_bytes;
Sha256.sha256_constructor.hex = sha256_hex;
Sha256.sha256_constructor.base64 = sha256_base64;

//exports.SHA256 = sha256_constructor;
module.exports = Sha256.sha256_constructor;
