'use strict';
const assert = require('node:assert');
const flush = require('../../../../lib/client/request-queue/flush');

describe('flush', () => {
  it('should clear the timer', () => {
    const q = {
      _timer: 123,
      _queue: {
        values () {
          return [];
        },
        clear () {
          assert.ok(true);
        }
      }
    }
    flush.call(q);
    assert.equal(q._timer, null);
  })

  it('should invoke callback with parameters', () => {
    const req = {
      message: 'foo',
      expect: 'bar',
      emitter: 'baz',
      cb: theCB
    };
    const q = {
      _timer: 123,
      _queue: {
        values () {
          return [req];
        },
        clear () {
          assert.ok(true);
        }
      }
    }
    flush.call(q, (message, expect, emitter, cb) => {
      assert.equal(message, 'foo')
      assert.equal(expect, 'bar')
      assert.equal(emitter, 'baz')
      assert.equal(cb, theCB)
    });
    assert.equal(q._timer, null);

    function theCB () {}
  });
});
