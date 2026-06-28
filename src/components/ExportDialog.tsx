import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy, X as XIcon } from 'lucide-react';
import type { Palette } from '../types';
import { exportAsNaturalLanguage } from '../lib/export';
import { writeClipboardText } from '../lib/clipboard';

interface Props {
  palette: Palette;
  initialCopyState?: 'idle' | 'copied' | 'failed';
  onClose: () => void;
}

export function ExportDialog({ palette, initialCopyState = 'idle', onClose }: Props) {
  const { t } = useTranslation();
  const text = useMemo(() => exportAsNaturalLanguage(palette), [palette]);
  const [copied, setCopied] = useState(initialCopyState === 'copied');
  const [copyFailed, setCopyFailed] = useState(initialCopyState === 'failed');
  const resetTimerRef = useRef<number | null>(null);

  const resetCopiedLater = () => {
    if (resetTimerRef.current != null) {
      window.clearTimeout(resetTimerRef.current);
    }
    resetTimerRef.current = window.setTimeout(() => {
      setCopied(false);
      resetTimerRef.current = null;
    }, 1500);
  };

  const copy = async () => {
    try {
      await writeClipboardText(text);
      setCopyFailed(false);
      setCopied(true);
      resetCopiedLater();
    } catch {
      setCopied(false);
      setCopyFailed(true);
    }
  };

  useEffect(() => {
    setCopied(initialCopyState === 'copied');
    setCopyFailed(initialCopyState === 'failed');
    if (initialCopyState === 'copied') {
      resetCopiedLater();
      return () => {
        if (resetTimerRef.current != null) {
          window.clearTimeout(resetTimerRef.current);
        }
      };
    }
    if (initialCopyState === 'idle') {
      void copy();
    }
    return () => {
      if (resetTimerRef.current != null) {
        window.clearTimeout(resetTimerRef.current);
      }
    };
  }, [initialCopyState, text]);

  const statusText = copyFailed
    ? t('export.copyFailed')
    : copied
      ? t('export.autoCopied')
      : t('export.chars', { count: text.length });

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
            {statusText}
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
