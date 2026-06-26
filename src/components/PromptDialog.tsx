import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface Props {
  title: string;
  placeholder?: string;
  defaultValue?: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

export function PromptDialog({ title, placeholder, defaultValue, onSubmit, onCancel }: Props) {
  const { t } = useTranslation();
  const [value, setValue] = useState(defaultValue ?? '');
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const submit = () => {
    const v = value.trim();
    if (!v) return;
    onSubmit(v);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-[360px] max-w-[calc(100vw-2rem)] bg-elevated border border-default rounded-lg shadow-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-default">
          <h3 className="text-sm font-semibold text-primary">{title}</h3>
        </div>
        <div className="p-4">
          <input
            ref={ref}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
              if (e.key === 'Escape') onCancel();
            }}
            placeholder={placeholder}
            className="w-full px-2.5 py-1.5 bg-input border border-default rounded text-sm text-primary focus:border-accent focus:outline-none"
          />
        </div>
        <div className="flex gap-2 px-4 py-3 border-t border-default bg-toolbar">
          <button
            onClick={onCancel}
            className="flex-1 py-1.5 text-sm bg-input hover:bg-card-hover text-secondary rounded"
          >
            {t('dialog.cancel')}
          </button>
          <button
            onClick={submit}
            disabled={!value.trim()}
            className="flex-1 py-1.5 text-sm bg-accent hover:opacity-90 disabled:opacity-40 text-on-accent font-medium rounded"
          >
            {t('dialog.ok')}
          </button>
        </div>
      </div>
    </div>
  );
}