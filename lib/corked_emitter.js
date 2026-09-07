'use strict';

const { EventEmitter } = require('events');

/**
 * A CorkedEmitter is a variant of an EventEmitter where events emitted wait
 *  for the appearance of the first listener of any kind. That is, a
 *  CorkedEmitter will store all .emit()s it receives, to be replayed later
 *  when an .on() is applied.
 * It is meant for situations where the consumers of the emitter are unable to
 *  register listeners right away, and cannot afford to miss any events emitted
 *  from the start.
 * Note that, whenever the first emitter (for any event) appears, the emitter
 *  becomes uncorked and works as usual for ALL events, and will not cache
 *  anything anymore. This is necessary to avoid re-ordering emits - either
 *  everything is being buffered, or nothing.
 */
class CorkedEmitter extends EventEmitter {
    /**
     * An array of arguments objects (array-likes) to emit on open.
     */
    #outstandingEmits = [];
    /**
     * Whether the normal flow of emits is restored yet.
     */
    #opened = false;

    constructor() {
        super();
        // When the first listener appears, we enqueue an opening.
        // It is not done immediately, so that other listeners can be
        //  registered in the same critical section.
        const self = this;
        this.once('newListener', function () {
            setImmediate(function releaseStoredEvents() {
                self.#opened = true;
                self.#outstandingEmits.forEach(function (args) {
                    self.emit(...args);
                });
            });
        });
    }

    emit(eventName, ...args) {
        if (this.#opened || eventName === 'newListener') {
            return super.emit(eventName, ...args);
        }
        this.#outstandingEmits.push([eventName, ...args]);
        return false;
    }
}

module.exports = CorkedEmitter;