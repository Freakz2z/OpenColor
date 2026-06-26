import { useTranslation } from 'react-i18next';
import type { Color } from '../types';

interface Props {
  color: Color;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ColorConfirm({ color, onConfirm, onCancel }: Props) {
  const { t } = useTranslation();
  const [r, g, b] = color.rgb;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm">
      <div className="w-[280px] max-w-[calc(100vw-2rem)] bg-elevated border border-default rounded-xl shadow-2xl overflow-hidden">
        <div className="h-20 flex items-center p-4 gap-3" style={{ background: color.hex }}>
          <div className="flex-1 min-w-0">
            <div className="font-mono text-base font-semibold" style={{ color: luminanceText(r, g, b) }}>
              {color.hex}
            </div>
            <div className="font-mono text-xs opacity-80" style={{ color: luminanceText(r, g, b) }}>
              RGB({r}, {g}, {b})
            </div>
          </div>
        </div>
        <div className="flex gap-2 px-3 py-2.5 bg-toolbar">
          <button
            onClick={onCancel}
            className="flex-1 py-1.5 text-sm bg-input hover:bg-card-hover text-secondary rounded"
          >
            {t('dialog.cancel')}
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-1.5 text-sm bg-accent hover:opacity-90 text-on-accent font-medium rounded"
          >
            {t('dialog.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}

function luminanceText(r: number, g: number, b: number): string {
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return l > 128 ? '#000' : '#fff';
}