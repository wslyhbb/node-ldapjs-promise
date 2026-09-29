import { ok } from 'node:assert';
import { Parser } from '../../lib/index.js';

describe('Parser', function () {
  it('should emit wrong protocol error', function (done) {
    const p = new Parser();

    p.once('error', function (err) {
      ok(err);
      done();
    })

    // Send some data to trigger a message
    p.write(Buffer.from([48, 3, 2, 1, 0]));
  });
});
