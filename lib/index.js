const client = require('./client');
const ldapjs = require('ldapjs');
const dn = require('ldapjs').dn;
const persistentSearch = require('ldapjs').persistentSearch;
const filters = require('ldapjs').filters;
const url = require('ldapjs').url;
const protocol = require('@ldapjs/protocol');
const messages = require('ldapjs/lib/messages');
const controls = require('ldapjs/lib/controls');
const errors = require('ldapjs/lib/errors');

module.exports = {
    Client: client,
    createClient: (options) => {
        return new client(options);
    },
    Server: ldapjs.Server,
    createServer: ldapjs.createServer,

    Attribute: ldapjs.Attribute,
    Change: ldapjs.Change,

    dn: dn,
    DN: dn.DN,
    RDN: dn.RDN,
    parseDN: dn.parse,

    persistentSearch: persistentSearch,
    PersistentSearchCache: persistentSearch.PersistentSearchCache,

    filters: filters,
    parseFilter: filters.parseString,

    url: url,
    parseURL: url.parse
};


///--- Export all the childrenz

let property;

for (property in protocol) {
    if (Object.prototype.hasOwnProperty.call(protocol, property)) {
        module.exports[property] = protocol[property];
    }
}

for (property in messages) {
    if (Object.prototype.hasOwnProperty.call(messages, property)) {
        module.exports[property] = messages[property];
    }
}

for (property in controls) {
    if (Object.prototype.hasOwnProperty.call(controls, property)) {
        module.exports[property] = controls[property];
    }
}

for (property in filters) {
    if (Object.prototype.hasOwnProperty.call(filters, property)) {
        if (property !== 'parse' && property !== 'parseString') {
            module.exports[property] = filters[property];
        }
    }
}

for (property in errors) {
    if (Object.prototype.hasOwnProperty.call(errors, property)) {
        module.exports[property] = errors[property];
    }
}
