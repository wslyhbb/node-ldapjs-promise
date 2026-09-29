import { throws, strictEqual, deepStrictEqual } from 'node:assert';
import messageTrackerFactory from '../../../../lib/client/message-tracker/index.js';

describe('message-tracker', () => {
  describe('options', () => {
    it('should require an options object', () => {
      throws(() => messageTrackerFactory(), /options object is required/);
      throws(() => messageTrackerFactory([]), /options object is required/);
      throws(() => messageTrackerFactory(''), /options object is required/);
      throws(() => messageTrackerFactory(42), /options object is required/);
    });

    it('should require id to be a string', () => {
      throws(() => messageTrackerFactory({ id: {} }), /options\.id string is required/);
      throws(() => messageTrackerFactory({ id: [] }), /options\.id string is required/);
      throws(() => messageTrackerFactory({ id: 42 }), /options\.id string is required/);
    });

    it('should require parser to be an object', () => {
      throws(() => messageTrackerFactory({ id: 'foo', parser: 'bar' }), /options\.parser object is required/);
      throws(() => messageTrackerFactory({ id: 'foo', parser: 42 }), /options\.parser object is required/);
      throws(() => messageTrackerFactory({ id: 'foo', parser: [] }), /options\.parser object is required/);
    });
  });

  describe('.pending', () => {
    it('should return 0 for no messages', () => {
      const tracker = messageTrackerFactory({ id: 'foo', parser: {} });
      strictEqual(tracker.pending, 0);
    });

    it('should return 1 for 1 message', () => {
      const tracker = messageTrackerFactory({ id: 'foo', parser: {} });
      tracker.track({}, () => {});
      strictEqual(tracker.pending, 1);
    });
  });

  describe('#abandon', () => {
    it('should return false if message does not exist', () => {
      const tracker = messageTrackerFactory({ id: 'foo', parser: {} });
      strictEqual(tracker.abandon(1), false);
    });

    it('should return true if message is abandoned', () => {
      const tracker = messageTrackerFactory({ id: 'foo', parser: {} });
      tracker.track({}, {});
      strictEqual(tracker.abandon(1), true);
    });
  });

  describe('#fetch', () => {
    it('should return handler for fetched message', () => {
      const tracker = messageTrackerFactory({ id: 'foo', parser: {} });
      tracker.track({}, { handler });
      strictEqual(tracker.fetch(1).handler, handler);

      function handler () {}
    });

    it('should return handler for fetched abandoned message', () => {
      const tracker = messageTrackerFactory({ id: 'foo', parser: {} });
      tracker.track({}, { handler });
      tracker.track({ abandon: 'message' }, { handler: () => {} });
      tracker.abandon(1);
      strictEqual(tracker.fetch(1).handler, handler);

      function handler () {}
    });

    it('should return null when message does not exist', () => {
      const tracker = messageTrackerFactory({ id: 'foo', parser: {} });
      strictEqual(tracker.fetch(1), null);
    });
  });

  describe('#purge', () => {
    it('should invoke callback for each tracked message', () => {
      const tracker = messageTrackerFactory({ id: 'foo', parser: {} });
      const calls = [];
      function handler1 () {}
      function handler2 () {}

      tracker.track({}, { handler: handler1 });
      tracker.track({}, { handler: handler2 });
      tracker.purge().forEach(({ msgID, handler }) => calls.push([msgID, handler]));

      deepStrictEqual(calls, [[1, handler1], [2, handler2]]);
    });
  });

  describe('#remove', () => {
    it('should remove from the current track', () => {
      const tracker = messageTrackerFactory({ id: 'foo', parser: {} });
      tracker.track({}, { handler: () => {} });
      tracker.remove(1);
      strictEqual(tracker.pending, 0);
    });

    it('should remove from the abandoned track', () => {
      const tracker = messageTrackerFactory({ id: 'foo', parser: {} });
      tracker.track({}, { handler: () => {} });
      tracker.track({ abandon: 'message' }, { handler: () => {} });
      tracker.abandon(1);
      tracker.remove(1);
      strictEqual(tracker.pending, 1);
    });
  });

  describe('#track', () => {
    it('should add messageId and track message', () => {
      const tracker = messageTrackerFactory({ id: 'foo', parser: {} });
      const message = {};
      function handler () {}

      tracker.track(message, { handler });

      deepStrictEqual(message, { messageId: 1 });
      strictEqual(tracker.fetch(1).handler, handler);
    });
  });
});
