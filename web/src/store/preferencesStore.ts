import { create } from "zustand";
import { persist } from "zustand/middleware";

import { STORAGE_KEY_PREFERENCES_STORE } from "../constants";
import type { Locale } from "../types/locales";

interface PreferencesState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      locale: (navigator.language.split("-")[0] as Locale) || "en",

      setLocale: (locale: Locale) => {
        set({ locale });
      },
    }),
    {
      name: STORAGE_KEY_PREFERENCES_STORE,
    },
  ),
);
