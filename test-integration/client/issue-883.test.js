'use strict';
const assert = require('node:assert');
const ldapjs = require('../../lib');

const SCHEME = process.env.SCHEME || 'ldap';
const HOST = process.env.HOST || '127.0.0.1';
const PORT = process.env.PORT || 389;
const baseURL = `${SCHEME}://${HOST}:${PORT}`;

let client;

describe('issue-883', function () {
    before(async function () {
        client = ldapjs.createClient({ url: baseURL });
        client.on('error', () => { });
        await client.bind('cn=admin,dc=planetexpress,dc=com', 'GoodNewsEveryone');
    });

    after(async function () {
        if (client) await client.unbind();
    });

    it('adds entries with Korean characters', async function () {
        const name = '홍길동';
        const dn = `cn=${name},ou=people,dc=planetexpress,dc=com`;
        const entry = {
            objectclass: 'person',
            sn: 'korean test'
        };

        await client.add(dn, entry);

        const searchOpts = {
            filter: '(sn=korean test)',
            scope: 'subtree',
            attributes: ['cn', 'sn'],
            sizeLimit: 10,
            timeLimit: 0
        };
        const response = await client.search('ou=people,dc=planetexpress,dc=com',
            searchOpts);
        const entries = [];

        await new Promise((resolve, reject) => {
            response.on('searchEntry', entry => entries.push(entry));
            response.once('error', reject);
            response.once('end', resolve);
        });

        assert.strictEqual(entries.length, 1);
        assert.strictEqual(
            entries[0].attributes.filter(attribute => attribute.type === 'cn')
                .pop().values.pop(),
            name
        );
    });
});