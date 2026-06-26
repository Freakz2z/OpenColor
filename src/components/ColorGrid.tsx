import { useTranslation } from 'react-i18next';
import type { Palette, Color, ColorFamily } from '../types';
import { ColorCard } from './ColorCard';

const FAMILY_ORDER: ColorFamily[] = [
  'red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'pink', 'brown', 'gray', 'neutral',
];

interface Props {
  palette: Palette;
  onEdit: (c: Color) => void;
  onDelete: (colorId: string) => void;
}

export function ColorGrid({ palette, onEdit, onDelete }: Props) {
  const { t } = useTranslation();
  const grouped = new Map<ColorFamily, Color[]>();
  for (const c of palette.colors) {
    if (!grouped.has(c.family)) grouped.set(c.family, []);
    grouped.get(c.family)!.push(c);
  }

  const families = FAMILY_ORDER.filter((f) => grouped.has(f));

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="mb-4 sm:mb-6">
        <h2 className="text-lg sm:text-xl font-semibold text-primary">{palette.name}</h2>
        {palette.description && (
          <p className="text-sm text-secondary mt-1">{palette.description}</p>
        )}
        <p className="text-xs text-muted mt-2">
          {t('card.colors', { count: palette.colors.length })}
        </p>
      </div>

      {palette.colors.length === 0 && (
        <div className="border border-dashed border-default rounded-lg p-12 text-center text-muted text-sm">
          {t('empty.noColorsHint')}
        </div>
      )}

      {families.map((fam) => {
        const colors = grouped.get(fam)!;
        return (
          <section key={fam} className="mb-6">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-medium uppercase tracking-wider text-muted">
                {t(`family.${fam}`)}
              </span>
              <span className="text-[10px] text-muted">· {colors.length}</span>
            </div>
            <div
              className="grid gap-2.5"
              style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}
            >
              {colors.map((c) => (
                <ColorCard key={c.id} color={c} onEdit={onEdit} onDelete={onDelete} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}