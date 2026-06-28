import { invoke, isTauri } from '@tauri-apps/api/core';
import type { Palette, Color, PermissionState, PickedPixel, PlatformInfo } from '../types';

declare global {
  interface Window {
    __TAURI_INTERNALS__?: {
      invoke?: typeof invoke;
      transformCallback?: (...args: unknown[]) => unknown;
    };
  }
}

export function isTauriRuntime(): boolean {
  return isTauri();
}

function ensureTauriRuntime() {
  if (!isTauriRuntime()) {
    throw new Error('Tauri runtime is unavailable');
  }
}

export const api = {
  listPalettes: () => {
    ensureTauriRuntime();
    return invoke<Palette[]>('list_palettes');
  },
  createPalette: (name: string, description?: string) =>
    (ensureTauriRuntime(), invoke<Palette>('create_palette', { name, description })),
  updatePalette: (id: string, name?: string, description?: string) =>
    (ensureTauriRuntime(), invoke<Palette>('update_palette', { id, name, description })),
  deletePalette: (id: string) => (ensureTauriRuntime(), invoke<void>('delete_palette', { id })),
  reorderPalettes: (ids: string[]) => (ensureTauriRuntime(), invoke<void>('reorder_palettes', { ids })),

  addColor: (paletteId: string, color: Color) =>
    (ensureTauriRuntime(), invoke<Palette>('add_color', { paletteId, color })),
  addColors: (paletteId: string, colors: Color[]) =>
    (ensureTauriRuntime(), invoke<Palette>('add_colors', { paletteId, colors })),
  updateColor: (paletteId: string, color: Color) =>
    (ensureTauriRuntime(), invoke<Palette>('update_color', { paletteId, color })),
  removeColor: (paletteId: string, colorId: string) =>
    (ensureTauriRuntime(), invoke<Palette>('remove_color', { paletteId, colorId })),

  startPicking: () => (ensureTauriRuntime(), invoke<void>('start_picking')),
  stopPicking: () => (ensureTauriRuntime(), invoke<void>('stop_picking')),
  capturePixel: (x: number, y: number) =>
    (ensureTauriRuntime(), invoke<PickedPixel>('capture_pixel', { x, y })),

  getPermissionState: () => (ensureTauriRuntime(), invoke<PermissionState>('get_permission_state')),
  refreshPermissionState: () => (ensureTauriRuntime(), invoke<PermissionState>('refresh_permission_state')),
  getPlatformInfo: () => (ensureTauriRuntime(), invoke<PlatformInfo>('get_platform_info')),
};
