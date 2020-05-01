# node-ldapjs-promise
LDAP Client and Server API for node.js with Promise support.

[ldapjs]: https://www.npmjs.com/package/ldapjs

This is a simple wrapper around [ldapjs] for basic operations.

## Installation

    npm install --save ldapjs-promise

## Usage

For full docs, head on over to <http://ldapjs.org>.

The methods signatures are the same except instead of callbacks they return promises.

```javascript
const ldap = require('ldapjs-promise');

const client = ldap.createClient({
  url: 'ldap://127.0.0.1:1389'
});
await client.bind(dn, password);
```

The [ldapjs] authors made the search method a special method that returns an
<code>EventEmitter</code> so the user can either handle each
<code>searchEntry</code> as it is returned. Since this library is just wrapping
[ldapjs], it does not make any assumptions and returns the same <code>EventEmitter</code>.

In order to await all of the results you could:
```javascript
const results = client.search(base, options, controls).then(response => {
    const entries = [];
    let referrals = [];
    return new Promise((resolve, reject) => {
        response.on('searchEntry', entry => {
            entries.push(entry.object);
        });
        response.on('searchReference', referral => {
            referrals = referrals.concat(referral.uris);
        });
        response.on('error', error => {
            return reject(error);
        })
        response.on('end', result => {
            if (result.status !== 0) {
                return reject(result.status);
            }

            return resolve({
                entries: entries,
                referrals: referrals
            });
        });
    });
});
```
If this is exactly what you want, an extension method <code>searchReturnAll</code> has been added
that does this.
```javascript
const results = await client.searchReturnAll(base, options, controls);
for (let entry of results.entries) {
    ...
}
```