import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import './index.css';
// Explicit .tsx extensions to avoid picking legacy .jsx files
import App from './App.tsx';
import LoginPage from './pages/Login.tsx';
import PlanPage from './pages/Plan.tsx';
import InvestigatePage from './pages/Investigate.tsx';
import RespondPage from './pages/Respond.tsx';
import AdaptPage from './pages/Adapt.tsx';
import ReportPage from './pages/Report.tsx';
import ThreatHunterPage from './pages/ThreatHunter.tsx';
import IngestPage from './pages/Ingest.tsx';
import AlertsListPage from './pages/AlertsList.tsx';
import AlertWorkspacePage from './pages/AlertWorkspace.tsx';
import AlertDetailPage from './pages/AlertDetail.tsx';
import CasesPage from './pages/Cases.tsx';
import CaseDetailPage from './pages/CaseDetail.tsx';
import ApprovalsPage from './pages/Approvals.tsx';
import PoliciesPage from './pages/Policies.tsx';
import AdminSettingsPage from './pages/AdminSettings.tsx';
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
      { index: true, element: <PlanPage /> },
      { path: 'plan', element: <PlanPage /> },
      { path: 'investigate', element: <InvestigatePage /> },
      { path: 'respond', element: <RespondPage /> },
      { path: 'adapt', element: <AdaptPage /> },
      { path: 'report', element: <ReportPage /> },
      { path: 'hunt', element: <ThreatHunterPage /> },
      { path: 'alert-workspace', element: <AlertWorkspacePage /> },
      { path: 'cases', element: <CasesPage /> },
      { path: 'cases/:id', element: <CaseDetailPage /> },
      { path: 'ingest', element: <IngestPage /> },
      { path: 'alerts-list', element: <AlertsListPage /> }
      ,{ path: 'alerts/:id', element: <AlertDetailPage /> }
      ,{ path: 'approvals', element: <ApprovalsPage /> }
      ,{ path: 'policies', element: <PoliciesPage /> }
      ,{ path: 'admin', element: <AdminSettingsPage /> }
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
