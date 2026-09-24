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
            reject: 'bif'
          });
        }
      },
      _frozen: false,
      timeout: 0
    };
    const result = enqueue.call(q, {
      message: 'foo',
      expect: 'bar',
      emitter: 'baz',
      reject: 'bif'
    });
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
            reject: 'bif'
          });
        }
      },
      _frozen: false,
      timeout: 100,
      _timer: null
    };
    const result = enqueue.call(q, {
      message: 'foo',
      expect: 'bar',
      emitter: 'baz',
      reject: 'bif'
    });
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
            reject: 'bif'
          });
        }
      },
      _frozen: false,
      timeout: 5,
      _timer: 123,
      freeze () { assert.strictEqual(true, true); },
      async purge () { return []; }
    };
    const result = enqueue.call(q, {
      message: 'foo',
      expect: 'bar',
      emitter: 'baz',
      reject: 'bif'
    });
    assert.strictEqual(result, true);
  });

  it('rejects queued requests when the queue times out', async () => {
    const timeout = new Promise((resolve, reject) => {
      const q = {
        _queue: {
          size: 0,
          add () {}
        },
        _frozen: false,
        timeout: 1,
        _timer: 123,
        freeze () {
          this._frozen = true;
        },
        async purge () {
          return [{
            request: { reject },
            error: new Error('request queue timeout')
          }];
        }
      };

      enqueue.call(q, { reject });
    });

    await assert.rejects(timeout, { message: 'request queue timeout' });
  });
});
