'use strict';
const assert = require('node:assert');
const { getSock, uuid } = require('./utils');
const { SearchResultEntry } = require('@ldapjs/messages');
const Attribute = require('@ldapjs/attribute');
const ldap = require('../lib');

async function search(client, suffix, options) {
    const response = await client.search(suffix, options);
    assert.ok(response);

    let found = false;
    response.on('searchEntry', function (entry) {
        assert.ok(entry);
        found = true;
    });

    await new Promise((resolve, reject) => {
        response.once('error', reject);
        response.once('end', resolve);
    });
    assert.ok(found);
}

describe('laundry', function () {
    let server;
    let socketPath;
    let client;
    let suffix;

    beforeEach(() => {
        return new Promise((resolve, reject) => {
            suffix = `dc=${uuid()}`;
            server = ldap.createServer();
            socketPath = getSock();

            server.on('error', reject);

            server.bind('cn=root', function (req, res, next) {
                res.end();
                return next();
            });

            server.search(suffix, function (req, res) {
                const entry = new SearchResultEntry({
                    entry: 'cn=foo,' + suffix,
                    attributes: Attribute.fromObject({
                        objectclass: ['person', 'top'],
                        cn: 'Pogo Stick',
                        sn: 'Stick',
                        givenname: 'ogo',
                        mail: uuid() + '@pogostick.org'
                    })
                })

                if (req.filter.matches(entry.attributes)) {
                    res.send(entry)
                }

                res.end();
            });

            server.listen(socketPath, function () {
                client = ldap.createClient({
                    socketPath: socketPath
                });

                client.on('error', (err) => {
                    server.close(() => reject(err));
                });
                client.on('connectError', (err) => {
                    server.close(() => reject(err));
                });
                client.on('connect', () => {
                    resolve();
                });
            });
        });
    });

    afterEach(async () => {
        if (client) await client.unbind();
        return new Promise((resolve, reject) => {
            if (!server) return resolve();
            server.close((err) => {
                if (err) return reject(err);
                resolve();
            });
        });
    });

    it('should search with Evolution filter (GH-3)', async function () {
        // This is what Evolution sends, when searching for a contact 'ogo'. Wow.
        const filter =
            '(|(cn=ogo*)(givenname=ogo*)(sn=ogo*)(mail=ogo*)(member=ogo*)' +
            '(primaryphone=ogo*)(telephonenumber=ogo*)(homephone=ogo*)(mobile=ogo*)' +
            '(carphone=ogo*)(facsimiletelephonenumber=ogo*)' +
            '(homefacsimiletelephonenumber=ogo*)(otherphone=ogo*)' +
            '(otherfacsimiletelephonenumber=ogo*)(internationalisdnnumber=ogo*)' +
            '(pager=ogo*)(radio=ogo*)(telex=ogo*)(assistantphone=ogo*)' +
            '(companyphone=ogo*)(callbackphone=ogo*)(tty=ogo*)(o=ogo*)(ou=ogo*)' +
            '(roomnumber=ogo*)(title=ogo*)(businessrole=ogo*)(managername=ogo*)' +
            '(assistantname=ogo*)(postaladdress=ogo*)(l=ogo*)(st=ogo*)' +
            '(postofficebox=ogo*)(postalcode=ogo*)(c=ogo*)(homepostaladdress=ogo*)' +
            '(mozillahomelocalityname=ogo*)(mozillahomestate=ogo*)' +
            '(mozillahomepostalcode=ogo*)(mozillahomecountryname=ogo*)' +
            '(otherpostaladdress=ogo*)(jpegphoto=ogo*)(usercertificate=ogo*)' +
            '(labeleduri=ogo*)(displayname=ogo*)(spousename=ogo*)(note=ogo*)' +
            '(anniversary=ogo*)(birthdate=ogo*)(mailer=ogo*)(fileas=ogo*)' +
            '(category=ogo*)(calcaluri=ogo*)(calfburl=ogo*)(icscalendar=ogo*))';

        await search(client, suffix, filter);
    });

    it('should throw errors with bad attributes (GH-49)', async function () {
        const searchOpts = {
            filter: 'cn=*ogo*',
            scope: 'one',
            attributes: 'dn'
        };
        await search(client, suffix, searchOpts);
    });

    it('should emit connect multiple times (GH-55)', async function () {
        const c = ldap.createClient({
            socketPath: socketPath
        });

        let count = 0;
        await new Promise((resolve, reject) => {
            c.on('connect', async function (socket) {
                assert.ok(socket);
                count++;
                try {
                    await c.bind('cn=root', 'secret');
                    await c.unbind();
                    resolve();
                } catch (err) {
                    reject(err);
                }
            });
            c.once('error', reject);
        });
        assert.strictEqual(count, 1);
    });
});
