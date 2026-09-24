'use strict';

/**
 * Removes all requests from the queue.
 *
 * @returns {Promise<Array<object>>} The requests that were queued.
 */
module.exports = async function flush() {
    if (this._timer) {
        clearTimeout(this._timer);
        this._timer = null;
    }

    // We must get a local copy of the queue and clear it before iterating it.
    // The client will invoke this flush function _many_ times. If we try to
    // iterate it without a local copy and clearing first then we will overflow
    // the stack.
    const requests = Array.from(this._queue.values());
    this._queue.clear();
    return requests;
};
