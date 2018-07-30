# ChainPad

[![XWiki labs logo](https://raw.githubusercontent.com/xwiki-labs/xwiki-labs-logo/master/projects/xwikilabs/xwikilabsproject.png "XWiki labs")](https://labs.xwiki.com/xwiki/bin/view/Projects/XWikiLabsProject)

ChainPad Algorithm is a Realtime Collaborative Editor algorithm based on
[Nakamoto Blockchains](https://en.bitcoin.it/wiki/Block_chain). This implementation is designed
to run with a dumb broadcasting server but with minimal effort, the algorithm could be ported to
full peer-to-peer. Because the ChainPad server need not be aware of the content which is being
edited, different types of editors can exist in harmony on the same system.

License: GNU AGPLv3.0 or at your option, any later version.

## Getting Started

To embed ChainPad in your web application, it is recommended that you use the contained node.js
websocket server. You may examine `test.html` to see how to bind the editor to a simple textarea.

### Building

To compile the code into `chainpad.js` run the following:

    npm install
    node make

This will run the tests and concatenate the js files into the resulting `chainpad.js` output file.

## The API

```javascript
var chainpad = ChainPad.create(config);

// The bindings are not included in the engine, see below.
bindToDataTransport(chainpad);
bindToUserInterface(chainpad);

chainpad.start();
```

### Configuration Parameters

Config is an *optional* object parameter which may have one or more of the following contents.
**NOTE:** it's critical that every ChainPad instance in the session has the same values for these
parameters.

* **initialState** (string) content to start off the pad with, default is empty-string.
* **checkpointInterval** (number) the number of patches which should be allowed to go across the
wire before sending a *checkpoint*. A small number will result in lots of sending of *checkpoints*
which are necessarily large because they send the whole document in the message. A large number
will result in more patches to download for a new person joining the pad.
* **avgSyncMilliseconds** (number) the number of milliseconds to wait before sending to the server
if there is anything to be sent. Making this number smaller will cause lots of patches to be sent
(however the number will be limited by the RTT to the server because ChainPad will only keep one
unacknowledged message on the wire at a time).
* **validateContent** (function) if specified, this function will be called during each patch and
receive the content of the document after the patch, if the document has semantic requirements
then this function can validate them if they are broken then the patch will be rejected.
* **strictCheckpointValidation** (boolean) if true then we will fail any checkpoint which comes
at an interval which is not in agreement with **checkpointInterval**. Default: *false*.
* **patchTransformer** (function) if specified, this function will be used for Operational
Transformation. You have 3 options which are packaged with ChainPad or you can implement your own.
  * `ChainPad.TextTransformer` (this is default so you need not pass anything) if you're using
  ChainPad on plain text, you probably want to use this.
  * `ChainPad.SmartJSONTransformer` if you are using ChainPad to patch JSON data, you probably
  want this.
  * `ChainPad.NaiveJSONTransformer` this is effectively just TextTransformer with a
  validation step to make sure the result is JSON, using this is not recommended.
* **operationSimplify** (function) This is an optional function which will override the function 
`ChainPad.Operation.simplify` in case you want to use a different one. Simplify is used for "fixing"
operations which remove content and then put back the same content. The default simplify will not
create patches containing strings with single characters from
[surrogate pairs](https://en.wikipedia.org/wiki/UTF-16#U.2B0000_to_U.2BD7FF_and_U.2BE000_to_U.2BFFFF).
* **logLevel** (number) If this is zero, none of the normal logs will be printed.
* **userName** (string) This is a string which will appear at the beginning of all logs in the
console, if multiple ChainPad instances are running at the same time, this will help differentiate
them.
* **noPrune** (boolean) If this is true, history will not be pruned when a checkpoint is encountered.
Caution: this can end up occupying a lot of memory!
* **diffFunction** (function) This is a function which takes 2 strings and outputs and array of
Operations. If unspecified, ChainPad will use the `ChainPad.Diff` which is a smart diff algorithm
based on the one used by Fossel. The default diff function will not create patches containing strings
with single characters from
[surrogate pairs](https://en.wikipedia.org/wiki/UTF-16#U.2B0000_to_U.2BD7FF_and_U.2BE000_to_U.2BFFFF).
* **diffBlockSize** (number) This is an optional number which will inform the default diff function
`ChainPad.Diff` how big the rolling window should be. Smaller numbers imply more resource usage but
common areas within a pair of documents which are smaller than this number will not be seen.
The default is 8.
* **transformFunction** (function) This parameter has been removed, if you attempt to pass this
argument ChainPad will fail to start and throw an error.


## Binding the ChainPad Session to the Data Transport

To bind the session to a data transport such as a websocket, you'll need to use the `message()`
and `onMessage()` methods of the ChainPad session object as follows:

* **message**: Function which takes a String and signals the ChainPad engine of an incoming
message.
* **onMessage**: Function which takes a function taking a String, called by the ChainPad engine
when a message is to be sent.

```javascript
var socket = new WebSocket("ws://your.server:port/");
socket.onopen = function(evt) {
    socket.onmessage = function (evt) { chainpad.message(evt.data); };
    chainpad.onMessage(function (message, cb) {
        socket.send(message);
        // Really the callback should only be called after you are sure the server has the patch.
        cb();
    });
});
```

### Binding the ChainPad Session to the User Interface

* Register a function to handle *changes* to the document, a change comprises an offset, a number
of characters to be removed and a number of characters to be inserted. This is the easiest way
to interact with ChainPad.
```javascript
var myContent = '';
chainpad.onChange(function (offset, toRemove, toInsert) {
    myContent = myContent.substring(0, offset) + toInsert + myContent.substring(offset + toRemove);
});
```

* Signal to chainpad engine that the user has inserted and/or removed content with the *change()*
function.
```javascript
var chainpad = ChainPad.create();
chainpad.change(0, 0, "Hello world");
console.log(chainpad.getUserDoc()); // -> "Hello world"
chainpad.change(0, 5, "Goodbye cruel");
console.log(chainpad.getUserDoc()); // -> "Goodbye cruel world"
```

* Register a function to handle a patch to the document, a patch is a series of insertions and
deletions which may must be applied atomically. When applying, the operations in the patch must
be applied in *decending* order, from highest index to zero. For more information about Patch,
see `chainpad.Patch`.
```javascript
chainpad.onPatch(function(patch) {});
```

* Signal the chainpad engine that the user has inserted and/or removed content to/from the document.
The Patch object can be constructed using Patch.create and Operations can be added to the patch
using Operation.create and Patch.addOperation(). See **ChainPad Internals** for more information.
```javascript
chainpad.patch(patch);
```

## Block Object

A block object is an internal representation of a message sent on the wire, each block contains a
**Patch** which itself contains one or more **Operations**. You can access **Blocks** using
`chainpad.getAuthBlock()` or `chainpad.getBlockForHash()`.

### Fields/Functions

* **hashOf**: Calculated SHA256 of the on-wire representation of this **Block** (as a **Message**).
* **lastMsgHash**: SHA256 of previous/parent **Block** in the chain. If this is all zeros then this
**Block** is the initial block.
* **isCheckpoint**: True if this **Block** represents a *checkpoint*. A *checkpoint* always removes
all of the content from the document and then adds it back, leaving the document as it was.
* **getParent**`() -> Block`: Get the parent block of this block, this is fast because the blocks
are already in the chain in memory.
* **getContent**`() -> string`: Get the content of the *Authoritative Document* at the point in the
history represented by this block. This takes time because it requires replaying part of the chain.
* **getPatch**`() -> Patch`: Get a clone of the **Patch** which is contained in this block.
* **getInversePatch**`() -> Patch`: Get a clone of the inverse **Patch** (the **Patch** which would
undo the **Patch** provided by **getPatch**). This is calculated when the **Message** comes in to
ChainPad.
* **equals**`(Block) -> Boolean`: Find out if another **Block** is representing the same underlying
structure, since **Blocks** are created whenever one is requested, using triple-equals is not ok.

## Control Functions

### chainpad.start()

Start the engine, this will cause the engine to setup a setInterval to sync back the changes
reported. Before start() is called, you can still inform chainpad of changes from the network.

### chainpad.abort()

Stop the engine, no more messages will be sent, even if there is *Uncommitted Work*.

### chainpad.sync()

Flush the *Uncommitted Work* back to the server, there is no guarantee that the work is actually
committed, just that it has attempted to send it to the server.

### chainpad.getAuthDoc()

Access the *Authoritative Document*, this is the content which everybody has agreed upon and has
been entered into the chain.

### chainpad.getAuthBlock()

Access the blockchain block which is at the head of the chain, this block contains the last patch
which made the *Authoritative Document* what it is. This returns a *Block Object*.

### chainpad.getBlockForHash()

Access the stored block which based on the SHA-256 hash.

### chainpad.getUserDoc()

Access the document which the engine believes is in the user interface, this is equivilant to
the *Authoritative Document* with the *Uncommitted Work* patch applied. Useful for debugging.
This should be equivilant to the string representation of the content which is in the UI.

### chainpad.getDepthOfState(state [,minDepth])

Determine how deep a particular state is in the chain _relative to the current state_. Depth means
the number of patches.

```javascript
// the authDoc is 0 patches deep, by definition
0 === chainpad.getDepthOfState(chainpad.getAuthDoc());

// if a state never existed in the chain, return value is -1
-1 === chainpad.getDepthOfState("said no one ever");
// ^^ assuming the state of the document was never "said no one ever"
```

You can specify a minimum depth to traverse, skip forward (down) this number of patches before
starting to try to match the specified content. This allows you to see multiple times in history
when the content was equal to the specified content. This function will not detect depth of states
older than the second checkpoint because this is pruned.

```javascript
// determine the last time the userDoc was 'pewpew'
var firstEncounter = chainpad.getDepthOfState('pewpew');

// check if it was ever previously in that state
if (chainpad.getDepthOfState('pewpew', firstEncounter) !== -1) {
    // use this pattern to check if the document state was 'pewpew'
    // at more than one point in its history
    console.log("the state 'pewpew' exists in the chain in at least two states");
}
```

### chainpad.onSettle()

Register a handler to be called *once* when there is no *Uncommitted Work* left. This does not
prove that no patch will be reverted because of a chain fork, but it does verify that the message
has hit the server and been acknowledged. The handler will be called only once the next time the
state is settled but you can re-register inside of the handler.

### chainpad.getLag()

Tells the amount of lag between the last onMessage events being fired by chainpad and the callback.
Specifically this returns an object with lag and pending properties. Pending is true if a message
has been sent which has not yet been acknowledged. Lag is the amount of time between the previous
sent message and it's response or if the previously send message has not yet been acknowledged, it
is the amount of time since it was sent.

# Internals

## Data Types

* **Operation**: An atomic insertion and/or deletion of a string at an offset in the document.
An Operation can contain both insertion and deletion and in this case, the deletion will occur
first.
* **Patch**: A list of **Operations** to be applied to the document in order and a hash of the
document content at the previous state (before the patch is applied).
* **Message**: Either a request to register the user, an announcement of a user having joined the
document or an encapsulation of a **Patch** to be sent over the wire.
* **Block**: This is an API encapsulation of the **Message** when it is in the chain.

## Functions

* **apply**`(Patch, Document) -> Document`: This function is fairly self-explanatory, a new document
is returned which reflects the result of applying the **Patch** to the document. The hash of the
document must be equal to `patch.parentHash`, otherwise an error will result.
* **merge**`(Patch, Patch) -> Patch`: Merging of two mergable **Patches** yields a **Patch** which
does the equivilant of applying the first **Patch**, then the second. Any two **Operations** which
act upon overlapping or abutting sections of a document can (and must) be merged. A **Patch**
containing mergable operations in invalid.
* **invert**`(Patch, Document) -> Patch`: Given a **Patch** and the document to which it could be
applied, calculate the *inverse* **Patch**, IE: the **Patch** which would un-do the operation of
applying the original **Patch**.
* **simplify**`(Patch, Document) -> Patch`: After **merging** of **Patches**, it is possible to end
up with a **Patch** which contains some redundant or partially redundant **Operations**, a redundant
**Operation** is one which removes some content from the document and then adds back the very same
content. Since the actual content to be removed is not stored in the **Operation** or **Patch**, the
**simplify** function exists to find and remove any redundancy in the **Patch**. Any **Patch** which
is sent over the wire which can still be **simplified** is invalid.
* **transform**`(Patch, Patch, Document) -> Patch`: This is the traditional Operational Transform
function. This is the only function which can *lose information*, for example if Alice and Bob both
delete the same text at the same time, **transform** will merge those two deletions. It is critical
to note that **transform** is only carried out upon the user's *Uncommitted Work*, never on any
other user's work so **transform's** decision making cannot possibly lead to de-synchronization.

## Mechanics

Internally the client stores a document known as the *Authoritative Document* this is the last known
state of the document which is agreed upon by all of the clients and the *Authoritative Document*
can only be changed as a result of an incoming **Patch** from the server. The difference between
what the user sees in their screen and the *Authoritative Document* is represented by a **Patch**
known as the *Uncommitted Work*.

When the user types in the document, onInsert() and onRemove() are called, creating **Operations**
which are **merged** into the *Uncommitted Work*. As the user adds and removes text, this **Patch**
grows. Periodically the engine transmits the *Uncommitted Work* to the server.
When the *Uncommitted Work* is transmitted to the server which will broadcast it out to all clients.

When a **Patch** is received from the server, it is first examined for validity and discarded if it
is obviously invalid. If this **Patch** is rooted in the current *Authoritative Document*, the
**Patch** is applied to the *Authoritative Document* and the user's *Uncommitted Work* is
**transformed** by that patch. If the **Patch** happens to be created by the current user, the
inverse of the **Patch** is merged with the user's *Uncommitted Work*, thus removing the committed
part.

If a **Patch** is received which does not root in the *Authoritative Document*, it is stored
by the client in case it is actually part of the chain but other patches have not yet been filled
in. If a **Patch** is rooted in a previous state of the document which is not the
*Authoritative Document*, the patch is stored in case it might be part of a fork of the patch-chain
which proves longer than the chain which the engine currently is aware of.

In the event that a fork of the chain becomes longer than the currently accepted chain, a
"reorganization" (Bitcoin term) will occur which will cause the *Authoritative Document* to be
rolled back to a previous state and then rolled forward along the winning chain. In the event of a
"reorganization", work which the user wrote which was committed may be reverted and as the engine
detects that it's own patch has been reverted, the content will be re-added to the user's
*Uncommitted Work* to be pushed to the server next time it is synced.

The initial startup of the engine, the server is asked for all of the **Messages** to date. These
are filtered through the engine as with any other incoming **Message** in a process which Bitcoin
developers will recognize as "syncing the chain".

A special type of **Patch** is known as a **Checkpoint** and a checkpoint always removes and re-adds
all content to the pad. The server may detect checkpoint patches because they are represented on
the wire as an array with a 4 as the first element. In order to improve performance of new users
joining the pad and "syncing" the chain, the server may send only the second most recent checkpoint
and all patches newer than that.


## Relationship to Bitcoin

Those with knowledge of Bitcoin will recognize this consensus protocol as inherently a
Nakamoto Chain. Whereas Bitcoin uses blocks, each of which point to the previous block, ChainPad
uses **Patches** each of which point to the previous state of the document. In the case of ChainPad
there is of course no mining or difficulty as security is not intended by this protocol. Obviously
it would be trivial to generate ever longer side-chains, causing all work to be reverted and
jamming the document.

A more subtle difference is the use of "lowest hash wins" as a tie-breaker. Bitcoin very cleverly
does *not* use "lowest hash wins" in order to prevent miners from withholding valid blocks with
particularly low hashes in order to gain advantages by mining against their own block before anyone
else gets a chance. Again since security is not a consideration in this design, "lowest hash wins"
is used in order to expediate convergence in the event of a split.
