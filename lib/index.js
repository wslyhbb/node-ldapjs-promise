import logger from './logger.js';

import {
    Client,
    createClient
} from './client/index.js';
import Attribute from '@ldapjs/attribute';
import Change from '@ldapjs/change';
import Server from './server.js';

import dn from '@ldapjs/dn';
import * as persistentSearch from './persistent_search.js';
import filters from '@ldapjs/filter';
import { parse } from './url.js';
import Protocol from '@ldapjs/protocol';

const { PersistentSearchCache } = persistentSearch;
const { parseString } = filters;
const { DN, RDN } = dn;
const url = { parse };

const hasOwnProperty = (target, val) =>
    Object.prototype.hasOwnProperty.call(target, val);

export {
    Client,
    createClient,

    Server
};
export function createServer(options) {
    if (options === undefined) { options = {}; }

    if (typeof (options) !== 'object') {
        throw new TypeError('options (object) required');
    }
    
    if (!options.log) {
        options.log = logger;
    }
    
    return new Server(options);
}

export {
    Attribute,
    Change,

    dn,
    DN,
    RDN
};

export const parseDN = DN.fromString;

export {
    persistentSearch,
    PersistentSearchCache,

    filters,
    parseString as parseFilter,

    url,
    parse as parseURL
};


///--- Export all the childrenz

const children = {};

let property;

for (property in Protocol) {
    if (hasOwnProperty(Protocol, property)) {
        children[property] = Protocol[property];
    }
}


for (property in filters) {
    if (hasOwnProperty(filters, property)) {
        if (property !== 'parse' && property !== 'parseString') {
            children[property] = filters[property];
        }
    }
}

export { children };

export * from './messages/index.js';
export * from './controls/index.js';
export * from './errors/index.js';