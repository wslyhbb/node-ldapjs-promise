'use strict';
const assert = require('node:assert');
const { parseURL } = require('../lib');

describe('parseURL', function () {
    it('parse empty', function () {
        const u = parseURL('ldap:///');
        assert.equal(u.hostname, 'localhost');
        assert.equal(u.port, 389);
        assert.ok(!u.DN);
        assert.ok(!u.attributes);
        assert.equal(u.secure, false);
    });

    it('parse hostname', function () {
        const u = parseURL('ldap://example.com/');
        assert.equal(u.hostname, 'example.com');
        assert.equal(u.port, 389);
        assert.ok(!u.DN);
        assert.ok(!u.attributes);
        assert.equal(u.secure, false);
    });

    it('parse host and port', function () {
        const u = parseURL('ldap://example.com:1389/');
        assert.equal(u.hostname, 'example.com');
        assert.equal(u.port, 1389);
        assert.ok(!u.DN);
        assert.ok(!u.attributes);
        assert.equal(u.secure, false);
    });

    it('parse full', function () {
        const u = parseURL('ldaps://ldap.example.com:1389/dc=example%20,dc=com' +
            '?cn,sn?sub?(cn=Babs%20Jensen)');

        assert.equal(u.secure, true);
        assert.equal(u.hostname, 'ldap.example.com');
        assert.equal(u.port, 1389);
        assert.equal(u.DN, 'dc=example ,dc=com');
        assert.ok(u.attributes);
        assert.equal(u.attributes.length, 2);
        assert.equal(u.attributes[0], 'cn');
        assert.equal(u.attributes[1], 'sn');
        assert.equal(u.scope, 'sub');
        assert.equal(u.filter.toString(), '(cn=Babs Jensen)');
    });

    it('supports href', function () {
        const u = parseURL('ldaps://ldap.example.com:1389/dc=example%20,dc=com?cn,sn?sub?(cn=Babs%20Jensen)');
        assert.equal(u.href, 'ldaps://ldap.example.com:1389/dc=example%20,dc=com?cn,sn?sub?(cn=Babs%20Jensen)');
    });
});
