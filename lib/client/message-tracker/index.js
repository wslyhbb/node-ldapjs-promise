'use strict';

const idGeneratorFactory = require('./id-generator');
const purgeAbandoned = require('./purge-abandoned');

/**
 * Returns a message tracker object that keeps track of which message
 * identifiers correspond to which message handlers. Also handles keeping track
 * of abandoned messages.
 *
 * @param {object} options
 * @param {string} options.id An identifier for the tracker.
 * @param {object} options.parser An object that will be used to parse messages.
 *
 * @returns {MessageTracker}
 */
module.exports = function messageTrackerFactory(options) {
    if (Object.prototype.toString.call(options) !== '[object Object]') {
        throw Error('options object is required')
    }
    if (!options.id || typeof options.id !== 'string') {
        throw Error('options.id string is required')
    }
    if (!options.parser || Object.prototype.toString.call(options.parser) !== '[object Object]') {
        throw Error('options.parser object is required')
    }
  
    let currentID = 0;
    const nextID = idGeneratorFactory();
    const messages = new Map();
    const abandoned = new Map();
  
    /**
     * @typedef {object} MessageTracker
     * @property {string} id The identifier of the tracker as supplied via the options.
     * @property {object} parser The parser object given by the the options.
     */
    const tracker = {
        id: options.id,
        parser: options.parser,

        /**
         * Count of messages awaiting response.
         *
         * @alias pending
         * @memberof! MessageTracker#
         */
        get pending() {
            return messages.size;
        },

        /**
         * Move a specific message to the abanded track.
         *
         * @param {integer} msgID The identifier for the message to move.
         *
         * @memberof MessageTracker
         * @method abandon
         */
        abandon(msgID) {
            if (messages.has(msgID) === false) return false;
            const toAbandon = messages.get(msgID);
            abandoned.set(msgID, {
                age: currentID,
                message: toAbandon.message,
                handler: toAbandon.handler,
                resolve: toAbandon.resolve,
                reject: toAbandon.reject
            });
            return messages.delete(msgID);
        },
    
        /**
         * @typedef {object} Tracked
         * @property {object} message The tracked message. Usually the outgoing
         * request object.
         * @property {Function} resolve Resolves the request promise.
         * @property {Function} reject Rejects the request promise.
         * @property {Function} handler Handles an incoming protocol message.
         */
        
        /**
         * Retrieves the message handler for a message. Removes abandoned messages
         * that have been given time to be resolved.
         *
         * @param {integer} msgID The identifier for the message to get the
         * handler for.
         *
         * @memberof MessageTracker
         * @method fetch
         */
        fetch(msgID) {
            const tracked = messages.get(msgID);
            if (tracked) {
                purgeAbandoned(msgID, abandoned);
                return tracked;
            }
    
            // We sent an abandon request but the server either wasn't able to process
            // it or has not received it yet. Therefore, we received a response for the
            // abandoned message. So we must return its promise handlers.
            const abandonedMsg = abandoned.get(msgID);
            if (abandonedMsg) {
                return abandonedMsg;
            }
        
            return null;
        },
        
        /**
         * Removes all message tracks and returns their promise handlers.
         *
         * @memberof MessageTracker
         * @method purge
         */
        purge() {
            const purged = [];
            messages.forEach((val, key) => {
                purgeAbandoned(key, abandoned);
                tracker.remove(key);
                purged.push({ msgID: key, ...val });
            });
            return purged;
        },

        /**
         * Removes a message from all tracking.
         *
         * @param {integer} msgID The identifier for the message to remove from tracking.
         *
         * @memberof MessageTracker
         * @method remove
         */
        remove(msgID) {
            if (messages.delete(msgID) === false) {
                abandoned.delete(msgID);
            }
        },

        /**
         * Add a message handler to be tracked.
         *
         * @param {object} message The message object to be tracked. This object
         * will have a new property added to it: `messageId`.
         * @param {object} handlers Promise handlers for the message.
         *
         * @memberof MessageTracker
         * @method track
         */
        track(message, handlers) {
            currentID = nextID();
            // This side effect is not ideal but the client does not attach the
            // tracker to itself until after the `.connect` method has fired.
            // If this can be refactored later, then we can possibly get rid of
            // this side effect.
            message.messageId = currentID;
            messages.set(currentID, { ...handlers, message });
        }
    };

    return tracker;
};
