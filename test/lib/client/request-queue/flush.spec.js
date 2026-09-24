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

  it('should return queued requests', async () => {
    const req = {
      message: 'foo',
      expect: 'bar',
      emitter: 'baz',
      cb: () => {}
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
    const requests = await flush.call(q);
    assert.deepStrictEqual(requests, [req]);
    assert.equal(q._timer, null);
  });
});
