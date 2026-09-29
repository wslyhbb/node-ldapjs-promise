import { strictEqual } from 'node:assert';
import { MAX_MSGID } from '../../../../lib/client/constants.js';
import geWindow from '../../../../lib/client/message-tracker/ge-window.js';

describe('geWindow', () => {
  it('should return true if comp is greater than ref', () => {
    const ref = Math.floor(MAX_MSGID / 2) + 10;
    const comp = ref + 10;
    const result = geWindow(ref, comp);
    strictEqual(result, true);
  });

  it('should return false if comp is less than ref', () => {
    const ref = Math.floor(MAX_MSGID / 2) + 10;
    const comp = ref - 5;
    const result = geWindow(ref, comp);
    strictEqual(result, false);
  });

  it('should return true if comp greater than ref and ref is in lower window', () => {
    const ref = Math.floor(MAX_MSGID / 2) - 10;
    const comp = ref + 20;
    const result = geWindow(ref, comp);
    strictEqual(result, true);
  });

  it('should return false if comp less than ref and ref is in lower window', () => {
    const ref = Math.floor(MAX_MSGID / 2) - 10;
    const comp = ref - 5;
    const result = geWindow(ref, comp);
    strictEqual(result, false);
  });

  it('should return true if max is MAX_MSGID and comp greater than ref', () => {
    const ref = MAX_MSGID - Math.floor(MAX_MSGID / 2);
    const comp = ref + 1;
    const result = geWindow(ref, comp);
    strictEqual(result, true);
  });

  it('should return false if max is MAX_MSGID and comp less than ref', () => {
    const ref = MAX_MSGID - Math.floor(MAX_MSGID / 2);
    const comp = ref - 1;
    const result = geWindow(ref, comp);
    strictEqual(result, false);
  });
});
