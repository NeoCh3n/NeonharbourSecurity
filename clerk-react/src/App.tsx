import './App.css';
import { useEffect, useRef, useState } from 'react';
import {
  AppLayout,
  Badge,
  Box,
  BreadcrumbGroup,
  Button,
  ColumnLayout,
  Container,
  ContentLayout,
  Flashbar,
  FormField,
  Header,
  Input,
  Link,
  Modal,
  SideNavigation,
  SpaceBetween,
  StatusIndicator,
  Table,
  TopNavigation,
} from '@cloudscape-design/components';
import {
  SignedIn,
  SignedOut,
  SignInButton,
  UserButton,
} from '@clerk/clerk-react';
import type { BadgeProps, InputProps, NonCancelableCustomEvent, SideNavigationProps, TableProps } from '@cloudscape-design/components';

type Alert = {
  id: string;
  vendor: string;
  severity: 'High' | 'Medium' | 'Low';
  status: string;
  resource: string;
  time: string;
};

const mockAlerts: Alert[] = [
  {
    id: 'A-101',
    vendor: 'GuardDuty',
    severity: 'High',
    status: 'Open',
    resource: 'i-0ab12c3d4',
    time: '2025-09-15 12:41',
  },
  {
    id: 'A-102',
    vendor: 'Sentinel',
    severity: 'Medium',
    status: 'Investigating',
    resource: 'vm-eastus-12',
    time: '2025-09-16 03:22',
  },
  {
    id: 'A-103',
    vendor: 'CrowdStrike',
    severity: 'Low',
    status: 'Closed',
    resource: 'host-34',
    time: '2025-09-16 18:05',
  },
];

const severityColors: Record<Alert['severity'], NonNullable<BadgeProps['color']>> = {
  High: 'severity-high',
  Medium: 'severity-medium',
  Low: 'severity-low',
};

const navItems: SideNavigationProps['items'] = [
  { type: 'link', text: 'Alerts', href: '#alerts', info: <Badge color="blue">3</Badge> },
  { type: 'link', text: 'Incidents', href: '#incidents' },
  { type: 'link', text: 'Automations', href: '#runbooks' },
  { type: 'link', text: 'Compliance', href: '#compliance' },
  { type: 'divider' },
  { type: 'link', text: 'Analytics', href: '#analytics' },
  { type: 'link', text: 'Settings', href: '#settings' },
];

type NavigationChangeEvent = NonCancelableCustomEvent<{
  open: boolean;
}>;

type QuickSightPanelProps = {
  embedUrl?: string;
};

const QuickSightPanel = ({ embedUrl }: QuickSightPanelProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const containerElement = containerRef.current;

    if (!embedUrl || !containerElement) {
      if (containerElement) {
        containerElement.innerHTML = '';
      }
      setError(null);
      return;
    }

    let isActive = true;

    containerElement.innerHTML = '';
    setError(null);

    (async () => {
      try {
        const { createEmbeddingContext } = await import('amazon-quicksight-embedding-sdk');
        const context = await createEmbeddingContext();
        await context.embedDashboard(
          {
            url: embedUrl,
            container: containerElement,
            width: '100%',
            height: '700px',
          }
        );
      } catch (err) {
        if (!isActive) return;
        const message = err instanceof Error ? err.message : 'Failed to load QuickSight';
        setError(message);
      }
    })();

    return () => {
      isActive = false;
      containerElement.innerHTML = '';
    };
  }, [embedUrl]);

  if (!embedUrl) {
    return (
      <Container header={<Header variant="h2">SOC KPIs</Header>}>
        <StatusIndicator type="pending">Waiting for QuickSight embed URL…</StatusIndicator>
        <Box margin={{ top: 's' }}>
          Provide an <Box variant="code">embedUrl</Box> from your backend signer.
        </Box>
      </Container>
    );
  }

  return (
    <Container header={<Header variant="h2">SOC KPIs</Header>}>
      {error ? <Flashbar items={[{ type: 'error', content: error, id: 'qs-error' }]} /> : null}
      <div ref={containerRef} />
    </Container>
  );
};

const SignedOutView = () => (
  <Box textAlign="center" padding="xxl">
    <SpaceBetween size="l">
      <Box variant="h1">Welcome to Neo SOC</Box>
      <Box variant="p">Enterprise-grade AI SOC on Cloudscape UI</Box>
      <SignInButton mode="modal">
        <Button variant="primary">Sign in with Clerk</Button>
      </SignInButton>
    </SpaceBetween>
  </Box>
);

const AlertsTable = () => {
  const [filter, setFilter] = useState('');
  const [selectedItems, setSelectedItems] = useState<Alert[]>([]);

  const items = mockAlerts.filter((alert) =>
    alert.id.toLowerCase().includes(filter.toLowerCase()) ||
    alert.vendor.toLowerCase().includes(filter.toLowerCase())
  );

  const columnDefinitions: TableProps.ColumnDefinition<Alert>[] = [
    { id: 'id', header: 'Alert ID', cell: (item: Alert) => item.id },
    { id: 'vendor', header: 'Source', cell: (item: Alert) => item.vendor },
    {
      id: 'severity',
      header: 'Severity',
      cell: (item: Alert) => (
        <Badge color={severityColors[item.severity]}>
          {item.severity}
        </Badge>
      ),
    },
    { id: 'status', header: 'Status', cell: (item: Alert) => item.status },
    { id: 'resource', header: 'Resource', cell: (item: Alert) => item.resource },
    { id: 'time', header: 'Time', cell: (item: Alert) => item.time },
  ];

  return (
    <Container header={<Header variant="h2">Active Alerts</Header>}>
      <SpaceBetween size="s">
        <FormField label="Filter">
          <Input
            value={filter}
            onChange={(event: NonCancelableCustomEvent<InputProps.ChangeDetail>) => setFilter(event.detail.value)}
            placeholder="Search by ID or vendor"
          />
        </FormField>
        <Table<Alert>
          trackBy="id"
          selectionType="multi"
          selectedItems={selectedItems}
          onSelectionChange={(event: NonCancelableCustomEvent<TableProps.SelectionChangeDetail<Alert>>) => setSelectedItems([...event.detail.selectedItems])}
          items={items}
          columnDefinitions={columnDefinitions}
          empty={<Box padding="s">No alerts</Box>}
        />
      </SpaceBetween>
    </Container>
  );
};

const IncidentModal = ({ open, onClose }: { open: boolean; onClose: () => void }) => (
  <Modal
    visible={open}
    onDismiss={onClose}
    closeAriaLabel="Close create incident modal"
    header={<Header>Create Incident</Header>}
  >
    <SpaceBetween size="m">
      <ColumnLayout columns={2} variant="text-grid">
        <FormField label="Title">
          <Input value="Suspicious login from TOR" readOnly />
        </FormField>
        <FormField label="Severity">
          <Input value="High" readOnly />
        </FormField>
      </ColumnLayout>
      <Button variant="primary" onClick={onClose}>
        Create
      </Button>
    </SpaceBetween>
  </Modal>
);

export default function App() {
  const [navigationOpen, setNavigationOpen] = useState(true);
  const [createIncidentOpen, setCreateIncidentOpen] = useState(false);

  const appLayoutAriaLabels = {
    navigation: 'Main navigation',
    navigationToggle: 'Open navigation',
    navigationClose: 'Close navigation',
    notifications: 'Notifications',
  };

  const topNav = (
    <TopNavigation
      identity={{
        href: '#',
        title: 'Neo SOC',
        logo: {
          src: 'https://d1.awsstatic.com/webteam/architecture-icons/q1-2022/Arch-Category_Security-Identity-Compliance_64.1ba5b2f0d8d1f3f7b8f4f1f8b2f5f9d1.png',
          alt: 'Neo SOC logo',
        },
      }}
      utilities={[
        { type: 'button', text: 'Docs', href: '#docs' },
        {
          type: 'menu-dropdown',
          text: 'Account',
          items: [
            { id: 'profile', text: 'Profile' },
            { id: 'billing', text: 'Billing' },
          ],
        },
        {
          type: 'button',
          iconName: 'user-profile',
          ariaLabel: 'Profile',
        },
        {
          type: 'button',
          text: '',
          ariaLabel: 'Open user menu',
          iconSvg: <UserButton afterSignOutUrl="/" />, // Clerk renders the user menu
        } as any,
      ]}
    />
  );

  return (
    <>
      <SignedOut>
        <SignedOutView />
      </SignedOut>

      <SignedIn>
        <div id="neo-soc-top-nav">{topNav}</div>
        <AppLayout
          toolsHide
          contentType="dashboard"
          headerSelector="#neo-soc-top-nav"
          ariaLabels={appLayoutAriaLabels}
          navigation={
            <SideNavigation
              activeHref="#alerts"
              items={navItems}
              header={{ text: 'Neo SOC', href: '#' }}
            />
          }
          navigationOpen={navigationOpen}
          onNavigationChange={(event: NavigationChangeEvent) => setNavigationOpen(event.detail.open)}
          breadcrumbs={<BreadcrumbGroup items={[{ text: 'Home', href: '#' }, { text: 'Alerts', href: '#alerts' }]} />}
          content={
            <ContentLayout
              header={
                <Header
                  variant="h1"
                  actions={<Button onClick={() => setCreateIncidentOpen(true)}>New Incident</Button>}
                >
                  SOC Overview
                </Header>
              }
            >
              <SpaceBetween size="l">
                <AlertsTable />
                <QuickSightPanel embedUrl={undefined /* supply from backend */} />
                <Container header={<Header variant="h2">Docs &amp; Links</Header>}>
                  <SpaceBetween size="s">
                    <Link external href="#">
                      Runbooks
                    </Link>
                    <Link external href="#">
                      API Reference
                    </Link>
                    <Link external href="#">
                      Status Page
                    </Link>
                  </SpaceBetween>
                </Container>
              </SpaceBetween>
            </ContentLayout>
          }
        />
        <IncidentModal open={createIncidentOpen} onClose={() => setCreateIncidentOpen(false)} />
      </SignedIn>
    </>
  );
}

/* --- Integration Notes ---
1) Install deps:
   npm i @cloudscape-design/components@3.0.1093 @clerk/clerk-react amazon-quicksight-embedding-sdk

2) (Optional) Bring in Cloudscape global styles when the package is accessible:
   import '@cloudscape-design/global-styles/index.css';
   // If you are offline, keep relying on the local baseline styles defined in src/index.css.

3) Wrap root with ClerkProvider (index/main):
   import { ClerkProvider } from '@clerk/clerk-react';
   ReactDOM.createRoot(document.getElementById('root')!).render(
     <ClerkProvider publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}>
       <App />
     </ClerkProvider>
   );

4) QuickSight embed URL: obtain server-side via AWS SDK (GenerateEmbedUrlForRegisteredUser or AnonymousUser), return to frontend and pass into <QuickSightPanel embedUrl={url} />.

5) Optional: Tailwind can coexist; Cloudscape controls layout/UX patterns.
*/

// ================================
// Backend: QuickSight Embed Signer
// ================================
// Minimal Node/Express service using AWS SDK v3 to generate QuickSight Embed URLs
// Endpoints provided:
//   - GET /api/qs-url/registered?dashboardId=...&userArn=... (preferred for signed-in QS users)
//   - GET /api/qs-url/anonymous?dashboardId=... (for PoC/anonymous embed; enable in QS settings)
//
// ---------- Setup ----------
// 1) npm i express cors dotenv @aws-sdk/client-quicksight
// 2) Create .env with:
//    AWS_REGION=ap-southeast-1
//    AWS_ACCESS_KEY_ID=...
//    AWS_SECRET_ACCESS_KEY=...
//    # Optional if using STS:
//    # AWS_SESSION_TOKEN=...
//    QS_AWS_ACCOUNT_ID=123456789012
//    QS_NAMESPACE=default
//    QS_ALLOWED_DOMAIN=http://localhost:5173
//    # Optional default dashboard and user for quick testing
//    QS_DASHBOARD_ID=your-dashboard-id
//    QS_USER_ARN=arn:aws:quicksight:ap-southeast-1:123456789012:user/default/neo-soc-user
// 3) Ensure your IAM role has QuickSight permissions for the chosen API(s).
// 4) Run: node server.js   (or ts-node server.ts)
//
// ---------- server.ts / server.js ----------
/*
Minimal signer service example (TypeScript)
```ts
import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import {
  GenerateEmbedUrlForAnonymousUserCommand,
  GenerateEmbedUrlForRegisteredUserCommand,
  QuickSightClient,
} from '@aws-sdk/client-quicksight';

const app = express();
app.use(cors({ origin: process.env.QS_ALLOWED_DOMAIN?.split(',') || true }));
app.use(express.json());

const REGION = process.env.AWS_REGION || 'ap-southeast-1';
const ACCOUNT_ID = process.env.QS_AWS_ACCOUNT_ID as string; // required
const NAMESPACE = process.env.QS_NAMESPACE || 'default';
const DEFAULT_DASHBOARD_ID = process.env.QS_DASHBOARD_ID;
const DEFAULT_USER_ARN = process.env.QS_USER_ARN; // for registered user flow

if (!ACCOUNT_ID) {
  console.error('Missing QS_AWS_ACCOUNT_ID');
  process.exit(1);
}

const qs = new QuickSightClient({ region: REGION });

app.get('/health', (_req, res) => res.json({ ok: true }));

app.get('/api/qs-url/registered', async (req, res) => {
  try {
    const dashboardId = (req.query.dashboardId as string) || DEFAULT_DASHBOARD_ID;
    const userArn = (req.query.userArn as string) || DEFAULT_USER_ARN;

    if (!dashboardId) return res.status(400).json({ error: 'dashboardId is required' });
    if (!userArn) return res.status(400).json({ error: 'userArn is required' });

    const cmd = new GenerateEmbedUrlForRegisteredUserCommand({
      AwsAccountId: ACCOUNT_ID,
      ExperienceConfiguration: {
        Dashboard: {
          InitialDashboardId: dashboardId,
        },
      },
      UserArn: userArn,
      SessionLifetimeInMinutes: 600,
      AllowedDomains: process.env.QS_ALLOWED_DOMAIN ? process.env.QS_ALLOWED_DOMAIN.split(',') : undefined,
    });

    const resp = await qs.send(cmd);
    return res.json({ embedUrl: resp.EmbedUrl, expiresAt: resp.Expiration });
  } catch (err) {
    console.error('registered error', err);
    const message = err instanceof Error ? err.message : 'failed to generate embed url';
    return res.status(500).json({ error: message });
  }
});

app.get('/api/qs-url/anonymous', async (req, res) => {
  try {
    const dashboardId = (req.query.dashboardId as string) || DEFAULT_DASHBOARD_ID;
    if (!dashboardId) return res.status(400).json({ error: 'dashboardId is required' });

    const cmd = new GenerateEmbedUrlForAnonymousUserCommand({
      AwsAccountId: ACCOUNT_ID,
      Namespace: NAMESPACE,
      AuthorizedResourceArns: [
        `arn:aws:quicksight:${REGION}:${ACCOUNT_ID}:dashboard/${dashboardId}`,
      ],
      ExperienceConfiguration: {
        Dashboard: {
          InitialDashboardId: dashboardId,
        },
      },
      SessionLifetimeInMinutes: 600,
      AllowedDomains: process.env.QS_ALLOWED_DOMAIN ? process.env.QS_ALLOWED_DOMAIN.split(',') : undefined,
    });

    const resp = await qs.send(cmd);
    return res.json({ embedUrl: resp.EmbedUrl, expiresAt: resp.Expiration });
  } catch (err) {
    console.error('anonymous error', err);
    const message = err instanceof Error ? err.message : 'failed to generate embed url';
    return res.status(500).json({ error: message });
  }
});

const port = Number(process.env.PORT) || 8787;
app.listen(port, () => console.log(`[qs-signer] listening on :${port}`));
```
*/

// ---------- Frontend glue (already in App.tsx) ----------
// fetch('/api/qs-url/anonymous?dashboardId=...').then(r => r.json()).then(({ embedUrl }) => setState(embedUrl));

// ---------- Minimal IAM Policy Hints ----------
// {
//   "Version": "2012-10-17",
//   "Statement": [
//     {
//       "Effect": "Allow",
//       "Action": [
//         "quicksight:GenerateEmbedUrlForRegisteredUser",
//         "quicksight:GenerateEmbedUrlForAnonymousUser"
//       ],
//       "Resource": "*"
//     }
//   ]
// }

// Notes:
// - Registered flow requires the QuickSight user to exist; you can automate provisioning via RegisterUser API or Console.
// - Anonymous flow requires enabling in QS admin and mapping dashboards to namespaces.
// - Always restrict AllowedDomains and IAM resources in production.

// 主框架：Cloudscape Design System → 打造「SOC 控制台」级体验。
// 认证/注册：根据后端选型，前期可用 Clerk 展示层。
// 后续集成 QuickSight Embedding SDK（BI 报表）来展示趋势和 KPI。
