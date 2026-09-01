import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import Backend from 'i18next-http-backend'
import { initReactI18next } from 'react-i18next'

void i18n
  .use(Backend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'en',
    supportedLngs: ['en', 'zh'],
    nonExplicitSupportedLngs: true,
    ns: ['main'],
    defaultNS: 'main',
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
      lookupLocalStorage: 'prompt-all-in-one-language'
    },
    backend: {
      loadPath:
        '/extensions/comfyui_prompt_all_in_one/locales/{{lng}}/{{ns}}.json'
    },
    interpolation: { escapeValue: false },
    react: { useSuspense: true }
  })

export default i18n
