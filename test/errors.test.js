'use strict';
const assert = require('node:assert');
const {
  LDAPError,
  ConnectionError,
  AbandonedError,
  TimeoutError,
  ConstraintViolationError,
  LDAP_OTHER
} = require('../lib');

describe('errors', function () {
  it('should create a basic error', function () {
    const msg = 'mymsg';
    const err = new LDAPError(msg, null, null);
    assert.ok(err);
    assert.equal(err.name, 'LDAPError');
    assert.equal(err.code, LDAP_OTHER);
    assert.equal(err.dn, '');
    assert.equal(err.message, msg);
  })

  it('should create a ConstraintViolationError', function () {
    const msg = 'mymsg';
    const err = new ConstraintViolationError(msg, null, null);
    assert.ok(err);
    assert.equal(err.name, 'ConstraintViolationError');
    assert.equal(err.code, 19);
    assert.equal(err.dn, '');
    assert.equal(err.message, msg);
  })

  it('should create "custom" errors', function () {
    const errors = [
      { name: 'ConnectionError', Func: ConnectionError },
      { name: 'AbandonedError', Func: AbandonedError },
      { name: 'TimeoutError', Func: TimeoutError }
    ];

    errors.forEach(function (entry) {
      const msg = entry.name + 'msg';
      const err = new entry.Func(msg);
      assert.ok(err);
      assert.equal(err.name, entry.name);
      assert.equal(err.code, LDAP_OTHER);
      assert.equal(err.dn, '');
      assert.equal(err.message, msg);
    });
  });
});
