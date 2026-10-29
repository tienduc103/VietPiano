/**
 * Cô giáo dùng chung cho cả app (một hàng đợi lời nói → không bao giờ đọc chồng giữa các màn).
 * Không nói trong lúc app đang phát tiếng đàn mẫu (`soundOutput.isPlayingUntil`).
 */
import { soundOutput } from '../audio/SoundOutput';
import { HybridSpeaker } from './speakers';
import { VoiceTeacher } from './VoiceTeacher';

export const voiceSpeaker = new HybridSpeaker(import.meta.env.BASE_URL);

export const voiceTeacher = new VoiceTeacher({ speaker: voiceSpeaker, quietUntil: () => soundOutput.isPlayingUntil });
