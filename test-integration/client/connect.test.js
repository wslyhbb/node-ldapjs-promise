import assert from 'node:assert/strict';
import { createClient } from '../../lib/index.js';

const SCHEME = process.env.SCHEME || 'ldap';
const HOST = process.env.HOST || '127.0.0.1';
const PORT = process.env.PORT || 389;

const baseURL = `${SCHEME}://${HOST}:${PORT}`;

describe('connect', function () {
    it('connects to a server', async function () {
        const client = createClient({ url: baseURL });

        try {
            await client.bind('cn=Philip J. Fry,ou=people,dc=planetexpress,dc=com', 'fry');
            assert.ok(true);
        } finally {
            if (client) await client.unbind();
        }
    });
});