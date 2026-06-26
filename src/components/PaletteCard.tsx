import { useTranslation } from 'react-i18next';
import { Trash, GripVertical } from 'lucide-react';
import type { Palette } from '../types';

interface Props {
  palette: Palette;
  onOpen: () => void;
  onDelete: () => void;
  draggingId: string | null;
  dragOverId: string | null;
  onDragStart: (id: string, e: React.DragEvent) => void;
  onDragEnd: () => void;
  onDragOver: (id: string, e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (id: string, e: React.DragEvent) => void;
}

export function PaletteCard({
  palette,
  onOpen,
  onDelete,
  draggingId,
  dragOverId,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
}: Props) {
  const { t } = useTranslation();
  const preview = palette.colors.slice(0, 5);
  const remaining = palette.colors.length - preview.length;
  const empty = palette.colors.length === 0;
  const isDragging = draggingId === palette.id;
  const isDragOver = dragOverId === palette.id;

  return (
    <div
      draggable
      onClick={onOpen}
      onDragStart={(e) => onDragStart(palette.id, e)}
      onDragEnd={onDragEnd}
      onDragOver={(e) => onDragOver(palette.id, e)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(palette.id, e)}
      className={
        'group flex items-center gap-3 sm:gap-4 px-3 sm:px-4 py-3 sm:py-3.5 rounded-xl border bg-card bg-card-hover cursor-pointer transition select-none ' +
        (isDragOver ? 'border-t-2 border-t-accent border-default ' : 'border border-default ') +
        (isDragging ? 'opacity-50 ' : '')
      }
    >
      <div
        className="hidden sm:flex text-muted group-hover:text-secondary transition shrink-0 cursor-grab active:cursor-grabbing touch-none"
        // Stop the card-level onClick from opening the detail view when
        // the user is just clicking the grip (which doesn't initiate a
        // drag if they don't move the mouse).
        onClick={(e) => e.stopPropagation()}
      >
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
