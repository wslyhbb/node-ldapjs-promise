'use strict';
const assert = require('node:assert');
const net = require('net');
const vm = require('node:vm');
const { getSock } = require('./utils');
const ldap = require('../lib');

const SERVER_PORT = process.env.SERVER_PORT || 1389;
const SUFFIX = 'dc=test';

function listen(server, port = 0, host = '127.0.0.1') {
    return new Promise((resolve, reject) => {
        const onError = (error) => {
            server.removeListener('error', onError);
            reject(error);
        };
        const onListening = () => {
            server.removeListener('error', onError);
            resolve();
        };
        server.once('error', onError);
        server.listen(port, host, onListening);
    });
}

function close(server) {
    return new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
    });
}

function connect(client) {
    return new Promise((resolve, reject) => {
        client.once('connect', resolve);
        client.once('error', reject);
        client.once('connectError', reject);
    });
}

describe('Server', function () {
    let sock;
    beforeEach(function () {
        // We do not need a `.afterEach` to clean up the sock files because that
        // is done when the server is destroyed.
        sock = getSock();
    });

    it('basic create', function () {
        assert.ok(ldap.createServer());
    });

    it('connection count', async function () {
        const server = ldap.createServer();
        await listen(server);
        try {
            await new Promise((resolve, reject) => {
                server.getConnections((error, count) => {
                    if (error) return reject(error);
                    assert.strictEqual(count, 0);
                    resolve();
                });
            });
            const client = ldap.createClient({ url: server.url });
            await connect(client);
            await new Promise((resolve, reject) => {
                server.getConnections((error, count) => {
                    if (error) return reject(error);
                    try {
                        assert.strictEqual(count, 1);
                        resolve();
                    } catch (assertionError) {
                        reject(assertionError);
                    }
                });
            });
            await client.unbind();
        } finally {
            await close(server);
        }
    });

    it('properties', async function () {
        const server = ldap.createServer();
        assert.strictEqual(server.name, 'LDAPServer');
        server.maxConnections = 10;
        assert.strictEqual(server.maxConnections, 10);
        assert.strictEqual(server.url, null);
        await listen(server);
        assert.ok(server.url);
        await close(server);
    });

    it('IPv6 URL is formatted correctly', async function () {
        const server = ldap.createServer();
        assert.strictEqual(server.url, null);
        try {
            await listen(server, 0, '::1');
        } catch (error) {
            if (error.code === 'EADDRNOTAVAIL') this.skip();
            throw error;
        }
        assert.strictEqual(server.url, `ldap://[::1]:${server.port}`);
        await close(server);
    });

    it('listen on unix/named socket', function () {
        return new Promise((resolve, reject) => {
            const server = ldap.createServer();
            server.listen(sock, () => {
                try {
                    assert.ok(server.url);
                    assert.strictEqual(server.url.split(':')[0], 'ldapi');
                    server.close((error) => error ? reject(error) : resolve());
                } catch (error) {
                    reject(error);
                }
            });
            server.once('error', reject);
        });
    });

    it('listen on static port', async function () {
        const server = ldap.createServer();
        try {
            await listen(server, parseInt(SERVER_PORT, 10));
        } catch (error) {
            if (error.code === 'EADDRINUSE') this.skip();
            throw error;
        }
        try {
            assert.strictEqual(server.address().port, parseInt(SERVER_PORT, 10));
            assert.strictEqual(server.url, `ldap://127.0.0.1:${SERVER_PORT}`);
        } finally {
            await close(server);
        }
    });

    it('listen on ephemeral port', async function () {
        const server = ldap.createServer();
        await listen(server);
        try {
            assert.ok(server.address().port > 0);
            assert.ok(server.address().port < 65535);
        } finally {
            await close(server);
        }
    });

    it('route order', async function () {
        const server = ldap.createServer();
        const dnShort = SUFFIX;
        const dnMed = `dc=sub,${SUFFIX}`;
        const dnLong = `dc=long,dc=sub,${SUFFIX}`;
        const generateHandler = (response) => (req, res, next) => {
            res.send({ dn: response, attributes: {} });
            res.end();
            return next();
        };
        server.search(dnMed, generateHandler(dnMed));
        server.search(dnShort, generateHandler(dnShort));
        server.search(dnLong, generateHandler(dnLong));
        await new Promise((resolve, reject) => {
            server.listen(sock, (err) => {
                if (err) return reject(err);
                resolve();
            });
        });
        const client = ldap.createClient({ socketPath: sock });
        try {
            await connect(client);
            await Promise.all([dnShort, dnMed, dnLong].map(async (value) => {
                const response = await client.search(value, '(objectclass=*)');
                response.once('searchEntry', (entry) => {
                    assert.strictEqual(entry.dn.toString(), value);
                });
                await new Promise((resolve, reject) => {
                    response.once('error', reject);
                    response.once('end', resolve);
                });
            }));
            await client.unbind();
        } finally {
            await close(server);
        }
    });

    it('route absent', async function () {
        const server = ldap.createServer();
        const DN_ROUTE = 'dc=base';
        const DN_ABSENT = 'dc=absent';

        server.bind(DN_ROUTE, (req, res, next) => {
            res.end();
            return next();
        });

        await new Promise((resolve, reject) => {
            server.listen(sock, (err) => {
                if (err) return reject(err);
                resolve();
            });
        });
        try {
            const present = ldap.createClient({ socketPath: sock });
            const absent = ldap.createClient({ socketPath: sock });
            await present.bind(DN_ROUTE, '');
            await assert.rejects(absent.bind(DN_ABSENT, ''), (error) => {
                assert.strictEqual(error.code, ldap.LDAP_NO_SUCH_OBJECT);
                return true;
            });
            await Promise.all([present.unbind(), absent.unbind()]);
        } finally {
            await close(server);
        }
    });

    it('route unbind', async function () {
        const server = ldap.createServer();
        let unbound = false;
        server.unbind((req, res, next) => {
            unbound = true;
            res.end();
            return next();
        });
        await new Promise((resolve, reject) => {
            server.listen(sock, (err) => {
                if (err) return reject(err);
                resolve();
            });
        });
        const client = ldap.createClient({ socketPath: sock });
        await connect(client);
        await client.bind('', '');
        await client.unbind();
        await close(server);
        assert.ok(unbound);
    });

    it('bind/unbind identity anonymous', async function () {
        const server = ldap.createServer({
            connectionRouter(connection) {
                server.newConnection(connection);
                server.emit('testconnection', connection);
            }
        });

        server.unbind((req, res, next) => {
            res.end();
            return next();
        });

        server.bind('', (req, res, next) => {
            res.end();
            return next();
        });

        const anonDN = ldap.parseDN('cn=anonymous');

        await new Promise((resolve, reject) => {
            server.listen(sock, (err) => {
                if (err) return reject(err);
                resolve();
            });
        });
        const client = ldap.createClient({ socketPath: sock });
        const connection = await new Promise((resolve, reject) => {
            server.once('testconnection', resolve);
            client.once('error', reject);
        });
        assert.ok(anonDN.equals(connection.ldap.bindDN));
        await client.bind('', '');
        assert.ok(anonDN.equals(connection.ldap.bindDN));
        await client.unbind();
        assert.ok(anonDN.equals(connection.ldap.bindDN));
        await close(server);
    });

    it('does not crash on empty DN values', async function () {
        const server = ldap.createServer({
            connectionRouter(connection) {
                server.newConnection(connection);
                server.emit('testconnection', connection);
            }
        });
        
        await new Promise((resolve, reject) => {
            server.listen(sock, (err) => {
                if (err) return reject(err);
                resolve();
            });
        });
        const client = ldap.createClient({ socketPath: sock });
        await new Promise((resolve) => server.once('testconnection', resolve));
        await assert.rejects(client.bind('', 'pw'));
        await client.unbind();
        await close(server);
    });

    it('bind/unbind identity user', async function () {
        const server = ldap.createServer({
            connectionRouter(connection) {
                server.newConnection(connection);
                server.emit('testconnection', connection);
            }
        });

        server.unbind((req, res, next) => {
            res.end();
            return next();
        });

        server.bind('', (req, res, next) => {
            res.end();
            return next();
        });

        const anonDN = ldap.parseDN('cn=anonymous');
        const testDN = ldap.parseDN('cn=anotheruser');

        await new Promise((resolve, reject) => {
            server.listen(sock, (err) => {
                if (err) return reject(err);
                resolve();
            });
        });
        const client = ldap.createClient({ socketPath: sock });
        const connection = await new Promise((resolve, reject) => {
            server.once('testconnection', resolve);
            client.once('error', reject);
        });
        assert.ok(anonDN.equals(connection.ldap.bindDN),
            'pre bind dn is correct');
        await client.bind(testDN.toString(), 'somesecret');
        assert.ok(testDN.equals(connection.ldap.bindDN),
            'user bind dn is correct');
        // check rebinds too
        await client.bind('', '');
        assert.ok(anonDN.equals(connection.ldap.bindDN),
            'anon bind dn is correct');
        await client.bind(testDN.toString(), 'somesecret');
        assert.ok(testDN.equals(connection.ldap.bindDN),
            'user rebind dn is correct');
        await client.unbind();
        assert.ok(anonDN.equals(connection.ldap.bindDN),
            'user unbind dn is correct');
        await close(server);
    });

    it('strict routing', async function () {
        const testDN = 'cn=valid';
        const server = ldap.createServer();
        server.search('', (req, res, next) => {
            assert.ok(req.dn);
            assert.strictEqual(typeof req.dn, 'object');
            assert.strictEqual(req.dn.toString(), testDN);
            res.end();
            next();
        });
        await new Promise((resolve, reject) => {
            server.listen(sock, (err) => {
                if (err) return reject(err);
                resolve();
            });
        });
        const client = ldap.createClient({ socketPath: sock });
        try {
            const response = await client.search(testDN, { scope: 'base' });
            await new Promise((resolve, reject) => {
                response.once('error', reject);
                response.once('end', (result) => {
                    assert.ok(result, 'accepted invalid dn');
                    resolve();
                });
            });
            await client.destroy();
        } finally {
            await close(server);
        }
    });

    it('close accepts a callback', async function () {
        const server = ldap.createServer();
        await listen(server);
        await close(server);
    });

    it('close without error calls callback', async function () {
        const server = ldap.createServer();
        await listen(server, 0, '127.0.0.1');
        await close(server);
    });

    it('close passes error to callback', async function () {
        const server = ldap.createServer();
        await assert.rejects(close(server));
    });

    it('multithreading support via external server', async function () {
        const serverOptions = {};
        const server = ldap.createServer(serverOptions);
        const fauxServer = net.createServer(serverOptions, (connection) => {
            server.newConnection(connection);
        });
        fauxServer.log = serverOptions.log;
        fauxServer.ldap = { config: serverOptions };
        await listen(fauxServer, 5555);
        const client = ldap.createClient({
            url: `ldap://127.0.0.1:${fauxServer.address().port}`
        });
        await connect(client);
        await client.unbind();
        await close(fauxServer);
    });

    it('multithreading support via hook', async function () {
        let server;
        const serverOptions = {
            connectionRouter: (connection) => {
                server.newConnection(connection);
            }
        };
        server = ldap.createServer(serverOptions);
        const fauxServer = ldap.createServer(serverOptions);
        await listen(fauxServer);
        const client = ldap.createClient({ url: fauxServer.url });
        await connect(client);
        await client.unbind();
        await close(fauxServer);
    });

    it('cross-realm type checks', function () {
        const server = ldap.createServer();
        const context = vm.createContext({});
        vm.runInContext(
            'globalThis.search=function(){};\n' +
            'globalThis.searches=[function(){}];',
            context
        );
        server.search('', context.search);
        server.search('', context.searches);
        assert.ok(server);
    });
});
