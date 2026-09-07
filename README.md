# ldapjs-promise

[![Build Status][travis_image_url]](https://travis-ci.org/wslyhbb/node-ldapjs-promise)

[travis_image_url]: https://travis-ci.org/wslyhbb/node-ldapjs-promise.svg?branch=master

LDAP Client and Server API for node.js with Promise support.

[ldapjs]: https://www.npmjs.com/package/ldapjs

Originally this was a promisfyied [ldapjs] library.  Due to [ldapjs] being
decommissioned, the core was merged into the project so the core can be
directly modified.

## Installation

    npm install --save ldapjs-promise

## Usage

The methods signatures are the same except instead of callbacks they return promises.

```javascript
const ldap = require('ldapjs-promise');

const client = ldap.createClient({
  url: 'ldap://127.0.0.1:1389'
});
await client.bind(dn, password);
```

The search method returns an <code>EventEmitter</code> so the user can handle
each <code>searchEntry</code> as it is returned.

In order to await all of the results you could:
```javascript
const response = client.search(base, options, controls);
const entries = [];
let referrals = [];
const results = await new Promise((resolve, reject) => {
    response.on('searchEntry', entry => {
        entries.push(entry);
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
```

If this is exactly what you want, an extension method
<code>searchReturnAll</code> does this.
```javascript
const results = await client.searchReturnAll(base, options, controls);
for (let entry of results.entries) {
    ...
}
```

## Additional Methods

+ `findUser(base, username, options)`
+ `userInGroup(base, username, groupName)`