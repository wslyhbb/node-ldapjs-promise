'use strict';
const assert = require('node:assert');
const { SearchResultEntry, SearchRequest } = require('@ldapjs/messages');
const ldapjs = require('../');

const server = ldapjs.createServer();

const SUFFIX = '';
const directory = {
    'dc=example,dc=com': {
        objectclass: 'example',
        dc: 'example',
        cn: 'example'
    }
};

server.bind(SUFFIX, (req, res, done) => {
    res.end();
    return done();
});

server.search(SUFFIX, (req, res, done) => {
    const dn = req.dn.toString().toLowerCase();

    if (Object.hasOwn(directory, dn) === false) {
        return done(Error('not in directory'));
    }

    switch (req.scope) {
        case SearchRequest.SCOPE_BASE:
        case SearchRequest.SCOPE_SUBTREE: {
            res.send(new SearchResultEntry({
                objectName: `dc=${req.scopeName}`
            }));
            break;
        }
    }

    res.end();
    done();
});

describe('issue 845', () => {
    let client;
    let searchOpts;

    beforeEach(done => {
        server.listen(0, '127.0.0.1', (err) => {
            if (err) return done(err);

            client = ldapjs.createClient({ url: [server.url] });
            searchOpts = {
                filter: '(&(objectClass=*))',
                scope: 'sub',
                attributes: ['dn', 'cn']
            };

            done();
        });
    });

    afterEach(async () => {
        await client.destroy();
        await new Promise((resolve, reject) => {
            server.close((err) => {
                if (err) return reject(err);
                resolve();
            });
        });
    });

    it('should reject if search not in directory', async () => {
        const res = await client.search('dc=nope', searchOpts);

        await new Promise((resolve, reject) => {
            res.on('error', err => {
                // TODO: plain error messages should not be lost
                // This should be fixed in a revamp of the server code.
                // ~ jsumners 2023-03-08
                try {
                    assert.strictEqual(err.lde_message, 'Operations Error');
                    resolve();
                } catch (assertionError) {
                    reject(assertionError);
                }
            });
        });
    });

    it('base scope matches', async () => {
        searchOpts.scope = 'base'
        const res = await client.search('dc=example,dc=com', searchOpts);

        await new Promise((resolve, reject) => {
            res.on('error', err => {
                reject(err);
            });
            res.on('searchEntry', entry => {
                try {
                    assert.strictEqual(entry.objectName.toString(), 'dc=base');
                    resolve();
                } catch (assertionError) {
                    reject(assertionError);
                }
            });
        });
    });

    it('sub scope matches', async () => {
        const res = await client.search('dc=example,dc=com', searchOpts);

        await new Promise((resolve, reject) => {
            res.on('error', err => {
                reject(err);
            });
            res.on('searchEntry', entry => {
                try {
                    assert.strictEqual(entry.objectName.toString(), 'dc=subtree');
                    resolve();
                } catch (assertionError) {
                    reject(assertionError);
                }
            });
        });
    });
});
