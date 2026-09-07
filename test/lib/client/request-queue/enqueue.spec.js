'use strict';
const assert = require('node:assert');
const enqueue = require('../../../../lib/client/request-queue/enqueue');

describe('enqueue', () => {
  it('should reject new requests if size is exceeded', () => {
    const q = { _queue: { size: 5 }, size: 5 };
    const result = enqueue.call(q, 'foo', 'bar', {}, {});
    assert.strictEqual(result, false);
  });

  it('should add a request and return true if no timeout', () => {
    const q = {
      _queue: {
        size: 0,
        add (obj) {
          assert.deepStrictEqual(obj, {
            message: 'foo',
            expect: 'bar',
            emitter: 'baz',
            cb: 'bif'
          });
        }
      },
      _frozen: false,
      timeout: 0
    };
    const result = enqueue.call(q, 'foo', 'bar', 'baz', 'bif');
    assert.strictEqual(result, true);
  });

  it('should add a request and return if timer not set', () => {
    const q = {
      _queue: {
        size: 0,
        add (obj) {
          assert.deepStrictEqual(obj, {
            message: 'foo',
            expect: 'bar',
            emitter: 'baz',
            cb: 'bif'
          });
        }
      },
      _frozen: false,
      timeout: 100,
      _timer: null
    };
    const result = enqueue.call(q, 'foo', 'bar', 'baz', 'bif');
    assert.strictEqual(result, true);
  });

  it('should add a request, returns true, and clears queue', () => {
    const q = {
      _queue: {
        size: 0,
        add (obj) {
          assert.deepStrictEqual(obj, {
            message: 'foo',
            expect: 'bar',
            emitter: 'baz',
            cb: 'bif'
          });
        }
      },
      _frozen: false,
      timeout: 5,
      _timer: 123,
      freeze () { assert.strictEqual(true, true); },
      purge () { assert.strictEqual(true, true); }
    };
    const result = enqueue.call(q, 'foo', 'bar', 'baz', 'bif');
    assert.strictEqual(result, true);
  });
});
