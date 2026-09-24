'use strict';
const assert = require('node:assert');
const purge = require('../../../../lib/client/request-queue/purge');

describe('purge', () => {
  it('should flush the queue with timeout errors', async () => {
    const q = {
      async flush () {
        return [{ message: 'a', cb: () => {} }];
      }
    };
    const timedOut = await purge.call(q);
    assert.strictEqual(timedOut.length, 1);
    assert.deepStrictEqual(timedOut[0].request, { message: 'a', cb: timedOut[0].request.cb });
    assert.ok(timedOut[0].error);
    assert.strictEqual(timedOut[0].error.name, 'TimeoutError');
    assert.strictEqual(timedOut[0].error.message, 'request queue timeout');
  });
});
