'use strict';

const requestQueueFactory = require('./request-queue');
const messageTrackerFactory = require('./message-tracker');
const { MAX_MSGID } = require('./constants');

const { EventEmitter } = require('events');
const net = require('net');
const tls = require('tls');
const util = require('util');

const once = require('once');
const backoff = require('backoff');
const assert = require('assert-plus');
const VError = require('verror').VError;

const Attribute = require('@ldapjs/attribute');
const Change = require('@ldapjs/change');
const { Control } = require('../controls/index');
const { Control: LdapControl } = require('@ldapjs/controls');
const SearchPager = require('./search_pager');
const Protocol = require('@ldapjs/protocol');
const { DN } = require('@ldapjs/dn');
const errors = require('../errors');
const filters = require('@ldapjs/filter');
const Parser = require('../messages/parser');
const url = require('../url');
const CorkedEmitter = require('../corked_emitter');

/// --- Globals

const messages = require('@ldapjs/messages');
const {
  AbandonRequest,
  AddRequest,
  BindRequest,
  CompareRequest,
  DeleteRequest,
  ExtensionRequest: ExtendedRequest,
  ModifyRequest,
  ModifyDnRequest: ModifyDNRequest,
  SearchRequest,
  UnbindRequest,
  LdapResult: LDAPResult,
  SearchResultEntry: SearchEntry,
  SearchResultReference: SearchReference
} = messages;

const PresenceFilter = filters.PresenceFilter;

const ConnectionError = errors.ConnectionError;

const CMP_EXPECT = [errors.LDAP_COMPARE_TRUE, errors.LDAP_COMPARE_FALSE];

// node 0.6 got rid of FDs, so make up a client id for logging
let CLIENT_ID = 0;

/// --- Internal Helpers

function nextClientId() {
    if (++CLIENT_ID === MAX_MSGID) { return 1; }

    return CLIENT_ID;
}

function validateControls(controls) {
    if (Array.isArray(controls)) {
        controls.forEach(function (c) {
            if (!(c instanceof Control) && !(c instanceof LdapControl)) {
                throw new TypeError('controls must be [Control]');
            }
        });
    } else if (controls instanceof Control || controls instanceof LdapControl) {
        controls = [controls];
    } else {
        throw new TypeError('controls must be [Control]');
    }

    return controls;
}

function ensureDN(input) {
    if (DN.isDn(input)) {
        return input;
    } else if (typeof (input) === 'string') {
        return DN.fromString(input);
    } else {
        throw new Error('invalid DN');
    }
}

class Client extends EventEmitter {
    #nextServer = 0;
    #socket = null;
    #starttls;
    #tracker;

    /**
     * Constructs a new client.
     * 
     * The options object is required, and must contain either a URL (string) or
     * a socketPath (string); the socketPath is only if you want to talk to an LDAP
     * server over a Unix Domain Socket.
     * 
     * @param {Object} options must have either url or socketPath.
     * @throws {Error} When an invalid configuration object is supplied.
     */
    constructor(options) {
        assert.ok(options);

        super(options);

        this.urls = options.url ? [].concat(options.url).map(url.parse) : [];
        // updated in connectSocket() after each connect
        this.host = undefined;
        this.port = undefined;
        this.secure = undefined;
        this.url = undefined;
        this.tlsOptions = options.tlsOptions;
        this.socketPath = options.socketPath || false;

        this.log = options.log.child({
            module: 'ldapjs-promise', clazz: 'Client'
        }, true);

        this.timeout = parseInt((options.timeout || 0), 10);
        this.connectTimeout = parseInt((options.connectTimeout || 0), 10);
        this.idleTimeout = parseInt((options.idleTimeout || 0), 10);
        if (options.reconnect) {
            // Fall back to defaults if options.reconnect === true
            const rOpts = (typeof (options.reconnect) === 'object')
                ? options.reconnect
                : {};
            this.reconnect = {
                initialDelay: parseInt(rOpts.initialDelay || 100, 10),
                maxDelay: parseInt(rOpts.maxDelay || 10000, 10),
                failAfter: parseInt(rOpts.failAfter, 10) || Infinity
            };
        }
        
        this.queue = requestQueueFactory({
            size: parseInt((options.queueSize || 0), 10),
            timeout: parseInt((options.queueTimeout || 0), 10)
        });
        if (options.queueDisable) {
            this.queue.freeze();
        }

        // Implicitly configure setup action to bind the client if bindDN and
        // bindCredentials are passed in.  This will more closely mimic
        // PooledClient auto-login behavior.
        if (options.bindDN !== undefined &&
            options.bindCredentials !== undefined) {
            const self = this;
            this.on('setup', async function (clt) {
                try {
                    await clt.bind(options.bindDN, options.bindCredentials);
                } catch (err) {
                    if (self.#socket) {
                        self.#socket.destroy();
                    }
                    self.emit('error', err);
                    throw err;
                }
            });
        }

        this.connected = false;
        this.connect();
    }

    /**
     * Sends an abandon request to the LDAP server.
     * 
     * @param {Number} messageId the messageID to abandon.
     * @param {Control} controls (optional) either a Control or [Control].
     * @throws {TypeError} on invalid input.
     */
    async abandon(messageId, controls) {
        assert.number(messageId, 'messageId');
        if (typeof controls === 'undefined') {
            controls = [];
        } else {
            controls = validateControls(controls);
        }

        const req = new AbandonRequest({
            abandonId: messageId,
            controls
        });

        await this._send(req, 'abandon', null);
        this.log.trace('abandon successful for: %s', messageId);
    }

    /**
     * Adds an entry to the LDAP server.
     *
     * Entry can be either [Attribute] or a plain JS object where the
     * values are either a plain value or an array of values.  Any value (that is
     * not an array) will get converted to a string, so keep that in mind.
     *
     * @param {String} name the DN of the entry to add.
     * @param {Object} entry an array of Attributes to be added or a JS object.
     * @param {Control} controls (optional) either a Control or [Control].
     * @throws {TypeError} on invalid input.
     */
    async add(name, entry, controls) {
        assert.ok(name !== undefined, 'name');
        assert.object(entry, 'entry');
        if (typeof controls === 'undefined') {
            controls = [];
        } else {
            controls = validateControls(controls);
        }

        if (Array.isArray(entry)) {
            entry.forEach(function (a) {
                if (!Attribute.isAttribute(a)) {
                    throw new TypeError('entry must be an Array of Attributes');
                }
            });
        } else {
            const save = entry;

            entry = [];
            Object.keys(save).forEach(function (k) {
                const attr = new Attribute({ type: k });
                if (Array.isArray(save[k])) {
                    save[k].forEach(function (v) {
                        attr.addValue(v.toString());
                    });
                } else if (Buffer.isBuffer(save[k])) {
                    attr.addValue(save[k]);
                } else {
                    attr.addValue(save[k].toString());
                }
                entry.push(attr);
            });
        }

        const req = new AddRequest({
            entry: ensureDN(name),
            attributes: entry,
            controls
        });

        const response = await this._send(req, [errors.LDAP_SUCCESS], null);
        this.log.trace('add successful for: %s', name);
        return response;
    }

    /**
     * Performs a simple authentication against the server.
     *
     * @param {String} name the DN to bind as.
     * @param {String} credentials the userPassword associated with name.
     * @param {Control} controls (optional) either a Control or [Control].
     * @throws {TypeError} on invalid input.
     */
    async bind(name, credentials, controls, _bypass) {
        if (
            typeof (name) !== 'string' &&
            name.toString() !== '[object LdapDn]'
        ) {
            throw new TypeError('name (string) required')
        }
        assert.optionalString(credentials, 'credentials');
        if (typeof controls === 'undefined') {
            controls = [];
        } else {
            controls = validateControls(controls);
        }

        const req = new BindRequest({
            name: name || '',
            authentication: 'Simple',
            credentials: credentials || '',
            controls
        });

        const connectError = new Promise((_, reject) => {
            const onConnectError = error => {
                this.removeListener('connectError', onConnectError);
                reject(error);
            };
            this.once('connectError', onConnectError);
        });
        try {
            const response = await Promise.race([
                this._send(req, [errors.LDAP_SUCCESS], null, _bypass),
                connectError
            ]);
            this.log.trace('bind successful for user: %s', name);
            return response;
        } catch (error) {
            this.log.trace('bind error: %s', error.message);
            throw error;
        }
    }

    /**
     * Compares an attribute/value pair with an entry on the LDAP server.
     *
     * @param {String} name the DN of the entry to compare attributes with.
     * @param {String} attr name of an attribute to check.
     * @param {String} value value of an attribute to check.
     * @param {Control} controls (optional) either a Control or [Control].
     * @throws {TypeError} on invalid input.
     */
    async compare(name, attr, value, controls) {
        assert.ok(name !== undefined, 'name');
        assert.string(attr, 'attr');
        assert.string(value, 'value');
        if (typeof controls === 'undefined') {
            controls = [];
        } else {
            controls = validateControls(controls);
        }

        const req = new CompareRequest({
            entry: ensureDN(name),
            attribute: attr,
            value,
            controls
        });

        try {
            const response = await this._send(req, CMP_EXPECT, null);
            return {
                matched: (response.status === errors.LDAP_COMPARE_TRUE),
                response
            };
        } catch (error) {
            this.log.trace('compare error: %s', error.message);
            throw error;
        }
    }

    /**
     * Deletes an entry from the LDAP server.
     *
     * @param {String} name the DN of the entry to delete.
     * @param {Control} controls (optional) either a Control or [Control].
     * @throws {TypeError} on invalid input.
     */
    async del(name, controls) {
        assert.ok(name !== undefined, 'name');
        if (typeof controls === 'undefined') {
            controls = [];
        } else {
            controls = validateControls(controls);
        }

        const req = new DeleteRequest({
            entry: ensureDN(name),
            controls
        });

        try {
            return await this._send(req, [errors.LDAP_SUCCESS], null);
        } catch (error) {
            this.log.trace('del error: %s', error.message);
            throw error;
        }
    }

    /**
     * Performs an extended operation on the LDAP server.
     *
     * Pretty much none of the LDAP extended operations return an OID
     * (responseName), so I do not bother giving it back in the response.
     * It is on the third param in `res` if you need it.
     * 
     * @param {String} name the OID of the extended operation to perform.
     * @param {String | Buffer} value value to pass in for this operation.
     * @param {Control} controls (optional) either a Control or [Control].
     * @throws {TypeError} on invalid input.
     */
    async exop(name, value, controls) {
        assert.string(name, 'name');
        if (typeof value === 'undefined') {
            controls = [];
        } else if (typeof controls === 'undefined') {
            controls = [];
        } else {
            controls = validateControls(controls);
        }

        const req = new ExtendedRequest({
            requestName: name,
            requestValue: value,
            controls
        });

        try {
            const response = await this._send(req, [errors.LDAP_SUCCESS], null);
            return {
                value: response.responseValue || '',
                response
            };
        } catch (error) {
            this.log.trace('exop error: %s', error.message);
            throw error;
        }
    }

    /**
     * Performs an LDAP modify against the server.
     *
     * @param {String} name the DN of the entry to modify.
     * @param {Change} change update to perform (can be [Change]).
     * @param {Control} controls (optional) either a Control or [Control].
     * @throws {TypeError} on invalid input.
     */
    async modify(name, change, controls) {
        assert.ok(name !== undefined, 'name');
        assert.object(change, 'change');
        
        const changes = [];

        function changeFromObject (obj) {
            if (!obj.operation && !obj.type) {
                throw new Error('change.operation required');
            }
            if (typeof (obj.modification) !== 'object') {
                throw new Error('change.modification (object) required');
            }

            if (Object.keys(obj.modification).length === 2 &&
                typeof (obj.modification.type) === 'string' &&
                Array.isArray(obj.modification.vals)) {
                // Use modification directly if it is already normalized:
                changes.push(new Change({
                    operation: obj.operation || obj.type,
                    modification: obj.modification
                }));
            } else {
                // Normalize the modification object
                Object.keys(obj.modification).forEach(function (k) {
                    const mod = {};
                    mod[k] = obj.modification[k];
                    changes.push(new Change({
                        operation: obj.operation || obj.type,
                        modification: mod
                    }));
                });
            }
        }

        if (Change.isChange(change)) {
            changes.push(change);
        } else if (Array.isArray(change)) {
            change.forEach(function (c) {
                if (Change.isChange(c)) {
                    changes.push(c);
                } else {
                    changeFromObject(c);
                }
            });
        } else {
            changeFromObject(change);
        }

        if (typeof controls === 'undefined') {
            controls = [];
        } else {
            controls = validateControls(controls);
        }

        const req = new ModifyRequest({
            object: ensureDN(name),
            changes,
            controls
        });

        try {
            return await this._send(req, [errors.LDAP_SUCCESS], null);
        } catch (error) {
            this.log.trace('modify error: %s', error.message);
            throw error;
        }
    }

    /**
     * Performs an LDAP modifyDN against the server.
     *
     * This does not allow you to keep the old DN, as while the LDAP protocol
     * has a facility for that, it is stupid. Just Search/Add.
     *
     * This will automatically deal with "new superior" logic.
     *
     * @param {String} name the DN of the entry to modify.
     * @param {String} newName the new DN to move this entry to.
     * @param {Control} controls (optional) either a Control or [Control].
     * @throws {TypeError} on invalid input.
     */
    async modifyDN(name, newName, controls) {
        assert.ok(name !== undefined, 'name');
        assert.string(newName, 'newName');
        if (typeof controls === 'undefined') {
            controls = [];
        } else {
            controls = validateControls(controls);
        }

        const newDN = DN.fromString(newName);

        const req = new ModifyDNRequest({
            entry: DN.fromString(name),
            deleteOldRdn: true,
            controls
        });

        if (newDN.length !== 1) {
            req.newRdn = DN.fromString(newDN.shift().toString());
            req.newSuperior = newDN;
        } else {
            req.newRdn = newDN;
        }

        try {
            return await this._send(req, [errors.LDAP_SUCCESS], null);
        } catch (error) {
            this.log.trace('modifyDN error: %s', error.message);
            throw error;
        }
    }

    /**
     * Performs an LDAP search against the server.
     *
     * Note that the defaults for options are a 'base' search, if that is what
     * you want you can just pass in a string for options and it will be treated
     * as the search filter.  Also, you can either pass in programatic Filter
     * objects or a filter string as the filter option.
     *
     * Note that this method is 'special' in that the returned response will
     * have two important events on it, namely 'entry' and 'end' that you can hook
     * to.  The former will emit a SearchEntry object for each record that comes
     * back, and the latter will emit a normal LDAPResult object.
     *
     * @param {String} base the DN in the tree to start searching at.
     * @param {SearchOptions} options parameters:
     *                           - {String} scope default of 'base'.
     *                           - {String} filter default of '(objectclass=*)'.
     *                           - {Array} attributes [string] to return.
     *                           - {Boolean} attrsOnly whether to return values.
     * @param {Control} controls (optional) either a Control or [Control].
     * @returns {Promise} the search response.
     * @throws {TypeError} on invalid input.
     */
    search(base, options, controls, _bypass) {
        assert.ok(base !== undefined, 'search base');
        if (Array.isArray(options) || (options instanceof Control)) {
            controls = options;
            options = {};
        } else if (typeof options === 'undefined') {
            controls = [];
            options = {
                filter: new PresenceFilter({attribute: 'objectclass'})
            };
        } else if (typeof (options) === 'string') {
            options = { filter: filters.parseString(options) };
        } else if (typeof (options) !== 'object') {
            throw new TypeError('options (object) required');
        }
        if (typeof (options.filter) === 'string') {
            options.filter = filters.parseString(options.filter);
        } else if (!options.filter) {
            options.filter = new PresenceFilter({ attribute: 'objectclass' });
        } else if (Object.prototype.toString.call(options.filter) !== '[object FilterString]') {
            throw new TypeError('options.filter (Filter) required')
        }
        if (typeof controls === 'undefined') {
            controls = [];
        } else {
            controls = validateControls(controls);
        }

        if (options.attributes) {
            if (!Array.isArray(options.attributes)) {
                if (typeof (options.attributes) === 'string') {
                    options.attributes = [options.attributes];
                } else {
                    throw new TypeError('options.attributes must be an Array of Strings');
                }
            }
        }

        const self = this;
        const baseDN = ensureDN(base);

        function sendRequest(ctrls, emitter) {
            const req = new SearchRequest({
                baseObject: baseDN,
                scope: options.scope || 'base',
                filter: options.filter,
                derefAliases: options.derefAliases ||
                    Protocol.search.NEVER_DEREF_ALIASES,
                sizeLimit: options.sizeLimit || 0,
                timeLimit: options.timeLimit || 10,
                typesOnly: options.typesOnly || false,
                attributes: options.attributes || [],
                controls: ctrls
            });

            return self._send(req, [errors.LDAP_SUCCESS], emitter, _bypass);
        }

        return new Promise((resolve, reject) => {
            if (options.paged) {
                // Perform automated search paging
                const pageOpts = typeof (options.paged) === 'object' ?
                    options.paged : {};
                let size = 100; // Default page size
                if (pageOpts.pageSize > 0) {
                    size = pageOpts.pageSize;
                } else if (options.sizeLimit > 1) {
                    // According to the RFC, servers should ignore the paging
                    // control if pageSize >= sizelimit.  Some might still send
                    // results, but it is safer to stay under that figure when
                    // assigning a default value.
                    size = options.sizeLimit - 1;
                }

                const pager = new SearchPager({
                    callback: (error, response) => error ?
                        reject(error) : resolve(response),
                    controls,
                    pageSize: size,
                    pagePause: pageOpts.pagePause,
                    sendRequest
                });
                pager.begin();
            } else {
                sendRequest(controls, new CorkedEmitter()).then(resolve, reject);
            }
        });
    }

    /**
     * Performs an LDAP search against the server.
     * 
     * Note that the defaults for options are a 'base' search, if that is what
     * you want you can just pass in a string for options and it will be treated
     * as the search filter.  Also, you can either pass in programatic Filter
     * objects or a filter string as the filter option.
     * 
     * @param {String} base the DN in the tree to start searching at.
     * @param {SearchOptions} options parameters:
     *                           - {String} scope default of 'base'.
     *                           - {String} filter default of '(objectclass=*)'.
     *                           - {Array} attributes [string] to return.
     *                           - {Boolean} attrsOnly whether to return values.
     * @param {Control} controls (optional) either a Control or [Control].
     * @returns {Object} of entries and referrals.
     * @throws {TypeError} on invalid input.
     */
    async searchReturnAll(base, options, controls) {
        const response = await this.search(base, options, controls);
        const entries = [];
        let referrals = [];
        return new Promise((resolve, reject) => {
            response.on('searchEntry', entry => {
                entries.push(entry);
            });
            response.on('searchReference', referral => {
                referrals = referrals.concat(referral.uris);
            });
            response.on('error', error => {
                if (error.name === 'SizeLimitExceededError' &&
                    options.sizeLimit && options.sizeLimit > 0) {

                    return resolve({
                        entries: entries,
                        referrals: referrals
                    });
                } else {
                    return reject(error);
                }
            })
            response.on('end', result => {
                if (result.status !== 0) {
                    return reject(result.status);
                }

                return resolve({
                    entries: entries,
                    referrals: referrals
                });
            });
        });
    }

    /**
     * Unbinds this client from the LDAP server.
     */
    async unbind() {
        // When the socket closes, it is useful to know whether it was due to a
        // user-initiated unbind or something else.
        this.unbound = true;

        if (!this.#socket) { return; }

        const req = new UnbindRequest();

        try {
            await this._send(req, 'unbind', null);
        } catch (error) {
            this.log.trace('unbind error: %s', error.message);
            throw error;
        }
    }

    /**
     * Attempt to secure connection with StartTLS.
     * 
     * @param {Object} options 
     * @param {Control} controls (optional) either a Control or [Control].
     */
    starttls(options, controls, _bypass) {
        if (typeof controls === 'undefined') {
            controls = [];
        }

        assert.optionalObject(options);
        options = options || {};

        if (this.#starttls) {
            return Promise.reject(new Error('STARTTLS already in progress or active'));
        }

        const self = this;
        return new Promise((resolve, reject) => {
            function onSend(sendErr, emitter) {
                if (sendErr) {
                    return reject(sendErr);
                }
                /*
                * Now that the request has been sent, block all outgoing messages
                * until an error is received or we successfully complete the setup.
                */
                // TODO: block traffic
                self.#starttls = {
                    started: true
                };

                emitter.on('error', function (err) {
                    self.#starttls = null;
                    reject(err);
                });
                emitter.on('end', function (_res) {
                    const sock = self.#socket;
                    /*
                    * Unplumb socket data during SSL negotiation.
                    * This will prevent the LDAP parser from stumbling over the
                    * TLS handshake and raising a ruckus.
                    */
                    sock.removeAllListeners('data');
                    
                    options.socket = sock;
                    let secure;
                    try {
                        secure = tls.connect(options);
                    } catch (err) {
                        self.#starttls = null;
                        return reject(err);
                    }
                    secure.once('secureConnect', function () {
                        /*
                        * Wire up 'data' and 'error' handlers like the normal
                        * socket.
                        * Handling 'end' events is not necessary since the
                        * underlying socket will handle those.
                        */
                        secure.removeAllListeners('error');
                        secure.on('data', function onData (data) {
                            self.log.trace('data event: %s', util.inspect(data));
                
                            self.#tracker.parser.write(data);
                        })
                        secure.on('error', function (err) {
                            self.log.trace({ err }, 'error event: %s', new Error().stack);
                
                            self.emit('error', err);
                            sock.destroy();
                        });
                        resolve();
                    });
                    secure.once('error', function (err) {
                        // If the SSL negotiation failed, go back to plain mode.
                        self.#starttls = null;
                        secure.removeAllListeners();
                        reject(err);
                    })
                    self.#starttls.success = true;
                    self.#socket = secure;
                });
            }

            const req = new ExtendedRequest({
                requestName: '1.3.6.1.4.1.1466.20037',
                requestValue: null,
                controls
            });
            this._send(
                req,
                [errors.LDAP_SUCCESS],
                new EventEmitter(),
                _bypass
            ).then(emitter => onSend(null, emitter), onSend);
        });
    }

    /**
     * Disconnect from the LDAP server and do not allow reconnection.
     *
     * If the client is instantiated with proper reconnection options, it is
     * possible to initiate new requests after a call to unbind since the client
     * will attempt to reconnect in order to fulfill the request.
     *
     * Calling destroy will prevent any further reconnection from occurring.
     *
     * @param {Object} error (Optional) error that was cause of client destruction
     */
    async destroy(error) {
        this.destroyed = true;
        this.queue.freeze();
        // Purge any queued requests which are now meaningless
        const requests = await this.queue.flush();
        for (const request of requests) {
            request.reject(new Error('client destroyed'));
        }
        if (this.connected) {
            await this.unbind();
        }
        if (this.#socket) {
            this.#socket.destroy();
        }

        this.emit('destroy', error);
    }

    /**
     * Initiate LDAP connection.
     */
    connect() {
        if (this.connecting || this.connected) {
            return;
        }
        const self = this;
        const log = this.log;
        let socket;
        let tracker;

        // Establish basic socket connection
        function connectSocket(cb) {
            const server = self.urls[self.#nextServer];
            self.#nextServer = (self.#nextServer + 1) % self.urls.length;

            cb = once(cb);

            function onResult(err, res) {
                if (err) {
                    if (self.connectTimer) {
                        clearTimeout(self.connectTimer);
                        self.connectTimer = null;
                    }
                    self.emit('connectError', err);
                }
                cb(err, res);
            }
            function onConnect () {
                if (self.connectTimer) {
                    clearTimeout(self.connectTimer);
                    self.connectTimer = null;
                }
                socket.removeAllListeners('error')
                    .removeAllListeners('connect')
                    .removeAllListeners('secureConnect');

                tracker.id = nextClientId() + '__' + tracker.id;
                self.log = self.log.child({ ldap_id: tracker.id }, true);

                // Move on to client setup
                setupClient(cb);
            }

            const port = (server && server.port) || self.socketPath;
            const host = server && server.hostname;
            if (server && server.secure) {
                socket = tls.connect(port, host, self.tlsOptions);
                socket.once('secureConnect', onConnect);
            } else {
                socket = net.connect(port, host);
                socket.once('connect', onConnect);
            }
            socket.once('error', onResult);
            initSocket(server);

            // Setup connection timeout handling, if desired
            if (self.connectTimeout) {
                self.connectTimer = setTimeout(function onConnectTimeout () {
                    if (!socket || !socket.readable || !socket.writeable) {
                        socket.destroy();
                        self.#socket = null;
                        onResult(new ConnectionError('connection timeout'));
                    }
                }, self.connectTimeout);
            }
        }

        // Initialize socket events and LDAP parser.
        function initSocket(server) {
            tracker = messageTrackerFactory({
                id: server ? server.href : self.socketPath,
                parser: new Parser({ log })
            });

            // This will not be set on TLS. So. Very. Annoying.
            if (typeof (socket.setKeepAlive) !== 'function') {
                socket.setKeepAlive = function setKeepAlive(enable, delay) {
                    return socket.socket
                        ? socket.socket.setKeepAlive(enable, delay)
                        : false;
                };
            }
            
            socket.on('data', function onData (data) {
                log.trace('data event: %s', util.inspect(data));
        
                tracker.parser.write(data);
            });

            // The "router"
            //
            // This is invoked after the incoming BER has been parsed into a JavaScript
            // object.
            tracker.parser.on('message', function onMessage (message) {
                message.connection = self.#socket;
                const trackedObject = tracker.fetch(message.messageId);
                if (!trackedObject) {
                    log.error({ message: message.pojo },
                        'unmatched server message received');
                    return false;
                }

                const { message: trackedMessage, handler } = trackedObject;

                if (!handler) {
                    log.error({ message: message.pojo }, 'unsolicited message');
                    return false;
                }

                // Some message types have narrower implementations and require
                // extra parsing to be complete. In particular,
                // ExtensionRequest messages will return responses that do not
                // identify the request that generated them. Therefore, we have
                // to match the response to the request and handle the extra
                // processing accordingly.
                switch (trackedMessage.type) {
                    case 'ExtensionRequest': {
                        const extensionType = ExtendedRequest.recognizedOIDs()
                            .lookupName(trackedMessage.requestName);
                        switch (extensionType) {
                            case 'PASSWORD_MODIFY': {
                                message = messages.PasswordModifyResponse.fromResponse(message);
                                break;
                            }
                            
                            case 'WHO_AM_I': {
                                message = messages.WhoAmIResponse.fromResponse(message);
                                break;
                            }
                            
                            default:
                        }

                        break;
                    }

                    default:
                }

                return handler(message);
            });

            tracker.parser.on('error', function onParseError (err) {
                self.emit('error', new VError(err, 'Parser error for %s',
                    tracker.id));
                self.connected = false;
                socket.end();
            });
        }

        // After connect, register socket event handlers and run any setup
        // actions
        function setupClient(cb) {
            cb = once(cb);

            // Indicate failure if anything goes awry during setup
            function bail(err) {
                socket.destroy();
                cb(err || new Error('client error during setup'));
            }
            socket.once('close', bail);
            socket.once('error', bail);
            socket.once('end', bail);
            socket.once('timeout', bail);
            socket.once('cleanupSetupListeners', function onCleanup () {
                socket.removeListener('error', bail)
                    .removeListener('close', bail)
                    .removeListener('end', bail)
                    .removeListener('timeout', bail);
            });

            self.#socket = socket;
            self.#tracker = tracker;

            // Run any requested setup (such as automatically performing a
            // bind) on socket before signalling successful connection. This
            // setup needs to bypass the request queue since all other activity
            // is  blocked until the connection is considered fully established
            // post-setup.
            // Only allow bind/search/starttls for now.
            const basicClient = {
                bind: function bindBypass (name, credentials, controls) {
                    return self.bind(name, credentials, controls, true);
                },
                search: function searchBypass (base, options, controls) {
                    return self.search(base, options, controls, true);
                },
                starttls: function starttlsBypass (options, controls) {
                    return self.starttls(options, controls, true);
                },
                unbind: self.unbind.bind(self)
            };
            (async () => {
                try {
                    for (const f of self.listeners('setup')) {
                        await Promise.resolve(f(basicClient));
                    }
                    cb(null);
                } catch (err) {
                    self.emit('setupError', err);
                    cb(err);
                }
            })();
        }

        // Wire up "official" event handlers after successful connect/setup
        function postSetup () {
            // cleanup the listeners we attached in setup phrase.
            socket.emit('cleanupSetupListeners');

            socket.once('close', self.#onClose.bind(self));
            socket.on('end', function onEnd () {
                log.trace('end event');

                self.emit('end');
                socket.end();
            });
            socket.on('error', function onSocketError (err) {
                log.trace({ err }, 'error event: %s', new Error().stack);

                self.emit('error', err);
                socket.destroy();
            });
            socket.on('timeout', function onTimeout () {
                log.trace('timeout event');

                self.emit('socketTimeout');
                socket.end();
            });

            const server = self.urls[self.#nextServer];
            if (server) {
                self.host = server.hostname;
                self.port = server.port;
                self.secure = server.secure;
            }
        }

        let retry;
        let failAfter;
        if (this.reconnect) {
            retry = backoff.exponential({
                initialDelay: this.reconnect.initialDelay,
                maxDelay: this.reconnect.maxDelay
            });
            failAfter = this.reconnect.failAfter;
            if (this.urls.length > 1 && failAfter) {
                failAfter *= this.urls.length;
            }
        } else {
            retry = backoff.exponential({
                initialDelay: 1,
                maxDelay: 2
            });
            failAfter = this.urls.length || 1;
        }
        retry.failAfter(failAfter);

        retry.on('ready', function (num, _delay) {
            if (self.destroyed) {
                // Cease connection attempts if destroyed
                return;
            }
            connectSocket(function (err) {
                if (!err) {
                    postSetup();
                    self.connecting = false;
                    self.connected = true;
                    self.emit('connect', socket);
                    self.log.debug('connected after %d attempt(s)', num + 1);
                    // Flush any queued requests
                    self.#flushQueue();
                } else {
                    retry.backoff(err);
                }
            });
        });
        retry.on('fail', function (err) {
            if (self.destroyed) {
                // Silence any connect/setup errors if destroyed
                return;
            }
            self.log.debug('failed to connect after %d attempts', failAfter);
            // Communicate the last-encountered error
            if (err instanceof ConnectionError) {
                self.#emitError('connectTimeout', err);
            } else if (err.code === 'ECONNREFUSED') {
                self.#emitError('connectRefused', err);
            } else {
                self.emit('error', err);
            }
        });

        this.connecting = true;
        retry.backoff();
    }

    /**
     * Performs a search of the directory to find the user identified by the
     * given username.
     * 
     * @param {String} base the DN in the tree to start searching at.
     * @param {string} username Either a simple name, e.g. 'juser', or an LDAP
     * filter that should result in a single user. If it returns multiple users,
     * only the first result will be returned. If omitted, a filter must be
     * supplied in the `options`. Default: `(&(objectcategory=user)(sAMAccountName=username))`.
     * @param {Object} options Options to be used for the search.
     */
    async findUser(base, username, options) {
        let filter = null;
        if (typeof username === 'string') {
            if (username.charAt(0) === '(') {
                this.log.trace('finding user via custom filter: %s', username);
                filter = username;
              } else {
                this.log.trace('finding user via default filter');
                filter = `(&(objectcategory=user)(sAMAccountName=${username}))`;
            }
        }

        const results = await this.searchReturnAll(base,
            Object.assign({filter}, options || username || {}))
            .catch(error => Promise.reject(error));
        return results.entries[0];
    }

    /**
     * Query the directory to determine if a user is a member of a specified
     * group.
     * 
     * @param {String} base the DN in the tree to start searching at.
     * @param {string} username A username as described in
     *  {@link LdapClient#findUser}.
     * @param {string} groupName The name of the group to verify.
     * @returns If the user is a member then `true`, otherwise `false`.
     */
    async userInGroup(base, username, groupName) {
        this.log.trace('determining if user "%s" is in group: %s', username, groupName);
        const user = await this.findUser(base, username, {attributes: ['memberOf']});
        groupName = groupName.toLowerCase();
        const groups = user.attributes
            .filter(a => a.type === 'memberOf')
            .map(a => a.values).pop()
            .filter((group) => group.toLowerCase() === groupName);
        return groups.length > 0;
    }

    /// --- Private API

    /**
     * Flush queued requests out to the socket.
     */
    async #flushQueue() {
        // Pull items we are about to process out of the queue.
        const requests = await this.queue.flush();
        for (const request of requests) {
            this.#sendSocket(request);
        }
    }

    /**
     * Clean up socket/parser resources after socket close.
     */
    #onClose(closeError) {
        const socket = this.#socket;
        const tracker = this.#tracker;
        socket.removeAllListeners('connect')
            .removeAllListeners('data')
            .removeAllListeners('drain')
            .removeAllListeners('end')
            .removeAllListeners('error')
            .removeAllListeners('timeout');
        this.#socket = null;
        this.connected = false;

        socket.removeAllListeners('close');

        this.log.trace('close event had_err=%s', closeError ? 'yes' : 'no');

        this.emit('close', closeError)
        // On close we have to walk the outstanding messages and go invoke
        // their callback with an error.
        for (const { msgID, resolve, reject } of tracker.purge()) {
            if (socket.unbindMessageID !== msgID) {
                reject(new ConnectionError(tracker.id + ' closed'));
            } else {
                // Unbinds will be communicated as a success since we are
                // closed;
                // TODO: we are faking this "UnbindResponse" object in order to
                // make tests pass. There is no such thing as an "unbind
                // response" in the LDAP protocol. When the client is revamped,
                // this logic should be removed.
                // ~ jsumners 2023-02-16
                class Unbind extends LDAPResult {
                    messageID = msgID
                    messageId = msgID
                    status = 'unbind'
                };
                const unbind = new Unbind();
                resolve(unbind);
            }
        }

        // Trash any parser or starttls state
        this.#tracker = null;
        this.#starttls = null;

        // Automatically fire reconnect logic if the socket was closed for any
        // reason other than a user-initiated unbind.
        if (this.reconnect && !this.unbound) {
            this.connect();
        }
        this.unbound = false;
        return false;
    }

    /**
     * Maintain idle timer for client.
     *
     * Will start timer to fire 'idle' event if conditions are satisfied.  If
     * conditions are not met and a timer is running, it will be cleared.
     *
     * @param {Boolean} override explicitly disable timer.
     */
    #updateIdle(override) {
        if (this.idleTimeout === 0) {
            return;
        }
        // Client must be connected but not waiting on any request data
        const self = this;
        function isIdle(disable) {
            return ((disable !== true) &&
            (self.#socket && self.connected) &&
            (self.#tracker.pending === 0));
        }
        if (isIdle(override)) {
            if (!this._idleTimer) {
                this._idleTimer = setTimeout(function () {
                    // Double-check idleness in case socket was torn down
                    if (isIdle()) {
                        self.emit('idle');
                    }
                }, this.idleTimeout);
            }
        } else if (this._idleTimer) {
            clearTimeout(this._idleTimer);
            this._idleTimer = null;
        }
    }

    /**
     * Attempt to send an LDAP request.
     */
    async _send(message, expect, emitter, _bypass) {
        assert.ok(message);
        assert.ok(expect);
        assert.optionalObject(emitter);
        return new Promise(async (resolve, reject) => {
            const request = { message, expect, emitter, resolve, reject };

            // Allow connect setup traffic to bypass checks.
            if (_bypass && this.#socket && this.#socket.writable) {
                return this.#sendSocket(request);
            }
            if (!this.#socket || !this.connected) {
                if (!this.queue.enqueue(request)) {
                    reject(new ConnectionError('connection unavailable'));
                }
                // Initiate reconnect if needed.
                if (this.reconnect) {
                    this.connect();
                }
                return;
            }

            await this.#flushQueue();
            this.#sendSocket(request);
        });
    }

    #sendSocket(request) {
        const { message, expect, emitter, resolve, reject } = request;
        const conn = this.#socket;
        const tracker = this.#tracker;
        const log = this.log;
        const self = this;
        let timer = false;
        let sentEmitter = false;

        function sendResult(event, obj) {
            if (event === 'error') {
                self.emit('resultError', obj);
            }
            if (emitter) {
                if (event === 'error') {
                    // Error will go unhandled if emitter has not been sent via
                    // callback.
                    // Execute callback with the error instead.
                    if (!sentEmitter) { return reject(obj); }
                }
                return emitter.emit(event, obj);
            }

            if (event === 'error') { return reject(obj); }

            return resolve(obj);
        }

        function messageCallback (msg) {
            if (timer) { clearTimeout(timer); }

            log.trace({ msg: msg ? msg.pojo : null }, 'response received');

            if (expect === 'abandon') { return sendResult('end', null); }

            if (msg instanceof SearchEntry || msg instanceof SearchReference) {
                let event = msg.constructor.name;
                // Generate the event name for the event emitter, i.e.
                // "searchEntry" and "searchReference".
                event = (event[0].toLowerCase() + event.slice(1))
                    .replaceAll('Result', '');
                return sendResult(event, msg);
            } else {
                tracker.remove(message.messageId);
                // Potentially mark client as idle
                self.#updateIdle();
        
                if (msg instanceof LDAPResult) {
                    if (msg.status !== 0 && expect.indexOf(msg.status) === -1) {
                        return sendResult('error', errors.getError(msg));
                    }
                    return sendResult('end', msg);
                } else if (msg instanceof Error) {
                    return sendResult('error', msg);
                } else {
                    return sendResult('error',
                        new errors.ProtocolError(msg.type));
                }
            }
        }
        
        function onRequestTimeout () {
            self.emit('timeout', message);
            const tracked = tracker.fetch(message.messageId);
            if (tracked) {
                // FIXME: the timed-out request should be abandoned
                tracker.remove(message.messageId);
                tracked.handler(new errors.TimeoutError('request timeout (client interrupt)'));
            }
        }

        function writeCallback () {
            if (expect === 'abandon') {
                // Mark the messageId specified as abandoned
                tracker.abandon(message.abandonId);
                // No need to track the abandon request itself
                tracker.remove(message.id);
                return resolve();
            } else if (expect === 'unbind') {
                conn.unbindMessageID = message.id;
                // Mark client as disconnected once unbind clears the socket
                self.connected = false;
                // Some servers will RST the connection after receiving an
                // unbind.
                // Socket errors are blackholed since the connection is being
                // closed.
                conn.removeAllListeners('error');
                conn.on('error', function () {});
                conn.end();
            } else if (emitter) {
                sentEmitter = true;
                resolve(emitter);
                emitter.emit('searchRequest', message);
                return;
            }
            return false;
        }

        // Start actually doing something...
        tracker.track(message, { resolve, reject, handler: messageCallback });
        // Mark client as active
        this.#updateIdle(true);

        if (this.timeout) {
            log.trace('Setting timeout to %d', this.timeout);
            timer = setTimeout(onRequestTimeout, this.timeout);
        }

        log.trace('sending request %j', message.pojo);

        try {
            const messageBer = message.toBer();
            return conn.write(messageBer.buffer, writeCallback);
        } catch (e) {
            if (timer) { clearTimeout(timer); }

            log.trace({ err: e }, 'Error writing message to socket');
            tracker.remove(message.messageId);
            return reject(e);
        }
    }

    #emitError(event, err) {
        if (event !== 'error' && err && this.listenerCount(event) === 0) {
            if (typeof err === 'string') {
                err = event + ': ' + err;
            } else if (err.message) {
                err.message = event + ': ' + err.message;
            }
            this.emit('error', err);
        }
        this.emit(event, err);        
    }
}

module.exports = Client;