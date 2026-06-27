import { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { listen } from '@tauri-apps/api/event';
import type { Palette, PermissionState, PickedPixel, Color, Theme, PlatformInfo } from './types';
import { api } from './lib/tauri';
import { ColorGrid } from './components/ColorGrid';
import { ColorEditor } from './components/ColorEditor';
import { ColorConfirm } from './components/ColorConfirm';
import { ExportDialog } from './components/ExportDialog';
import { PermissionBanner } from './components/PermissionBanner';
import { PromptDialog } from './components/PromptDialog';
import { ConfirmDialog } from './components/ConfirmDialog';
import { PaletteCard } from './components/PaletteCard';
import {
  Toolbar, IconButton, PlusButton,
  SettingsIcon, Trash, Pencil, ChevronLeft, Crosshair, Share2,
} from './components/Toolbar';
import { Image as ImageIcon, PlusCircle as PlusCircleIcon } from 'lucide-react';
import { SettingsView } from './components/SettingsView';
import { ImageImportDialog } from './components/ImageImportDialog';
import { DEMO_PALETTES } from './lib/demoData';
import { reorderIds } from './lib/reorder';

type Dialog =
  | { kind: 'prompt'; title: string; placeholder?: string; defaultValue?: string; resolve: (v: string | null) => void }
  | { kind: 'confirm'; title: string; body: string; resolve: (ok: boolean) => void }
  | null;

type View = 'list' | 'detail' | 'settings';

const THEME_KEY = 'opencolor.theme';

function loadTheme(): Theme {
  if (typeof localStorage === 'undefined') return 'auto';
  const v = localStorage.getItem(THEME_KEY);
  if (v === 'dark' || v === 'light' || v === 'auto') return v;
  return 'auto';
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  const apply = (m: 'dark' | 'light') => root.classList.toggle('dark', m === 'dark');
  if (theme === 'auto') {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    apply(mq.matches ? 'dark' : 'light');
    const handler = (e: MediaQueryListEvent) => apply(e.matches ? 'dark' : 'light');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  } else {
    apply(theme === 'dark' ? 'dark' : 'light');
  }
}

export default function App() {
  const { t } = useTranslation();
  const [palettes, setPalettes] = useState<Palette[]>(() => {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (url.searchParams.get('demo') === '1') return DEMO_PALETTES;
    }
    return [];
  });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [view, setView] = useState<View>('list');
  const [permission, setPermission] = useState<PermissionState>('ok');
  const [platformInfo, setPlatformInfo] = useState<PlatformInfo | null>(null);
  const [picking, setPicking] = useState(false);
  const [pendingPick, setPendingPick] = useState<Color | null>(null);
  const [editingColor, setEditingColor] = useState<{ color: Color; isNew: boolean } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [theme, setThemeState] = useState<Theme>(loadTheme);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const isDemo = palettes === DEMO_PALETTES;

  const isDemoRef = useRef(isDemo);
  isDemoRef.current = isDemo;

  // React can receive a second click before the toolbar swaps buttons.
  // Keep only one start command in flight; Rust also rejects active sessions.
  const pickInFlightRef = useRef(false);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try { localStorage.setItem(THEME_KEY, next); } catch {}
  }, []);

  useEffect(() => {
    return applyTheme(theme);
  }, [theme]);

  const prompt = useCallback(
    (title: string, opts?: { placeholder?: string; defaultValue?: string }): Promise<string | null> =>
      new Promise((resolve) => {
        setDialog({ kind: 'prompt', title, placeholder: opts?.placeholder, defaultValue: opts?.defaultValue, resolve });
      }),
    [],
  );

  const confirm = useCallback(
    (title: string, body: string): Promise<boolean> =>
      new Promise((resolve) => {
        setDialog({ kind: 'confirm', title, body, resolve });
      }),
    [],
  );

  const refresh = useCallback(async () => {
    try {
      const list = await api.listPalettes();
      setPalettes(list);
    } catch (e) {
      setStatusMsg(t('status.loadedFail', { error: (e as Error).message }));
    }
  }, [t]);

  useEffect(() => {
    if (isDemo) {
      setPermission('ok');
      setStatusMsg(t('status.demo'));
      return;
    }
    refresh();
    api.getPlatformInfo()
      .then((info) => {
        setPlatformInfo(info);
        setPermission(info.permission);
      })
      .catch(() => {
        api.getPermissionState().then(setPermission).catch(() => setPermission('unsupported'));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const unPicked = listen<PickedPixel>('picker://picked', (e) => {
      const p = e.payload;
      setPicking(false);
      const color: Color = {
        id: crypto.randomUUID(),
        name: '',
        hex: p.hex,
        rgb: p.rgb,
        family: 'neutral',
        created_at: Date.now(),
      };
      setPendingPick(color);
    });
    const unCancelled = listen('picker://cancelled', () => {
      setPicking(false);
    });
    // Diagnostic mirror of Rust's picker mode-change log. Surfaces whether
    // main actually hid after `set_picker_mode(true)` ran, so the
    // "window didn't hide" symptom is observable from the webview console
    // even when the Rust log stream isn't being captured.
    const unModeChanged = listen<{ enabled: boolean; main_visible: boolean }>(
      'picker://mode-changed',
      (e) => {
        console.log('[picker] mode-changed', e.payload);
        if (!e.payload.enabled) setPicking(false);
      },
    );
    return () => {
      unPicked.then((f) => f());
      unCancelled.then((f) => f());
      unModeChanged.then((f) => f());
    };
  }, []);

  // In demo mode, simulate a "pick" by inserting a random color from the demo palette.
  const active = palettes.find((p) => p.id === activeId) ?? null;

  const handleDemoPick = useCallback(() => {
    if (!active) return;
    const candidates = DEMO_PALETTES.flatMap((p) => p.colors);
    const c = candidates[Math.floor(Math.random() * candidates.length)] ?? candidates[0];
    if (!c) return;
    const color: Color = {
      id: crypto.randomUUID(),
      name: '',
      hex: c.hex,
      rgb: c.rgb,
      family: c.family,
      created_at: Date.now(),
    };
    setPicking(false);
    setPendingPick(color);
  }, [active]);

  const handleCreatePalette = async () => {
    const name = await prompt(t('dialog.newPalette'), { placeholder: t('dialog.newPalettePlaceholder') });
    if (!name) return;
    try {
      if (isDemoRef.current) {
        const p: Palette = {
          id: crypto.randomUUID(),
          name,
          description: undefined,
          colors: [],
          created_at: Date.now(),
          updated_at: Date.now(),
        };
        setPalettes((prev) => [...prev, p]);
        setActiveId(p.id);
        setView('detail');
        return;
      }
      const p = await api.createPalette(name);
      await refresh();
      setActiveId(p.id);
      setView('detail');
    } catch (e) {
      setStatusMsg(t('status.createFail', { error: (e as Error).message }));
      setTimeout(() => setStatusMsg(null), 3000);
    }
  };

  const handleOpenPalette = (id: string) => {
    setActiveId(id);
    setView('detail');
  };

  const handleReorderPalettes = useCallback((ids: string[]) => {
    setPalettes((prev) => {
      const byId = new Map(prev.map((p) => [p.id, p]));
      const next: Palette[] = [];
      for (const id of ids) {
        const p = byId.get(id);
        if (p) {
          next.push(p);
          byId.delete(id);
        }
      }
      // Append anything not in the new id list (shouldn't happen, but
      // keeps the list length consistent if storage and UI diverge).
      for (const p of byId.values()) next.push(p);
      return next;
    });
  }, []);

  const handleDeletePalette = async (id: string) => {
    const p = palettes.find((x) => x.id === id);
    if (!p) return;
    const body = t('dialog.deletePaletteBody', { name: p.name, count: p.colors.length });
    const ok = await confirm(t('dialog.deletePalette'), body);
    if (!ok) return;
    if (isDemoRef.current) {
      setPalettes((prev) => prev.filter((x) => x.id !== id));
    } else {
      await api.deletePalette(id);
      await refresh();
    }
    if (activeId === id) {
      setActiveId(null);
      setView('list');
    }
  };

  const handleRenamePalette = async () => {
    if (!active) return;
    const name = await prompt(t('dialog.renamePalette'), { defaultValue: active.name });
    if (!name) return;
    if (isDemoRef.current) {
      setPalettes((prev) => prev.map((x) => x.id === active.id ? { ...x, name, updated_at: Date.now() } : x));
    } else {
      await api.updatePalette(active.id, name);
      await refresh();
    }
  };

  const handleStartPick = async () => {
    if (pickInFlightRef.current || picking) {
      // Already starting or running. Ignore the duplicate click — see the
      // pickInFlightRef comment for why this matters.
      return;
    }
    pickInFlightRef.current = true;
    try {
      if (!active) {
        setStatusMsg(t('status.noPaletteForPick'));
        setTimeout(() => setStatusMsg(null), 2500);
        return;
      }
      if (isDemoRef.current) {
        setPicking(true);
        setStatusMsg(t('status.pickDemoHint'));
        return;
      }
      if (permission !== 'ok') {
        setStatusMsg(t('status.pickUnavailable'));
        setTimeout(() => setStatusMsg(null), 3000);
        return;
      }
      // Rust starts the input hook, creates the session and changes window
      // mode as one operation. A failed start therefore cannot strand the
      // application with its main window hidden.
      try {
        await api.startPicking();
        setPicking(true);
      } catch (e: any) {
        setPicking(false);
        setStatusMsg(t('status.pickFail', { error: e?.toString?.() ?? '' }));
        setTimeout(() => setStatusMsg(null), 3000);
      }
    } finally {
      pickInFlightRef.current = false;
    }
  };

  const handleStopPick = async () => {
    // Tell Rust to cancel FIRST. If we await this before setState, the picker
    // window is hidden and the main window restored before React re-renders,
    // so the user never sees a stale "picking" indicator.
    if (!isDemoRef.current) {
      try { await api.stopPicking(); } catch {}
    }
    setPicking(false);
  };

  const handleAddColor = () => {
    if (!active) return;
    const blank: Color = {
      id: crypto.randomUUID(),
      name: '',
      hex: '#4ECDC4',
      rgb: [78, 205, 196],
      family: 'cyan',
      created_at: Date.now(),
    };
    setEditingColor({ color: blank, isNew: true });
  };

  const handleSaveColor = async (color: Color) => {
    if (!active) return;
    if (isDemoRef.current) {
      setPalettes((prev) => prev.map((p) => {
        if (p.id !== active.id) return p;
        const colors = editingColor?.isNew
          ? [...p.colors, color]
          : p.colors.map((c) => c.id === color.id ? color : c);
        return { ...p, colors, updated_at: Date.now() };
      }));
      setEditingColor(null);
      return;
    }
    if (editingColor?.isNew) {
      await api.addColor(active.id, color);
    } else {
      await api.updateColor(active.id, color);
    }
    setEditingColor(null);
    await refresh();
  };

  const handleConfirmPick = async (color: Color) => {
    if (!active) { setPendingPick(null); return; }
    try {
      if (isDemoRef.current) {
        setPalettes((prev) => prev.map((p) => {
          if (p.id !== active.id) return p;
          return { ...p, colors: [...p.colors, color], updated_at: Date.now() };
        }));
      } else {
        await api.addColor(active.id, color);
        await refresh();
      }
    } catch (e) {
      setStatusMsg(t('status.createFail', { error: (e as Error).message }));
      setTimeout(() => setStatusMsg(null), 3000);
    } finally {
      setPendingPick(null);
    }
  };

  const handleAddManyColors = async (newColors: Color[]) => {
    if (!active || newColors.length === 0) { setImporting(false); return; }
    try {
      if (isDemoRef.current) {
        setPalettes((prev) => prev.map((p) => {
          if (p.id !== active.id) return p;
          return { ...p, colors: [...p.colors, ...newColors], updated_at: Date.now() };
        }));
      } else {
        for (const c of newColors) {
          await api.addColor(active.id, c);
        }
        await refresh();
      }
      setStatusMsg(t('status.addedColors', { count: newColors.length }));
      setTimeout(() => setStatusMsg(null), 2500);
    } catch (e) {
      setStatusMsg(t('status.createFail', { error: (e as Error).message }));
      setTimeout(() => setStatusMsg(null), 3000);
    } finally {
      setImporting(false);
    }
  };

  const handleDeleteColor = async (colorId: string) => {
    if (!active) return;
    if (isDemoRef.current) {
      setPalettes((prev) => prev.map((p) => p.id === active.id ? { ...p, colors: p.colors.filter((c) => c.id !== colorId), updated_at: Date.now() } : p));
      return;
    }
    await api.removeColor(active.id, colorId);
    await refresh();
  };

  // toolbar pieces
  const renderToolbar = () => {
    if (view === 'settings') return null;

    const left =
      view === 'list' ? (
        <>
          <img
            src="/favicon.svg"
            alt=""
            className="w-7 h-7 shrink-0"
            draggable={false}
          />
          <span className="text-sm font-semibold text-primary shrink-0">{t('app.name')}</span>
          <span className="text-xs text-muted whitespace-nowrap hidden sm:inline">
            · {palettes.length}
          </span>
        </>
      ) : (
        <>
          <button
            onClick={() => setView('list')}
            className="w-7 h-7 flex items-center justify-center rounded-md text-secondary hover:text-primary hover:bg-card-hover transition"
            title={t('toolbar.back')}
            aria-label={t('toolbar.back')}
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm font-semibold text-primary truncate">
            {active?.name ?? ''}
          </span>
          {active && (
            <span className="text-[10px] text-muted px-1.5 py-0.5 rounded bg-input">
              {active.colors.length}
            </span>
          )}
        </>
      );

    const right =
      view === 'list' ? (
        <>
          <IconButton title={t('toolbar.settings')} onClick={() => setView('settings')}>
            <SettingsIcon size={18} />
          </IconButton>
          <PlusButton onClick={handleCreatePalette} title={t('toolbar.new')} />
        </>
      ) : (
        <>
          {picking ? (
            <IconButton title={t('toolbar.stopPick')} active onClick={handleStopPick} testId="detail-stop-pick">
              <span className="relative flex items-center justify-center">
                <span className="absolute inset-0 m-auto w-2 h-2 rounded-full bg-accent animate-ping" />
                <span className="relative w-2 h-2 rounded-full bg-accent" />
              </span>
            </IconButton>
          ) : (
            <IconButton
              title={isDemoRef.current ? t('toolbar.pickDemo') : t('toolbar.pickHotkey')}
              onClick={isDemoRef.current ? handleDemoPick : handleStartPick}
              disabled={!active || (!isDemoRef.current && permission !== 'ok')}
              testId="detail-pick"
            >
              <Crosshair size={18} />
            </IconButton>
          )}
          <IconButton
            title={t('toolbar.export')}
            onClick={() => active && active.colors.length > 0 && setExporting(true)}
            disabled={!active || active.colors.length === 0}
            testId="detail-export"
          >
            <Share2 size={18} />
          </IconButton>
          <IconButton
            title={t('toolbar.fromImage')}
            onClick={() => active && setImporting(true)}
            disabled={!active}
            testId="detail-image"
          >
            <ImageIcon size={18} />
          </IconButton>
          <IconButton
            title={t('toolbar.addColor')}
            onClick={handleAddColor}
            disabled={!active}
            testId="detail-add-color"
          >
            <PlusCircleIcon size={18} />
          </IconButton>
          <IconButton title={t('toolbar.rename')} onClick={handleRenamePalette} disabled={!active} testId="detail-rename">
            <Pencil size={16} />
          </IconButton>
          <IconButton
            title={t('toolbar.deletePalette')}
            danger
            onClick={() => active && handleDeletePalette(active.id)}
            disabled={!active}
            testId="detail-delete"
          >
            <Trash size={16} />
          </IconButton>
        </>
      );

    return <Toolbar left={left} right={right} />;
  };

  return (
    <div className="flex flex-col h-full bg-app text-primary">
      {renderToolbar()}

      {view !== 'settings' && statusMsg && (
        <div className="warn-banner px-4 py-1.5 text-xs">
          {statusMsg}
        </div>
      )}

      {view !== 'settings' && permission !== 'ok' && (
        <PermissionBanner state={permission} platform={platformInfo} />
      )}

      <div className="flex-1 overflow-auto">
        {view === 'settings' ? (
          <SettingsView
            onBack={() => setView('list')}
            theme={theme}
            onThemeChange={setTheme}
          />
        ) : view === 'list' ? (
          <PaletteListView
            palettes={palettes}
            onOpen={handleOpenPalette}
            onDelete={handleDeletePalette}
            onCreate={handleCreatePalette}
            onReorder={handleReorderPalettes}
            isDemo={isDemo}
          />
        ) : active ? (
          <ColorGrid
            palette={active}
            onEdit={(c) => setEditingColor({ color: c, isNew: false })}
            onDelete={handleDeleteColor}
          />
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-muted text-sm gap-3">
            <div>{t('empty.notFound')}</div>
            <button
              onClick={() => setView('list')}
              className="px-3 py-1.5 text-xs bg-input hover:bg-card-hover text-secondary rounded"
            >
              {t('empty.backToList')}
            </button>
          </div>
        )}
      </div>

      {editingColor && (
        <ColorEditor
          initial={editingColor.color}
          isNew={editingColor.isNew}
          onSave={handleSaveColor}
          onCancel={() => setEditingColor(null)}
        />
      )}

      {pendingPick && (
        <ColorConfirm
          color={pendingPick}
          onConfirm={() => handleConfirmPick(pendingPick)}
          onCancel={() => setPendingPick(null)}
        />
      )}

      {exporting && active && (
        <ExportDialog palette={active} onClose={() => setExporting(false)} />
      )}

      {importing && active && (
        <ImageImportDialog
          onAdd={handleAddManyColors}
          onClose={() => setImporting(false)}
        />
      )}

      {dialog?.kind === 'prompt' && (
        <PromptDialog
          title={dialog.title}
          placeholder={dialog.placeholder}
          defaultValue={dialog.defaultValue}
          onSubmit={(v) => { dialog.resolve(v); setDialog(null); }}
          onCancel={() => { dialog.resolve(null); setDialog(null); }}
        />
      )}
      {dialog?.kind === 'confirm' && (
        <ConfirmDialog
          title={dialog.title}
          body={dialog.body}
          onConfirm={() => { dialog.resolve(true); setDialog(null); }}
          onCancel={() => { dialog.resolve(false); setDialog(null); }}
        />
      )}
    </div>
  );
}

function PaletteListView({
  palettes,
  onOpen,
  onDelete,
  onCreate,
  onReorder,
  isDemo,
}: {
  palettes: Palette[];
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onCreate: () => void;
  onReorder: (nextIds: string[]) => void;
  isDemo: boolean;
}) {
  const { t } = useTranslation();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const dragRef = useRef<{
    sourceId: string;
    pointerId: number;
    startY: number;
    active: boolean;
  } | null>(null);

  const clearDrag = () => {
    dragRef.current = null;
    setDraggingId(null);
    setDragOverId(null);
  };

  const persistOrder = (sourceId: string, targetId: string) => {
    const currentIds = palettes.map((p) => p.id);
    const nextIds = reorderIds(currentIds, sourceId, targetId);
    if (nextIds === currentIds) return;
    onReorder(nextIds);
    if (!isDemo) {
      api.reorderPalettes(nextIds).catch((err) => {
        console.error('[reorder] persist failed:', err);
        api.listPalettes().then((list) => onReorder(list.map((p) => p.id))).catch(() => {});
      });
    }
  };

  const containerRef = useRef<HTMLDivElement | null>(null);
  const pickTargetByY = (clientY: number, sourceId: string): string | null => {
    const root = containerRef.current;
    if (!root) return null;
    const cards = Array.from(root.querySelectorAll<HTMLElement>('[data-palette-id]'));
    if (cards.length === 0) return null;
    let best: { id: string; dist: number } | null = null;
    for (const el of cards) {
      const r = el.getBoundingClientRect();
      const id = el.dataset.paletteId;
      if (!id || id === sourceId) continue;
      const mid = r.top + r.height / 2;
      const dist = Math.abs(clientY - mid);
      if (best === null || dist < best.dist) {
        best = { id, dist };
      }
    }
    return best?.id ?? null;
  };

  const handleDragPointerDown = (id: string, e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      sourceId: id,
      pointerId: e.pointerId,
      startY: e.clientY,
      active: false,
    };
  };

  const handleDragPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    if (!drag.active && Math.abs(e.clientY - drag.startY) < 5) return;
    if (!drag.active) {
      drag.active = true;
      setDraggingId(drag.sourceId);
    }
    const targetId = pickTargetByY(e.clientY, drag.sourceId);
    setDragOverId(targetId);
  };

  const handleDragPointerUp = (e: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const targetId = drag.active ? pickTargetByY(e.clientY, drag.sourceId) : null;
    clearDrag();
    if (targetId) persistOrder(drag.sourceId, targetId);
  };

  const handleDragPointerCancel = (e: React.PointerEvent<HTMLElement>) => {
    if (dragRef.current?.pointerId === e.pointerId) clearDrag();
  };

  if (palettes.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted text-sm gap-3">
        <div className="opacity-60">
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
            <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
            <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
            <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
            <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c3.31 0 6-2.69 6-6 0-5.5-4.5-9-10-9z" />
          </svg>
        </div>
        <div>{t('empty.noPalettes')}</div>
        <div className="text-xs text-muted">{t('empty.noPalettesHint')}</div>
        <button
          onClick={onCreate}
          className="mt-1 px-4 py-1.5 text-xs bg-accent hover:opacity-90 text-on-accent font-medium rounded"
        >
          {t('dialog.newPalette')}
        </button>
      </div>
    );
  }
  return (
    <div
      ref={containerRef}
      className="p-4 space-y-2.5 max-w-3xl mx-auto"
    >
      {palettes.map((p) => (
        <PaletteCard
          key={p.id}
          palette={p}
          onOpen={() => onOpen(p.id)}
          onDelete={() => onDelete(p.id)}
          draggingId={draggingId}
          dragOverId={dragOverId}
          onDragPointerDown={handleDragPointerDown}
          onDragPointerMove={handleDragPointerMove}
          onDragPointerUp={handleDragPointerUp}
          onDragPointerCancel={handleDragPointerCancel}
        />
      ))}
    </div>
  );
}

// (PickerCard lives in src-tauri/picker.html as a dedicated transparent
// window — see tauri.conf.json `windows.picker`. It listens for the
// `picker://pixel` event and renders the color swatch + HEX/RGB.)
