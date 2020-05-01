const client = require('./client');
const ldapjs = require('ldapjs');
const dn = require('ldapjs').dn;
const persistentSearch = require('ldapjs').persistentSearch;
const filters = require('ldapjs').filters;
const url = require('ldapjs').url;
const protocol = require('ldapjs/lib/protocol');

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
for (const p in protocol) {
    if (Object.hasOwnProperty(protocol, p)) {
        module.exports[p] = protocol[p];
    }
}
