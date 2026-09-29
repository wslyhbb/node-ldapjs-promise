import { ok, equal, deepStrictEqual } from 'node:assert';
import flush from '../../../../lib/client/request-queue/flush.js';

describe('flush', () => {
  it('should clear the timer', () => {
    const q = {
      _timer: 123,
      _queue: {
        values () {
          return [];
        },
        clear () {
          ok(true);
        }
      }
    }
    flush.call(q);
    equal(q._timer, null);
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
          ok(true);
        }
      }
    }
    const requests = await flush.call(q);
    deepStrictEqual(requests, [req]);
    equal(q._timer, null);
  });
});
