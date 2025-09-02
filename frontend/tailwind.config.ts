import type { Config } from 'tailwindcss';

export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}"
  ],
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
        bg: "var(--bg)",
        surface: "var(--surface)",
        surfaceAlt: "var(--surface-alt)",
        text: "var(--text)",
        muted: "var(--muted)",
        primary: "var(--primary)",
        primaryFg: "var(--primary-fg)",
        border: "var(--border)",
        ring: "var(--ring)",
        success: "var(--success)",
        warning: "var(--warning)",
        danger: "var(--danger)",
        info: "var(--info)"
      },
      boxShadow: {
        sm: "0 1px 2px rgba(0,0,0,0.06)",
        md: "0 2px 8px rgba(0,0,0,0.08)",
        lg: "0 8px 24px rgba(0,0,0,0.12)"
      },
      borderRadius: {
        lg: '16px',
        md: '12px',
        sm: '8px'
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
} satisfies Config;

