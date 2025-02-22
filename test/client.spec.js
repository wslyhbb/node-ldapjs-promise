'use strict';
const sinon = require("sinon");
const ldapjs = require('ldapjs');
const ldap = require('../lib');
const EventEmitter = require("events");
const { Attribute } = require("../lib");

describe('LdapClient', () => {
    let assert;
    before(async () => {
        assert = (await import('chai')).assert;
    });

    describe('event emitter tests', () => {
        it('should add event listener', () => {
            sinon.stub(ldapjs, 'createClient').returns(new EventEmitter());

            const client = ldap.createClient({
                url: 'ldap://127.0.0.1:1389'
            });
            client.addListener('error', () => {});

            assert.equal(client.listenerCount('error'), 1);

            client.on('error', () => {});

            assert.equal(client.listenerCount('error'), 2);

            ldapjs.createClient.restore();
        });

        it('should add once event listener', () => {
            const eventEmitter = new EventEmitter();
            sinon.stub(ldapjs, 'createClient').returns(eventEmitter);

            const client = ldap.createClient({
                url: 'ldap://127.0.0.1:1389'
            });
            client.once('error', () => {});

            assert.equal(client.listenerCount('error'), 1);

            eventEmitter.emit('error');

            assert.equal(client.listenerCount('error'), 0);

            ldapjs.createClient.restore();
        });

        it('should remove event listener', () => {
            sinon.stub(ldapjs, 'createClient').returns(new EventEmitter());

            const client = ldap.createClient({
                url: 'ldap://127.0.0.1:1389'
            });
            const listener = () => {};
            const listener2 = () => {};
            client.addListener('error', listener);
            client.addListener('error', listener2);

            assert.equal(client.listenerCount('error'), 2);

            client.removeListener('error', listener);

            assert.equal(client.listenerCount('error'), 1);

            client.off('error', listener2);

            assert.equal(client.listenerCount('error'), 0);

            ldapjs.createClient.restore();
        });

        it('should remove all event listeners', () => {
            sinon.stub(ldapjs, 'createClient').returns(new EventEmitter());

            const client = ldap.createClient({
                url: 'ldap://127.0.0.1:1389'
            });
            client.addListener('error', () => {});
            client.addListener('error', () => {});

            assert.equal(client.listenerCount('error'), 2);

            client.removeAllListeners('error');

            assert.equal(client.listenerCount('error'), 0);

            ldapjs.createClient.restore();
        });

        it('should set max event listeners', () => {
            sinon.stub(ldapjs, 'createClient').returns(new EventEmitter());

            const client = ldap.createClient({
                url: 'ldap://127.0.0.1:1389'
            });
            client.setMaxListeners(5);

            assert.equal(client.getMaxListeners(), 5);

            ldapjs.createClient.restore();
        });

        it('should get all event listeners by name', () => {
            sinon.stub(ldapjs, 'createClient').returns(new EventEmitter());

            const client = ldap.createClient({
                url: 'ldap://127.0.0.1:1389'
            });
            client.addListener('error', () => {});

            const listeners = client.listeners('error');

            assert.equal(listeners.length, 1);

            ldapjs.createClient.restore();
        });

        it('should get all raw event listeners by name', () => {
            sinon.stub(ldapjs, 'createClient').returns(new EventEmitter());

            const client = ldap.createClient({
                url: 'ldap://127.0.0.1:1389'
            });
            client.addListener('error', () => {});

            const listeners = client.rawListeners('error');

            assert.equal(listeners.length, 1);

            ldapjs.createClient.restore();
        });

        it('should prepend event listener', () => {
            sinon.stub(ldapjs, 'createClient').returns(new EventEmitter());

            const client = ldap.createClient({
                url: 'ldap://127.0.0.1:1389'
            });
            const listener = () => {};
            const listener2 = () => {};
            client.addListener('error', listener);
            client.prependListener('error', listener2);

            const listeners = client.listeners('error');

            assert.equal(listeners[0], listener2);
            assert.equal(listeners[1], listener);

            ldapjs.createClient.restore();
        });

        it('should prepend once event listener', () => {
            const eventEmitter = new EventEmitter();
            sinon.stub(ldapjs, 'createClient').returns(eventEmitter);

            const client = ldap.createClient({
                url: 'ldap://127.0.0.1:1389'
            });
            const listener = () => {};
            const listener2 = () => {};
            client.once('error', listener);
            client.prependOnceListener('error', listener2);

            const listeners = client.listeners('error');

            assert.equal(listeners[0], listener2);
            assert.equal(listeners[1], listener);

            ldapjs.createClient.restore();
        });

        it('should get event names', () => {
            const eventEmitter = new EventEmitter();
            sinon.stub(ldapjs, 'createClient').returns(eventEmitter);

            const client = ldap.createClient({
                url: 'ldap://127.0.0.1:1389'
            });
            client.addListener('error', () => {});

            const eventNames = client.eventNames();

            assert.equal(eventNames.length, 1);
            assert.isTrue(eventNames.includes('error'));

            ldapjs.createClient.restore();
        });
    });

    describe('bind tests', () => {
        it('should bind successfully', async () => {
            const fakeLdapJsClient = {
                bind(name, credentials, controls, callback) {
                    callback();
                }
            };
            sinon.stub(ldapjs, 'createClient').returns(fakeLdapJsClient);

            const client = ldap.createClient({
                url: 'ldap://127.0.0.1:1389'
            });
            await client.bind('bind.user', 'P@$$w0rd');

            ldapjs.createClient.restore();
        });

        it('should failt to bind', async () => {
            const thrownError = new Error('bind error');
            const fakeLdapJsClient = {
                bind(name, credentials, controls, callback) {
                    callback(thrownError);
                },
                unbind(callback) {
                    callback();
                }
            };
            sinon.stub(ldapjs, 'createClient').returns(fakeLdapJsClient);

            const client = ldap.createClient({
                url: 'ldap://127.0.0.1:1389'
            });
            let gotError = false;
            try {
                await client.bind('bind.user', 'P@$$w0rd');
            } catch (error) {
                gotError = true;
                assert.equal(error, thrownError);
            }

            ldapjs.createClient.restore();

            assert.isTrue(gotError);
        });
    });
    
    describe('unbind tests', () => {
        it('should unbind successfully', async () => {
            const fakeLdapJsClient = {
                unbind(callback) {
                    callback();
                }
            };
            sinon.stub(ldapjs, 'createClient').returns(fakeLdapJsClient);

            const client = ldap.createClient({
                url: 'ldap://127.0.0.1:1389'
            });
            await client.unbind();

            ldapjs.createClient.restore();
        });

        it('should fail to unbind', async () => {
            const thrownError = new Error('unbind error');
            const fakeLdapJsClient = {
                unbind(callback) {
                    callback(thrownError);
                }
            };
            sinon.stub(ldapjs, 'createClient').returns(fakeLdapJsClient);

            const client = ldap.createClient({
                url: 'ldap://127.0.0.1:1389'
            });
            let gotError = false;
            try {
                await client.unbind();
            } catch (error) {
                gotError = true;
                assert.equal(error, thrownError);
            }

            ldapjs.createClient.restore();

            assert.isTrue(gotError);
        });
    });

    describe('abandon tests', () => {
        it('should abandon request', async () => {
            const fakeLdapJsClient = {
                abandon(messageID, controls, callback) {
                    callback();
                }
            };
            sinon.stub(ldapjs, 'createClient').returns(fakeLdapJsClient);

            const client = ldap.createClient({
                url: 'ldap://127.0.0.1:1389'
            });
            await client.abandon(1);

            ldapjs.createClient.restore();
        });

        it('should fail to abandon request', async () => {
            const thrownError = new Error('abandon error');
            const fakeLdapJsClient = {
                abandon(messageID, controls, callback) {
                    callback(thrownError);
                }
            };
            sinon.stub(ldapjs, 'createClient').returns(fakeLdapJsClient);

            const client = ldap.createClient({
                url: 'ldap://127.0.0.1:1389'
            });
            let gotError = false;
            try {
                await client.abandon(1);
            } catch (error) {
                gotError = true;
                assert.equal(error, thrownError);
            }

            ldapjs.createClient.restore();

            assert.isTrue(gotError);
        });
    });

    describe('add tests', () => {
        it('should add entry', async () => {
            const fakeLdapJsClient = {
                add(name, entry, controls, callback) {
                    callback();
                }
            };
            sinon.stub(ldapjs, 'createClient').returns(fakeLdapJsClient);

            const client = ldap.createClient({
                url: 'ldap://127.0.0.1:1389'
            });
            await client.add('cn=foo', {
                cn: 'foo',
                sn: 'bar'
            });
            
            ldapjs.createClient.restore();
        });

        it('should fail to add entry', async () => {
            const thrownError = new Error('add error');
            const fakeLdapJsClient = {
                add(name, entry, controls, callback) {
                    callback(thrownError);
                }
            };
            sinon.stub(ldapjs, 'createClient').returns(fakeLdapJsClient);

            const client = ldap.createClient({
                url: 'ldap://127.0.0.1:1389'
            });
            let gotError = false;
            try {
                await client.add('cn=foo', {
                    cn: 'foo',
                    sn: 'bar'
                });
            } catch (error) {
                gotError = true;
                assert.equal(error, thrownError);
            }

            ldapjs.createClient.restore();

            assert.isTrue(gotError);
        });
    });

    describe('compare tests', () => {
        it('should compare attribute/value pair with entries on the server', async () => {
            const matchedEntry = {
                cn: 'foo',
                sn: 'bar'
            };
            const fakeLdapJsClient = {
                compare(name, attr, value, controls, callback) {
                    callback(null, matchedEntry);
                }
            };
            sinon.stub(ldapjs, 'createClient').returns(fakeLdapJsClient);

            const client = ldap.createClient({
                url: 'ldap://127.0.0.1:1389'
            });
            const entry = await client.compare('cn=foo', 'sn', 'bar');
            
            ldapjs.createClient.restore();

            assert.equal(entry, matchedEntry);
        });

        it('should fail to compare attribute/value pair with entries on the server', async () => {
            const thrownError = new Error('compare error');
            const fakeLdapJsClient = {
                compare(name, attr, value, controls, callback) {
                    callback(thrownError);
                }
            };
            sinon.stub(ldapjs, 'createClient').returns(fakeLdapJsClient);

            const client = ldap.createClient({
                url: 'ldap://127.0.0.1:1389'
            });
            let gotError = false;
            try {
                await client.compare('cn=foo', 'sn', 'bar');
            } catch (error) {
                gotError = true;
                assert.equal(error, thrownError);
            }

            ldapjs.createClient.restore();

            assert.isTrue(gotError);
        });
    });

    describe('del tests', () => {
        it('should delete entry', async () => {
            const fakeLdapJsClient = {
                del(name, controls, callback) {
                    callback();
                }
            };
            sinon.stub(ldapjs, 'createClient').returns(fakeLdapJsClient);

            const client = ldap.createClient({
                url: 'ldap://127.0.0.1:1389'
            });
            await client.del('cn=foo');
            
            ldapjs.createClient.restore();
        });

        it('should fail to delete entry', async () => {
            const thrownError = new Error('delete error');
            const fakeLdapJsClient = {
                del(name, controls, callback) {
                    callback(thrownError);
                }
            };
            sinon.stub(ldapjs, 'createClient').returns(fakeLdapJsClient);

            const client = ldap.createClient({
                url: 'ldap://127.0.0.1:1389'
            });
            let gotError = false;
            try {
                await client.del('cn=foo');
            } catch (error) {
                gotError = true;
                assert.equal(error, thrownError);
            }

            ldapjs.createClient.restore();

            assert.isTrue(gotError);
        });
    });

    describe('exop tests', () => {
        it('should perform an extended operation', async () => {
            const expectedResponse = {
                responseValue: 'response'
            };
            const fakeLdapJsClient = {
                exop(name, value, controls, callback) {
                    callback(null, expectedResponse.responseValue, expectedResponse);
                }
            };
            sinon.stub(ldapjs, 'createClient').returns(fakeLdapJsClient);

            const client = ldap.createClient({
                url: 'ldap://127.0.0.1:1389'
            });
            const response = await client.exop('1.3.6.1.4.1.4203.1.11.3');
            
            ldapjs.createClient.restore();

            assert.equal(response.value, expectedResponse.responseValue);
            assert.equal(response.response, expectedResponse);
        });

        it('should fail to perform an extended operation', async () => {
            const thrownError = new Error('exop error');
            const fakeLdapJsClient = {
                exop(name, value, controls, callback) {
                    callback(thrownError);
                }
            };
            sinon.stub(ldapjs, 'createClient').returns(fakeLdapJsClient);

            const client = ldap.createClient({
                url: 'ldap://127.0.0.1:1389'
            });
            let gotError = false;
            try {
                await client.exop('1.3.6.1.4.1.4203.1.11.3');
            } catch (error) {
                gotError = true;
                assert.equal(error, thrownError);
            }

            ldapjs.createClient.restore();

            assert.isTrue(gotError);
        });
    });

    describe('modify tests', () => {
        it('should modify entry', async () => {
            const fakeLdapJsClient = {
                modify(name, change, controls, callback) {
                    callback();
                }
            };
            sinon.stub(ldapjs, 'createClient').returns(fakeLdapJsClient);

            const client = ldap.createClient({
                url: 'ldap://127.0.0.1:1389'
            });
            const change = new ldap.Change({
                operation: 'add',
                modification: new Attribute({
                    type: 'pets',
                    values: ['cat', 'dog']
                })
            });
            await client.modify('cn=foo', change);
            
            ldapjs.createClient.restore();
        });

        it('should fail to modify entry', async () => {
            const thrownError = new Error('modify error');
            const fakeLdapJsClient = {
                modify(name, change, controls, callback) {
                    callback(thrownError);
                }
            };
            sinon.stub(ldapjs, 'createClient').returns(fakeLdapJsClient);

            const client = ldap.createClient({
                url: 'ldap://127.0.0.1:1389'
            });
            const change = new ldap.Change({
                operation: 'add',
                modification: new Attribute({
                    type: 'pets',
                    values: ['cat', 'dog']
                })
            });
            let gotError = false;
            try {
                await client.modify('cn=foo', change);
            } catch (error) {
                gotError = true;
                assert.equal(error, thrownError);
            }

            ldapjs.createClient.restore();

            assert.isTrue(gotError);
        });
    });

    describe('modifyDN tests', () => {
        it('should rename DN entry', async () => {
            const fakeLdapJsClient = {
                modifyDN(name, newName, controls, callback) {
                    callback();
                }
            };
            sinon.stub(ldapjs, 'createClient').returns(fakeLdapJsClient);

            const client = ldap.createClient({
                url: 'ldap://127.0.0.1:1389'
            });
            await client.modifyDN('cn=foo', 'cn=bar');
            
            ldapjs.createClient.restore();
        });

        it('should fail to rename DN entry', async () => {
            const thrownError = new Error('modify DN error');
            const fakeLdapJsClient = {
                modifyDN(name, newName, controls, callback) {
                    callback(thrownError);
                }
            };
            sinon.stub(ldapjs, 'createClient').returns(fakeLdapJsClient);

            const client = ldap.createClient({
                url: 'ldap://127.0.0.1:1389'
            });
            let gotError = false;
            try {
                await client.modifyDN('cn=foo', 'cn=bar');
            } catch (error) {
                gotError = true;
                assert.equal(error, thrownError);
            }

            ldapjs.createClient.restore();

            assert.isTrue(gotError);
        });
    });

    describe('search tests', () => {
        it('should search and return response', async () => {
            const EventEmitter = require('events').EventEmitter;
            const expectedResponse = new EventEmitter();
            const fakeLdapJsClient = {
                search(base, options, controls, callback) {
                    callback(null, expectedResponse);
                }
            };
            sinon.stub(ldapjs, 'createClient').returns(fakeLdapJsClient);

            const client = ldap.createClient({
                url: 'ldap://127.0.0.1:1389'
            });
            const response = await client.search('cn=foo', {});
            
            ldapjs.createClient.restore();

            assert.equal(response, expectedResponse);
        });

        it('should fail to search', async () => {
            const thrownError = new Error('search error');
            const fakeLdapJsClient = {
                search(base, options, controls, callback) {
                    callback(thrownError);
                }
            };
            sinon.stub(ldapjs, 'createClient').returns(fakeLdapJsClient);

            const client = ldap.createClient({
                url: 'ldap://127.0.0.1:1389'
            });
            let gotError = false;
            try {
                await client.search('cn=foo', {});
            } catch (error) {
                gotError = true;
                assert.equal(error, thrownError);
            }

            ldapjs.createClient.restore();

            assert.isTrue(gotError);
        });

        it('should search and return all results', async () => {
            const EventEmitter = require('events').EventEmitter;
            const expectedResponse = new EventEmitter();
            const searchEntry = {
                attributes: [
                    {
                        type: 'cn',
                        values: ['foo']
                    },
                    {
                        type: 'sn',
                        values: ['bar']
                    }
                ]
            };
            const searchReference = {
                uris: [
                    'ldaps://uri1',
                    'ldaps://uri2'
                ]
            };
            const searchResult = {
                status: 0
            };
            const fakeLdapJsClient = {
                search(base, options, controls, callback) {
                    callback(null, expectedResponse);

                    setTimeout(() => {
                        expectedResponse.emit('searchEntry', searchEntry);
                        expectedResponse.emit('searchReference', searchReference);
                        expectedResponse.emit('end', searchResult);
                    }, 100);
                }
            };
            sinon.stub(ldapjs, 'createClient').returns(fakeLdapJsClient);

            const client = ldap.createClient({
                url: 'ldap://127.0.0.1:1389'
            });
            const results = await client.searchReturnAll('cn=foo', {});
            
            ldapjs.createClient.restore();
            assert.equal(results.entries.length, 1);
            assert.equal(results.entries[0], searchEntry);
            assert.deepEqual(results.referrals, searchReference.uris);
        });

        it('should fail to search and return all', async () => {
            const thrownError = new Error('search error');
            const fakeLdapJsClient = {
                search(base, options, controls, callback) {
                    callback(thrownError);
                }
            };
            sinon.stub(ldapjs, 'createClient').returns(fakeLdapJsClient);

            const client = ldap.createClient({
                url: 'ldap://127.0.0.1:1389'
            });
            let gotError = false;
            try {
                await client.searchReturnAll('cn=foo', {});
            } catch (error) {
                gotError = true;
                assert.equal(error, thrownError);
            }

            ldapjs.createClient.restore();

            assert.isTrue(gotError);
        });
    });

    describe('starttls tests', () => {
        it('should start TLS', async () => {
            const fakeLdapJsClient = {
                starttls(options, controls, callback) {
                    callback();
                }
            };
            sinon.stub(ldapjs, 'createClient').returns(fakeLdapJsClient);

            const client = ldap.createClient({
                url: 'ldap://127.0.0.1:1389'
            });
            await client.starttls({});
            
            ldapjs.createClient.restore();
        });

        it('should fail to start TLS', async () => {
            const thrownError = new Error('exop error');
            const fakeLdapJsClient = {
                starttls(options, controls, callback) {
                    callback(thrownError);
                }
            };
            sinon.stub(ldapjs, 'createClient').returns(fakeLdapJsClient);

            const client = ldap.createClient({
                url: 'ldap://127.0.0.1:1389'
            });
            let gotError = false;
            try {
                await client.starttls({});
            } catch (error) {
                gotError = true;
                assert.equal(error, thrownError);
            }

            ldapjs.createClient.restore();

            assert.isTrue(gotError);
        });
    });

    describe('findUser tests', () => {
        let client;
        before(() => {
            const fakeLdapJsClient = {};
            sinon.stub(ldapjs, 'createClient').returns(fakeLdapJsClient);

            client = ldap.createClient({
                url: 'ldap://127.0.0.1:1389'
            });
        });

        after(() => {
            ldapjs.createClient.restore();
        });

        it('should find user by filter', async () => {
            const searchReturnAllResult = {
                entries: [
                    {
                        attributes: [
                            { type: 'cn', values: [ 'test.user' ] }
                        ]
                    }
                ],
                referrals: []
            };
            sinon.stub(client, 'searchReturnAll').resolves(searchReturnAllResult);

            const result = await client.findUser('',
                '(&(objectcategory=user)(sAMAccountName=test.user))');

            client.searchReturnAll.restore();

            assert.deepEqual(result, searchReturnAllResult.entries[0]);
        });

        it('should find user by username', async () => {
            const searchReturnAllResult = {
                entries: [
                    {
                        attributes: [
                            { type: 'cn', values: [ 'test.user' ] }
                        ]
                    }
                ],
                referrals: []
            };
            sinon.stub(client, 'searchReturnAll').resolves(searchReturnAllResult);

            const result = await client.findUser('', 'test.user');

            client.searchReturnAll.restore();

            assert.deepEqual(result, searchReturnAllResult.entries[0]);
        });

        it('should fail to find user', async () => {
            const thrownError = new Error('find user error');
            sinon.stub(client, 'searchReturnAll').rejects(thrownError);

            let gotError = false;
            try {
                await client.findUser('', 'test.user');
            } catch (error) {
                gotError = true;
                assert.equal(error, thrownError);
            }

            client.searchReturnAll.restore();

            assert.isTrue(gotError);
        });
    });

    describe('user in group tests', () => {
        let client;
        before(() => {
            const fakeLdapJsClient = {};
            sinon.stub(ldapjs, 'createClient').returns(fakeLdapJsClient);

            client = ldap.createClient({
                url: 'ldap://127.0.0.1:1389'
            });
        });

        after(() => {
            ldapjs.createClient.restore();
        });

        it('should determine if user is in specified group', async () => {
            const searchReturnAllResult = {
                entries: [
                    {
                        attributes: [
                            { type: 'cn', values: [ 'test.user' ] },
                            { type: 'memberOf', values: [ 'test.group' ] }
                        ]
                    }
                ],
                referrals: []
            };
            sinon.stub(client, 'searchReturnAll').resolves(searchReturnAllResult);

            assert.isTrue(await client.userInGroup('', 'test.user', 'test.group'));
            assert.isFalse(await client.userInGroup('', 'test.user', 'administrator'));

            client.searchReturnAll.restore();
        });

        it('should fail to determine if user is in specified group', async () => {
            const thrownError = new Error('user in group error');
            sinon.stub(client, 'searchReturnAll').rejects(thrownError);

            let gotError = false;
            try {
                await client.userInGroup('', 'test.user', 'test.group');
            } catch (error) {
                gotError = true;
                assert.equal(error, thrownError);
            }

            client.searchReturnAll.restore();

            assert.isTrue(gotError);
        });
    });
});