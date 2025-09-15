NeonHarbour Security Frontend (Desktop 1280–1920)

Overview
- Desktop-only React + TypeScript + Vite app with Tailwind and CSS variables for 3 themes (light/dark/high-contrast).
- Pages: Login, Dashboard, Threat Hunter. Virtualized DataTable, Recharts wrappers, MSW mock API, Zustand for UI state, React Query for data.

Run (after installing deps)
- npm i
- npm run dev

Environment
- VITE_CLERK_PUBLISHABLE_KEY: Clerk publishable key. Use a live key (pk_live_...) for production to avoid dev-key warnings. For local dev you can use pk_test_...
- VITE_API_BASE_URL: Optional. If set, the frontend uses this as the API base in both dev and production (e.g., http://localhost:3000/api). If unset, the app uses same-origin '/api' and expects an HTTP proxy (nginx) to forward to the backend.
- VITE_ENABLE_MSW: Optional. When 'true' in dev, starts MSW mocks for local UI work without a backend.

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

Deployment notes
- The provided nginx.conf serves the static build and proxies '/api/*' to the backend. It targets a container named 'backend:3000' and falls back to the host at 'host.docker.internal:3000'. Ensure either a 'backend' container is on the same network, or a backend is running on the host at port 3000. A 502 Bad Gateway indicates the upstream backend is unreachable.
- If your backend is not on the same origin, you can build the frontend with 'VITE_API_BASE_URL' to point directly to it (ensure the backend allows CORS). Example:
  docker build \
    --build-arg VITE_CLERK_PUBLISHABLE_KEY=pk_live_xxx \
    --build-arg VITE_API_BASE_URL=http://api.example.com \
    -t neonharbour-frontend:latest .

Clerk warning in console
- "Clerk has been loaded with development keys" appears when using a test publishable key (pk_test_...). Use a live key in production to remove the warning.
