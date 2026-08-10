import { useTranslation } from 'react-i18next';

const LANGUAGES = [
  { code: 'es', label: 'ES' },
  { code: 'en', label: 'EN' },
];

// Selector de idioma: cambia i18n.language de inmediato (toda la pantalla se re-renderiza sola,
// sin recargar) y la preferencia queda guardada en localStorage (ver src/i18n/index.js).
export default function LanguageSwitcher() {
  const { i18n, t } = useTranslation();

  return (
    <div className="flex items-center bg-gray-800 rounded-md overflow-hidden text-xs" aria-label={t('nav.language')}>
      {LANGUAGES.map((lang) => (
        <button
          key={lang.code}
          onClick={() => i18n.changeLanguage(lang.code)}
          className={`px-2 py-1.5 transition-colors ${i18n.language === lang.code ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
        >
          {lang.label}
        </button>
      ))}
    </div>
  );
}
