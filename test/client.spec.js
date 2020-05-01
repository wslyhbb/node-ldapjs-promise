'use strict';
const sinon = require("sinon");
const { assert } = require('chai');
const ldapjs = require('ldapjs');
const ldap = require('../lib');

describe('LdapClient', () => {
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
                modification: {
                  pets: ['cat', 'dog']
                }
            });
            await client.modify('cn=foo', change);
            
            ldapjs.createClient.restore();
        });

        it('should fail to modify entry', async () => {
            const thrownError = new Error('exop error');
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
                modification: {
                  pets: ['cat', 'dog']
                }
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
            const thrownError = new Error('exop error');
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
            const thrownError = new Error('exop error');
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
                object: {
                    cn: 'foo',
                    sn: 'bar'
                }
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
            assert.equal(results.entries[0], searchEntry.object);
            assert.deepEqual(results.referrals, searchReference.uris);
        });

        it('should fail to search and return all', async () => {
            const thrownError = new Error('exop error');
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
});