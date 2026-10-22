import { create } from 'zustand';
import { loadSettings, saveSettings, type DeviceSettings } from '../core/settings/DeviceSettings';
import { microphoneInput } from '../core/input/MicrophoneInputProvider';

interface SettingsStore {
  settings: DeviceSettings;
  update: (patch: Partial<DeviceSettings>) => void;
}

function applyToRecognizer(s: DeviceSettings) {
  microphoneInput.updateConfig({
    a4: s.a4,
    noiseGate: s.noiseGate,
    minConfidence: s.minConfidence,
    stableMs: s.stableMs,
    onsetRatio: s.onsetRatio,
  });
}

const initial = loadSettings();
applyToRecognizer(initial);

export const useSettings = create<SettingsStore>((set, get) => ({
  settings: initial,
  update: (patch) => {
    const settings = { ...get().settings, ...patch };
    saveSettings(settings);
    applyToRecognizer(settings);
    set({ settings });
  },
}));
