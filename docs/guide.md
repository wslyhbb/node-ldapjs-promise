---
title: LDAP Guide | ldapjs-promise
---

# LDAP Guide

<div class="intro">

This guide was written assuming that you (1) do not know anything about
ldapjs-promise, and perhaps more importantly (2) know little, if anything about
LDAP.  If you are already an LDAP whiz, please do not read this and feel it is
condescending. Most people do not know how LDAP works, other than that "it is
that thing that has my password."

By the end of this guide, we will have a simple LDAP server that accomplishes a
"real" task.

</div>

# What exactly is LDAP?

If you have not already read the
[wikipedia](http://en.wikipedia.org/wiki/Lightweight_Directory_Access_Protocol)
entry (which you should go do that right now), LDAP is the "Lightweight
Directory Access Protocol".  A directory service basically breaks down as
follows:

* A directory is a tree of entries (similar to but different than an FS).
* Every entry has a unique name in the tree.
* An entry is a set of attributes.
* An attribute is a key/value(s) pairing (multivalue is natural).

It might be helpful to visualize:

```
              o=example
              /       \
         ou=users     ou=groups
        /      |         |     \
    cn=john  cn=jane  cn=dudes  cn=dudettes
    /
keyid=foo
```

Let us say we wanted to look at the record cn=john:

```shell
dn: cn=john, ou=users, o=example
cn: john
sn: smith
email: john@example.com
email: john.smith@example.com
objectClass: person
```

A few things to note:

* All names in a directory tree are actually referred to as a _distinguished
name_, or _dn_ for short.  A dn is comprised of attributes that lead to that
node in the tree, as shown above (the syntax is foo=bar, ...).
* The root of the tree is at the right of the _dn_, which is inverted from a
filesystem hierarchy.
* Every entry in the tree is an _instance of_ an _objectclass_.
* An _objectclass_ is a schema concept; think of it like a table in a
traditional ORM.
* An _objectclass_ defines what _attributes_ an entry can have (on the ORM
analogy, an _attribute_ would be like a column).

That is it. LDAP, then, is the protocol for interacting with the directory
tree, and it is comprehensively specified for common operations, like
add/update/delete and importantly, search.  Really, the power of LDAP comes
through the search operations defined in the protocol, which are richer
than HTTP query string filtering, but less powerful than full SQL.  You can
think of LDAP as a NoSQL/document store with a well-defined query syntax.

So, why is LDAP not more popular for a lot of applications? Like anything else
that has "simple" or "lightweight" in the name, it is not really that
lightweight. In particular, almost all of the implementations of LDAP stem
from the original University of Michigan codebase written in 1996. At that
time, the original intention of LDAP was to be an IP-accessible gateway to the
much more complex X.500 directories,  which means that a lot of that
baggage has carried through to today.  That makes for a high barrier to entry,
when most applications just do not need most of those features.

## How is ldapjs-promise any different?

Well, on the one hand, since ldapjs-promise has to be 100% wire compatible with
LDAP to be useful, it is not. On the other hand, there are no forced assumptions
about what you need and do not need for your use of a directory system.  For
example, if you want to run with no-schema in OpenLDAP/389DS/et al? Good luck.
Most of the server implementations support arbitrary "backends" for persistence,
but really you will be using [BDB](http://www.oracle.com/technetwork/database/berkeleydb/overview/index.html).

Want to run schema-less in ldapjs-promise, or wire it up with some mongoose
models? No problem.  Want to back it to redis? Should be able to get some
basics up in a day or two.

Basically, the ldapjs-promise philosophy is to deal with the "muck" of LDAP,
and then get out of the way so you can just use the "good parts."

# Ok, cool. Learn me some LDAP!

With the initial fluff out of the way, let us do something crazy to teach
you some LDAP.  Let us put an LDAP server up over the top of your (Linux) host's
/etc/passwd and /etc/group files. Usually sysadmins "go the other way," and
replace /etc/passwd with a
[PAM](http://en.wikipedia.org/wiki/Pluggable_authentication_module "Pluggable
authentication module") module to LDAP. While this is probably not a super
useful real-world use case, it will teach you some of the basics. If it is
useful to you, then that is great.

## Install

If you do not already have node.js and npm, clearly you need those, so follow
the steps at [nodejs.org](http://nodejs.org) and [npmjs.org](http://npmjs.org),
respectively.  After that, run:

```shell
$ npm install ldapjs-promise
```

Rather than overload you with client-side programming for now, we will use
the OpenLDAP CLI to interact with our server.  It is almost certainly already
installed on your system, but if not, you can get it from brew/apt/yum/your
package manager here.

To get started, open some file, and let us get the library loaded and a server
created:

```js
const ldap = require('ldapjs-promise');

const server = ldap.createServer();

server.listen(1389, () => {
  console.log('/etc/passwd LDAP server up at: %s', server.url);
});
```

And run that.  Doing anything will give you errors (LDAP "No Such Object")
since we have not added any support in yet, but go ahead and try it anyway:

```shell
$ ldapsearch -H ldap://localhost:1389 -x -b "o=myhost" objectclass=*
```

Before we go any further, note that the complete code for the server we are
about to build up is on the [examples](examples.html) page.

## Bind

So, lesson #1 about LDAP: unlike HTTP, it is connection-oriented; that means
that you authenticate (in LDAP nomenclature this is called a _bind_), and all
subsequent operations operate at the level of priviledge you established during
a bind.  You can bind any number of times on a single connection and change that
identity.  Technically, it is optional, and you can support _anonymous_
operations from clients, but (1) you probably do not want that, and (2) most
LDAP clients will initiate a bind anyway (OpenLDAP will), so let us add it in
and get it out of our way.

What we are going to do is add a "root" user to our LDAP server.  This root user
has no correspondence to our Unix root user, it is just something we are making up
and going to use for allowing an (LDAP) admin to do anything.  To do so, add
this code into your file:

```js
server.bind('cn=root', (req, res, next) => {
  if (req.dn.toString() !== 'cn=root' || req.credentials !== 'secret')
    return next(new ldap.InvalidCredentialsError());

  res.end();
  return next();
});
```

Not very secure, but this is a demo.  What we did there was "mount" a tree in
the ldapjs-promise server, and add a handler for the _bind_ method.  If you
have ever used express, this pattern should be really familiar; you can add any
number of handlers in, as we will see later.

On to the meat of the method.  What is up with this?

```js
if (req.dn.toString() !== 'cn=root' || req.credentials !== 'secret')
```

The first part `req.dn.toString() !== 'cn=root'`:  you are probably thinking
"Why does ldapjs-promise allow something other than cn=root into this handler?"
Sort of.  It allows cn=root *and any children* into that handler.  So the
entries `cn=root` and `cn=evil, cn=root` would both match and flow into this
handler.  Hence that check.  The second check `req.credentials` is probably
obvious, but it brings up an important point, and that is the `req`, `res`
objects in ldapjs-promise are not homogenous across server operation types.
Unlike HTTP, there is not a single message format, so each of the operations
has fields and functions appropriate to that type.  The LDAP bind operation has
`credentials`, which are a string representation of the client's password.
This is logically the same as HTTP Basic Authentication (there are other
mechanisms, but that is out of scope for a getting started guide).  Ok, if
either of those checks failed, we pass a new ldapjs-promise `Error` back into
the server, and it will (1) halt the chain, and (2) send the proper error code
back to the client.

Lastly, assuming that this request was ok, we just end the operation with
`res.end()`.  The `return next()` is not strictly necessary, since here we only
have one handler in the chain, but it is good habit to always do that, so if you
add another handler in later you will not get bit by it not being invoked.

Blah blah, let us try running the ldap client again, first with a bad password:

```shell
$ ldapsearch -H ldap://localhost:1389 -x -D cn=root -w foo -b "o=myhost" objectclass=*

ldap_bind: Invalid credentials (49)
    matched DN: cn=root
    additional info: Invalid Credentials
```

And again with the correct one:

```shell
$ ldapsearch -H ldap://localhost:1389 -x -D cn=root -w secret -LLL -b "o=myhost" objectclass=*

No such object (32)
Additional information: No tree found for: o=myhost
```

Do not worry about all the flags we are passing into OpenLDAP, that is just to
make their CLI less annonyingly noisy.  This time, we got another
`No such object` error, but it is for the tree `o=myhost`. That means our bind
went through, and our search failed, since we have not yet added a search
handler. Just one more small thing to do first.

Remember earlier I said there were no authorization rules baked into LDAP?  Well,
we added a bind route, so the only user that can authenticate is `cn=root`, but
what if the remote end does not authenticate at all?  Right, nothing says they
*have to* bind, that is just what the common clients do.  Let us add a quick
authorization handler that we will use in all our subsequent routes:

```js
function authorize(req, res, next) {
  if (!req.connection.ldap.bindDN.equals('cn=root'))
    return next(new ldap.InsufficientAccessRightsError());

  return next();
}
```

Should be pretty self-explanatory, but as a reminder, LDAP is connection
oriented, so we check that the connection remote user was indeed our `cn=root`
(by default ldapjs-promise will have a DN of `cn=anonymous` if the client did
not bind).

## Search

We said we wanted to allow LDAP operations over /etc/passwd, so let us detour
for a moment to explain an /etc/passwd record.

```shell
jsmith:x:1001:1000:Joe Smith,Room 1007,(234)555-8910,(234)555-0044,email:/home/jsmith:/bin/sh
```

The sample record above maps to:

|Field              |Description                        |
|-------------------|-----------------------------------|
|jsmith             |Username                           |
|x                  |Placeholder for password hash      |
|1001               |Numeric UID                        |
|1000               |Numeric Primary GID                |
|'Joe Smith,...'    |DisplayName                        |
|/home/jsmith       |Home directory                     |
|/bin/sh            |Shell                              |

Let us write some handlers to parse that and transform it into an LDAP search
record (note, you will need to add `const fs = require('fs');` at the top of
the source file).

First, make a handler that just loads the "user database" in a "pre" handler:

```js
function loadPasswdFile(req, res, next) {
  fs.readFile('/etc/passwd', 'utf8', (err, data) => {
    if (err)
      return next(new ldap.OperationsError(err.message));

    req.users = {};

    const lines = data.split('\n');
    for (const line of lines) {
      if (!line || /^#/.test(line))
        continue;

      const record = line.split(':');
      if (!record || !record.length)
        continue;

      req.users[record[0]] = {
        dn: 'cn=' + record[0] + ', ou=users, o=myhost',
        attributes: {
          cn: record[0],
          uid: record[2],
          gid: record[3],
          description: record[4],
          homedirectory: record[5],
          shell: record[6] || '',
          objectclass: 'unixUser'
        }
      };
    }

    return next();
  });
}
```

Ok, all that did is tack the /etc/passwd records onto req.users so that any
subsequent handler does not have to reload the file.  Next, let us write a
search handler to process that:

```js
const pre = [authorize, loadPasswdFile];

server.search('o=myhost', pre, (req, res, next) => {
  const keys = Object.keys(req.users);
  for (const k of keys) {
    if (req.filter.matches(req.users[k].attributes))
      res.send(req.users[k]);
  }

  res.end();
  return next();
});
```

And try running:

```shell
$ ldapsearch -H ldap://localhost:1389 -x -D cn=root -w secret -LLL -b "o=myhost" cn=root
dn: cn=root, ou=users, o=myhost
cn: root
uid: 0
gid: 0
description: System Administrator
homedirectory: /var/root
shell: /bin/sh
objectclass: unixUser
```

Sweet! Try this out too:

```shell
$ ldapsearch -H ldap://localhost:1389 -x -D cn=root -w secret -LLL -b "o=myhost" objectclass=*
...
```

You should have seen an entry for every record in /etc/passwd with the second.
What all did we do here?  A lot.  Let us break this down...

### What did I just do on the command line?

Let us start with looking at what you even asked for:

```shell
$ ldapsearch -H ldap://localhost:1389 -x -D cn=root -w secret -LLL -b "o=myhost" cn=root
```

We can throw away `ldapsearch -H -x -D -w -LLL`, as those just specify the URL
to connect to, the bind credentials and the `-LLL` just quiets down OpenLDAP.
That leaves us with: `-b "o=myhost" cn=root`.

The `-b o=myhost` tells our LDAP server where to _start_ looking in
the tree for entries that might match the search filter, which above is
`cn=root`.

In this little LDAP example, we are mostly throwing out any qualification of the
"tree," since there is not actually a tree in /etc/passwd (we will extend later
with /etc/group).  Remember how I said ldapjs-promise gets out of the way and
does not force anything on you?  Here is an example.  If we wanted an LDAP
server to run over the filesystem, we actually would use this, but here, meh.

Next, `cn=root` is the search "filter".  LDAP has a rich specification of
filters, where you can specify `and`, `or`, `not`, `>=`, `<=`, `equal`,
`wildcard`, `present` and a few other esoteric things.  Really, `equal`,
`wildcard`, `present` and the boolean operators are all you will likely ever
need.  So, the filter `cn=root` is an "equality" filter, and says to only
return entries that have attributes that match that.  In the second invocation,
we used a 'presence' filter, to say 'return any entries that have an
objectclass' attribute, which in LDAP parlance is saying "give me everything."

### The code

In the code above, let us ignore the fs and split stuff, since really all we
did was read in /etc/passwd line by line.  After that, we looked at each record
and made the cheesiest transform ever, which is making up a "search entry." A
search entry _must_ have a DN so the client knows what record it is, and a set
of attributes.  So that is why we did this:

```js
const entry = {
  dn: 'cn=' + record[0] + ', ou=users, o=myhost',
  attributes: {
    cn: record[0],
    uid: record[2],
    gid: record[3],
    description: record[4],
    homedirectory: record[5],
    shell: record[6] || '',
    objectclass: 'unixUser'
  }
};
```

Next, we let ldapjs-promise do all the hard work of figuring out LDAP search
filters for us by calling `req.filter.matches`.  If it matched, we return the
whole record with `res.send`.  In this little example we are running O(n), so
for something big and/or slow, you would have to do some work to effectively
write a query planner (or just not support it...). For some reference code,
check out `node-ldapjs-riak`, which takes on the fairly difficult task of
writing a 'full' LDAP server over riak.

To demonstrate what ldapjs-promise is doing for you, let us find all users who
have a shell set to `/bin/false` and whose name starts with `p` (I am doing
this on Ubuntu).  Then, let us say we only care about their login name and
primary group id.  We would do this:

```shell
$ ldapsearch -H ldap://localhost:1389 -x -D cn=root -w secret -LLL -b "o=myhost" "(&(shell=/bin/false)(cn=p*))" cn gid
dn: cn=proxy, ou=users, o=myhost
cn: proxy
gid: 13

dn: cn=pulse, ou=users, o=myhost
cn: pulse
gid: 114
```

## Add

This is going to be a little bit ghetto, since what we are going to do is just
use node's child process module to spawn calls to `adduser`.  Go ahead and add
the following code in as another handler (you will need a
`const { spawn } = require('child_process');` at the top of your file):

```js
server.add('ou=users, o=myhost', pre, (req, res, next) => {
  if (!req.dn.rdns[0].attrs.cn)
    return next(new ldap.ConstraintViolationError('cn required'));

  if (req.users[req.dn.rdns[0].attrs.cn.value])
    return next(new ldap.EntryAlreadyExistsError(req.dn.toString()));

  const entry = req.toObject().attributes;

  if (entry.objectclass.indexOf('unixUser') === -1)
    return next(new ldap.ConstraintViolationError('entry must be a unixUser'));

  const opts = ['-m'];
  if (entry.description) {
    opts.push('-c');
    opts.push(entry.description[0]);
  }
  if (entry.homedirectory) {
    opts.push('-d');
    opts.push(entry.homedirectory[0]);
  }
  if (entry.gid) {
    opts.push('-g');
    opts.push(entry.gid[0]);
  }
  if (entry.shell) {
    opts.push('-s');
    opts.push(entry.shell[0]);
  }
  if (entry.uid) {
    opts.push('-u');
    opts.push(entry.uid[0]);
  }
  opts.push(entry.cn[0]);
  const useradd = spawn('useradd', opts);

  const messages = [];

  useradd.stdout.on('data', (data) => {
    messages.push(data.toString());
  });
  useradd.stderr.on('data', (data) => {
    messages.push(data.toString());
  });

  useradd.on('exit', (code) => {
    if (code !== 0) {
      let msg = '' + code;
      if (messages.length)
        msg += ': ' + messages.join();
      return next(new ldap.OperationsError(msg));
    }

    res.end();
    return next();
  });
});
```

Then, you will need to be root to have this running, so start your server with
`sudo` (or be root, whatever).  Now, go ahead and create a file called
`user.ldif` with the following contents:

```shell
dn: cn=ldapjs-promise, ou=users, o=myhost
objectClass: unixUser
cn: ldapjs-promise
shell: /bin/bash
description: Created via ldapadd
```

Now go ahead and invoke with:

```shell
$ ldapadd -H ldap://localhost:1389 -x -D cn=root -w secret -f ./user.ldif
adding new entry "cn=ldapjs-promise, ou=users, o=myhost"
```

Let us confirm he got added with an ldapsearch:

```shell
$ ldapsearch -H ldap://localhost:1389 -LLL -x -D cn=root -w secret -b "ou=users, o=myhost" cn=ldapjs-promise
dn: cn=ldapjs-promise, ou=users, o=myhost
cn: ldapjs-promise
uid: 1001
gid: 1001
description: Created via ldapadd
homedirectory: /home/ldapjs-promise
shell: /bin/bash
objectclass: unixUser
```

As before, here is a breakdown of the code:

```js
server.add('ou=users, o=myhost', pre, (req, res, next) => {
  if (!req.dn.rdns[0].attrs.cn)
    return next(new ldap.ConstraintViolationError('cn required'));

  if (req.users[req.dn.rdns[0].attrs.cn.value])
    return next(new ldap.EntryAlreadyExistsError(req.dn.toString()));

  const entry = req.toObject().attributes;

  if (entry.objectclass.indexOf('unixUser') === -1)
    return next(new ldap.ConstraintViolationError('entry must be a unixUser'));
});
```

A few new things:

* We mounted this handler at `ou=users, o=myhost`. Why?  What if we want to
extend this little project with groups?  We probably want those under a
different part of the tree.
* We did some really minimal schema enforcement by:
    + Checking that the leaf RDN (relative distinguished name) was a _cn_
attribute.
    + We then did `req.toObject()`. As mentioned before, each of the req/res
objects have special APIs that make sense for that operation.  Without getting
into the details, the LDAP add operation on the wire doesn't look like a JS
object, and we want to support both the LDAP nerd that wants to see what
got sent, and the "easy" case.  So use `.toObject()`.  Note we also filtered
out to the `attributes` portion of the object since that is all we are really
looking at.
    + Lastly, we did a super minimal check to see if the entry was of type
`unixUser`. Frankly for this case, it is kind of useless, but it does illustrate
one point: attribute names are case-insensitive, so ldapjs converts them all to
lower case (note the client sent _objectClass_ over the wire).

After that, we really just delegated off to the _useradd_ command.  As far as I
know, there is not a node.js module that wraps up `getpwent` and friends,
otherwise we would use that.

Now, what is missing?  Oh, right, we need to let you set a password.  Well, let
us support that via the _modify_ command.

## Modify

Unlike HTTP, "partial" document updates are fully specified as part of the
RFC, so appending, removing, or replacing a single attribute is pretty natural.
Go ahead and add the following code into your source file:

```js
server.modify('ou=users, o=myhost', pre, (req, res, next) => {
  if (!req.dn.rdns[0].attrs.cn || !req.users[req.dn.rdns[0].attrs.cn.value])
    return next(new ldap.NoSuchObjectError(req.dn.toString()));

  if (!req.changes.length)
    return next(new ldap.ProtocolError('changes required'));

  const user = req.users[req.dn.rdns[0].attrs.cn.value].attributes;
  let mod;

  for (const i = 0; i < req.changes.length; i++) {
    mod = req.changes[i].modification;
    switch (req.changes[i].operation) {
    case 'replace':
      if (mod.type !== 'userpassword' || !mod.vals || !mod.vals.length)
        return next(new ldap.UnwillingToPerformError('only password updates ' +
                                                     'allowed'));
      break;
    case 'add':
    case 'delete':
      return next(new ldap.UnwillingToPerformError('only replace allowed'));
    }
  }

  const passwd = spawn('chpasswd', ['-c', 'MD5']);
  passwd.stdin.end(user.cn + ':' + mod.vals[0], 'utf8');

  passwd.on('exit', (code) => {
    if (code !== 0)
      return next(new ldap.OperationsError(code));

    res.end();
    return next();
  });
});
```

Basically, we made sure the remote client was targeting an entry that exists,
ensuring that they were asking to "replace" the `userPassword` attribute (which
is the 'standard' LDAP attribute for passwords; if you think it is easier to use
'password', knock yourself out), and then just delegating to the `chpasswd`
command (which lets you change a user's password over stdin).  Next, go ahead
and create a `passwd.ldif` file:

```shell
dn: cn=ldapjs-promise, ou=users, o=myhost
changetype: modify
replace: userPassword
userPassword: secret
-
```

And then run the OpenLDAP CLI:

```shell
$ ldapmodify -H ldap://localhost:1389 -x -D cn=root -w secret -f ./passwd.ldif
```

You should now be able to login to your box as the ldapjs-promise user. Let us
get the last "mainline" piece of work out of the way, and delete the user.

## Delete

Delete is pretty straightforward. The client gives you a dn to delete, and you
delete it :).  Add the following code into your server:

```js
server.del('ou=users, o=myhost', pre, (req, res, next) => {
  if (!req.dn.rdns[0].attrs.cn || !req.users[req.dn.rdns[0].attrs.cn.value])
    return next(new ldap.NoSuchObjectError(req.dn.toString()));

  const userdel = spawn('userdel', ['-f', req.dn.rdns[0].attrs.cn.value]);

  const messages = [];
  userdel.stdout.on('data', (data) => {
    messages.push(data.toString());
  });
  userdel.stderr.on('data', (data) => {
    messages.push(data.toString());
  });

  userdel.on('exit', (code) => {
    if (code !== 0) {
      let msg = '' + code;
      if (messages.length)
        msg += ': ' + messages.join();
      return next(new ldap.OperationsError(msg));
    }

    res.end();
    return next();
  });
});
```

And then run the following command:

```shell
$ ldapdelete -H ldap://localhost:1389 -x -D cn=root -w secret "cn=ldapjs-promise, ou=users, o=myhost"
```

# Where to go from here

The complete source code for this example server is available in
[examples](examples.html).  Make sure to read up on the [server](server.html)
and [client](client.html) APIs.  If you are looking for a "drop in" solution,
take a look at [ldapjs-riak](https://github.com/mcavage/node-ldapjs-riak).

[Mozilla](https://wiki.mozilla.org/Mozilla_LDAP_SDK_Programmer%27s_Guide/Understanding_LDAP)
still maintains some web pages with LDAP overviews if you look around, if you are
looking for more tutorials.  After that, you will need to work your way through
the [RFCs](http://tools.ietf.org/html/rfc4510) as you work through the APIs in
ldapjs-promise.