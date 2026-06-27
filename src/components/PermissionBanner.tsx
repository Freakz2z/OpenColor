import { useTranslation } from 'react-i18next';
import type { PermissionState, PlatformInfo } from '../types';
import { openUrl } from '@tauri-apps/plugin-opener';

interface Props {
  state: PermissionState;
  platform?: PlatformInfo | null;
}

export function PermissionBanner({ state, platform }: Props) {
  const { t } = useTranslation();
  if (state === 'ok') return null;

  const os = platform?.os ?? '';
  const displayServer = platform?.displayServer ?? '';
  const isMac = os === 'macos' || navigator.userAgent.includes('Mac');
  const isWin = os === 'windows' || navigator.userAgent.includes('Windows');
  const isLinux = os === 'linux';
  const isWayland = displayServer === 'wayland';

  let title = t('permission.unsupportedTitle');
  let body = t('permission.unsupportedBody');
  let actionUrl = '';
  let actionLabel = '';

  if (state === 'denied') {
    if (isMac) {
      title = t('permission.deniedTitle');
      const needsInputPermission = platform?.canCaptureScreen && !platform.canListenGlobalInput;
      body = needsInputPermission
        ? t('permission.deniedBodyMacInput')
        : t('permission.deniedBodyMac');
      actionUrl = needsInputPermission
        ? 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility'
        : 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture';
      actionLabel = t('permission.openSettings');
    } else if (isWin) {
      title = t('permission.deniedTitle');
      body = t('permission.deniedBodyWin');
    } else {
      title = t('permission.deniedTitle');
      body = t('permission.deniedBodyLinux');
    }
  } else if (isLinux && isWayland) {
    body = t('permission.unsupportedBodyWayland');
  } else if (isLinux) {
    body = t('permission.unsupportedBodyLinux');
  } else if (isWin) {
    body = t('permission.unsupportedBodyWin');
  }

  return (
    <div className="px-5 py-3 bg-danger-soft border-b border-default text-primary">
      <div className="text-sm font-medium">{title}</div>
      <div className="text-xs mt-1 text-secondary">{body}</div>
      {actionUrl && (
        <button
          onClick={() => openUrl(actionUrl)}
          className="mt-2 px-3 py-1 text-xs bg-card hover:bg-card-hover text-primary rounded border border-default"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
