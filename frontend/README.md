NeonHarbour Security Frontend (Desktop 1280–1920)

Overview
- Desktop-only React + TypeScript + Vite app with Tailwind and CSS variables for 3 themes (light/dark/high-contrast).
- Pages: Login, Dashboard, Threat Hunter. Virtualized DataTable, Recharts wrappers, MSW mock API, Zustand for UI state, React Query for data.

Run (after installing deps)
- npm i
- npm run dev

Testing
- npm run test

Storybook
- npm run storybook

Key Paths
- Tokens JSON: src/tokens/tokens.json
- Theme provider: src/store/theme.tsx
- App shell: src/components/shell/*
- Data table: src/components/datatable/*
- Charts: src/components/charts/*
- Pages: src/pages/*
- MSW: src/mocks/*

Desktop Constraints
- Baseline 1440, content max 1280; min width 1280, max 1920 with centered content and density options.

Security & Telemetry
- Add fetch interceptors to include traceId per request (placeholder in MSW handlers).

Next Steps
- Wire to backend APIs, add auth guards and token storage (HttpOnly cookie). Add more components (Modal, Toast, Tabs), command palette, and E2E tests.

