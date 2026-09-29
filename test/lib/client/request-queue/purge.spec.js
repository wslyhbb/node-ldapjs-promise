import { strictEqual, deepStrictEqual, ok } from 'node:assert';
import purge from '../../../../lib/client/request-queue/purge.js';

describe('purge', () => {
  it('should flush the queue with timeout errors', async () => {
    const q = {
      async flush () {
        return [{ message: 'a', cb: () => {} }];
      }
    };
    const timedOut = await purge.call(q);
    strictEqual(timedOut.length, 1);
    deepStrictEqual(timedOut[0].request, { message: 'a', cb: timedOut[0].request.cb });
    ok(timedOut[0].error);
    strictEqual(timedOut[0].error.name, 'TimeoutError');
    strictEqual(timedOut[0].error.message, 'request queue timeout');
  });
});
