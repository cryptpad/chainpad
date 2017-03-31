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
