import { initReactI18next } from "react-i18next";
import i18next from "i18next";

import { resources } from "../constants";
import { useUserStore } from "../store/userStore";

const language = useUserStore.getState().locale;

i18next
  .use(initReactI18next) // passes i18n down to react-i18next
  .init({
    resources: resources,

    lng: language,

    fallbackLng: "en",

    interpolation: {
      escapeValue: false, // react already safes from xss => https://www.i18next.com/translation-function/interpolation#unescape
    },
  });

useUserStore.subscribe((state) => {
  if (i18next.language !== state.locale) {
    void i18next.changeLanguage(state.locale);
  }
});
