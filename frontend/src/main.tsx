import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import './index.css';
// Explicit .tsx extensions to avoid picking legacy .jsx files
import App from './App.tsx';
import LoginPage from './pages/Login.tsx';
import DashboardPage from './pages/Dashboard.tsx';
import ThreatHunterPage from './pages/ThreatHunter.tsx';
import { ThemeProvider } from './store/theme';
import { worker } from './mocks/browser';

// Start MSW in development
if (import.meta.env.DEV) {
  void worker.start({ onUnhandledRequest: 'bypass' });
}

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'threat-hunter', element: <ThreatHunterPage /> }
    ]
  },
  { path: '/login', element: <LoginPage /> }
]);

const qc = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <ThemeProvider>
        <RouterProvider router={router} />
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>
);
