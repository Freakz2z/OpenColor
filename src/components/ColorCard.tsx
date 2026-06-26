import type { Color } from '../types';
import { textOn } from '../lib/format';
import { useTranslation } from 'react-i18next';
import { X as XIcon } from 'lucide-react';

interface Props {
  color: Color;
  onEdit: (c: Color) => void;
  onDelete: (colorId: string) => void;
}

export function ColorCard({ color, onEdit, onDelete }: Props) {
  const { t } = useTranslation();
  const txt = textOn(color.hex);

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="group rounded-lg overflow-hidden border border-default bg-card bg-card-hover transition max-w-xs">
      <div
        className="h-14 flex items-end p-2 cursor-pointer"
        style={{ background: color.hex, color: txt }}
        onClick={() => onEdit(color)}
        title={t('colorCard.edit')}
      >
        <span className="text-[10px] font-mono opacity-80">{color.hex}</span>
      </div>
      <div className="px-2.5 py-1.5">
        <div className="text-sm text-primary truncate" title={color.name || t('colorCard.unnamed')}>
          {color.name || <span className="text-muted italic">{t('colorCard.unnamed')}</span>}
        </div>
        <div className="flex gap-2 mt-1 items-center">
          <button
            onClick={() => copy(color.hex)}
            className="text-[10px] text-muted hover:text-accent font-mono"
            title={t('colorCard.copyHex')}
          >
            HEX
          </button>
          <button
            onClick={() => copy(`rgb(${color.rgb.join(', ')})`)}
            className="text-[10px] text-muted hover:text-accent font-mono"
            title={t('colorCard.copyRgb')}
          >
            RGB
          </button>
          <div className="flex-1" />
          <button
            onClick={() => onDelete(color.id)}
            className="text-muted hover:text-danger opacity-0 group-hover:opacity-100 transition"
            title={t('colorCard.delete')}
            aria-label={t('colorCard.delete')}
          >
            <XIcon size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}