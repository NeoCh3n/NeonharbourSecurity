import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: {
        DEFAULT: '16px'
      },
      screens: {
        xl: '1280px'
      }
    },
    extend: {
      colors: {
        bg: 'rgb(var(--bg) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        surfaceAlt: 'rgb(var(--surface-alt) / <alpha-value>)',
        fg: 'rgb(var(--fg) / <alpha-value>)',
        text: 'rgb(var(--fg) / <alpha-value>)',
        muted: 'rgb(var(--muted-fg) / <alpha-value>)',
        'muted-fg': 'rgb(var(--muted-fg) / <alpha-value>)',
        border: 'rgb(var(--border) / <alpha-value>)',
        brand: 'rgb(var(--brand) / <alpha-value>)',
        primary: 'rgb(var(--brand) / <alpha-value>)',
        primaryFg: 'rgb(var(--primary-fg) / <alpha-value>)',
        success: 'rgb(var(--success) / <alpha-value>)',
        warning: 'rgb(var(--warning) / <alpha-value>)',
        danger: 'rgb(var(--danger) / <alpha-value>)',
        info: 'rgb(var(--info) / <alpha-value>)'
      },
      borderRadius: {
        mdx: 'var(--radius-md)',
        lg: '16px',
        md: '12px',
        sm: '8px'
      },
      boxShadow: {
        smx: 'var(--shadow-sm)',
        mdx: 'var(--shadow-md)',
        sm: '0 1px 2px rgba(0,0,0,0.06)',
        md: '0 2px 8px rgba(0,0,0,0.08)',
        lg: '0 8px 24px rgba(0,0,0,0.12)'
      },
      height: {
        topbar: '56px'
      },
      spacing: {
        18: '72px',
        70: '280px'
      }
    }
  },
  plugins: []
};

export default config;
