import { create } from 'zustand';
import { loadProfiles, newProfile, sanitizeProfile, saveProfiles, type LearnerProfile, type ProfilesState } from '../core/profile/LearnerProfile';

interface ProfileStore extends ProfilesState {
  add: (input: Omit<LearnerProfile, 'id' | 'createdAt'>) => LearnerProfile;
  update: (id: string, patch: Partial<Omit<LearnerProfile, 'id' | 'createdAt'>>) => void;
  remove: (id: string) => void;
  select: (id: string) => void;
}

export const useProfiles = create<ProfileStore>((set, get) => {
  const commit = (next: ProfilesState) => {
    saveProfiles(next);
    set(next);
  };
  return {
    ...loadProfiles(),
    add: (input) => {
      const profile = newProfile(input);
      commit({ profiles: [...get().profiles, profile], activeId: profile.id });
      return profile;
    },
    update: (id, patch) =>
      commit({ profiles: get().profiles.map((p) => (p.id === id ? (sanitizeProfile({ ...p, ...patch }) ?? p) : p)), activeId: get().activeId }),
    remove: (id) => {
      const profiles = get().profiles.filter((p) => p.id !== id);
      commit({ profiles, activeId: get().activeId === id ? (profiles[0]?.id ?? null) : get().activeId });
    },
    select: (id) => commit({ profiles: get().profiles, activeId: id }),
  };
});

export function activeProfile(s: ProfilesState): LearnerProfile | null {
  return s.profiles.find((p) => p.id === s.activeId) ?? null;
}
