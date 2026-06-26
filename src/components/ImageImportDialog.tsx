import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image as ImageIcon, X as XIcon } from 'lucide-react';
import type { Color } from '../types';
import { classifyFamily } from '../lib/format';
import { loadImageRgba, quantizeColors, type QuantizedColor } from '../lib/quantize';

interface Props {
  onAdd: (colors: Color[]) => void;
  onClose: () => void;
}

export function ImageImportDialog({ onAdd, onClose }: Props) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [colors, setColors] = useState<QuantizedColor[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);

  const onPickFile = () => fileInputRef.current?.click();

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setExtracting(true);
    try {
      const src = URL.createObjectURL(file);
      setImageSrc(src);
      const rgba = await loadImageRgba(file, 256);
      const result = quantizeColors(rgba, 12);
      setColors(result);
      setSelected(new Set(result.map((_, i) => i))); // pre-select all
    } catch (err) {
      setError(t('imageImport.failLoad', { error: (err as Error).message }));
    } finally {
      setExtracting(false);
      // Reset so re-selecting same file fires onChange.
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const toggle = (i: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };

  const handleAdd = () => {
    const chosen = colors.filter((_, i) => selected.has(i));
    const newColors: Color[] = chosen.map((c, i) => ({
      id: crypto.randomUUID(),
      name: '',
      hex: c.hex,
      rgb: c.rgb,
      family: classifyFamily(c.hex),
      created_at: Date.now() + i,
    }));
    onAdd(newColors);
  };

  const selectedCount = selected.size;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[640px] max-w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)] flex flex-col bg-elevated border border-default rounded-lg shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-default">
          <div>
            <h3 className="text-sm font-semibold text-primary">{t('imageImport.title')}</h3>
            <p className="text-[11px] text-muted mt-0.5">{t('imageImport.subtitle')}</p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md text-muted hover:text-primary hover:bg-card-hover"
            title={t('export.close')}
          >
            <XIcon size={14} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-auto p-4 space-y-3">
          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={onFileChange}
              className="hidden"
            />
            <button
              onClick={onPickFile}
              className="px-3 py-1.5 text-xs bg-input hover:bg-card-hover text-secondary rounded inline-flex items-center gap-1.5"
            >
              <ImageIcon size={14} />
              {t('imageImport.choose')}
            </button>
            {imageSrc && (
              <div className="w-10 h-10 rounded border border-default overflow-hidden shrink-0 bg-app">
                <img src={imageSrc} alt="" className="w-full h-full object-cover" />
              </div>
            )}
            {extracting && <span className="text-xs text-muted">{t('imageImport.extracting')}</span>}
            {!extracting && colors.length > 0 && (
              <span className="text-xs text-muted">{t('imageImport.count', { count: colors.length })}</span>
            )}
          </div>

          {error && (
            <div className="text-xs text-danger bg-danger-soft rounded px-3 py-2">{error}</div>
          )}

          {!extracting && colors.length === 0 && !imageSrc && (
            <div className="border border-dashed border-default rounded-lg p-12 text-center text-muted text-xs">
              {t('imageImport.noImage')}
            </div>
          )}

          {colors.length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
              {colors.map((c, i) => {
                const isSelected = selected.has(i);
                return (
                  <button
                    key={`${c.hex}-${i}`}
                    onClick={() => toggle(i)}
                    title={c.hex}
                    className={`relative aspect-square rounded-md overflow-hidden border-2 transition ${
                      isSelected ? 'border-accent ring-2 ring-accent-ring' : 'border-default'
                    }`}
                    style={{ background: c.hex }}
                  >
                    <span
                      className="absolute bottom-1 left-1 text-[10px] font-mono px-1 rounded"
                      style={{ color: c.rgb[0] * 0.299 + c.rgb[1] * 0.587 + c.rgb[2] * 0.114 > 128 ? '#000' : '#fff' }}
                    >
                      {c.hex}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 px-4 py-3 border-t border-default bg-toolbar">
          <button
            onClick={() => { setSelected(new Set(colors.map((_, i) => i))); }}
            className="px-2.5 py-1 text-xs text-muted hover:text-primary"
            disabled={colors.length === 0}
          >
            {t('imageImport.selectAll')}
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="px-2.5 py-1 text-xs text-muted hover:text-primary"
            disabled={selectedCount === 0}
          >
            {t('imageImport.clear')}
          </button>
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm bg-input hover:bg-card-hover text-secondary rounded"
          >
            {t('export.close')}
          </button>
          <button
            onClick={handleAdd}
            disabled={selectedCount === 0}
            className="px-3 py-1.5 text-sm bg-accent hover:opacity-90 text-on-accent font-medium rounded disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {t('imageImport.addSelected', { count: selectedCount })}
          </button>
        </div>
      </div>
    </div>
  );
}