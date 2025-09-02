import { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'theme-light' | 'theme-dark' | 'theme-hc';

const ThemeContext = createContext<{ theme: Theme; setTheme: (t: Theme) => void } | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('theme') as Theme) || 'theme-light');

  useEffect(() => {
    const html = document.documentElement;
    html.classList.remove('theme-light', 'theme-dark', 'theme-hc');
    html.classList.add(theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

