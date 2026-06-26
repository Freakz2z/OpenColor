import { useTranslation } from 'react-i18next';
import { Crosshair, Share2 as Share2Icon, Pencil, Trash, GripVertical, PlusCircle } from 'lucide-react';
import type { Palette } from '../types';

interface Props {
  palette: Palette;
  onOpen: () => void;
  onPick: () => void;
  onExport: () => void;
  onEdit: () => void;
  onAddColor: () => void;
  onDelete: () => void;
}

export function PaletteCard({ palette, onOpen, onPick, onExport, onEdit, onAddColor, onDelete }: Props) {
  const { t } = useTranslation();
  const preview = palette.colors.slice(0, 5);
  const remaining = palette.colors.length - preview.length;
  const empty = palette.colors.length === 0;

  return (
    <div
      onClick={onOpen}
      className="group flex items-center gap-3 sm:gap-4 px-3 sm:px-4 py-3 sm:py-3.5 rounded-xl border border-default bg-card bg-card-hover cursor-pointer transition"
    >
      <div className="hidden sm:block text-muted group-hover:text-secondary transition shrink-0" onClick={(e) => e.stopPropagation()}>
        <GripVertical size={14} />
      </div>

      <div className="flex items-center gap-1.5 w-14 sm:w-20 shrink-0">
        {preview.length === 0 ? (
          <div className="w-12 sm:w-16 h-9 sm:h-10 rounded-md border border-dashed border-strong flex items-center justify-center text-muted text-[10px] sm:text-xs">
            {t('card.empty')}
          </div>
        ) : (
          preview.map((c) => (
            <div
              key={c.id}
              className="w-4 sm:w-5 h-9 sm:h-10 rounded-md border border-black/10 shadow-sm"
              style={{ background: c.hex }}
              title={c.hex}
            />
          ))
        )}
        {remaining > 0 && (
          <span className="text-[10px] text-muted ml-0.5">{t('card.more', { count: remaining })}</span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-primary truncate">{palette.name}</div>
        <div className="hidden sm:block text-xs text-muted mt-0.5 truncate">
          {palette.description || (
            empty
              ? t('card.emptyHint')
              : t('card.colors', { count: palette.colors.length })
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onPick}
          disabled={empty}
          title={t('toolbar.pick')}
          aria-label={t('toolbar.pick')}
          data-testid="card-pick"
          className="p-1.5 text-muted hover:text-primary hover:bg-card-hover rounded-md transition disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-muted"
        >
          <Crosshair size={14} />
        </button>
        <button
          onClick={onExport}
          disabled={empty}
          title={t('toolbar.export')}
          aria-label={t('toolbar.export')}
          data-testid="card-export"
          className="p-1.5 text-muted hover:text-primary hover:bg-card-hover rounded-md transition disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-muted"
        >
          <Share2Icon size={14} />
        </button>
        <button
          onClick={onEdit}
          title={t('toolbar.rename')}
          aria-label={t('toolbar.rename')}
          data-testid="card-rename"
          className="p-1.5 text-muted hover:text-primary hover:bg-card-hover rounded-md transition"
        >
          <Pencil size={14} />
        </button>
        <button
          onClick={onAddColor}
          title={t('toolbar.addColor')}
          aria-label={t('toolbar.addColor')}
          data-testid="card-add-color"
          className="p-1.5 text-muted hover:text-accent hover:bg-accent-soft rounded-md transition"
        >
          <PlusCircle size={14} />
        </button>
        <button
          onClick={onDelete}
          title={t('card.delete')}
          aria-label={t('card.delete')}
          data-testid="card-delete"
          className="p-1.5 text-muted hover:text-danger hover:bg-danger-soft rounded-md transition"
        >
          <Trash size={14} />
        </button>
      </div>
    </div>
  );
}
