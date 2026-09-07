'use strict';
const assert = require('node:assert');
const { MAX_MSGID } = require('../../../../lib/client/constants');
const idGeneratorFactory = require('../../../../lib/client/message-tracker/id-generator');

describe('idGenerator', () => {
  it('should start at 0', () => {
    const nextID = idGeneratorFactory();
    const currentID = nextID();
    assert.strictEqual(currentID, 1);
  });

  it('should handle wrapping around', async () => {
    const nextID = idGeneratorFactory(MAX_MSGID - 2);

    let currentID = nextID();
    assert.strictEqual(currentID, MAX_MSGID - 1);

    currentID = nextID();
    assert.strictEqual(currentID, 1);
  });
});
