import { useTranslation } from 'react-i18next';
import { Languages, Sun, Moon, Monitor, Info, Check, ChevronLeft } from 'lucide-react';
import { SUPPORTED_LANGUAGES, setLanguage, getLanguage, type LanguageCode } from '../i18n';
import type { Theme } from '../types';

interface Props {
  onBack: () => void;
  theme: Theme;
  onThemeChange: (t: Theme) => void;
}

export function SettingsView({ onBack, theme, onThemeChange }: Props) {
  const { t, i18n } = useTranslation();
  const currentLang = getLanguage();

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2.5 px-4 h-12 border-b border-default bg-toolbar">
        <button
          onClick={onBack}
          className="w-7 h-7 flex items-center justify-center rounded-md text-secondary hover:text-primary hover:bg-card-hover transition"
          title={t('toolbar.back')}
          aria-label={t('toolbar.back')}
        >
          <ChevronLeft size={18} />
        </button>
        <span className="text-sm font-semibold text-primary">{t('settings.title')}</span>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-6">
        {/* Language */}
        <section>
          <SectionHeader icon={<Languages size={14} />} title={t('settings.language')} hint={t('settings.languageHint')} />
          <div className="mt-3 space-y-1.5">
            {SUPPORTED_LANGUAGES.map((lng) => {
              const active = currentLang === lng.code;
              return (
                <button
                  key={lng.code}
                  onClick={() => setLanguage(lng.code as LanguageCode)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition ${
                    active
                      ? 'bg-accent-soft text-accent ring-accent'
                      : 'bg-card text-secondary hover:bg-card-hover'
                  }`}
                >
                  <span>{lng.label}</span>
                  {active && <Check size={14} className="text-accent" />}
                </button>
              );
            })}
          </div>
        </section>

        {/* Theme */}
        <section>
          <SectionHeader icon={<Sun size={14} />} title={t('settings.theme')} />
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            <ThemeOption active={theme === 'auto'} onClick={() => onThemeChange('auto')} icon={<Monitor size={14} />} label={t('settings.themeAuto')} />
            <ThemeOption active={theme === 'dark'} onClick={() => onThemeChange('dark')} icon={<Moon size={14} />} label={t('settings.themeDark')} />
            <ThemeOption active={theme === 'light'} onClick={() => onThemeChange('light')} icon={<Sun size={14} />} label={t('settings.themeLight')} />
          </div>
        </section>

        {/* About */}
        <section>
          <SectionHeader icon={<Info size={14} />} title={t('settings.about')} />
          <div className="mt-3 text-xs text-muted space-y-1.5">
            <div className="flex items-center justify-between">
              <span>{t('settings.version')}</span>
              <span className="font-mono text-primary">{__APP_VERSION__}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>{t('settings.langLabel')}</span>
              <span className="font-mono text-primary">{i18n.language}</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function SectionHeader({ icon, title, hint }: { icon: React.ReactNode; title: string; hint?: string }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted font-medium">
        {icon}
        {title}
      </div>
      {hint && <div className="text-[10px] text-muted mt-0.5">{hint}</div>}
    </div>
  );
}

function ThemeOption({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1 py-2 rounded-lg text-xs transition ${
        active
          ? 'bg-accent-soft text-accent ring-accent'
          : 'bg-card text-secondary hover:bg-card-hover'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
