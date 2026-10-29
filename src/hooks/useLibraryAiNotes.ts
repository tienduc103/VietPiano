import { useCallback, useEffect, useState } from 'react';
import { GUEST_PROFILE } from '../core/curriculum/progress';
import type { AiNote } from '../core/feedback/aiNotes';
import { aiNoteStorage } from '../core/storage/AiNoteStorage';
import { useProfiles } from '../store/profileStore';

/** Nhận xét AI đã lưu của một bài Thư viện, theo người học đang chọn. */
export function useLibraryAiNotes(lessonId: string): { notes: AiNote[]; add: (note: AiNote) => void } {
  const profileKey = useProfiles((s) => s.activeId) ?? GUEST_PROFILE;
  const [notes, setNotes] = useState<AiNote[]>([]);

  useEffect(() => {
    let alive = true;
    setNotes([]);
    aiNoteStorage
      .get(profileKey, lessonId)
      .then((list) => alive && setNotes(list))
      .catch((err) => console.warn('[VietPiano] Không đọc được nhận xét AI', err));
    return () => {
      alive = false;
    };
  }, [profileKey, lessonId]);

  const add = useCallback(
    (note: AiNote) => {
      aiNoteStorage
        .add(profileKey, lessonId, note)
        .then(setNotes)
        .catch((err) => console.warn('[VietPiano] Không lưu được nhận xét AI', err));
    },
    [profileKey, lessonId],
  );

  return { notes, add };
}
