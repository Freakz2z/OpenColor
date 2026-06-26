export type ColorFamily =
  | 'red' | 'orange' | 'yellow' | 'green' | 'cyan'
  | 'blue' | 'purple' | 'pink' | 'brown' | 'gray' | 'neutral';

export interface Color {
  id: string;
  name: string;
  hex: string;
  rgb: [number, number, number];
  family: ColorFamily;
  note?: string;
  created_at: number;
}

export interface Palette {
  id: string;
  name: string;
  description?: string;
  colors: Color[];
  created_at: number;
  updated_at: number;
}

export type PermissionState = 'ok' | 'denied' | 'unsupported';

export interface PlatformInfo {
  os: string;
  displayServer?: string | null;
  permission: PermissionState;
  canPickScreen: boolean;
}

export type Theme = 'auto' | 'dark' | 'light';

export interface PickedPixel {
  hex: string;
  rgb: [number, number, number];
  x: number;
  y: number;
}

export interface FramePayload {
  width: number;
  height: number;
  rgba: number[];
  seq: number;
}
