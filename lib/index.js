const logger = require('./logger');

const client = require('./client');
const Attribute = require('@ldapjs/attribute');
const Change = require('@ldapjs/change');
const Server = require('./server');

const dn = require('@ldapjs/dn');
const persistentSearch = require('./persistent_search');
const filters = require('@ldapjs/filter');
const url = require('./url');
const Protocol = require('@ldapjs/protocol');
const messages = require('./messages');
const controls = require('./controls');
const errors = require('./errors');

const hasOwnProperty = (target, val) =>
    Object.prototype.hasOwnProperty.call(target, val);

module.exports = {
    Client: client.Client,
    createClient: client.createClient,

    Server,
    createServer: function (options) {
        if (options === undefined) { options = {}; }

        if (typeof (options) !== 'object') {
            throw new TypeError('options (object) required');
        }
        
        if (!options.log) {
            options.log = logger;
        }
        
        return new Server(options);
    },

    Attribute,
    Change,

    dn,
    DN: dn.DN,
    RDN: dn.RDN,
    parseDN: dn.DN.fromString,

    persistentSearch: persistentSearch,
    PersistentSearchCache: persistentSearch.PersistentSearchCache,

    filters: filters,
    parseFilter: filters.parseString,

    url: url,
    parseURL: url.parse
};


///--- Export all the childrenz

let property;

for (property in Protocol) {
    if (hasOwnProperty(Protocol, property)) {
        module.exports[property] = Protocol[property];
    }
}

for (property in messages) {
    if (hasOwnProperty(messages, property)) {
        module.exports[property] = messages[property];
    }
}

for (property in controls) {
    if (hasOwnProperty(controls, property)) {
        module.exports[property] = controls[property];
    }
}

for (property in filters) {
    if (hasOwnProperty(filters, property)) {
        if (property !== 'parse' && property !== 'parseString') {
            module.exports[property] = filters[property];
        }
    }
}

for (property in errors) {
    if (hasOwnProperty(errors, property)) {
        module.exports[property] = errors[property];
    }
}
