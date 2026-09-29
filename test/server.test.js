import { ok, strictEqual, rejects } from 'node:assert';
import { createServer } from 'node:net';
import { createContext, runInContext } from 'node:vm';
import { getSock } from './utils.js';
import {
    createServer as _createServer,
    createClient,
    LDAP_NO_SUCH_OBJECT,
    parseDN
} from '../lib/index.js';

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
        ok(_createServer());
    });

    it('connection count', async function () {
        const server = _createServer();
        await listen(server);
        try {
            await new Promise((resolve, reject) => {
                server.getConnections((error, count) => {
                    if (error) return reject(error);
                    strictEqual(count, 0);
                    resolve();
                });
            });
            const client = createClient({ url: server.url });
            await connect(client);
            await new Promise((resolve, reject) => {
                server.getConnections((error, count) => {
                    if (error) return reject(error);
                    try {
                        strictEqual(count, 1);
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
        const server = _createServer();
        strictEqual(server.name, 'LDAPServer');
        server.maxConnections = 10;
        strictEqual(server.maxConnections, 10);
        strictEqual(server.url, null);
        await listen(server);
        ok(server.url);
        await close(server);
    });

    it('IPv6 URL is formatted correctly', async function () {
        const server = _createServer();
        strictEqual(server.url, null);
        try {
            await listen(server, 0, '::1');
        } catch (error) {
            if (error.code === 'EADDRNOTAVAIL') this.skip();
            throw error;
        }
        strictEqual(server.url, `ldap://[::1]:${server.port}`);
        await close(server);
    });

    it('listen on unix/named socket', function () {
        return new Promise((resolve, reject) => {
            const server = _createServer();
            server.listen(sock, () => {
                try {
                    ok(server.url);
                    strictEqual(server.url.split(':')[0], 'ldapi');
                    server.close((error) => error ? reject(error) : resolve());
                } catch (error) {
                    reject(error);
                }
            });
            server.once('error', reject);
        });
    });

    it('listen on static port', async function () {
        const server = _createServer();
        try {
            await listen(server, parseInt(SERVER_PORT, 10));
        } catch (error) {
            if (error.code === 'EADDRINUSE') this.skip();
            throw error;
        }
        try {
            strictEqual(server.address().port, parseInt(SERVER_PORT, 10));
            strictEqual(server.url, `ldap://127.0.0.1:${SERVER_PORT}`);
        } finally {
            await close(server);
        }
    });

    it('listen on ephemeral port', async function () {
        const server = _createServer();
        await listen(server);
        try {
            ok(server.address().port > 0);
            ok(server.address().port < 65535);
        } finally {
            await close(server);
        }
    });

    it('route order', async function () {
        const server = _createServer();
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
        const client = createClient({ socketPath: sock });
        try {
            await connect(client);
            await Promise.all([dnShort, dnMed, dnLong].map(async (value) => {
                const response = await client.search(value, '(objectclass=*)');
                response.once('searchEntry', (entry) => {
                    strictEqual(entry.dn.toString(), value);
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
        const server = _createServer();
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
            const present = createClient({ socketPath: sock });
            const absent = createClient({ socketPath: sock });
            await present.bind(DN_ROUTE, '');
            await rejects(absent.bind(DN_ABSENT, ''), (error) => {
                strictEqual(error.code, LDAP_NO_SUCH_OBJECT);
                return true;
            });
            await Promise.all([present.unbind(), absent.unbind()]);
        } finally {
            await close(server);
        }
    });

    it('route unbind', async function () {
        const server = _createServer();
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
        const client = createClient({ socketPath: sock });
        await connect(client);
        await client.bind('', '');
        await client.unbind();
        await close(server);
        ok(unbound);
    });

    it('bind/unbind identity anonymous', async function () {
        const server = _createServer({
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

        const anonDN = parseDN('cn=anonymous');

        await new Promise((resolve, reject) => {
            server.listen(sock, (err) => {
                if (err) return reject(err);
                resolve();
            });
        });
        const client = createClient({ socketPath: sock });
        const connection = await new Promise((resolve, reject) => {
            server.once('testconnection', resolve);
            client.once('error', reject);
        });
        ok(anonDN.equals(connection.ldap.bindDN));
        await client.bind('', '');
        ok(anonDN.equals(connection.ldap.bindDN));
        await client.unbind();
        ok(anonDN.equals(connection.ldap.bindDN));
        await close(server);
    });

    it('does not crash on empty DN values', async function () {
        const server = _createServer({
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
        const client = createClient({ socketPath: sock });
        await new Promise((resolve) => server.once('testconnection', resolve));
        await rejects(client.bind('', 'pw'));
        await client.unbind();
        await close(server);
    });

    it('bind/unbind identity user', async function () {
        const server = _createServer({
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

        const anonDN = parseDN('cn=anonymous');
        const testDN = parseDN('cn=anotheruser');

        await new Promise((resolve, reject) => {
            server.listen(sock, (err) => {
                if (err) return reject(err);
                resolve();
            });
        });
        const client = createClient({ socketPath: sock });
        const connection = await new Promise((resolve, reject) => {
            server.once('testconnection', resolve);
            client.once('error', reject);
        });
        ok(anonDN.equals(connection.ldap.bindDN),
            'pre bind dn is correct');
        await client.bind(testDN.toString(), 'somesecret');
        ok(testDN.equals(connection.ldap.bindDN),
            'user bind dn is correct');
        // check rebinds too
        await client.bind('', '');
        ok(anonDN.equals(connection.ldap.bindDN),
            'anon bind dn is correct');
        await client.bind(testDN.toString(), 'somesecret');
        ok(testDN.equals(connection.ldap.bindDN),
            'user rebind dn is correct');
        await client.unbind();
        ok(anonDN.equals(connection.ldap.bindDN),
            'user unbind dn is correct');
        await close(server);
    });

    it('strict routing', async function () {
        const testDN = 'cn=valid';
        const server = _createServer();
        server.search('', (req, res, next) => {
            ok(req.dn);
            strictEqual(typeof req.dn, 'object');
            strictEqual(req.dn.toString(), testDN);
            res.end();
            next();
        });
        await new Promise((resolve, reject) => {
            server.listen(sock, (err) => {
                if (err) return reject(err);
                resolve();
            });
        });
        const client = createClient({ socketPath: sock });
        try {
            const response = await client.search(testDN, { scope: 'base' });
            await new Promise((resolve, reject) => {
                response.once('error', reject);
                response.once('end', (result) => {
                    ok(result, 'accepted invalid dn');
                    resolve();
                });
            });
            await client.destroy();
        } finally {
            await close(server);
        }
    });

    it('close accepts a callback', async function () {
        const server = _createServer();
        await listen(server);
        await close(server);
    });

    it('close without error calls callback', async function () {
        const server = _createServer();
        await listen(server, 0, '127.0.0.1');
        await close(server);
    });

    it('close passes error to callback', async function () {
        const server = _createServer();
        await rejects(close(server));
    });

    it('multithreading support via external server', async function () {
        const serverOptions = {};
        const server = _createServer(serverOptions);
        const fauxServer = createServer(serverOptions, (connection) => {
            server.newConnection(connection);
        });
        fauxServer.log = serverOptions.log;
        fauxServer.ldap = { config: serverOptions };
        await listen(fauxServer, 5555);
        const client = createClient({
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
        server = _createServer(serverOptions);
        const fauxServer = _createServer(serverOptions);
        await listen(fauxServer);
        const client = createClient({ url: fauxServer.url });
        await connect(client);
        await client.unbind();
        await close(fauxServer);
    });

    it('cross-realm type checks', function () {
        const server = _createServer();
        const context = createContext({});
        runInContext(
            'globalThis.search=function(){};\n' +
            'globalThis.searches=[function(){}];',
            context
        );
        server.search('', context.search);
        server.search('', context.searches);
        ok(server);
    });
});
