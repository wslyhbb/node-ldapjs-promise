'use strict';
const ldap = require('ldapjs');
const Control = require('ldapjs').Control;

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
     * @throws {TypeError} on invalid input.
     */
    bind(name, credentials, controls) {
        if (typeof controls === 'undefined') {
            controls = [];
        }

        return new Promise((resolve, reject) => {
            this.client.bind(name, credentials, controls, error => {
                if (error) {
                    this.log.trace('bind error: %s', error.message);
                    this.unbind();
                    return reject(error);
                }

                this.log.trace('bind successful for user: %s', name);
                return resolve();
            });
        });
    }

    /**
     * Unbinds this client from the LDAP server.
     */
    unbind() {
        return new Promise((resolve, reject) => {
            this.client.unbind(error => {
                if (error) {
                    this.log.trace('unbind error: %s', error.message);
                    return reject(error);
                }

                return resolve();
            });
        });
    }

    /**
     * Sends an abandon request to the LDAP server.
     * 
     * @param {Number} messageID the messageID to abandon.
     * @param {Control} controls (optional) either a Control or [Control].
     * @throws {TypeError} on invalid input.
     */
    abandon(messageID, controls) {
        if (typeof controls === 'undefined') {
            controls = [];
        }

        return new Promise((resolve, reject) => {
            this.client.abandon(messageID, controls, error => {
                if (error) {
                    this.log.trace('abandon error: %s', error.message);
                    return reject(error);
                }

                this.log.trace('abandon successful for: %s', messageID);
                return resolve();
            });
        });
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
    add(name, entry, controls) {
        if (typeof controls === 'undefined') {
            controls = [];
        }

        return new Promise((resolve, reject) => {
            this.client.add(name, entry, controls, error => {
                if (error) {
                    this.log.trace('add error: %s', error.message);
                    return reject(error);
                }

                this.log.trace('add successful for: %s', name);
                return resolve();
            });
        });
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
    compare(name, attr, value, controls) {
        if (typeof controls === 'undefined') {
            controls = [];
        }

        return new Promise((resolve, reject) => {
            this.client.compare(name, attr, value, controls, (error, matched) => {
                if (error) {
                    this.log.trace('compare error: %s', error.message);
                    return reject(error);
                }

                return resolve(matched);
            });
        });
    }

    /**
     * Deletes an entry from the LDAP server.
     *
     * @param {String} name the DN of the entry to delete.
     * @param {Control} controls (optional) either a Control or [Control].
     * @throws {TypeError} on invalid input.
     */
    del(name, controls) {
        if (typeof controls === 'undefined') {
            controls = [];
        }

        return new Promise((resolve, reject) => {
            this.client.del(name, controls, error => {
                if (error) {
                    this.log.trace('del error: %s', error.message);
                    return reject(error);
                }

                return resolve();
            });
        });
    }

    /**
     * Performs an extended operation on the LDAP server.
     * 
     * @param {String} name the OID of the extended operation to perform.
     * @param {String} value value to pass in for this operation.
     * @param {Control} controls (optional) either a Control or [Control].
     * @throws {TypeError} on invalid input.
     */
    exop(name, value, controls) {
        if (typeof value === 'undefined') {
            value = '';
            controls = [];
        } else if (typeof controls === 'undefined') {
            controls = [];
        }

        return new Promise((resolve, reject) => {
            this.client.exop(name, value, controls, (error, resValue, response) => {
                if (error) {
                    this.log.trace('exop error: %s', error.message);
                    return reject(error);
                }

                return resolve({
                    value: resValue,
                    response: response
                });
            });
        });
    }

    /**
     * Performs an LDAP modify against the server.
     * 
     * @param {String} name the DN of the entry to modify.
     * @param {Change} change update to perform (can be [Change]).
     * @param {Control} controls (optional) either a Control or [Control].
     * @throws {TypeError} on invalid input.
     */
    modify(name, change, controls) {
        if (typeof controls === 'undefined') {
            controls = [];
        }

        return new Promise((resolve, reject) => {
            this.client.modify(name, change, controls, (error) => {
                if (error) {
                    this.log.trace('modify error: %s', error.message);
                    return reject(error);
                }

                return resolve();
            });
        });
    }

    /**
     * Performs an LDAP modifyDN against the server.
     * 
     * This does not allow you to keep the old DN, as while the LDAP protocol
     * has a facility for that, it's stupid. Just Search/Add.
     *
     * This will automatically deal with "new superior" logic.
     * 
     * @param {String} name the DN of the entry to modify.
     * @param {String} newName the new DN to move this entry to.
     * @param {Control} controls (optional) either a Control or [Control].
     * @throws {TypeError} on invalid input.
     */
    modifyDN(name, newName, controls) {
        if (typeof controls === 'undefined') {
            controls = [];
        }

        return new Promise((resolve, reject) => {
            this.client.modifyDN(name, newName, controls, (error) => {
                if (error) {
                    this.log.trace('modifyDN error: %s', error.message);
                    return reject(error);
                }

                return resolve();
            });
        });
    }

    /**
     * Performs an LDAP search against the server.
     * 
     * Note that the defaults for options are a 'base' search, if that's what
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
     * @param {Object} options parameters:
     *                           - {String} scope default of 'base'.
     *                           - {String} filter default of '(objectclass=*)'.
     *                           - {Array} attributes [string] to return.
     *                           - {Boolean} attrsOnly whether to return values.
     * @param {Control} controls (optional) either a Control or [Control].
     * @returns 
     * @throws {TypeError} on invalid input.
     */
    search(base, options, controls) {
        if (Array.isArray(options) || (options instanceof Control)) {
            controls = options;
            options = {};
        } else if (typeof options === 'undefined') {
            controls = [];
            options = {
                filter: new ldap.filters.PresenceFilter({attribute: 'objectclass'})
            };
        }
        if (typeof controls === 'undefined') {
            controls = [];
        }

        return new Promise((resolve, reject) => {
            this.client.search(base, options, controls, (error, response) => {
                if (error) {
                    this.log.trace('search error: %s', error.message);
                    return reject(error);
                }

                return resolve(response);
            });
        });
    }

    /**
     * Performs an LDAP search against the server.
     * 
     * Note that the defaults for options are a 'base' search, if that's what
     * you want you can just pass in a string for options and it will be treated
     * as the search filter.  Also, you can either pass in programatic Filter
     * objects or a filter string as the filter option.
     * 
     * @param {String} base the DN in the tree to start searching at.
     * @param {Object} options parameters:
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
                entries.push(entry.object);
            });
            response.on('searchReference', referral => {
                referrals = referrals.concat(referral.uris);
            });
            response.on('error', error => {
                if (error.name === 'SizeLimitExceededError' &&
                    options.sizeLimit && options.sizeLimit > 0) {
                    return resolve(entries);
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
     * Attempt to secure connection with StartTLS.
     * 
     * @param {Object} options 
     * @param {Control} controls (optional) either a Control or [Control].
     */
    starttls(options, controls) {
        if (typeof controls === 'undefined') {
            controls = [];
        }

        return new Promise((resolve, reject) => {
            this.client.starttls(options, controls, error => {
                if (error) {
                    this.log.trace('starttls error: %s', error.message);
                    return reject(error);
                }

                return resolve();
            });
        });
    }

    /**
     * Disconnect from the LDAP server and do not allow reconnection.
     *
     * If the client is instantiated with proper reconnection options, it's
     * possible to initiate new requests after a call to unbind since the client
     * will attempt to reconnect in order to fulfill the request.
     *
     * Calling destroy will prevent any further reconnection from occurring.
     *
     * @param {Object} error (Optional) error that was cause of client destruction
     */
    destroy(error) {
        this.client.destroy(error);
    }

    /**
     * Initiate LDAP connection.
     */
    connect() {
        this.client.connect();
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
     * Query the directory to determine if a user is a member of a specified group.
     * 
     * @param {String} base the DN in the tree to start searching at.
     * @param {string} username A username as described in {@link LdapClient#findUser}.
     * @param {string} groupName The name of the group to verify.
     * @returns If the user is a member then `true`, otherwise `false`.
     */
    async userInGroup(base, username, groupName) {
        this.log.trace('determining if user "%s" is in group: %s', username, groupName);
        const user = await this.findUser(base, username, {attributes: ['memberOf']})
            .catch(error => Promise.reject(error));
        groupName = groupName.toLowerCase();
        const groups = user.memberOf.filter((group) => group.toLowerCase() === groupName);
        return groups.length > 0;
    }
}

module.exports = LdapClient;
