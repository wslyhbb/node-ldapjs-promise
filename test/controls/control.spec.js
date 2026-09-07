'use strict';
const assert = require('node:assert');
const { BerReader, BerWriter } = require('@ldapjs/asn1');
const { Control, getControl } = require('../../lib');

describe('Control', () => {
  it('should create a new control with no arguments', () => {
    assert.ok(new Control());
  });

  it('should create a new control with arguments', () => {
    const c = new Control({
      type: '2.16.840.1.113730.3.4.2',
      criticality: true
    });
    assert.ok(c);
    assert.equal(c.type, '2.16.840.1.113730.3.4.2');
    assert.ok(c.criticality);
  });

  it('should parse a control from a BER reader', () => {
    const ber = new BerWriter();
    ber.startSequence();
    ber.writeString('2.16.840.1.113730.3.4.2');
    ber.writeBoolean(true);
    ber.writeString('foo');
    ber.endSequence();

    const c = getControl(new BerReader(ber.buffer));

    assert.ok(c);
    assert.equal(c.type, '2.16.840.1.113730.3.4.2');
    assert.ok(c.criticality);
    assert.equal(c.value.toString('utf8'), 'foo');
  });

  it('should parse a control with no value from a BER reader', () => {
    const ber = new BerWriter();
    ber.startSequence();
    ber.writeString('2.16.840.1.113730.3.4.2');
    ber.endSequence();

    const c = getControl(new BerReader(ber.buffer));

    assert.ok(c);
    assert.equal(c.type, '2.16.840.1.113730.3.4.2');
    assert.equal(c.criticality, false);
    assert.ok(!c.value, null);
  });
});
