import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClerkProvider } from '@clerk/clerk-react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import './index.css';
// Explicit .tsx extensions to avoid picking legacy .jsx files
import App from './App.tsx';
import SignInPage from './pages/SignInPage.tsx';
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
import DashboardPage from './pages/Dashboard.tsx';
import AdminSettingsPage from './pages/AdminSettings.tsx';
import InvestigationsListPage from './pages/InvestigationsList.tsx';
import InvestigationDetailPage from './pages/InvestigationDetail.tsx';
import InvestigationMetricsPage from './pages/InvestigationMetrics.tsx';
import { ThemeProvider } from './store/theme';
import { worker } from './mocks/browser';
import { clerkAppearance } from './config/clerkAppearance';

// Optional MSW mocking (enable by setting VITE_ENABLE_MSW=true)
if (import.meta.env.DEV && String(import.meta.env.VITE_ENABLE_MSW).toLowerCase() === 'true') {
  void worker.start({ onUnhandledRequest: 'bypass' });
}

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <PlanPage /> },
      { path: 'plan', element: <PlanPage /> },
      { path: 'dashboard', element: <DashboardPage /> },
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
      , { path: 'alerts/:id', element: <AlertDetailPage /> }
      , { path: 'approvals', element: <ApprovalsPage /> }
      , { path: 'policies', element: <PoliciesPage /> }
      , { path: 'admin', element: <AdminSettingsPage /> }
      , { path: 'investigations', element: <InvestigationsListPage /> }
      , { path: 'investigations/metrics', element: <InvestigationMetricsPage /> }
      , { path: 'investigations/:id', element: <InvestigationDetailPage /> }
    ]
  },
  { path: '/login', element: <SignInPage /> }
]);

const qc = new QueryClient();

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;
if (!PUBLISHABLE_KEY) {
  throw new Error('Missing Clerk Publishable Key (VITE_CLERK_PUBLISHABLE_KEY)');
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ClerkProvider publishableKey={PUBLISHABLE_KEY} afterSignOutUrl="/" appearance={clerkAppearance}>
      <QueryClientProvider client={qc}>
        <ThemeProvider>
          <RouterProvider router={router} />
        </ThemeProvider>
      </QueryClientProvider>
    </ClerkProvider>
  </StrictMode>
);
