import { describe, expect, it } from 'vitest';
import { MidiEngine } from './MidiEngine';
import { MidiSoundMonitor, type LiveSynth } from './MidiSoundMonitor';
import { SimulatedMidiBackend } from './backends/SimulatedMidiBackend';
import { MemoryDeviceConfigStore } from './deviceConfigStore';
import { platformHint } from './platform';

function fakeSynth() {
  const calls: string[] = [];
  const synth: LiveSynth = {
    liveNoteOn: (m, v, t) => calls.push(`on ${m} ${v} ${t}`),
    liveNoteOff: (m) => calls.push(`off ${m}`),
    liveSetSustain: (d) => calls.push(`sustain ${d}`),
    liveAllOff: () => calls.push('alloff'),
  };
  return { synth, calls };
}

async function setup() {
  const sim = new SimulatedMidiBackend();
  const ctrl = sim.connect({ id: 'c', name: 'microKEY2-37', manufacturer: 'KORG INC.' });
  const piano = sim.connect({ id: 'p', name: 'Clavinova', manufacturer: 'Yamaha' });
  const engine = new MidiEngine(sim, { configStore: new MemoryDeviceConfigStore() });
  const { synth, calls } = fakeSynth();
  const monitor = new MidiSoundMonitor(engine, synth);
  monitor.start();
  await engine.start();
  return { sim, ctrl, piano, engine, monitor, calls };
}

describe('MidiSoundMonitor', () => {
  it('controller không loa → app phát tiếng; đàn có loa → không (tránh kêu đôi)', async () => {
    const { sim, ctrl, piano, calls } = await setup();
    sim.noteOn(ctrl, 60, 80);
    sim.noteOn(piano, 64, 80);
    sim.noteOff(ctrl, 60);
    sim.noteOff(piano, 64);
    expect(calls).toEqual(['on 60 80 grand', 'off 60']);
  });

  it('pedal của controller giữ tiếng; đổi tiếng piano', async () => {
    const { sim, ctrl, monitor, calls } = await setup();
    monitor.setTimbre('electric');
    sim.sustain(ctrl, true);
    sim.noteOn(ctrl, 62, 50);
    expect(calls).toEqual(['sustain true', 'on 62 50 electric']);
  });

  it('tắt tiếng thiết bị giữa chừng → tắt nốt đang kêu; bật tay cho đàn có loa', async () => {
    const { sim, ctrl, piano, engine, calls } = await setup();
    sim.noteOn(ctrl, 60);
    engine.updateConfig('c', { sound: 'off' });
    expect(calls).toContain('off 60');
    engine.updateConfig('p', { sound: 'on' });
    sim.noteOn(piano, 70, 90);
    expect(calls.at(-1)).toBe('on 70 90 grand');
  });

  it('stop: tắt hết, không nghe nữa', async () => {
    const { sim, ctrl, monitor, calls } = await setup();
    monitor.stop();
    sim.noteOn(ctrl, 60);
    expect(calls).toEqual(['alloff']);
  });
});

describe('platformHint', () => {
  it('iPad (kể cả iPadOS báo Macintosh), Safari máy Mac, máy tính', () => {
    expect(platformHint({ userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit Safari' })).toBe('ipad');
    expect(platformHint({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit Version/17 Safari/605', maxTouchPoints: 5 })).toBe('ipad');
    expect(platformHint({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit Version/17 Safari/605', maxTouchPoints: 0 })).toBe('safari');
    expect(platformHint({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64) Chrome/130 Safari/537 Edg/130' })).toBe('desktop');
    expect(platformHint(undefined)).toBe('other');
  });
});
