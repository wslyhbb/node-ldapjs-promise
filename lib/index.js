'use strict';
const ldap = require('ldapjs');

class LdapClient {
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
        this.log = options.log || require('abstract-logging');
        if (!this.log.child) {
            this.log.child = () => { return this.log; }
        }
        this.log.child({ module: 'ldapjs-promise', clazz: 'client' });

        this.client = ldap.createClient(options);
    }

    /**
     * Performs a simple authentication against the server.
     * 
     * @param {String} name the DN to bind as.
     * @param {String} credentials the userPassword associated with name.
     * @param {Control} controls (optional) either a Control or [Control].
     * 
     * @returns {Promise}
     * @resolve {*} No value is returned on success.
     * @reject {TypeError} on invalid input.
     */
    bind(name, credentials, controls) {
        return new Promise((resolve, reject) => {
            if (typeof controls === 'undefined') {
                controls = [];
            }

            this.client.bind(name, credentials, controls, error => {
                if (error) {
                    this.log.trace('bind error: %s', error.message);
                    this.unbind();
                    return reject(error);
                }

                log.trace('bind successful for user: %s', name);
                return resolve();
            });
        });
    }

    /**
     * Unbinds this client from the LDAP server.
     * 
     * @returns {Promise}
     * @resolve {*} No value is returned on success.
     * @reject {TypeError} on unbind failure.
     */
    unbind() {
        return new Promise((resolve, reject) => {
            if (error) {
                log.trace('unbind error: %s', error.message);
                return reject(error);
            }

            return resolve();
        });
    }
}

module.exports = LdapClient;
