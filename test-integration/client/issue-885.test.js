'use strict';
const assert = require('node:assert');
const ldapjs = require('../../lib');
const parseDN = ldapjs.parseDN;

const SCHEME = process.env.SCHEME || 'ldap';
const HOST = process.env.HOST || '127.0.0.1';
const PORT = process.env.PORT || 389;
const baseURL = `${SCHEME}://${HOST}:${PORT}`;

let client;

const searchOpts = {
    filter: '(&(objectClass=person))',
    scope: 'sub',
    paged: true,
    sizeLimit: 0,
    attributes: ['cn', 'employeeID']
};

const baseDN = parseDN('ou=large_ou,dc=planetexpress,dc=com');

describe('issue-885', function () {
    before(async function () {
        client = ldapjs.createClient({ url: baseURL });
        client.on('error', () => { });
        await client.bind('cn=admin,dc=planetexpress,dc=com', 'GoodNewsEveryone');
    });

    after(async function () {
        if (client) await client.unbind();
    });

    it('paged search option returns pages', async function () {
        const response = await client.search(baseDN.toString(), searchOpts);
        let pages = 0;
        const results = [];

        await new Promise((resolve, reject) => {
            response.on('searchEntry', entry => {
                results.push(entry);
            });

            response.on('page', () => {
                pages += 1;
            });

            response.once('error', reject);
            response.once('end', resolve);
        });

        assert.strictEqual(results.length, 2000);
        assert.strictEqual(pages, 20);
    });
});