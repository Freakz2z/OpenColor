import { Plus } from 'lucide-react';
import type { ReactNode } from 'react';

interface ToolbarProps {
  left: ReactNode;
  right: ReactNode;
}

export function Toolbar({ left, right }: ToolbarProps) {
  return (
    <div className="flex items-center gap-3 px-4 h-12 border-b border-default bg-toolbar">
      <div className="flex items-center gap-2.5 min-w-0 flex-1 text-primary">{left}</div>
      <div className="flex items-center gap-1 shrink-0">{right}</div>
    </div>
  );
}

interface IconButtonProps {
  title: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
  danger?: boolean;
  testId?: string;
}

export function IconButton({ title, active, disabled, onClick, children, danger, testId }: IconButtonProps) {
  const base = 'relative w-9 h-9 flex items-center justify-center rounded-lg transition';
  const normal = active
    ? 'bg-accent-soft text-accent ring-accent'
    : disabled
      ? 'text-muted opacity-50 cursor-not-allowed'
      : 'text-secondary hover:text-primary hover:bg-card-hover';
  const dangerStyle = danger
    ? disabled
      ? 'text-muted opacity-50 cursor-not-allowed'
      : 'text-secondary hover:text-danger hover:bg-danger-soft'
    : '';
  return (
    <button
      onClick={() => { if (!disabled) onClick(); }}
      title={title}
      aria-label={title}
      disabled={disabled}
      data-testid={testId}
      className={`${base} ${danger ? dangerStyle : normal}`}
    >
      {children}
    </button>
  );
}

interface PlusButtonProps {
  onClick: () => void;
  title?: string;
  children?: ReactNode;
}

export function PlusButton({ onClick, title = 'New', children }: PlusButtonProps) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className="ml-1 w-9 h-9 flex items-center justify-center rounded-lg text-secondary hover:text-primary hover:bg-card-hover transition active:scale-95"
    >
      {children ?? <Plus size={18} strokeWidth={2} />}
    </button>
  );
}