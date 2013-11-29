First the structures.
The base structure is the Operation.
    return {
        type: 'Operation',
        offset: 0,
        toDelete: 0,
        toInsert: '',
    };

Deletion happens before insertion.

Applying an Operation upon a piece of data yields a result and an inverse Operation.

Two operations which act upon overlapping or abutting sections of a document can be merged.

Merging of two mergable operations yields an operation which does the equivilant of applying
the first operation, then the second.

If two operations cannot be merged and the newer operation has a higher offset, this operation
can be rebased. Rebasing adjusts the offset of the operation so that it is what it would have
been, had the older operation not taken place.


A patch is a series of operations.
If any two operations in a patch are mergable, the patch is invalid.

If the operations in a patch are not ordered by offset ascending, the patch is invalid.

Applying a patch is done by applying each of the operations in descending order, offsets
are all absolute to the pre-patch state of the document.

Applying a patch to a piece of data yields the result and the inverse patch.

Adding an operation to a patch is done by iterating over the operations in the patch in
ascending order, merging or, if merging is impossible, rebasing, the new operation against
each one until one is reached with which it cannot be either merged or rebased. The new
operation (or result of m mergers) is inserted before this operation thus maintaining the
order of operations and thereby the validity of the patch.

Merging two patches is simply a matter of adding each operation from the newer patch to a
clone of the older patch.



When a client first starts up, it sends a request for the patch set to date, it keeps a
patch representing uncommitted work, a string representing the authoritative document and
a list of all *inverse* patches which if, applied in descending order, would convert the
authoritative document back to the initial state.

When the user presses a key, the binding interprets the message from the browser and sends
an Insert or Delete message to the realtime engine, this message contains an offset and
either a string or a number of characters to delete.

From this information an operation is created, the operation is added to a patch which
represents uncommitted work. Every 3 seconds this patch is pushed to the server.

When a patch comes in from the server, it is either based on the last known authoritative
patch or it is not. If it is based on an earlier authoritative patch then the hash of the
new patch is compared with the hashes of each patch with which it collides, if any of them
have a lower integer value, the patch is rejected. This is not secure but does make sure
that all clients will settle on the same truth.

If the patch is not rejected, each of the inverse patches which it invalidates is applied
to the authoritative document, thus reverting it to an earlier state. Finally the newly
received patch is applied to the authoritative document to bring it into agreement with
the other clients.

At this point, the patch representing the user's work must be *transformed*. This
transformation is the only operation which causes data loss and this is the operation which
an HTML editor would need to alter in order to prevent it from placing incorrect text inside
of HTML tags. In order to transform the user's uncommitted work, each of patches which were
just applied to the authoritative document are merged and the user's work is transformed
against the result of this merger.

One final thing which must be done is to bring the user interface into agreement with the
authoritative document. First we calculate the inverse of the user's uncommitted work prior
to the transformation. This inverse patch is then merged with the merge result which the
user's work was previously transformed against. Finally we merge the newly transformed
user's work with this patch, yielding a patch which takes us from the previous state of
the user's uncommitted work to the new state of the user's uncommitted work.

Each operation in this patch is sent out to the binding as an Insert or Delete message to
update the user interface.

When a patch comes in which is the user's own patch, we apply the patch to the authoritative
document and add it's inverse to the list of inverse patches as is the usual and then
instead of transforming we merge the inverse of this patch with the user's uncommitted work,
thus removing the work which has just been committed.
