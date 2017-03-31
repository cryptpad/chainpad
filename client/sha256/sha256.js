var Utils = require('./utils.js');
var Hash = require('./hash.js');
var Asm = require('./sha256.asm.js');

var _sha256_block_size = 64,
    _sha256_hash_size = 32;

function sha256_constructor ( options ) {
    options = options || {};

    this.heap = Utils._heap_init( Uint8Array, options );
    this.asm = options.asm || Asm.sha256_asm( { Uint8Array: Uint8Array }, null, this.heap.buffer );

    this.BLOCK_SIZE = _sha256_block_size;
    this.HASH_SIZE = _sha256_hash_size;

    this.reset();
}

sha256_constructor.BLOCK_SIZE = _sha256_block_size;
sha256_constructor.HASH_SIZE = _sha256_hash_size;
var sha256_prototype = sha256_constructor.prototype;
sha256_prototype.reset =   Hash.hash_reset;
sha256_prototype.process = Hash.hash_process;
sha256_prototype.finish =  Hash.hash_finish;

var sha256_instance = null;

function get_sha256_instance () {
    if ( sha256_instance === null ) sha256_instance = new sha256_constructor( { heapSize: 0x100000 } );
    return sha256_instance;
}

module.exports.get_sha256_instance = get_sha256_instance;
module.exports.sha256_constructor = sha256_constructor;
