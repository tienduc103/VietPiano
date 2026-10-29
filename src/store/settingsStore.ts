import { create } from 'zustand';
import { loadSettings, saveSettings, type DeviceSettings } from '../core/settings/DeviceSettings';
import { microphoneInput } from '../core/input/MicrophoneInputProvider';
import { voiceSpeaker, voiceTeacher } from '../core/voice/teacher';

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

/** Tốc độ đọc + giọng cho cô giáo giọng nói (bật/tắt theo giao diện Kids: `useVoiceTeacher`). */
function applyToVoice(s: DeviceSettings) {
  voiceSpeaker.configure({ voiceName: s.voiceName, allowOnline: s.voiceAllowOnline });
  voiceTeacher.setConfig({ rate: s.voiceRate });
}

const initial = loadSettings();
applyToRecognizer(initial);
applyToVoice(initial);

export const useSettings = create<SettingsStore>((set, get) => ({
  settings: initial,
  update: (patch) => {
    const settings = { ...get().settings, ...patch };
    saveSettings(settings);
    applyToRecognizer(settings);
    applyToVoice(settings);
    set({ settings });
  },
}));
