import { strictEqual } from 'node:assert';
import { MAX_MSGID } from '../../../../lib/client/constants.js';
import idGeneratorFactory from '../../../../lib/client/message-tracker/id-generator.js';

describe('idGenerator', () => {
  it('should start at 0', () => {
    const nextID = idGeneratorFactory();
    const currentID = nextID();
    strictEqual(currentID, 1);
  });

  it('should handle wrapping around', async () => {
    const nextID = idGeneratorFactory(MAX_MSGID - 2);

    let currentID = nextID();
    strictEqual(currentID, MAX_MSGID - 1);

    currentID = nextID();
    strictEqual(currentID, 1);
  });
});
