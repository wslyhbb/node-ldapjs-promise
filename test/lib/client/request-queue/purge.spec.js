'use strict';
const assert = require('node:assert');
const purge = require('../../../../lib/client/request-queue/purge');

describe('purge', () => {
  it('should flush the queue with timeout errors', () => {
    const q = {
      flush (func) {
        func('a', 'b', 'c', (err) => {
          assert.ok(err);
          assert.strictEqual(err.name, 'TimeoutError');
          assert.strictEqual(err.message, 'request queue timeout');
        });
      }
    };
    purge.call(q);
  });
});
