import { ok, equal } from 'node:assert';
import {
  LDAPError,
  ConnectionError,
  AbandonedError,
  TimeoutError,
  ConstraintViolationError,
  LDAP_OTHER
} from '../lib/index.js';

describe('errors', function () {
  it('should create a basic error', function () {
    const msg = 'mymsg';
    const err = new LDAPError(msg, null, null);
    ok(err);
    equal(err.name, 'LDAPError');
    equal(err.code, LDAP_OTHER);
    equal(err.dn, '');
    equal(err.message, msg);
  })

  it('should create a ConstraintViolationError', function () {
    const msg = 'mymsg';
    const err = new ConstraintViolationError(msg, null, null);
    ok(err);
    equal(err.name, 'ConstraintViolationError');
    equal(err.code, 19);
    equal(err.dn, '');
    equal(err.message, msg);
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
      ok(err);
      equal(err.name, entry.name);
      equal(err.code, LDAP_OTHER);
      equal(err.dn, '');
      equal(err.message, msg);
    });
  });
});
