'use strict';
const assert = require('node:assert');
const ldapjs = require('../../lib');

const SCHEME = process.env.SCHEME || 'ldap';
const HOST = process.env.HOST || '127.0.0.1';
const PORT = process.env.PORT || 389;
const baseURL = `${SCHEME}://${HOST}:${PORT}`;

describe('issue-946', function () {
    it('can use password policy response', async function () {
        const client = ldapjs.createClient({ url: baseURL });
        client.on('error', () => { });
        const targetDN = 'cn=Bender Bending Rodríguez,ou=people,dc=planetexpress,dc=com';

        try {
            const adminResponse = await client.bind(
                'cn=admin,dc=planetexpress,dc=com',
                'GoodNewsEveryone'
            );
            assert.ok(adminResponse);
            assert.strictEqual(adminResponse.status, 0);

            await changePassword(client, targetDN, 'bender2');
        } finally {
            await client.unbind();
        }

        const firstClient = await bindNewClient(
            targetDN,
            'bender2',
            { error: 2 }
        );
        try {
            await changePassword(firstClient, targetDN, 'bender');
        } finally {
            await firstClient.unbind();
        }

        const secondClient = await bindNewClient(
            targetDN,
            'bender',
            { timeBeforeExpiration: 1000 }
        );
        await secondClient.unbind();
    });
});

async function bindNewClient (targetDN, password, expected) {
    const client = ldapjs.createClient({ url: baseURL });
    client.on('error', () => { });
    const control = new ldapjs.PasswordPolicyControl();
    const response = await client.bind(targetDN, password, control);
    assert.ok(response);
    assert.strictEqual(response.status, 0);

    let error = null;
    let timeBeforeExpiration = null;
    let graceAuthNsRemaining = null;

    response.controls.forEach(responseControl => {
        if (responseControl.type === ldapjs.PasswordPolicyControl.OID) {
            error = responseControl.value.error ?? error;
            timeBeforeExpiration = responseControl.value.timeBeforeExpiration ?? timeBeforeExpiration;
            graceAuthNsRemaining = responseControl.value.graceAuthNsRemaining ?? graceAuthNsRemaining;
        }
    });

    if (expected.error !== undefined) {
        assert.strictEqual(error, expected.error);
    }
    if (expected.timeBeforeExpiration !== undefined) {
        assert.strictEqual(timeBeforeExpiration, expected.timeBeforeExpiration);
    }
    if (expected.graceAuthNsRemaining !== undefined) {
        assert.strictEqual(graceAuthNsRemaining, expected.graceAuthNsRemaining);
    }

    return client;
}

async function changePassword (client, targetDN, newPassword) {
    const change = new ldapjs.Change({
        operation: 'replace',
        modification: new ldapjs.Attribute({
            type: 'userPassword',
            values: newPassword
        })
    });

    const response = await client.modify(targetDN, change);
    assert.ok(response);
    assert.strictEqual(response.status, 0);
}