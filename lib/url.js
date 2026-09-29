import { unescape } from 'querystring';
import { URL } from 'url';
import dn from '@ldapjs/dn';
import filters from '@ldapjs/filter';

const { DN } = dn;
const { parseString } = filters;

export function parse(urlStr, parseDN) {
    let parsedURL;
    try {
        parsedURL = new URL(urlStr);
    } catch (error) {
        throw new TypeError(urlStr + ' is an invalid LDAP url (scope)');
    }

    if (!parsedURL.protocol || !(parsedURL.protocol === 'ldap:' ||
        parsedURL.protocol === 'ldaps:')) {
        throw new TypeError(urlStr + ' is an invalid LDAP url (protocol)');
    }

    const u = {
        protocol: parsedURL.protocol,
        hostname: parsedURL.hostname,
        port: parsedURL.port,
        pathname: parsedURL.pathname,
        search: parsedURL.search,
        href: parsedURL.href
    };

    u.secure = (u.protocol === 'ldaps:');

    if (!u.hostname) { u.hostname = 'localhost'; };

    if (!u.port) {
        u.port = (u.secure ? 636 : 389);
    } else {
        u.port = parseInt(u.port, 10);
    }

    if (u.pathname) {
        u.pathname = unescape(u.pathname.slice(1));
        u.DN = parseDN ? DN.fromString(u.pathname) : u.pathname;
    }

    if (u.search) {
        u.attributes = [];
        const tmp = u.search.slice(1).split('?');
        if (tmp && tmp.length) {
            if (tmp[0]) {
                tmp[0].split(',').forEach(function (a) {
                    u.attributes.push(unescape(a.trim()));
                });
            }
        }
        if (tmp[1]) {
            if (tmp[1] !== 'base' && tmp[1] !== 'one' && tmp[1] !== 'sub') {
                throw new TypeError(urlStr + ' is an invalid LDAP url (scope)');
            }
            u.scope = tmp[1];
        }
        if (tmp[2]) {
            u.filter = unescape(tmp[2]);
        }
        if (tmp[3]) {
            u.extensions = unescape(tmp[3]);
        }

        if (!u.scope) { u.scope = 'base'; }
        if (!u.filter) {
            u.filter = parseString('(objectclass=*)');
        } else {
            u.filter = parseString(u.filter);
        }
    }

    return u;
}
