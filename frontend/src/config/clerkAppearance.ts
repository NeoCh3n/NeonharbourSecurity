import type { Appearance } from '@clerk/clerk-react';

/**
 * Single source of truth for Clerk styling.
 * Maps to Tailwind/CSS variable tokens so auth screens match the application shell.
 */
export const clerkAppearance: Appearance = {
  variables: {
    colorPrimary: 'rgb(var(--brand))',
    colorText: 'rgb(var(--fg))',
    colorTextSecondary: 'rgb(var(--muted-fg))',
    colorBackground: 'rgb(var(--surface))',
    colorInputBackground: 'rgb(var(--surface))',
    colorInputText: 'rgb(var(--fg))',
    colorInputBorder: 'rgb(var(--border))',
    borderRadius: 'var(--radius-md)',
    fontSize: '14px'
  },
  layout: {
    helpPageUrl: 'https://neonharbour.security/help',
    logoPlacement: 'inside',
    socialButtonsPlacement: 'bottom',
    unsafe_disableDevelopmentModeWarnings: true
  },
  elements: {
    card: {
      backgroundColor: 'rgb(var(--surface))',
      boxShadow: 'var(--shadow-sm)',
      border: '1px solid rgb(var(--border))',
      borderRadius: 'var(--radius-md)'
    },
    headerTitle: { color: 'rgb(var(--fg))', fontWeight: 600 },
    headerSubtitle: { color: 'rgb(var(--muted-fg))' },
    formFieldInput: {
      backgroundColor: 'rgb(var(--surface))',
      border: '1px solid rgb(var(--border))',
      borderRadius: 'var(--radius-md)',
      boxShadow: 'var(--shadow-sm)',
      padding: '10px 14px'
    },
    formFieldInput__focused: {
      outline: '2px solid rgb(var(--brand))',
      outlineOffset: '0px',
      borderColor: 'transparent',
      boxShadow: '0 0 0 2px rgb(var(--brand))'
    },
    formFieldLabel: { color: 'rgb(var(--fg))', fontWeight: 500 },
    formFieldErrorText: { color: 'rgb(var(--danger))' },
    formButtonPrimary: {
      backgroundColor: 'rgb(var(--brand))',
      color: 'rgb(var(--primary-fg))',
      borderRadius: 'var(--radius-md)',
      height: '44px',
      boxShadow: 'var(--shadow-sm)'
    },
    formButtonPrimary__disabled: { opacity: 0.6 },
    socialButtons: {
      borderRadius: 'var(--radius-md)',
      height: '44px',
      border: '1px solid rgb(var(--border))',
      backgroundColor: 'rgb(var(--surface))',
      boxShadow: 'var(--shadow-sm)'
    },
    dividerLine: { backgroundColor: 'rgb(var(--border))' },
    dividerText: { color: 'rgb(var(--muted-fg))' },
    footer: { color: 'rgb(var(--muted-fg))' },
    footerActionText: { color: 'rgb(var(--fg))' },
    footerActionLink: { color: 'rgb(var(--brand))' }
  }
};
