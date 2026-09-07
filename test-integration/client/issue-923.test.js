'use strict';
const assert = require('node:assert');
const ldapjs = require('../../lib');
const { DN } = require('@ldapjs/dn');
const Change = require('@ldapjs/change');

const SCHEME = process.env.SCHEME || 'ldap';
const HOST = process.env.HOST || '127.0.0.1';
const PORT = process.env.PORT || 389;
const baseURL = `${SCHEME}://${HOST}:${PORT}`;

let client;

describe('issue-923', function () {
    before(function () {
        client = ldapjs.createClient({ url: baseURL });
        client.on('error', () => { });
    });

    after(async function () {
        if (client) await client.unbind();
    });

    it('modifies entry specified by dn string', async function () {
        await client.bind('cn=admin,dc=planetexpress,dc=com', 'GoodNewsEveryone');

        const dn = 'cn=large10,ou=large_ou,dc=planetexpress,dc=com';
        const change = new Change({
            operation: 'replace',
            modification: {
                type: 'givenName',
                values: ['test']
            }
        });

        await client.modify(dn, change);
        await validateChange({ expected: 'test', client });
    });

    it('modifies entry specified by dn object', async function () {
        await client.bind('cn=admin,dc=planetexpress,dc=com', 'GoodNewsEveryone');

        const dn = DN.fromString('cn=large10,ou=large_ou,dc=planetexpress,dc=com');
        const change = new Change({
            operation: 'replace',
            modification: {
                type: 'givenName',
                values: ['test2']
            }
        });

        await client.modify(dn, change);
        await validateChange({ expected: 'test2', client });
    });
});

async function validateChange({ expected, client }) {
    const searchBase = 'ou=large_ou,dc=planetexpress,dc=com';
    const searchOpts = {
        filter: '(cn=large10)',
        scope: 'subtree',
        attributes: ['givenName'],
        sizeLimit: 10,
        timeLimit: 0
    };
    const response = await client.search(searchBase, searchOpts);
    const entries = [];

    await new Promise((resolve, reject) => {
        response.on('searchEntry', entry => entries.push(entry));
        response.once('error', reject);
        response.once('end', resolve);
    });

    assert.strictEqual(entries.length, 1);
    assert.strictEqual(
        entries[0].attributes.filter(attribute => attribute.type === 'givenName')
            .pop().values.pop(),
        expected
    );
}