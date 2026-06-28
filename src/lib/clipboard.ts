import { writeText as writeTextWithTauri } from '@tauri-apps/plugin-clipboard-manager';
import { isTauriRuntime } from './tauri';

export async function writeClipboardText(text: string): Promise<void> {
  if (isTauriRuntime()) {
    await writeTextWithTauri(text);
    return;
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  throw new Error('Clipboard API is unavailable');
}
