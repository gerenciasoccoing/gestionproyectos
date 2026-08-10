import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import es from './locales/es.json';
import en from './locales/en.json';

export const STORAGE_KEY = 'ergy_language';

// El idioma por defecto es SIEMPRE español, tanto para usuarios nuevos como al recargar, salvo
// que el usuario haya elegido explícitamente inglés antes (no se detecta el idioma del navegador,
// para no cambiar el default sin que el usuario lo haya pedido).
const saved = localStorage.getItem(STORAGE_KEY);
const initialLanguage = saved === 'en' ? 'en' : 'es';

i18n.use(initReactI18next).init({
  resources: { es: { translation: es }, en: { translation: en } },
  lng: initialLanguage,
  fallbackLng: 'es',
  interpolation: { escapeValue: false },
});

i18n.on('languageChanged', (lng) => localStorage.setItem(STORAGE_KEY, lng));

export default i18n;
