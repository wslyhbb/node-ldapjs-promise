'use strict';
const assert = require('node:assert');
const ldapjs = require('../../lib');
const Change = require('@ldapjs/change');

const SCHEME = process.env.SCHEME || 'ldap';
const HOST = process.env.HOST || '127.0.0.1';
const PORT = process.env.PORT || 389;
const baseURL = `${SCHEME}://${HOST}:${PORT}`;

let client;

describe('issue-940', function () {
    before(async function () {
        client = ldapjs.createClient({ url: baseURL });
        client.on('error', () => { });
        await client.bind('cn=admin,dc=planetexpress,dc=com', 'GoodNewsEveryone');
    });

    after(async function () {
        if (client) await client.unbind();
    });

    it('can modify entries with non-ascii chars in RDN', async function () {
        const dn = 'cn=Mendonça,ou=people,dc=planetexpress,dc=com';
        const entry = {
            objectclass: 'person',
            sn: 'change me'
        };

        await client.add(dn, entry);
        await validateChange({ expected: 'change me', client });

        const change = new Change({
            operation: 'replace',
            modification: {
                type: 'sn',
                values: ['changed']
            }
        });

        await client.modify(dn, change);
        await validateChange({ expected: 'changed', client });
    });
});

async function validateChange ({ expected, client }) {
    const searchOpts = {
        filter: '(&(objectclass=person)(cn=Mendonça))',
        scope: 'subtree',
        attributes: ['sn']
    };
    const response = await client.search(
        'ou=people,dc=planetexpress,dc=com',
        searchOpts
    );
    const entries = [];

    await new Promise((resolve, reject) => {
        response.on('searchEntry', entry => entries.push(entry));
        response.once('error', reject);
        response.once('end', resolve);
    });

    assert.strictEqual(entries.length, 1);
    const found = entries[0].attributes
        .filter(attribute => attribute.type === 'sn')
        .pop().values.pop();
    assert.strictEqual(found, expected);
}