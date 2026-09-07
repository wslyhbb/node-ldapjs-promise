'use strict';
const assert = require('node:assert');
const ldapjs = require('../../lib');
const parseDN = ldapjs.parseDN;

const SCHEME = process.env.SCHEME || 'ldap';
const HOST = process.env.HOST || '127.0.0.1';
const PORT = process.env.PORT || 389;
const baseURL = `${SCHEME}://${HOST}:${PORT}`;

let client;

describe('issue-860', function () {
    before(async function () {
        client = ldapjs.createClient({ url: baseURL });
        client.on('error', () => { });
        await client.bind('cn=admin,dc=planetexpress,dc=com', 'GoodNewsEveryone');
    })

    after(async function () {
        await client.unbind();
    })

    it('can search OUs with Japanese characters', async function () {
        const opts = {
            filter: '(&(objectClass=person))',
            scope: 'sub',
            paged: true,
            sizeLimit: 100,
            attributes: ['cn', 'employeeID']
        };

        const baseDN = parseDN('ou=テスト,dc=planetexpress,dc=com');
        const response = await client.search(baseDN.toString(), opts);
        const entries = [];

        await new Promise((resolve, reject) => {
            response.on('searchEntry', entry => entries.push(entry));
            response.once('error', reject);
            response.once('end', resolve);
        });

        assert.strictEqual(entries.length, 1);
        assert.strictEqual(entries[0].pojo.type, 'SearchResultEntry');
        assert.strictEqual(
            entries[0].pojo.objectName,
            'cn=jdoe,ou=\\e3\\83\\86\\e3\\82\\b9\\e3\\83\\88,dc=planetexpress,dc=com'
        );
        assert.deepStrictEqual(entries[0].pojo.attributes[0], {
            type: 'cn',
            values: ['John', 'jdoe']
        });
    })

    it('can search with non-ascii chars in filter', async function () {
        const opts = {
            filter: '(&(sn=Rodríguez))',
            scope: 'sub',
            attributes: ['dn', 'sn', 'cn'],
            type: 'user'
        };

        const response = await client.search('dc=planetexpress,dc=com', opts);
        const entries = [];

        await new Promise((resolve, reject) => {
            response.on('searchEntry', entry => entries.push(entry));
            response.once('error', reject);
            response.once('end', resolve);
        });

        assert.strictEqual(entries.length, 1);
        assert.strictEqual(entries[0].pojo.type, 'SearchResultEntry');
        assert.strictEqual(
            entries[0].pojo.objectName,
            'cn=Bender Bending Rodr\\c3\\adguez,ou=people,dc=planetexpress,dc=com'
        );
        assert.deepStrictEqual(entries[0].pojo.attributes[0], {
            type: 'cn',
            values: ['Bender Bending Rodríguez']
        });
    });
});
