'use strict';
const ldap = require('ldapjs');

class LdapServer {
    /**
     * Constructs a new server that you can call .listen() on, in the various
     * forms node supports.  You need to first assign some handlers to the various
     * LDAP operations however.
     *
     * The options object currently only takes a certificate/private key, and a
     * bunyan logger handle.
     *
     * This object exposes the following events:
     *  - 'error'
     *  - 'close'
     *
     * @param {Object} options (optional) parameterization object.
     * @throws {TypeError} on bad input.
     */
    constructor(options) {
        this.log = options.log || require('abstract-logging');
        if (!this.log.child) {
            this.log.child = () => { return this.log; }
        }
        this.log.child({ module: 'ldapjs-promise', clazz: 'server' });

        this.server = ldap.createServer(options);
    }
}

module.exports = LdapServer;