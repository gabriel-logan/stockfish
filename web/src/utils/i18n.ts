import { initReactI18next } from "react-i18next";
import i18next from "i18next";

import { resources } from "../constants";
import { usePreferencesStore } from "../store/preferencesStore";

const language = usePreferencesStore.getState().locale;

i18next
  .use(initReactI18next) // passes i18n down to react-i18next
  .init({
    resources,

    lng: language,

    fallbackLng: "en",

    interpolation: {
      escapeValue: false, // react already safes from xss => https://www.i18next.com/translation-function/interpolation#unescape
    },
  });

usePreferencesStore.subscribe((state) => {
  if (i18next.language !== state.locale) {
    void i18next.changeLanguage(state.locale);
  }
});
