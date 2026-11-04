/**
 * Các instance MIDI dùng chung toàn app ngoài `midiInput`: thiết bị mô phỏng và tiếng piano phát kèm.
 * Glue với React ở `hooks/useAppLifecycle.ts` (`useMidiConnection`).
 */
import { midiInput } from '../input/MIDIInputProvider';
import { soundOutput } from '../audio/SoundOutput';
import { SIMULATED_PRESETS, SimulatedMidiBackend } from './backends/SimulatedMidiBackend';
import { MidiSoundMonitor } from './MidiSoundMonitor';
import { platformBackend, withSimulator } from './platform';

export const midiSimulator = new SimulatedMidiBackend();
for (const preset of SIMULATED_PRESETS) midiSimulator.connect(preset);

export const midiSound = new MidiSoundMonitor(midiInput, soundOutput);

let simulatorOn = false;

/** Bật / tắt thiết bị mô phỏng (gộp vào adapter thật). `window.__vietpianoMidiSim` cho e2e / thử trên console. */
export async function setMidiSimulator(on: boolean): Promise<void> {
  if (on === simulatorOn) return;
  simulatorOn = on;
  if (typeof window !== 'undefined') {
    const w = window as unknown as Record<string, unknown>;
    if (on) w.__vietpianoMidiSim = midiSimulator;
    else delete w.__vietpianoMidiSim;
  }
  await midiInput.setBackend(withSimulator(platformBackend(), on ? midiSimulator : null));
}

export function isMidiSimulatorOn(): boolean {
  return simulatorOn;
}

/** Id cổng của thiết bị mô phỏng trong engine (CompositeBackend thêm tiền tố khi có adapter thật). */
export function simulatorPortId(simId: string): string {
  return platformBackend() ? `1:${simId}` : simId;
}

/** Id thiết bị mô phỏng từ id cổng engine; không phải thiết bị mô phỏng → null. */
export function simulatorIdOf(portId: string): string | null {
  if (!simulatorOn) return null;
  const id = platformBackend() ? (portId.startsWith('1:') ? portId.slice(2) : null) : portId;
  return id && midiSimulator.list().some((p) => p.id === id) ? id : null;
}
