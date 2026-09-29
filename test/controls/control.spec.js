import { ok, equal } from 'node:assert';
import { BerReader, BerWriter } from '@ldapjs/asn1';
import { Control, getControl } from '../../lib/index.js';

describe('Control', () => {
  it('should create a new control with no arguments', () => {
    ok(new Control());
  });

  it('should create a new control with arguments', () => {
    const c = new Control({
      type: '2.16.840.1.113730.3.4.2',
      criticality: true
    });
    ok(c);
    equal(c.type, '2.16.840.1.113730.3.4.2');
    ok(c.criticality);
  });

  it('should parse a control from a BER reader', () => {
    const ber = new BerWriter();
    ber.startSequence();
    ber.writeString('2.16.840.1.113730.3.4.2');
    ber.writeBoolean(true);
    ber.writeString('foo');
    ber.endSequence();

    const c = getControl(new BerReader(ber.buffer));

    ok(c);
    equal(c.type, '2.16.840.1.113730.3.4.2');
    ok(c.criticality);
    equal(c.value.toString('utf8'), 'foo');
  });

  it('should parse a control with no value from a BER reader', () => {
    const ber = new BerWriter();
    ber.startSequence();
    ber.writeString('2.16.840.1.113730.3.4.2');
    ber.endSequence();

    const c = getControl(new BerReader(ber.buffer));

    ok(c);
    equal(c.type, '2.16.840.1.113730.3.4.2');
    equal(c.criticality, false);
    ok(!c.value, null);
  });
});
