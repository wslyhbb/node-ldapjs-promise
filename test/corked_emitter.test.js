'use strict';
const assert = require('node:assert');
const CorkedEmitter = require('../lib/corked_emitter');

function gatherEventSequence (expectedNumber) {
  const gatheredEvents = [];
  let callback;
  const finished = new Promise(function (resolve) {
    callback = function (...args) {
      gatheredEvents.push(...args);
      if (gatheredEvents.length >= expectedNumber) {
        // Prevent result mutation after our promise is resolved:
        resolve(gatheredEvents.slice());
      }
    };
  });
  return {
    finished,
    callback
  };
}

describe('CorkedEmitter', () => {
  it('should handle the normal emit flow', async () => {
    const emitter = new CorkedEmitter();
    const expectedSequence = [
      ['searchEntry', { data: 'a' }],
      ['searchEntry', { data: 'b' }],
      ['end']
    ];
    const gatherer = gatherEventSequence(3);

    emitter.on('searchEntry', (...args) => {
      gatherer.callback(['searchEntry', ...args]);
    });
    emitter.on('end', (...args) => {
      gatherer.callback(['end', ...args]);
    });

    emitter.emit('searchEntry', { data: 'a' });
    emitter.emit('searchEntry', { data: 'b' });
    emitter.emit('end');

    const gatheredEvents = await gatherer.finished;
    expectedSequence.forEach((expectedEvent, i) => {
      assert.deepStrictEqual(gatheredEvents[i], expectedEvent);
    });
  });

  it('should preserve emit order for reversed listener registration', async () => {
    const emitter = new CorkedEmitter();
    const expectedSequence = [
      ['searchEntry', { data: 'a' }],
      ['searchEntry', { data: 'b' }],
      ['end']
    ];
    const gatherer = gatherEventSequence(3);
    // This time, we swap the event listener registrations.
    // The order of emits should remain unchanged.
    emitter.on('end', (...args) => {
      gatherer.callback(['end', ...args]);
    });
    emitter.on('searchEntry', (...args) => {
      gatherer.callback(['searchEntry', ...args]);
    });

    emitter.emit('searchEntry', { data: 'a' });
    emitter.emit('searchEntry', { data: 'b' });
    emitter.emit('end');

    const gatheredEvents = await gatherer.finished;
    expectedSequence.forEach((expectedEvent, i) => {
      assert.deepStrictEqual(gatheredEvents[i], expectedEvent);
    });
  });

  it('should replay events when listeners are registered after emit', async () => {
    const emitter = new CorkedEmitter();
    const expectedSequence = [
      ['searchEntry', { data: 'a' }],
      ['searchEntry', { data: 'b' }],
      ['end']
    ];
    const gatherer = gatherEventSequence(3);

    emitter.emit('searchEntry', { data: 'a' });
    emitter.emit('searchEntry', { data: 'b' });
    emitter.emit('end');
    // The listeners only appear after a brief delay - this simulates
    //  the situation described in https://github.com/ldapjs/node-ldapjs/issues/602
    //  and in https://github.com/ifroz/node-ldapjs/commit/5239f6c68827f2c25b4589089c199d15bb882412
    await new Promise((resolve) => setTimeout(resolve, 50));

    emitter.on('end', (...args) => {
      gatherer.callback(['end', ...args]);
    });
    emitter.on('searchEntry', (...args) => {
      gatherer.callback(['searchEntry', ...args]);
    });

    const gatheredEvents = await gatherer.finished;
    expectedSequence.forEach((expectedEvent, i) => {
      assert.deepStrictEqual(gatheredEvents[i], expectedEvent);
    });
  });
});
