import { equal, ok } from 'node:assert';
import { parseURL } from '../lib/index.js';

describe('parseURL', function () {
    it('parse empty', function () {
        const u = parseURL('ldap:///');
        equal(u.hostname, 'localhost');
        equal(u.port, 389);
        ok(!u.DN);
        ok(!u.attributes);
        equal(u.secure, false);
    });

    it('parse hostname', function () {
        const u = parseURL('ldap://example.com/');
        equal(u.hostname, 'example.com');
        equal(u.port, 389);
        ok(!u.DN);
        ok(!u.attributes);
        equal(u.secure, false);
    });

    it('parse host and port', function () {
        const u = parseURL('ldap://example.com:1389/');
        equal(u.hostname, 'example.com');
        equal(u.port, 1389);
        ok(!u.DN);
        ok(!u.attributes);
        equal(u.secure, false);
    });

    it('parse full', function () {
        const u = parseURL('ldaps://ldap.example.com:1389/dc=example%20,dc=com' +
            '?cn,sn?sub?(cn=Babs%20Jensen)');

        equal(u.secure, true);
        equal(u.hostname, 'ldap.example.com');
        equal(u.port, 1389);
        equal(u.DN, 'dc=example ,dc=com');
        ok(u.attributes);
        equal(u.attributes.length, 2);
        equal(u.attributes[0], 'cn');
        equal(u.attributes[1], 'sn');
        equal(u.scope, 'sub');
        equal(u.filter.toString(), '(cn=Babs Jensen)');
    });

    it('supports href', function () {
        const u = parseURL('ldaps://ldap.example.com:1389/dc=example%20,dc=com?cn,sn?sub?(cn=Babs%20Jensen)');
        equal(u.href, 'ldaps://ldap.example.com:1389/dc=example%20,dc=com?cn,sn?sub?(cn=Babs%20Jensen)');
    });
});
