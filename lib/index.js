const client = require('./client');
const server = require('./server');
const attribute = require('ldapjs').Attribute;
const change = require('ldapjs').Change;
const dn = require('ldapjs').dn;
const persistentSearch = require('ldapjs').persistentSearch;
const filters = require('ldapjs').filters;
const url = require('ldapjs').url;

module.exports = {
    Client: client,
    createClient: (options) => {
        return new client(options);
    },
    Server: server,
    createServer: (options) => {
        return new server(options);
    },

    Attribute: attribute,
    Change: change,

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
