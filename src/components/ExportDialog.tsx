import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy, X as XIcon } from 'lucide-react';
import type { Palette } from '../types';
import { exportAsNaturalLanguage } from '../lib/export';

interface Props {
  palette: Palette;
  onClose: () => void;
}

export function ExportDialog({ palette, onClose }: Props) {
  const { t } = useTranslation();
  const text = useMemo(() => exportAsNaturalLanguage(palette), [palette]);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[640px] max-w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)] flex flex-col bg-elevated border border-default rounded-lg shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-default">
          <div>
            <h3 className="text-sm font-semibold text-primary">{t('export.title')}</h3>
            <p className="text-[10px] text-muted mt-0.5">{t('export.subtitle')}</p>
          </div>
          <button
            onClick={onClose}
            className="text-muted hover:text-primary"
            title={t('export.close')}
            aria-label={t('export.close')}
          >
            <XIcon size={16} />
          </button>
        </div>
        <textarea
          value={text}
          readOnly
          className="flex-1 min-h-0 p-4 bg-app text-primary font-mono text-[13px] leading-relaxed resize-none focus:outline-none"
        />
        <div className="flex items-center gap-2 px-4 py-3 border-t border-default bg-toolbar">
          <span className="text-[10px] text-muted flex-1">
            {t('export.chars', { count: text.length })}
          </span>
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm bg-input hover:bg-card-hover text-secondary rounded"
          >
            {t('export.close')}
          </button>
          <button
            onClick={copy}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-accent hover:opacity-90 text-on-accent font-medium rounded"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? t('export.copied') : t('export.copy')}
          </button>
        </div>
      </div>
    </div>
  );
}