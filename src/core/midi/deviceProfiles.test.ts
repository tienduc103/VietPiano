import { describe, expect, it } from 'vitest';
import { guessTransport, identifyDevice, normalizeDeviceName } from './deviceProfiles';

describe('identifyDevice', () => {
  it.each([
    ['microKEY2-37', 'KORG INC.', 'korg', 37, false],
    ['2- microKEY2-25', '', 'korg', 25, false],
    ['microKEY Air-49', 'KORG INC.', 'korg', 49, false],
    ['nanoKEY2', 'KORG INC.', 'korg', 25, false],
    ['MPK mini 3', 'AKAI', 'akai', 25, false],
    ['MPK249', 'Akai Professional', 'akai', 49, false],
    ['Arturia KeyStep 37', 'Arturia', 'arturia', 37, false],
    ['KeyLab Essential 61', '', 'arturia', 61, false],
    ['Launchkey Mini MK3 MIDI', 'Focusrite', 'novation', 25, false],
    ['Keystation 88 MK3', 'M-Audio', 'm-audio', 88, false],
    ['Digital Piano', 'Yamaha Corporation', 'yamaha', 88, true],
    ['Clavinova', '', 'yamaha', 88, true],
    ['P-125', 'Yamaha', 'yamaha', 88, true],
    ['PSR-E373', 'Yamaha', 'yamaha', 61, true],
    ['Roland Digital Piano', 'Roland', 'roland', 88, true],
    ['FP-30X', 'Roland', 'roland', 88, true],
    ['CASIO USB-MIDI', 'CASIO', 'casio', null, null],
    ['Privia PX-S1100', 'CASIO', 'casio', 88, true],
    ['CT-S300', 'CASIO', 'casio', 61, true],
    ['KAWAI USB MIDI', '', 'kawai', 88, true],
  ] as const)('%s (%s) → %s, %s phím, có loa %s', (name, mfr, brand, keys, sound) => {
    const p = identifyDevice(name, mfr);
    expect(p.brand).toBe(brand);
    expect(p.keyCount).toBe(keys);
    expect(p.hasBuiltInSound).toBe(sound);
  });

  it('không nhận ra → không đoán gì (vẫn dùng được như mọi thiết bị MIDI chuẩn)', () => {
    expect(identifyDevice('USB MIDI Interface', '')).toEqual({ brand: 'unknown', kind: 'unknown', keyCount: null, hasBuiltInSound: null, model: null });
  });

  it('chuẩn hoá tên: bỏ số thứ tự Windows, chữ thường', () => {
    expect(normalizeDeviceName('3-  microKEY2-37  ')).toBe('microkey2-37');
  });
});

describe('guessTransport', () => {
  it('đoán Bluetooth / mạng / cổng ảo theo tên, còn lại là cổng hệ điều hành', () => {
    expect(guessTransport('microKEY Air-37 Bluetooth')).toEqual({ transport: 'bluetooth', guessed: true });
    expect(guessTransport('MD-BT01 BLE')).toMatchObject({ transport: 'bluetooth' });
    expect(guessTransport('loopMIDI Port')).toMatchObject({ transport: 'virtual' });
    expect(guessTransport('rtpMIDI Session 1')).toMatchObject({ transport: 'network' });
    expect(guessTransport('Digital Piano')).toMatchObject({ transport: 'os' });
  });
});
