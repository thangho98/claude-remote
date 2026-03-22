import { useCallback, useEffect, useState } from 'react';

type NotificationPermission = 'default' | 'denied' | 'granted';

interface NotifyOptions {
  icon?: string;
  tag?: string;
  requireInteraction?: boolean;
}

interface UseNotificationsReturn {
  isSupported: boolean;
  permission: NotificationPermission;
  requestPermission: () => Promise<NotificationPermission>;
  notify: (title: string, body: string, options?: NotifyOptions) => Notification | null;
}

export function useNotifications(): UseNotificationsReturn {
  const isSupported = typeof window !== 'undefined' && 'Notification' in window;
  const [permission, setPermission] = useState<NotificationPermission>(
    isSupported ? Notification.permission : 'denied',
  );

  // Sync permission state if it changes externally
  useEffect(() => {
    if (!isSupported) return;
    setPermission(Notification.permission);
  }, [isSupported]);

  const requestPermission = useCallback(async (): Promise<NotificationPermission> => {
    if (!isSupported) return 'denied';
    const result = await Notification.requestPermission();
    setPermission(result);
    return result;
  }, [isSupported]);

  const notify = useCallback(
    (title: string, body: string, options?: NotifyOptions): Notification | null => {
      if (!isSupported || permission !== 'granted') return null;
      // Only notify when user is NOT looking at the page
      if (!document.hidden) return null;

      try {
        const notification = new Notification(title, {
          body,
          icon: options?.icon,
          tag: options?.tag ?? 'claude-remote',
          requireInteraction: options?.requireInteraction ?? false,
        });

        // Focus the tab when notification is clicked
        notification.onclick = () => {
          window.focus();
          notification.close();
        };

        return notification;
      } catch {
        return null;
      }
    },
    [isSupported, permission],
  );

  return { isSupported, permission, requestPermission, notify };
}
