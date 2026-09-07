'use strict';
const util = require('util');
const assert = require('node:assert');
const { EventEmitter } = require('node:events');
const tls = require('node:tls');
const getPort = require('get-port').default;
const { getSock, uuid } = require('./utils');
const Attribute = require('@ldapjs/attribute');
const Change = require('@ldapjs/change');
const messages = require('@ldapjs/messages');
const controls = require('@ldapjs/controls');
const dn = require('@ldapjs/dn');
const ldap = require('../lib');

const {
    SearchRequest,
    SearchResultEntry,
    SearchResultReference,
    SearchResultDone
} = messages;

const SUFFIX = 'dc=test';
const LDAP_CONNECT_TIMEOUT = process.env.LDAP_CONNECT_TIMEOUT || 0;
const BIND_DN = 'cn=root';
const BIND_PW = 'secret';

describe('LdapClient', function () {
    let socketPath;
    let server;
    let client;

    beforeEach(function () {
        return new Promise((resolve) => {
            socketPath = getSock();
            server = ldap.createServer();

            server.bind(BIND_DN, function (req, res, next) {
                if (req.credentials !== BIND_PW) {
                  return next(new ldap.InvalidCredentialsError('Invalid password'));
                }

                res.end();
                return next();
            });

            server.add(SUFFIX, function (req, res, next) {
                res.end();
                return next();
            });

            server.compare(SUFFIX, function (req, res, next) {
                res.end(req.value === 'test');
                return next();
            });

            server.del(SUFFIX, function (req, res, next) {
                res.end();
                return next();
            });

            server.exop('1.3.6.1.4.1.4203.1.11.3', function (req, res, next) {
                res.responseValue = 'u:xxyyz@EXAMPLE.NET';
                res.end();
                return next();
            });

            server.modify(SUFFIX, function (req, res, next) {
                res.end();
                return next();
            });

            server.modifyDN(SUFFIX, function (req, res, next) {
                res.end();
                return next();
            });

            server.modifyDN('cn=issue-480', function (req, res, next) {
                assert(req.newRdn.toString().length > 132);
                res.end();
                return next();
            });

            server.search('dc=slow', function (req, res, next) {
                res.send({
                    dn: 'dc=slow',
                    attributes: {
                        you: 'wish',
                        this: 'was',
                        faster: '.'
                    }
                });
                setTimeout(function () {
                    res.end();
                    next();
                }, 250);
            });

            server.search('dc=timeout', function () {
                // Cause the client to timeout by not sending a response.
            });

            server.search(SUFFIX, function (req, res, next) {
                if (req.dn.equals('cn=ref,' + SUFFIX)) {
                    res.send(res.createSearchReference('ldap://localhost'));
                } else if (req.dn.equals('cn=bin,' + SUFFIX)) {
                    const attributes = [
                        new Attribute({
                          type: 'foo;binary', values: ['wr0gKyDCvCA9IMK+']
                      }),
                      new Attribute({
                          type: 'gb18030',
                          values: [Buffer.from([0xB5, 0xE7, 0xCA, 0xD3, 0xBB, 0xFA])]
                      }),
                      new Attribute({
                          type: 'objectclass', values: ['binary']
                      })
                    ];
                    res.send(res.createSearchEntry({
                        objectName: req.dn,
                        attributes
                    }));
                } else {
                    const attributes = [
                        new Attribute({ type: 'cn', values: ['unit', 'test'] }),
                        new Attribute({ type: 'SN', values: ['testy'] })
                    ];
                    const e = res.createSearchEntry({
                        objectName: req.dn,
                        attributes
                    });
                    res.send(e);
                    res.send(e);
                }

                res.end();
                return next();
            });

            server.search('cn=sizelimit', function (req, res, next) {
                const sizeLimit = 200;
                for (let i = 0; i < 1000; i++) {
                    if (req.sizeLimit > 0 && i >= req.sizeLimit) {
                        break;
                    } else if (i > sizeLimit) {
                        res.end(ldap.LDAP_SIZE_LIMIT_EXCEEDED);
                        return next();
                    }
                    res.send({
                        dn: util.format('o=%d, cn=sizelimit', i),
                        attributes: {
                            o: [i],
                            objectclass: ['pagedResult']
                        }
                    });
                }
                res.end();
                return next();
            });

            server.search('cn=paged', function (req, res, next) {
                const min = 0;
                const max = 1000;

                function sendResults (start, end) {
                    start = (start < min) ? min : start;
                    end = (end > max || end < min) ? max : end;
                    let i;
                    for (i = start; i < end; i++) {
                        res.send(new SearchResultEntry({
                            messageId: res.id,
                            entry: `o=${i},cn=paged`,
                            attributes: Attribute.fromObject({
                                o: [i],
                                objectclass: ['pagedResult']
                            })
                        }));
                    }
                    return i;
                }

                let cookie = null;
                let pageSize = 0;
                req.controls.forEach(function (control) {
                    if (control.type === controls.PagedResultsControl.OID) {
                        pageSize = control.value.size;
                        cookie = control.value.cookie;
                    }
                });

                if (!cookie || Buffer.isBuffer(cookie) === false) {
                    // do not allow non-paged searches for this test endpoint
                    next(Error('unwilling to perform'));
                    return;
                }

                // Do simple paging
                let first = min;
                if (cookie.length !== 0) {
                    first = parseInt(cookie.toString(), 10);
                }
                const last = sendResults(first, first + pageSize);

                let resultCookie;
                if (last < max) {
                    resultCookie = Buffer.from(last.toString());
                } else {
                    resultCookie = Buffer.from('');
                }
                res.addControl(new controls.PagedResultsControl({
                    value: {
                        size: pageSize,
                        cookie: resultCookie
                    }
                }));
                res.end();
                next();
            });

            server.search('cn=sssvlv', function (req, res, next) {
                const min = 0;
                const max = 100;
                const results = [];
                let o = 'aa';
                for (let i = min; i < max; i++) {
                    results.push({
                        dn: util.format('o=%s, cn=sssvlv', o),
                        attributes: {
                            o: [o],
                            objectclass: ['sssvlvResult']
                        }
                    });
                    o = ((parseInt(o, 36) + 1).toString(36)).replace(/0/g, 'a');
                }
                function sendResults (start, end, sortBy, sortDesc) {
                    start = (start < min) ? min : start;
                    end = (end > max || end < min) ? max : end;
                    const sorted = results.sort((a, b) => {
                        if (a.attributes[sortBy][0] < b.attributes[sortBy][0]) {
                            return sortDesc ? 1 : -1;
                        } else if (a.attributes[sortBy][0] > b.attributes[sortBy][0]) {
                            return sortDesc ? -1 : 1;
                        }
                        return 0;
                    });
                    for (let i = start; i < end; i++) {
                        res.send(sorted[i]);
                    }
                }
                let sortBy = null;
                let sortDesc = null;
                let afterCount = null;
                let targetOffset = null;
                req.controls.forEach(function (control) {
                    if (control.type === ldap.ServerSideSortingRequestControl.OID) {
                        sortBy = control.value[0].attributeType;
                        sortDesc = control.value[0].reverseOrder;
                    }
                    if (control.type === ldap.VirtualListViewRequestControl.OID) {
                        afterCount = control.value.afterCount;
                        targetOffset = control.value.targetOffset;
                    }
                });
                if (sortBy) {
                    if (afterCount && targetOffset) {
                        sendResults(targetOffset - 1, (targetOffset + afterCount), sortBy, sortDesc);
                    } else {
                        sendResults(min, max, sortBy, sortDesc);
                    }
                    res.end();
                    next();
                } else {
                    next(new ldap.UnwillingToPerformError());
                }
            });

            server.search('cn=pagederr', function (req, res, next) {
                let cookie = null;
                req.controls.forEach(function (control) {
                    if (control.type === ldap.PagedResultsControl.OID) {
                      cookie = control.value.cookie;
                    }
                });
                if (cookie && Buffer.isBuffer(cookie) && cookie.length === 0) {
                    res.send({
                      dn: util.format('o=result, cn=pagederr'),
                      attributes: {
                          o: 'result',
                          objectclass: ['pagedResult']
                      }
                    });
                    res.controls.push(new ldap.PagedResultsControl({
                        value: {
                            size: 2,
                            cookie: Buffer.from('a')
                        }
                    }));
                    res.end();
                    return next();
                }

                res.end(ldap.LDAP_SIZE_LIMIT_EXCEEDED);
                return next();
            });

            server.search('dc=empty', function (req, res, next) {
                res.send({
                    dn: 'dc=empty',
                    attributes: {
                        member: [],
                        'member;range=0-1': ['cn=user1, dc=empty', 'cn=user2, dc=empty']
                    }
                });
                res.end();
                return next();
            });

            server.search('cn=busy', function (req, res, next) {
                next(new ldap.BusyError('too much to do'));
            });

            server.search('', function (req, res, next) {
                if (req.dn.toString() === '') {
                    res.send({
                        dn: '',
                        attributes: {
                            objectclass: ['RootDSE', 'top']
                        }
                    });
                    res.end();
                } else {
                    res.errorMessage = 'No tree found for: ' + req.dn.toString();
                    res.end(ldap.LDAP_NO_SUCH_OBJECT);
                }
                return next();
            });

            server.unbind(function (req, res, next) {
                res.end();
                return next();
            });

            server.listen(socketPath, function () {
                client = ldap.createClient({
                    connectTimeout: parseInt(LDAP_CONNECT_TIMEOUT, 10),
                    socketPath: socketPath
                });
                client.on('connect', () => resolve());
            });
        });
    });

    afterEach(function () {
        return new Promise(async (resolve) => {
            if (client) {
                await client.unbind();
            }
            if (server) {
                server.close(() => resolve());
                server = null;
            } else {
                resolve();
            }
        });
    });

    describe('createClient', function () {
        it('requires an options object', function () {
            const match = /options.+required/;
            assert.throws(() => ldap.createClient(), match);
            assert.throws(() => ldap.createClient([]), match);
            assert.throws(() => ldap.createClient(''), match);
            assert.throws(() => ldap.createClient(42), match);
        });

        it('url must be a string or array', function () {
            const match = /options\.url \(string\|array\) required/;
            assert.throws(() => ldap.createClient({ url: {} }), match);
            assert.throws(() => ldap.createClient({ url: 42 }), match);
        });

        it('socketPath must be a string', function () {
            const match = /options\.socketPath must be a string/;
            assert.throws(() => ldap.createClient({ socketPath: {} }), match);
            assert.throws(() => ldap.createClient({ socketPath: [] }), match);
            assert.throws(() => ldap.createClient({ socketPath: 42 }), match);
        });

        it('cannot supply both url and socketPath', function () {
            assert.throws(
                () => ldap.createClient({ url: 'foo', socketPath: 'bar' }),
                /options\.url \^ options\.socketPath \(String\) required/
            );
        });

        it('must supply at least url or socketPath', function () {
            assert.throws(
                () => ldap.createClient({}),
                /options\.url \^ options\.socketPath \(String\) required/
            );
        });

        it('exception from bad createClient parameter (issue #418)', function () {
            assert.doesNotThrow(() => {
                try {
                    ldap.createClient({ url: 'ldap://127.0.0.1:13891389' });
                } catch (error) {
                    assert.ok(error);
                }
            });
        });

        it('url array is correctly assigned', async function () {
            const unusedPortNumber = await getPort();
            const newClient = ldap.createClient({
                url: [
                  `ldap://127.0.0.1:${unusedPortNumber}`,
                  `ldap://127.0.0.2:${unusedPortNumber}`
                ],
                connectTimeout: 1
            });
            newClient.on('connectTimeout', () => {});
            newClient.on('connectError', () => {});
            newClient.on('connectRefused', () => {});

            assert.strictEqual(newClient.urls.length, 2);
            await newClient.destroy();
        });
    });

    // TODO: this test is really flaky. It would be better if we could validate
    // the options _withouth_ having to connect to a server.
    // it('attaches a child function to logger', async function () {
    //     let client;
    //     const logger = Object.create(require('abstract-logging'));
    //     const socketPath = getSock();
    //     const server = ldap.createServer();
    //     server.listen(socketPath, () => {});
    //     this.afterEach(async () => {
    //         await client.unbind();
    //         server.close();
    //     });

    //     client = ldap.createClient({ socketPath, log: logger })
    //     assert.ok(logger.child);
    //     assert.strictEqual(typeof client.log.child, 'function');
    // });

    it('simple bind failure', async function () {
        await assert.rejects(client.bind(BIND_DN, uuid()), (err) => {
            assert.ok(err);
            assert.ok(err instanceof ldap.InvalidCredentialsError);
            assert.ok(err instanceof Error);
            assert.ok(err.dn);
            assert.ok(err.message);
            assert.ok(err.stack);
            return true;
        });
    });

    it('simple bind success', async function () {
        const res = await client.bind(BIND_DN, BIND_PW);
        assert.ok(res);
        assert.strictEqual(res.status, 0);
    });

    it('simple anonymous bind (empty credentials)', async function () {
        const res = await client.bind('', '');
        assert.ok(res);
        assert.strictEqual(res.status, 0);
    });

    it('auto-bind bad credentials', async function () {
        const clt = ldap.createClient({
            socketPath: socketPath,
            bindDN: BIND_DN,
            bindCredentials: 'totallybogus'
        });
        await new Promise((resolve, reject) => {
            clt.once('error', function (err) {
                assert.strictEqual(err.code, ldap.LDAP_INVALID_CREDENTIALS);
                clt.destroy()
                    .then(resolve)
                    .catch(reject);
            });
        });
    });

    it('auto-bind success', async function () {
        const clt = ldap.createClient({
            socketPath: socketPath,
            bindDN: BIND_DN,
            bindCredentials: BIND_PW
        });
        await new Promise((resolve, reject) => {
            clt.once('connect', function () {
                assert.ok(clt);
                clt.destroy()
                    .then(resolve)
                    .catch(reject);
            });
        });
    });

    it('add success', async function () {
        const attrs = [
            new Attribute({
                type: 'cn',
                values: ['test']
            })
        ];
        const res = await client.add('cn=add, ' + SUFFIX, attrs);
        assert.ok(res);
        assert.strictEqual(res.status, 0);
    });

    it('add success with object', async function () {
        const entry = {
            cn: ['unit', 'add'],
            sn: 'test'
        };
        const res = await client.add('cn=add, ' + SUFFIX, entry);
        assert.ok(res);
        assert.strictEqual(res.status, 0);
    });

    it('add buffer', async function () {
        const { BerReader } = require('@ldapjs/asn1');
        const dnValue = `cn=add,${SUFFIX}`;
        const attribute = 'thumbnailPhoto';
        const binary = 0xa5;
        const entry = {
            [attribute]: Buffer.from([binary])
        };

        const originalSendSocket = client._sendSocket.bind(client);
        client._sendSocket = function (message, expect, emitter, callback) {
            const data = message.toBer().buffer;
            const reader = new BerReader(data);
            assert.strictEqual(data.byteLength, 48);
            assert.ok(reader.readSequence());
            assert.strictEqual(reader.readInt(), 0x1);
            assert.strictEqual(reader.readSequence(), 0x68);
            assert.strictEqual(reader.readString(), dnValue);
            assert.ok(reader.readSequence());
            assert.ok(reader.readSequence());
            assert.strictEqual(reader.readString(), attribute);
            assert.strictEqual(reader.readSequence(), 0x31);
            assert.strictEqual(reader.readByte(), 0x4);
            assert.strictEqual(reader.readByte(), 1);
            assert.strictEqual(reader.readByte(), binary);
            return originalSendSocket(message, expect, emitter, callback);
        };

        try {
            const res = await client.add(dnValue, entry);
            assert.ok(res);
            assert.strictEqual(res.status, 0);
        } finally {
            client._sendSocket = originalSendSocket;
        }
    });

    it('compare success', async function () {
        const res = await client.compare('cn=compare, ' + SUFFIX, 'cn', 'test');
        assert.ok(res.matched);
        assert.ok(res.response);
    });

    it('compare false', async function () {
        const res = await client.compare('cn=compare, ' + SUFFIX, 'cn', 'foo');
        assert.ok(!res.matched);
        assert.ok(res.response);
    });

    it('compare bad suffix', async function () {
        await assert.rejects(client.compare('cn=' + uuid(), 'cn', 'foo'),
            (err) => {
                assert.ok(err);
                assert.ok(err instanceof ldap.NoSuchObjectError);
                return true;
            });
    });

    it('delete success', async function () {
        const res = await client.del('cn=delete, ' + SUFFIX);
        assert.ok(res);
    });

    it('delete with control (GH-212)', async function () {
        const control = new ldap.Control({
            type: '1.2.3.4',
            criticality: false
        });
        const res = await client.del('cn=delete, ' + SUFFIX, control);
        assert.ok(res);
    });

    it('exop success', async function () {
        const res = await client.exop('1.3.6.1.4.1.4203.1.11.3');
        assert.ok(res.value);
        assert.ok(res.response);
        assert.strictEqual(res.value, 'u:xxyyz@EXAMPLE.NET');
    });

    it('exop invalid', async function () {
        await assert.rejects(client.exop('1.2.3.4'), (err) => {
            assert.ok(err);
            assert.ok(err instanceof ldap.ProtocolError);
            return true;
        });
    });

    it('bogus exop (GH-17)', async function () {
        await assert.rejects(client.exop('cn=root'), (err) => {
            assert.ok(err);
            return true;
        });
    });

    it('modify success', async function () {
        const change = new Change({
            type: 'Replace',
            modification: new Attribute({
                type: 'cn',
                values: ['test']
            })
        });
        const res = await client.modify('cn=modify, ' + SUFFIX, change);
        assert.ok(res);
        assert.strictEqual(res.status, 0);
    });

    it('can delete attributes', async function () {
        const change = new Change({
            type: 'Delete',
            modification: new Attribute({ type: 'cn', values: [null] })
        });
        const res = await client.modify('cn=modify,' + SUFFIX, change);
        assert.ok(res);
        assert.strictEqual(res.status, 0);
    });

    it('modify array success', async function () {
        const changes = [
            new Change({
                operation: 'Replace',
                modification: new Attribute({
                    type: 'cn',
                    values: ['test']
                })
            }),
            new Change({
                operation: 'Delete',
                modification: new Attribute({
                    type: 'sn'
                })
            })
        ];
        const res = await client.modify('cn=modify, ' + SUFFIX, changes);
        assert.ok(res);
        assert.strictEqual(res.status, 0);
    });

    it('modify DN new RDN only', async function () {
        const res = await client.modifyDN('cn=old, ' + SUFFIX, 'cn=new');
        assert.ok(res);
        assert.strictEqual(res.status, 0);
    });

    it('modify DN new superior', async function () {
        const res = await client.modifyDN('cn=old, ' + SUFFIX, 'cn=new, dc=foo');
        assert.ok(res);
        assert.strictEqual(res.status, 0);
    });

    it('modify DN excessive length (GH-480)', async function () {
        const res = await client.modifyDN('cn=issue-480',
            'cn=a292979f2c86d513d48bbb9786b564b3c5228146e5ba46f404724e322544a7304a2b1049168803a5485e2d57a544c6a0d860af91330acb77e5907a9e601ad1227e80e0dc50abe963b47a004f2c90f570450d0e920d15436fdc771e3bdac0487a9735473ed3a79361d1778d7e53a7fb0e5f01f97a75ef05837d1d5496fc86968ff47fcb64');
        assert.ok(res);
        assert.strictEqual(res.status, 0);
    });

    it('modify DN excessive superior length', function () {
        const entry = 'cn=Test     User,ou=A Long OU                  ,ou=Another Long OU                ,ou=Another Long OU              ,dc=acompany,DC=io';
        const newSuperior = 'ou=A New Long OU              , ou=Another New Long OU                                   , ou=An OU               , dc=acompany, dc=io';
        const newRdn = entry.replace(/(.*?),.*/, '$1');
        const deleteOldRdn = true;

        const req = new messages.ModifyDnRequest({
            entry,
            deleteOldRdn,
            newRdn,
            newSuperior
        });

        assert.strictEqual(req.entry.toString(), 'cn=Test     User,ou=A Long OU,ou=Another Long OU,ou=Another Long OU,dc=acompany,DC=io');
        assert.strictEqual(req.newRdn.toString(), 'cn=Test     User');
        assert.strictEqual(req.deleteOldRdn, true);
        assert.strictEqual(req.newSuperior.toString(), 'ou=A New Long OU,ou=Another New Long OU,ou=An OU,dc=acompany,dc=io');
    });

    it('search basic', async function () {
        const res = await client.search('cn=test, ' + SUFFIX, '(objectclass=*)');
        assert.ok(res);
        let gotEntry = 0;
        await new Promise((resolve) => {
            res.on('searchEntry', function (entry) {
                assert.ok(entry);
                assert.ok(entry instanceof SearchResultEntry);
                assert.strictEqual(entry.dn.toString(), 'cn=test,' + SUFFIX);
                assert.ok(entry.attributes);
                assert.ok(entry.attributes.length);
                assert.strictEqual(entry.attributes[0].type, 'cn');
                assert.strictEqual(entry.attributes[1].type, 'SN');
                gotEntry++;
            });
            res.on('error', function (err) {
                assert.fail(err);
            });
            res.on('end', function (result) {
                assert.ok(result);
                assert.ok(result instanceof SearchResultDone);
                assert.strictEqual(result.status, 0);
                assert.strictEqual(gotEntry, 2);
                resolve();
            });
        });
    });

    it('search basic with DN', async function () {
        const res = await client.search(dn.DN.fromString('cn=test, ' + SUFFIX), '(objectclass=*)');
        assert.ok(res);
        let gotEntry = 0;
        await new Promise((resolve) => {
            res.on('searchEntry', function (entry) {
                assert.ok(entry);
                assert.ok(entry instanceof SearchResultEntry);
                assert.strictEqual(entry.dn.toString(), 'cn=test,' + SUFFIX);
                assert.ok(entry.attributes);
                assert.ok(entry.attributes.length);
                assert.strictEqual(entry.attributes[0].type, 'cn');
                assert.strictEqual(entry.attributes[1].type, 'SN');
                gotEntry++;
            });
            res.on('error', function (err) {
                assert.fail(err);
            });
            res.on('end', function (result) {
                assert.ok(result);
                assert.ok(result instanceof SearchResultDone);
                assert.strictEqual(result.status, 0);
                assert.strictEqual(gotEntry, 2);
                resolve();
            });
        });
    });

    it('GH-602 search basic with delayed event listener binding', async function () {
        const res = await client.search('cn=test, ' + SUFFIX, '(objectclass=*)');
        await new Promise((resolve) => {
            setTimeout(() => {
                let gotEntry = 0;
                res.on('searchEntry', function () {
                    gotEntry++;
                });
                res.on('error', function (err) {
                    assert.fail(err);
                });
                res.on('end', function () {
                    assert.strictEqual(gotEntry, 2);
                    resolve();
                });
            }, 100);
        });
    });

    describe('search sizeLimit', function () {
        it('over limit', async function () {
            const res = await client.search('cn=sizelimit', {});
            await new Promise((resolve, reject) => {
                res.on('error', error => {
                    try {
                        assert.strictEqual(error.name, 'SizeLimitExceededError');
                        resolve();
                    } catch (assertionError) {
                        reject(assertionError);
                    }
                });

                res.on('end', () => {
                    reject(new Error('Expected size-limit error'));
                });
            });
        });

        it('under limit', async function () {
            const limit = 100;
            const res = await client.search('cn=sizelimit', { sizeLimit: limit });
            let count = 0;
            await new Promise((resolve, reject) => {
                res.on('searchEntry', function () {
                    count++;
                });
                res.on('error', function (err) {
                    reject(err);
                });
                res.on('end', function () {
                    assert.ok(true);
                    assert.strictEqual(count, limit);
                    resolve();
                });
            });
        });
    });

    describe('search paged', function () {
        it('paged - no pauses', async function () {
            let countEntries = 0;
            let countPages = 0;
            let currentSearchRequest = null;

            function entryListener() {
                countEntries += 1;
            }

            function pageListener(result) {
                countPages += 1;
                if (countPages < 10) {
                    assert.strictEqual(result.messageId,
                        currentSearchRequest.messageId);
                }
            }
            
            const res = await client.search('cn=paged', {
                paged: { pageSize: 100 } });
            await new Promise((resolve, reject) => {
                res.on('searchEntry', entryListener);
                res.on('searchRequest', (searchRequest) => {
                    assert.ok(searchRequest instanceof SearchRequest);
                    if (currentSearchRequest === null) {
                        assert.strictEqual(countPages, 0);
                    }
                    currentSearchRequest = searchRequest;
                });
                res.on('page', pageListener);
                res.on('error', (err) => reject(err));
                res.on('end', function (result) {
                    assert.strictEqual(countEntries, 1000);
                    assert.strictEqual(countPages, 10);
                    assert.strictEqual(result.messageId, currentSearchRequest.messageId);
                    res.removeListener('searchEntry', entryListener);
                    res.removeListener('page', pageListener);
                    resolve();
                });
            });
        });

        it('paged - pauses', async function () {
            let countPages = 0;
            const res = await client.search('cn=paged', {
                paged: {
                    pageSize: 100,
                    pagePause: true
                }
            });
            await new Promise((resolve, reject) => {
                function pageListener(result, cb) {
                    countPages++;
                    if (countPages === 9) {
                        res.removeListener('page', pageListener)
                            .on('page', () => reject(new Error('unexpected page')));
                        return cb(new Error());
                    }
                    return cb();
                }
                
                res.on('page', pageListener);
                res.on('error', (err) => reject(err));
                res.on('end', function () {
                    assert.strictEqual(countPages, 9);
                    resolve();
                });
            });
        });

        it('paged - no support (err handled)', async function () {
            const res = await client.search(SUFFIX, {
              paged: { pageSize: 100 }
            });
            await new Promise((resolve) => {
                res.on('pageError', () => {});
                res.on('end', function () {
                    assert.ok(true);
                    resolve();
                });
            });
        });

        it('paged - no support (err not handled)', async function () {
            const res = await client.search(SUFFIX, {
                paged: { pageSize: 100 }
            });
            await new Promise((resolve, reject) => {
                res.on('end', () => reject(new Error('should not be reached')));
                res.on('error', function (error) {
                    assert.ok(error);
                    resolve();
                });
            });
        });

        it('paged - redundant control', async function () {
            try {
                await client.search(SUFFIX, {
                    paged: { pageSize: 100 }
                }, new ldap.PagedResultsControl());
                assert.fail('Expected search to fail');
            } catch (e) {
                assert.ok(e);
            }
        });

        it('paged - handle later error', async function () {
            let countEntries = 0;
            let countPages = 0;
            const res = await client.search('cn=pagederr', {
                paged: { pageSize: 1 }
            });
            await new Promise((resolve, reject) => {
                res.on('searchEntry', function () {
                    assert.ok(++countEntries);
                });
                res.on('page', function () {
                    assert.ok(++countPages);
                });
                res.on('error', function (error) {
                    assert.ok(error);
                    assert.strictEqual(countEntries, 1);
                    assert.strictEqual(countPages, 1);
                    resolve();
                });
                res.on('end', function () {
                    reject(new Error('should not be reached'));
                });
            });
        });

        it('paged - search with delayed event listener binding', async function () {
            const res = await client.search('cn=paged', {
                filter: '(objectclass=*)', paged: true
            });
            await new Promise((resolve) => {
                setTimeout(() => {
                    let gotEntry = 0;
                    res.on('searchEntry', function () {
                        gotEntry++;
                    });
                    res.on('error', function (err) {
                        assert.fail(err);
                    });
                    res.on('end', function () {
                        assert.strictEqual(gotEntry, 1000);
                        resolve();
                    });
                }, 100);
            });
        });
    });

    // We are skipping the ServerSideSorting test because we have skipped
    // properly implementing the controls in order to get v3 shipped. These
    // tests should be re-enabled once we have addressed this issue.
    // ~ jsumners 2023-02-19
    // TODO: re-enable after adding back SSSR support
    describe.skip('search - sssvlv', function () {
        this.timeout(10000);

        it('ssv - asc', async function () {
            let preventry = null;
            const sssrcontrol = new ldap.ServerSideSortingRequestControl({
                value: {
                    attributeType: 'o',
                    orderingRule: 'caseIgnoreOrderingMatch',
                    reverseOrder: false
                }
            });
            const res = await client.search('cn=sssvlv', {}, sssrcontrol);            
            await new Promise((resolve) => {
                res.on('searchEntry', function (entry) {
                    assert.ok(entry);
                    assert.ok(entry instanceof ldap.SearchEntry);
                    assert.ok(entry.attributes);
                    assert.ok(entry.attributes.length);
                    
                    if (preventry != null) {
                        assert.ok(entry.attributes[0]._vals[0] >= preventry.attributes[0]._vals[0]);
                    }
                    preventry = entry;
                });

                res.on('error', function (err) {
                    assert.ifError(err);
                });

                res.on('end', function () {
                    resolve();
                });
            });
        });

        it('ssv - desc', async function () {
            let preventry = null;
            const sssrcontrol = new ldap.ServerSideSortingRequestControl({
                value: {
                    attributeType: 'o',
                    orderingRule: 'caseIgnoreOrderingMatch',
                    reverseOrder: true
                }
            });
            const res = await client.search('cn=sssvlv', {}, sssrcontrol);
            await new Promise((resolve) => {
                res.on('searchEntry', function (entry) {
                    assert.ok(entry);
                    assert.ok(entry instanceof ldap.SearchEntry);
                    assert.ok(entry.attributes);
                    assert.ok(entry.attributes.length);
                    
                    if (preventry != null) {
                        assert.ok(entry.attributes[0]._vals[0] <= preventry.attributes[0]._vals[0]);
                    }
                    preventry = entry;
                });

                res.on('error', function (err) {
                    assert.ifError(err);
                });

                res.on('end', function () {
                    resolve();
                });
            });
        });
        
        it.skip('vlv - first page', async function () {
            // This test is disabled.
            // See https://github.com/ldapjs/node-ldapjs/pull/797#issuecomment-1094132289
            const sssrcontrol = new ldap.ServerSideSortingRequestControl(
                {
                    value: {
                        attributeType: 'o',
                        orderingRule: 'caseIgnoreOrderingMatch',
                        reverseOrder: false
                    }
                }
            );
            const vlvrcontrol = new ldap.VirtualListViewRequestControl(
                {
                    value: {
                        beforeCount: 0,
                        afterCount: 9,
                        targetOffset: 1,
                        contentCount: 0
                    }
                }
            );
            let count = 0;
            let preventry = null;
            const res = await client.search('cn=sssvlv', {},
                [sssrcontrol, vlvrcontrol]);
            await new Promise((resolve) => {
                res.on('searchEntry', function (entry) {
                    assert.ok(entry);
                    assert.ok(entry instanceof ldap.SearchEntry);
                    assert.ok(entry.attributes);
                    assert.ok(entry.attributes.length);
                    if (preventry != null) {
                        assert.ok(entry.attributes[0]._vals[0] >= preventry.attributes[0]._vals[0]);
                    }
                    preventry = entry;
                    count++;
                });
                res.on('error', function (err) {
                    assert.ifError(err);
                });
                res.on('end', function () {
                    assert.strictEqual(count, 10);
                    resolve();
                });
            });
        });
        
        it.skip('vlv - last page', async function () {
            // This test is disabled.
            // See https://github.com/ldapjs/node-ldapjs/pull/797#issuecomment-1094132289
            const sssrcontrol = new ldap.ServerSideSortingRequestControl(
                {
                    value: {
                        attributeType: 'o',
                        orderingRule: 'caseIgnoreOrderingMatch',
                        reverseOrder: false
                    }
                }
            );
            const vlvrcontrol = new ldap.VirtualListViewRequestControl(
                {
                    value: {
                        beforeCount: 0,
                        afterCount: 9,
                        targetOffset: 91,
                        contentCount: 0
                    }
                }
            );
            let count = 0;
            let preventry = null;
            const res = await client.search('cn=sssvlv', {},
                [sssrcontrol, vlvrcontrol]);
            await new Promise((resolve) => {
                res.on('searchEntry', function (entry) {
                    assert.ok(entry);
                    assert.ok(entry instanceof ldap.SearchEntry);
                    assert.ok(entry.attributes);
                    assert.ok(entry.attributes.length);
                    if (preventry != null) {
                        assert.ok(entry.attributes[0]._vals[0] >= preventry.attributes[0]._vals[0]);
                    }
                    preventry = entry;
                    count++;
                });
                res.on('error', function (err) {
                    assert.ifError(err);
                });
                res.on('end', function () {
                    assert.strictEqual(count, 10);
                    resolve();
                });
            });
        });
    });

    it('search referral', async function () {
        const res = await client.search('cn=ref, ' + SUFFIX, '(objectclass=*)');
        assert.ok(res);
        let gotEntry = 0;
        let gotReferral = false;
        await new Promise((resolve) => {
            res.on('searchEntry', function () {
                gotEntry++;
            });
            res.on('searchReference', function (referral) {
                gotReferral = true;
                assert.ok(referral);
                assert.ok(referral instanceof SearchResultReference);
                assert.ok(referral.uris);
                assert.ok(referral.uris.length);
            });
            res.on('error', function (err) {
                assert.fail(err);
            });
            res.on('end', function (result) {
                assert.ok(result);
                assert.ok(result instanceof SearchResultDone);
                assert.strictEqual(result.status, 0);
                assert.strictEqual(gotEntry, 0);
                assert.ok(gotReferral);
                resolve();
            });
        });
    });

    it('search rootDSE', async function () {
        const res = await client.search('', '(objectclass=*)');
        assert.ok(res);
        await new Promise((resolve) => {
            res.on('searchEntry', function (entry) {
                assert.ok(entry);
                assert.strictEqual(entry.dn.toString(), '');
                assert.ok(entry.attributes);
            });
            res.on('error', function (err) {
                assert.fail(err);
            });
            res.on('end', function (result) {
                assert.ok(result);
                assert.ok(result instanceof SearchResultDone);
                assert.strictEqual(result.status, 0);
                resolve();
            });
        });
    });

    it('search empty attribute', async function () {
        const res = await client.search('dc=empty', '(objectclass=*)');
        assert.ok(res);
        let gotEntry = 0;
        await new Promise((resolve) => {
            res.on('searchEntry', function (entry) {
                const obj = entry.pojo;
                assert.strictEqual('dc=empty', obj.objectName);

                const member = entry.attributes[0];
                assert.ok(member);
                assert.strictEqual(member.values.length, 0);

                const rangedMember = entry.attributes[1];
                assert.strictEqual(rangedMember.type, 'member;range=0-1');
                assert.strictEqual(rangedMember.values.length, 2);
                gotEntry++;
            });
            res.on('error', function (err) {
                assert.fail(err);
            });
            res.on('end', function (result) {
                assert.ok(result);
                assert.ok(result instanceof SearchResultDone);
                assert.strictEqual(result.status, 0);
                assert.strictEqual(gotEntry, 1);
                resolve();
            });
        });
    });

    it('GH-21 binary attributes', async function () {
        const res = await client.search('cn=bin, ' + SUFFIX, '(objectclass=*)');
        assert.ok(res);
        let gotEntry = 0;
        const expect = Buffer.from('\u00bd + \u00bc = \u00be', 'utf8');
        const expect2 = Buffer.from([0xB5, 0xE7, 0xCA, 0xD3, 0xBB, 0xFA]);
        await new Promise((resolve) => {
            res.on('searchEntry', function (entry) {
                assert.ok(entry);
                assert.ok(entry instanceof SearchResultEntry);
                assert.strictEqual(entry.dn.toString(), 'cn=bin,' + SUFFIX);
                assert.ok(entry.attributes);
                assert.ok(entry.attributes.length);
                assert.strictEqual(entry.attributes[0].type, 'foo;binary');
                assert.strictEqual(entry.attributes[0].values[0], expect.toString('base64'));
                assert.strictEqual(entry.attributes[0].buffers[0].toString('base64'),
                expect.toString('base64'));

                assert.ok(entry.attributes[1].type, 'gb18030');
                assert.strictEqual(entry.attributes[1].buffers.length, 1);
                assert.strictEqual(expect2.length, entry.attributes[1].buffers[0].length);
                for (let i = 0; i < expect2.length; i++) {
                    assert.strictEqual(expect2[i], entry.attributes[1].buffers[0][i]);
                }

                gotEntry++;
            });
            res.on('error', function (err) {
                assert.fail(err);
            });
            res.on('end', function (result) {
                assert.ok(result);
                assert.ok(result instanceof SearchResultDone);
                assert.strictEqual(result.status, 0);
                assert.strictEqual(gotEntry, 1);
                resolve();
            });
        });
    });

    it('GH-23 case insensitive attribute filtering', async function () {
        const opts = {
            filter: '(objectclass=*)',
            attributes: ['Cn']
        };
        const res = await client.search('cn=test, ' + SUFFIX, opts);
        assert.ok(res);
        let gotEntry = 0;
        await new Promise((resolve) => {
            res.on('searchEntry', function (entry) {
                assert.ok(entry);
                assert.ok(entry instanceof SearchResultEntry);
                assert.strictEqual(entry.dn.toString(), 'cn=test,' + SUFFIX);
                assert.ok(entry.attributes);
                assert.ok(entry.attributes.length);
                assert.strictEqual(entry.attributes[0].type, 'cn');
                gotEntry++;
            });
            res.on('error', function (err) {
                assert.fail(err);
            });
            res.on('end', function (result) {
                assert.ok(result);
                assert.ok(result instanceof SearchResultDone);
                assert.strictEqual(result.status, 0);
                assert.strictEqual(gotEntry, 2);
                resolve();
            });
        });
    });

    it('GH-24 attribute selection of *', async function () {
        const opts = {
            filter: '(objectclass=*)',
            attributes: ['*']
        };
        const res = await client.search('cn=test, ' + SUFFIX, opts);
        assert.ok(res);
        let gotEntry = 0;
        await new Promise((resolve) => {
            res.on('searchEntry', function (entry) {
                assert.ok(entry);
                assert.ok(entry instanceof SearchResultEntry);
                assert.strictEqual(entry.dn.toString(), 'cn=test,' + SUFFIX);
                assert.ok(entry.attributes);
                assert.ok(entry.attributes.length);
                assert.strictEqual(entry.attributes[0].type, 'cn');
                assert.strictEqual(entry.attributes[1].type, 'SN');
                gotEntry++;
            });
            res.on('error', function (err) {
                assert.fail(err);
            });
            res.on('end', function (result) {
                assert.ok(result);
                assert.ok(result instanceof SearchResultDone);
                assert.strictEqual(result.status, 0);
                assert.strictEqual(gotEntry, 2);
                resolve();
            });
        });
    });

  it('idle timeout', async function () {
        client.idleTimeout = 250;
        function premature () {
            assert.fail('idle fired too early');
        }
        client.on('idle', premature);
        const res = await client.search('dc=slow', 'objectclass=*');
        assert.ok(res);
        await new Promise((resolve) => {
            res.on('searchEntry', function (entry) {
                assert.ok(entry);
            });
            res.on('error', function (err) {
                assert.ifError(err);
            });
            res.on('end', function () {
                const late = setTimeout(function () {
                    assert.fail('too late');
                }, 500);
                client.removeListener('idle', premature);
                client.on('idle', function () {
                    clearTimeout(late);
                    client.removeAllListeners('idle');
                    client.idleTimeout = 0;
                    resolve();
                });
            });
        });
    });

    it('setup action', async function () {
        const setupClient = ldap.createClient({
            connectTimeout: parseInt(LDAP_CONNECT_TIMEOUT, 10),
            socketPath: socketPath
        });
        setupClient.on('setup', async function (clt) {
            await clt.bind(BIND_DN, BIND_PW);
        });
        const res = await setupClient.search(SUFFIX, { scope: 'base' });
        assert.ok(res);
        await new Promise((resolve) => {
            res.on('end', async function () {
                await setupClient.destroy();
                resolve();
            });
        });
    });

  it('setup reconnect', async function () {
        const rClient = ldap.createClient({
            connectTimeout: parseInt(LDAP_CONNECT_TIMEOUT, 10),
            socketPath: socketPath,
            reconnect: true
        });
        rClient.on('setup', async function (clt) {
            await clt.bind(BIND_DN, BIND_PW);
        });
        let socket;
        rClient.on('connect', (connectedSocket) => {
            socket = connectedSocket;
        });

        async function doSearch() {
            const res = await rClient.search(SUFFIX, { scope: 'base' });
            await new Promise((resolve) => {
                res.on('end', function () {
                    resolve();
                });
            });
        }

        try {
            await doSearch();
            assert.ok(rClient.connected);
            await new Promise(async (resolve, reject) => {
                rClient.once('close', (err) => {
                    try {
                        assert.ok(!err);
                        assert.strictEqual(rClient.connected, false);
                        resolve();
                    } catch (e) {
                        reject(e);
                    }
                });
                await rClient.unbind();
            });
            await doSearch();
            const msg = 'fake socket error';
            await new Promise((resolve) => {
                rClient.once('error', (err) => {
                    assert.strictEqual(err.message, msg);
                    assert.ok(err);
                });
                rClient.once('close', () => {
                    resolve();
                });
                socket.emit('error', new Error(msg));
            });
            await doSearch();
        } finally {
            await rClient.destroy();
        }
    });

    it('setup abort', async function () {
        const setupClient = ldap.createClient({
            connectTimeout: parseInt(LDAP_CONNECT_TIMEOUT, 10),
            socketPath: socketPath,
            reconnect: true
        });
        const message = "It's a trap!";
        await new Promise((resolve) => {
            setupClient.on('setup', function (clt) {
                // simulate failure
                assert.ok(clt);
                throw new Error(message);
            });

            setupClient.on('setupError', async function (err) {
                assert.ok(true);
                assert.strictEqual(err.message, message);
                await setupClient.destroy();
                resolve();
            });
        });
    });

    it('abort reconnect', async function () {
        const abortClient = ldap.createClient({
            connectTimeout: parseInt(LDAP_CONNECT_TIMEOUT, 10),
            socketPath: 'an invalid path',
            reconnect: true
        });
        let retryCount = 0;
        abortClient.on('connectError', function () {
            ++retryCount;
        });
        await new Promise((resolve) => {
            abortClient.once('connectError', async function () {
                assert.ok(true);
                abortClient.once('destroy', function () {
                    assert.ok(retryCount < 3);
                    resolve();
                });
                await abortClient.destroy();
            });
        });
    });

    it('reconnect max retries', async function () {
        const RETRIES = 5;
        const rClient = ldap.createClient({
            connectTimeout: 100,
            socketPath: 'an invalid path',
            reconnect: {
                failAfter: RETRIES,
                // Keep the test duration low
                initialDelay: 10,
                maxDelay: 100
            }
        });
        let count = 0;
        rClient.on('connectError', function () {
            count++;
        });
        await new Promise((resolve) => {
            rClient.on('error', async function (err) {
                assert.ok(err);
                assert.strictEqual(count, RETRIES);
                await rClient.destroy();
                resolve();
            });
        });
    });

    it('reconnect on server close', async function () {
        const clt = ldap.createClient({
            socketPath: socketPath,
            reconnect: true
        });
        let socket;
        await new Promise((resolve) => {
            clt.on('setup', async function (sclt) {
                await sclt.bind(BIND_DN, BIND_PW);
            });
            clt.once('connect', async function (connectedSocket) {
                socket = connectedSocket;
                assert.ok(socket);
                clt.once('connect', async function () {
                    assert.ok(true, 'successful reconnect');
                    await clt.destroy();
                    resolve();
                });

                // Simulate server-side close
                await socket.destroy();
            });
        });
    });

    it('no auto-reconnect on unbind', async function () {
        const clt = ldap.createClient({
            socketPath: socketPath,
            reconnect: true
        });
        clt.on('setup', async function (sclt) {
            await sclt.bind(BIND_DN, BIND_PW);
        });
        await new Promise((resolve) => {
            clt.once('connect', async function () {
                clt.once('connect', function () {
                    assert.fail('client should not reconnect');
                });
                clt.once('close', function () {
                    assert.ok(true, 'initial close');
                    setImmediate(async function () {
                        assert.ok(!clt.connected, 'should not be connected');
                        assert.ok(!clt.connecting, 'should not be connecting');
                        await clt.destroy();
                        resolve();
                    });
                });
                await clt.unbind();
            });
        });
    });

    it('abandon (GH-27)', async function () {
        // FIXME: test abandoning a real request
        await client.abandon(401876543);
    });

    it('search timeout (GH-51)', async function () {
        client.timeout = 250;
        const res = await client.search('dc=timeout', 'objectclass=*');
        await new Promise((resolve) => {
            res.on('error', function () {
                resolve();
            });
        });
    });

    it('resultError handling', async function () {
        const clientRef = client;

        try {
            await errSearch();
            await cleanSearch();
        } finally {
            clientRef.removeListener('resultError', error1);
            clientRef.removeListener('resultError', error2);
        }

        async function errSearch() {
            clientRef.once('resultError', error1);
            const res = await clientRef.search('cn=busy', {});
            res.once('error', function (error) {
                assert.strictEqual(error.name, 'BusyError');
            });
        }

        async function cleanSearch() {
            clientRef.on('resultError', error2);
            const res = await clientRef.search(SUFFIX, {});
            res.once('end', function () {
                assert.ok(true);
            });
        }

        function error1 (error) {
            assert.strictEqual(error.name, 'BusyError');
        }

        function error2 () {
            assert.fail('should not get error');
        }
    });

    it('connection refused', async function () {
        const unusedPortNumber = await getPort();
        const client = ldap.createClient({
            url: `ldap://0.0.0.0:${unusedPortNumber}`
        });

        client.on('connectRefused', () => {});

        try {
            const res = await client.bind('cn=root', 'secret');
            assert.ok(!res);
        } catch (err) {
            assert.ok(err);
            assert.ok(err instanceof Error);
            assert.strictEqual(err.code, 'ECONNREFUSED');
        } finally {
            await client.destroy();
        }
    });

    it('connection timeout', async function () {
        const unusedPortNumber = await getPort();
        const client = ldap.createClient({
            url: `ldap://example.org:${unusedPortNumber}`,
            connectTimeout: 1,
            timeout: 1
        });

        client.on('connectTimeout', () => {});

        let done = false;

        setTimeout(function () {
            if (!done) {
                throw new Error('LDAPJS waited for the server for too long');
            }
        }, 2000);

        try {
            const res = await client.bind('cn=root', 'secret');
            assert.ok(!res);
        } catch (err) {
            assert.ok(err);
            assert.ok(err instanceof Error);
            assert.strictEqual(err.message, 'connection timeout');
            done = true;
        } finally {
            await client.destroy();
        }
    });

    describe('emitError', function () {
        it('connectTimeout', async function () {
            const unusedPortNumber = await getPort();
            const client = ldap.createClient({
                url: `ldap://example.org:${unusedPortNumber}`,
                connectTimeout: 1,
                timeout: 1
            });

            const timeout = setTimeout(function () {
                throw new Error('LDAPJS waited for the server for too long');
            }, 2000);

            client.on('error', (err) => {
                assert.fail(err);
            });
            const connectTimeoutPromise = new Promise(async (resolve, reject) => {
                client.on('connectTimeout', async (err) => {
                    try {
                        assert.ok(err);
                        assert.ok(err instanceof Error);
                        assert.strictEqual(err.message, 'connection timeout');
                        clearTimeout(timeout);
                        resolve();
                    } catch (e) {
                        reject(e);
                    } finally {
                        await client.destroy();
                    }
                });
            });

            const bindPromise = client.bind('cn=root', 'secret')
                .catch(() => {});
            await Promise.all([connectTimeoutPromise, bindPromise]);
        });

        it('connectTimeout to error', async function () {
            const unusedPortNumber = await getPort();
            const client = ldap.createClient({
                url: `ldap://example.org:${unusedPortNumber}`,
                connectTimeout: 1,
                timeout: 1
            });

            const timeout = setTimeout(function () {
                throw new Error('LDAPJS waited for the server for too long');
            }, 2000);

            const errorPromise = new Promise(async (resolve, reject) => {
                client.on('error', async (err) => {
                    try {
                        assert.ok(err);
                        assert.ok(err instanceof Error);
                        assert.strictEqual(err.message,
                            'connectTimeout: connection timeout');
                        clearTimeout(timeout);
                        resolve();
                    } catch (e) {
                        reject(e);
                    } finally {
                        await client.destroy();
                    }
                });
            });

            const bindPromise = client.bind('cn=root', 'secret')
                .catch(() => {});
            await Promise.all([errorPromise, bindPromise]);
        });

        it('connectRefused', async function () {
            const unusedPortNumber = await getPort();
            const client = ldap.createClient({
                url: `ldap://0.0.0.0:${unusedPortNumber}`
            });

            client.on('error', (err) => {
                assert.fail(err);
            });
            const connectRefusedPromise = new Promise((resolve, reject) => {
                client.on('connectRefused', async(err) => {
                    try {
                        assert.ok(err);
                        assert.ok(err instanceof Error);
                        assert.strictEqual(err.message,
                            `connect ECONNREFUSED 0.0.0.0:${unusedPortNumber}`);
                        assert.strictEqual(err.code, 'ECONNREFUSED');
                        resolve();
                    } catch (e) {
                        reject(e);
                    } finally {
                        await client.destroy();
                    }
                });
            });

            const bindPromise = client.bind('cn=root', 'secret')
                .catch(() => {});
            await Promise.all([connectRefusedPromise, bindPromise]);
        });

        it('connectRefused to error', async function () {
            const unusedPortNumber = await getPort();
            const client = ldap.createClient({
                url: `ldap://0.0.0.0:${unusedPortNumber}`
            });

            const errorPromise = new Promise(async (resolve, reject) => {
                client.on('error', async (err) => {
                    try {
                        assert.ok(err);
                        assert.ok(err instanceof Error);
                        assert.strictEqual(err.message,
                            `connectRefused: connect ECONNREFUSED 0.0.0.0:${unusedPortNumber}`);
                        assert.strictEqual(err.code, 'ECONNREFUSED');
                        resolve();
                    } catch (e) {
                        reject(e);
                    } finally {
                        await client.destroy();
                    }
                });
            });

            const bindPromise = client.bind('cn=root', 'secret')
                .catch(() => {});
            await Promise.all([errorPromise, bindPromise]);
        });
    });

    it('socket destroy', async function () {
        const clt = ldap.createClient({
            socketPath: socketPath,
            bindDN: BIND_DN,
            bindCredentials: BIND_PW
        });

        const closePromise = new Promise(resolve => {
            clt.once('connect', async function (socket) {
                assert.ok(clt);
                socket.once('close', function () {
                    assert.ok(!clt.connected);
                    resolve();
                });
                await clt.destroy();
            });
        });

        const destroyPromise = new Promise(resolve => {
            clt.once('destroy', () => {
                assert.ok(clt.destroyed);
                resolve();
            });
        });

        await Promise.all([closePromise, destroyPromise]);
    });

    describe('unbind tests', function () {
        it('should unbind successfully', async function () {
            await client.unbind();
            assert.strictEqual(client.connected, false);
        });

        it('should fail to unbind', async function () {
            const thrownError = new Error('unbind error');

            const originalSend = client._send;
            client._send = function (message, expect, emitter, callback) {
                callback(thrownError);
            };

            try {
                await client.unbind();
                assert.fail('Expected unbind to throw an error');
            } catch (err) {
                assert.strictEqual(err, thrownError);
            } finally {
                client._send = originalSend;
            }
        });
    });

    describe('failure tests', function () {
        it('should fail to abandon request', async function () {
            const thrownError = new Error('abandon error');

            const originalSend = client._send;
            client._send = function (message, expect, emitter, callback) {
                callback(thrownError);
            };

            try {
                await client.abandon(123);
                assert.fail('Expected abandon to throw an error');
            } catch (err) {
                assert.strictEqual(err, thrownError);
            } finally {
                client._send = originalSend;
            }
        });

        it('should fail to add entry', async function () {
            const thrownError = new Error('add error');

            const originalSend = client._send;
            client._send = function (message, expect, emitter, callback) {
                callback(thrownError);
            };

            try {
                await client.add('cn=foo', {
                    cn: 'foo',
                    sn: 'bar'
                });
                assert.fail('Expected add to throw an error');
            } catch (err) {
                assert.strictEqual(err, thrownError);
            } finally {
                client._send = originalSend;
            }
        });

        it('should fail to delete entry', async function () {
            const thrownError = new Error('delete error');

            const originalSend = client._send;
            client._send = function (message, expect, emitter, callback) {
                callback(thrownError);
            };

            try {
                await client.del('cn=foo');
                assert.fail('Expected delete to throw an error');
            } catch (err) {
                assert.strictEqual(err, thrownError);
            } finally {
                client._send = originalSend;
            }
        });

        it('should fail to modify entry', async function () {
            const thrownError = new Error('modify error');

            const originalSend = client._send;
            client._send = function (message, expect, emitter, callback) {
                callback(thrownError);
            };

            try {
                const change = new ldap.Change({
                    operation: 'add',
                    modification: new Attribute({
                        type: 'pets',
                        values: ['cat', 'dog']
                    })
                });
                await client.modify('cn=foo', change);
                assert.fail('Expected modify to throw an error');
            } catch (err) {
                assert.strictEqual(err, thrownError);
            } finally {
                client._send = originalSend;
            }
        });

        it('should fail to rename DN entry', async function () {
            const thrownError = new Error('modify DN error');

            const originalSend = client._send;
            client._send = function (message, expect, emitter, callback) {
                callback(thrownError);
            };

            try {
                await client.modifyDN('cn=foo', 'cn=bar');
                assert.fail('Expected modify DN to throw an error');
            } catch (err) {
                assert.strictEqual(err, thrownError);
            } finally {
                client._send = originalSend;
            }
        });

        it('should fail to search', async function () {
            const thrownError = new Error('search error');

            const originalSend = client._send;
            client._send = function (message, expect, emitter, callback) {
                callback(thrownError);
            };

            try {
                await client.search('cn=foo', {});
                assert.fail('Expected search to throw an error');
            } catch (err) {
                assert.strictEqual(err, thrownError);
            } finally {
                client._send = originalSend;
            }
        });
    });

    describe('searchAll tests', function () {
        it('should search and return all results', async function () {
            const res = await client.searchReturnAll('cn=foo,' + SUFFIX, {
                filter: '(objectclass=*)'
            });

            assert.strictEqual(res.entries.length, 2);
            res.entries.forEach((entry) => {
                assert.ok(entry instanceof SearchResultEntry);
                assert.strictEqual(entry.dn.toString(), 'cn=foo,' + SUFFIX);
                assert.strictEqual(entry.attributes[0].type, 'cn');
                assert.deepStrictEqual(entry.attributes[0].values, ['unit', 'test']);
                assert.strictEqual(entry.attributes[1].type, 'SN');
                assert.deepStrictEqual(entry.attributes[1].values, ['testy']);
            });
        });
        
        it('should fail to search and return all', async function () {
            const thrownError = new Error('search all error');

            const originalSearch = client.search;
            client.search = function () {
                throw thrownError;
            };

            try {
                await client.searchReturnAll('cn=foo,' + SUFFIX, {
                    filter: '(objectclass=*)'
                });
                assert.fail('Expected search all to throw an error');
            } catch (err) {
                assert.strictEqual(err, thrownError);
            } finally {
                client.search = originalSearch;
            }
        });
    });

    describe('starttls tests', function () {
        it('should start TLS successfully', async function () {
            const clt = ldap.createClient({
                socketPath: socketPath
            });
            const socket = await new Promise((resolve) => {
                clt.once('connect', function (connectedSocket) {
                    resolve(connectedSocket);
                });
            });
            const secure = new EventEmitter();
            secure.destroy = () => socket.destroy();

            const originalConnect = tls.connect;
            const originalSend = clt._send;
            tls.connect = function () {
                process.nextTick(() => secure.emit('secureConnect'));
                return secure;
            };

            try {
                clt._send = function (message, expect, emitter, callback) {
                    callback(null, emitter);
                    process.nextTick(() => emitter.emit('end'));
                };

                await clt.starttls({});
            } finally {
                clt._send = originalSend;
                clt.connected = false;
                await clt.destroy();
                tls.connect = originalConnect;
            }
        });

        it('should fail to start TLS', async function () {
            const clt = ldap.createClient({
                socketPath: socketPath
            });
            await new Promise((resolve) => {
                clt.once('connect', resolve);
            });
            const thrownError = new Error('start TLS error');

            const originalConnect = tls.connect;
            const originalSend = clt._send;
            tls.connect = function () {
                throw thrownError;
            };

            try {
                clt._send = function (message, expect, emitter, callback) {
                    callback(null, emitter);
                    setImmediate(() => emitter.emit('end'));
                };
                await clt.starttls({});
                assert.fail('Expected start TLS to throw an error');
            } catch (err) {
                assert.strictEqual(err, thrownError);
            } finally {
                clt._send = originalSend;
                tls.connect = originalConnect;
                clt.connected = false;
                await clt.destroy();
            }
        });
    });

    describe('findUser tests', function () {
        it('should find user by filter', async function () {
            const clt = ldap.createClient({
                socketPath: socketPath
            });
            await new Promise((resolve) => {
                clt.once('connect', resolve);
            });

            const filter = '(&(objectcategory=user)(sAMAccountName=test.user))';
            const expectedUser = {
                attributes: [
                    { type: 'cn', values: [ 'test.user' ] }
                ]
            };

            const originalSearch = clt.search;
            clt.search = function () {
                const emitter = new EventEmitter();
                process.nextTick(() => {
                    emitter.emit('searchEntry', expectedUser);
                    emitter.emit('end', { status: 0 });
                });
                return Promise.resolve(emitter);
            };

            try {
                const user = await clt.findUser('', filter);
                assert.deepStrictEqual(user, expectedUser);
            } finally {
                clt.search = originalSearch;
                clt.connected = false;
                await clt.destroy();
            }
        });

        it('should find user by username', async function () {
            const clt = ldap.createClient({
                socketPath: socketPath
            });
            await new Promise((resolve) => {
                clt.once('connect', resolve);
            });

            const username = 'test.user';
            const expectedUser = {
                attributes: [
                    { type: 'cn', values: [ 'test.user' ] }
                ]
            };

            const originalSearch = clt.search;
            clt.search = function () {
                const emitter = new EventEmitter();
                process.nextTick(() => {
                    emitter.emit('searchEntry', expectedUser);
                    emitter.emit('end', { status: 0 });
                });
                return Promise.resolve(emitter);
            };

            try {
                const user = await clt.findUser('', username);
                assert.deepStrictEqual(user, expectedUser);
            } finally {
                clt.search = originalSearch;
                clt.connected = false;
                await clt.destroy();
            }
        });

        it('should fail to find user', async function () {
            const clt = ldap.createClient({
                socketPath: socketPath
            });
            await new Promise((resolve) => {
                clt.once('connect', resolve);
            });
            const thrownError = new Error('find user error');

            const originalSearch = clt.search;
            clt.search = function () {
                const emitter = new EventEmitter();
                process.nextTick(() => {
                    emitter.emit('error', thrownError);
                });
                return Promise.resolve(emitter);
            };

            try {
                await assert.rejects(clt.findUser('', 'nonexistent.user'),
                    thrownError);
            } finally {
                clt.search = originalSearch;
                clt.connected = false;
                await clt.destroy();
            }
        });
    });

    describe('user in group tests', function () {
        it('should determine if user is in specified group', async function () {
            const clt = ldap.createClient({
                socketPath: socketPath
            });
            await new Promise((resolve) => {
                clt.once('connect', resolve);
            });

            const username = 'test.user';
            const expectedUser = {
                attributes: [
                    { type: 'cn', values: [ 'test.user' ] },
                    { type: 'memberOf', values: [ 'test.group' ] }
                ]
            };

            const originalSearch = clt.search;
            clt.search = function () {
                const emitter = new EventEmitter();
                process.nextTick(() => {
                    emitter.emit('searchEntry', expectedUser);
                    emitter.emit('end', { status: 0 });
                });
                return Promise.resolve(emitter);
            };
            
            try {
                let isInGroup = await clt.userInGroup('', username, 'test.group');
                assert.strictEqual(isInGroup, true);
                isInGroup = await clt.userInGroup('', username, 'administrator');
                assert.strictEqual(isInGroup, false);
            } finally {
                clt.search = originalSearch;
                clt.connected = false;
                await clt.destroy();
            }
        });

        it('should fail to determine if user is in specified group', async function () {
            const clt = ldap.createClient({
                socketPath: socketPath
            });
            await new Promise((resolve) => {
                clt.once('connect', resolve);
            });

            const username = 'test.user';
            const thrownError = new Error('user in group error');

            const originalSearch = clt.search;
            clt.search = function () {
                const emitter = new EventEmitter();
                process.nextTick(() => {
                    emitter.emit('error', thrownError);
                });
                return Promise.resolve(emitter);
            };

            try {
                await assert.rejects(clt.userInGroup('', username, 'test.group'),
                    thrownError);
            } finally {
                clt.search = originalSearch;
                clt.connected = false;
                await clt.destroy();
            }
        });
    });
});
