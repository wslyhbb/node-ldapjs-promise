import { strictEqual, fail } from 'node:assert';
import { MAX_MSGID } from '../../../../lib/client/constants.js';
import purgeAbandoned from '../../../../lib/client/message-tracker/purge-abandoned.js';

describe('purgeAbandoned', () => {
  it('should clear the queue if only one message is present', () => {
    const abandoned = new Map();
    abandoned.set(1, { age: 2, reject: cb });

    purgeAbandoned(2, abandoned);

    strictEqual(abandoned.size, 0);

    function cb (err) {
      strictEqual(err.name, 'AbandonedError');
      strictEqual(err.message, 'client request abandoned');
    }
  });

  it('should clear the queue if multiple messages are present', () => {
    const abandoned = new Map();
    abandoned.set(1, { age: 2, reject: cb });
    abandoned.set(2, { age: 3, reject: cb });

    purgeAbandoned(4, abandoned);

    strictEqual(abandoned.size, 0);

    function cb (err) {
      strictEqual(err.name, 'AbandonedError');
      strictEqual(err.message, 'client request abandoned');
    }
  });

  it('should handle the message ID wrapping around', () => {
    const abandoned = new Map();
    abandoned.set(MAX_MSGID - 1, { age: MAX_MSGID, reject: cb });

    // The abandon message used MAX_MSGID, so this is the first message in the new sequence.
    purgeAbandoned(1, abandoned);

    strictEqual(abandoned.size, 0);

    function cb (err) {
      strictEqual(err.name, 'AbandonedError');
      strictEqual(err.message, 'client request abandoned');
    }
  });

  it('should not clear the queue if the window is not met', () => {
    const abandoned = new Map();
    abandoned.set(1, { age: 2, reject: cb });

    purgeAbandoned(1, abandoned);

    strictEqual(abandoned.size, 1);

    function cb () {
      fail('should not be invoked');
    }
  });
});
