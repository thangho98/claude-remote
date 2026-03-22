import { useCallback, useEffect } from 'react';
import { useAppStore } from '../stores/appStore';
import { useShallow } from 'zustand/react/shallow';

export type Theme = 'light' | 'dark';

export function useTheme() {
  const { theme, setTheme } = useAppStore(
    useShallow((s) => ({ theme: s.theme, setTheme: s.setTheme }))
  );

  // Apply theme to DOM
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    // Update meta theme-color for mobile browsers
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', theme === 'dark' ? '#111827' : '#ffffff');
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  return { theme, setTheme, toggleTheme, isDark: theme === 'dark' };
}
