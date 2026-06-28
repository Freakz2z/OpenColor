import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Color } from '../types';
import { classifyFamily, rgbToHex, isValidHex, normalizeHex, hexToRgb } from '../lib/format';
import { HslPicker } from './HslPicker';

interface Props {
  initial: Color;
  isNew: boolean;
  onSave: (c: Color) => void;
  onCancel: () => void;
}

export function ColorEditor({ initial, isNew, onSave, onCancel }: Props) {
  const { t } = useTranslation();
  const [hex, setHex] = useState(initial.hex);
  const [hexInput, setHexInput] = useState(initial.hex);
  const [hexError, setHexError] = useState(false);
  const [name, setName] = useState(initial.name);
  const [note, setNote] = useState(initial.note ?? '');

  const onHexInput = (raw: string) => {
    setHexInput(raw);
    const norm = normalizeHex(raw);
    if (norm) {
      setHex(norm);
      setHexError(false);
    } else {
      setHexError(raw.replace('#', '').length > 0 && raw.replace('#', '').length < 7);
    }
  };

  const onHexBlur = () => {
    const norm = normalizeHex(hexInput);
    if (norm) setHexInput(norm);
  };

  const handleSave = () => {
    if (!isValidHex(hex)) return;
    const finalHex = rgbToHex(...hexToRgb(hex));
    const [r, g, b] = hexToRgb(finalHex);
    onSave({
      ...initial,
      hex: finalHex,
      rgb: [r, g, b],
      name: name.trim(),
      family: classifyFamily(finalHex),
      note: note.trim() || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" data-testid="color-editor">
      <div className="w-[420px] max-w-[calc(100vw-2rem)] flex flex-col bg-elevated border border-default rounded-lg shadow-2xl overflow-hidden">
        <div className="h-24 flex items-end p-4" style={{ background: hex }}>
          <span className="font-mono text-sm" style={{ color: textOn(hex) }}>
            {hex}
          </span>
        </div>
        <div className="p-4 space-y-2.5">
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_140px]">
            <Field label={t('colorEditor.name')}>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('colorEditor.namePlaceholder')}
                className="w-full px-2.5 py-1.5 bg-input border border-default rounded text-sm text-primary focus:border-accent focus:outline-none"
              />
            </Field>
            <Field label={t('colorEditor.hex')}>
              <input
                value={hexInput}
                onChange={(e) => onHexInput(e.target.value)}
                onBlur={onHexBlur}
                spellCheck={false}
                autoCorrect="off"
                className={`w-full px-2.5 py-1.5 bg-input border rounded text-sm font-mono text-primary focus:outline-none ${
                  hexError ? 'border-danger' : 'border-default focus:border-accent'
                }`}
              />
            </Field>
          </div>
          <Field label={t('colorEditor.picker')}>
            <HslPicker hex={hex} onChange={(h) => { setHex(h); setHexInput(h); setHexError(false); }} />
          </Field>
          {hexError && (
            <div className="-mt-1 text-[10px] text-danger">{t('colorEditor.hexError')}</div>
          )}
          <Field label={t('colorEditor.note')}>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={1}
              placeholder={t('colorEditor.notePlaceholder')}
              className="w-full px-2.5 py-1.5 bg-input border border-default rounded text-sm text-primary focus:border-accent focus:outline-none resize-none"
            />
          </Field>
        </div>
        <div className="flex gap-2 px-4 py-3 border-t border-default bg-toolbar">
          <button
            onClick={onCancel}
            data-testid="color-editor-cancel"
            className="flex-1 py-1.5 text-sm bg-input hover:bg-card-hover text-secondary rounded"
          >
            {t('dialog.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={!isValidHex(hex)}
            data-testid="color-editor-save"
            className="flex-1 py-1.5 text-sm bg-accent hover:opacity-90 text-on-accent font-medium rounded disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isNew ? t('colorEditor.save') : t('colorEditor.update')}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted mb-1">{label}</div>
      {children}
    </div>
  );
}

function textOn(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return l > 128 ? '#000' : '#fff';
}
