import { invoke } from '@tauri-apps/api/core';
import type { Palette, Color, PermissionState, PickedPixel, PlatformInfo } from '../types';

export const api = {
  listPalettes: () => invoke<Palette[]>('list_palettes'),
  createPalette: (name: string, description?: string) =>
    invoke<Palette>('create_palette', { name, description }),
  updatePalette: (id: string, name?: string, description?: string) =>
    invoke<Palette>('update_palette', { id, name, description }),
  deletePalette: (id: string) => invoke<void>('delete_palette', { id }),

  addColor: (paletteId: string, color: Color) =>
    invoke<Palette>('add_color', { paletteId, color }),
  updateColor: (paletteId: string, color: Color) =>
    invoke<Palette>('update_color', { paletteId, color }),
  removeColor: (paletteId: string, colorId: string) =>
    invoke<Palette>('remove_color', { paletteId, colorId }),

  startPicking: () => invoke<void>('start_picking'),
  stopPicking: () => invoke<void>('stop_picking'),
  setPickerMode: (enabled: boolean) => invoke<void>('set_picker_mode', { enabled }),
  capturePixel: (x: number, y: number) =>
    invoke<PickedPixel>('capture_pixel', { x, y }),

  getPermissionState: () => invoke<PermissionState>('get_permission_state'),
  getPlatformInfo: () => invoke<PlatformInfo>('get_platform_info'),
};
