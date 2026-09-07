'use strict';

// This test is complicated. It must simulate a server sending an unsolicited,
// or a mismatched, message in order to force the client's internal message
// tracker to try and find a corresponding sent message that does not exist.
// In order to do that, we need to set a high test timeout and wait for the
// error message to be logged.

const assert = require('node:assert');
const ldapjs = require('../');
const { SearchResultEntry } = require('@ldapjs/messages');
const server = ldapjs.createServer();
const SUFFIX = '';

server.bind(SUFFIX, (req, res, done) => {
    res.end();
    return done();
});

server.search(SUFFIX, (req, res, done) => {
    const result = new SearchResultEntry({
        objectName: `dc=${req.scopeName}`
    });

    // Respond to the search request with a matched response.
    res.send(result);
    res.end();

    // After a short delay, send ANOTHER response to the client that will not
    // be matched by the client's internal tracker.
    setTimeout(
        () => {
            res.send(result);
            res.end();
            done();
        },
        100
    );
});

describe('issue-890', function () {
    let client;
    let logMessages;

    beforeEach(function () {
        this.timeout(10000);

        return new Promise((resolve, reject) => {
            server.listen(0, '127.0.0.1', (err) => {
                if (err) return reject(err);

                logMessages = [];
                const logger = {
                    child() { return this; },
                    debug() { },
                    error(...args) {
                        logMessages.push(args);
                    },
                    trace() { }
                };

                client = ldapjs.createClient({
                    url: [server.url],
                    timeout: 500,
                    log: logger
                });

                resolve();
            });
        });
    });

    afterEach(async function () {
        await client.destroy();
        return new Promise((resolve, reject) => {
            server.close((err) => {
                if (err) return reject(err);
                resolve();
            });
        });
    });

    it('should handle null messages', async function () {
        // There's no way to get an error from the client when it has received an
        // unmatched response from the server. So we need to poll our logger instance
        // and detect when the corresponding error message has been logged.
        const response = await client.search('dc=test', {});
        await new Promise((resolve, reject) => {
            const timer = setInterval(() => {
                if (logMessages.length > 0) {
                    clearInterval(timer);
                    try {
                        assert.strictEqual(
                            logMessages.some(msg => msg[1] === 'unmatched server message received'),
                            true
                        );
                        resolve();
                    } catch (error) {
                        reject(error);
                    }
                }
            }, 100);

            response.once('error', (error) => {
                clearInterval(timer);
                reject(error);
            });
        });
    });
});
