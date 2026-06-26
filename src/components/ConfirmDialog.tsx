import { useTranslation } from 'react-i18next';

interface Props {
  title: string;
  body: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ title, body, confirmLabel, onConfirm, onCancel }: Props) {
  const { t } = useTranslation();
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[360px] max-w-[calc(100vw-2rem)] bg-elevated border border-default rounded-lg shadow-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-default">
          <h3 className="text-sm font-semibold text-primary">{title}</h3>
        </div>
        <div className="p-4 text-sm text-secondary leading-relaxed">
          {body}
        </div>
        <div className="flex gap-2 px-4 py-3 border-t border-default bg-toolbar">
          <button
            onClick={onCancel}
            className="flex-1 py-1.5 text-sm bg-input hover:bg-card-hover text-secondary rounded"
          >
            {t('dialog.cancel')}
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-1.5 text-sm bg-danger hover:opacity-90 text-on-accent font-medium rounded"
          >
            {confirmLabel ?? t('dialog.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}