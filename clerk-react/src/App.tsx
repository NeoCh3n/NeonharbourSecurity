import './App.css';
import { useEffect, useMemo, useState } from 'react';
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
  Header,
  SideNavigation,
  SpaceBetween,
  StatusIndicator,
  Table,
  Tabs,
  TopNavigation,
  Spinner,
} from '@cloudscape-design/components';
import type {
  BadgeProps,
  NonCancelableCustomEvent,
  SideNavigationProps,
  StatusIndicatorProps,
  TableProps,
} from '@cloudscape-design/components';
import { useQuery } from '@tanstack/react-query';
import {
  SignedIn,
  SignedOut,
  SignInButton,
  UserButton,
} from '@clerk/clerk-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';
const DEMO_TOKEN = import.meta.env.VITE_DEMO_AUTH_TOKEN ?? 'change-me';

type RecommendedAction = {
  action_id?: string;
  description?: string;
  rationale?: string;
};

type InvestigationSummary = {
  investigationId: string;
  stage?: string;
  riskLevel?: string;
  receivedAt?: string;
  updatedAt?: string;
  tenantId?: string;
};

type InvestigationDetail = InvestigationSummary & {
  summary?: {
    summary?: string;
    risk_level?: string;
    confidence?: number;
    recommended_actions?: RecommendedAction[];
    timeline?: Array<Record<string, unknown>>;
  };
  context?: Record<string, unknown>;
  risk?: Record<string, unknown>;
};

type TimelineEvent = {
  id: string;
  timestamp: string;
  stage: string;
  detail: string;
  durationSeconds?: number;
};

type NavigationChangeEvent = NonCancelableCustomEvent<{ open: boolean }>;

const FALLBACK_INVESTIGATIONS: InvestigationSummary[] = [
  {
    investigationId: 'INV-20240212-001',
    tenantId: 'hk-demo',
    stage: 'summarized',
    riskLevel: 'high',
    receivedAt: '2024-02-12T03:14:00Z',
    updatedAt: '2024-02-12T03:20:00Z',
  },
  {
    investigationId: 'INV-20240211-004',
    tenantId: 'hk-demo',
    stage: 'completed',
    riskLevel: 'low',
    receivedAt: '2024-02-11T10:02:00Z',
    updatedAt: '2024-02-11T11:30:00Z',
  },
];

const FALLBACK_DETAILS: Record<string, InvestigationDetail> = {
  'INV-20240212-001': {
    investigationId: 'INV-20240212-001',
    tenantId: 'hk-demo',
    stage: 'summarized',
    riskLevel: 'high',
    summary: {
      summary:
        'Unusual admin login from a new ASN triggered conditional access failure, likely credential stuffing attempt.',
      risk_level: 'high',
      confidence: 0.72,
      recommended_actions: [
        {
          action_id: 'DISABLE_KEYS',
          description: 'Disable HK Ops admin break-glass keys',
          rationale: 'Contain potential abuse.',
        },
        {
          action_id: 'BLOCK_IP_WAF',
          description: 'Block offending ASN at WAF',
          rationale: 'Stop further bursts.',
        },
      ],
      timeline: [
        { time: '2024-02-12T03:14:00Z', step: 'Alert received from Sentinel' },
        { time: '2024-02-12T03:16:00Z', step: 'Correlated with Splunk login failures' },
        { time: '2024-02-12T03:18:00Z', step: 'Recommended containment actions prepared' },
      ],
    },
    context: {
      sentinel_alerts: [{ alertId: 'sentinel-001' }],
      splunk_events: [{ _time: '2024-02-12T03:13:21Z', status: 'failed' }],
      entra_signins: [
        {
          id: 'entra-001',
          status: { failureReason: 'Conditional Access policy' },
          ipAddress: '203.120.55.21',
        },
      ],
    },
  },
  'INV-20240211-004': {
    investigationId: 'INV-20240211-004',
    tenantId: 'hk-demo',
    stage: 'completed',
    riskLevel: 'low',
    summary: {
      summary:
        'Okta password spray alert suppressed after MFA enforcement. Multiple failed authentications from a known corporate VPN.',
      risk_level: 'low',
      confidence: 0.91,
      recommended_actions: [
        {
          action_id: 'TICKET_UPSERT',
          description: 'Notify IAM operations of repeated failures',
          rationale: 'Track noisy accounts and adjust thresholds.',
        },
      ],
      timeline: [
        { time: '2024-02-11T10:02:00Z', step: 'Okta alert raised' },
        { time: '2024-02-11T10:10:00Z', step: 'Matched VPN source and suppressed' },
      ],
    },
    context: {
      okta_events: [
        { id: 'okta-992', result: 'FAILURE', ipAddress: '18.162.4.12' },
        { id: 'okta-993', result: 'FAILURE', ipAddress: '18.162.4.12' },
      ],
    },
  },
};

const riskBadgeColors: Record<string, BadgeProps['color']> = {
  high: 'severity-high',
  medium: 'severity-medium',
  low: 'severity-low',
};

const riskIndicatorMap: Record<string, StatusIndicatorProps.Type> = {
  high: 'error',
  medium: 'warning',
  low: 'success',
};

const stageIndicatorMap: Record<string, StatusIndicatorProps.Type> = {
  plan: 'in-progress',
  execute: 'in-progress',
  analyze: 'info',
  respond: 'warning',
  adapt: 'info',
  report: 'success',
  summarized: 'info',
  completed: 'success',
  closed: 'success',
};

const defaultNavItems: SideNavigationProps.Item[] = [
  { type: 'link', text: 'Investigations', href: '#investigations' },
  { type: 'link', text: 'Automations', href: '#automations' },
  { type: 'link', text: 'Compliance', href: '#compliance' },
  { type: 'divider' },
  { type: 'link', text: 'Analytics', href: '#analytics' },
  { type: 'link', text: 'Settings', href: '#settings' },
];

const SignedOutView = () => (
  <Box textAlign="center" padding="xxl">
    <SpaceBetween size="l">
      <Box variant="h1">NeoHarbourSecurity Workbench</Box>
      <Box variant="p">Sign in with Clerk to inspect investigations and agent timelines.</Box>
      <SignInButton mode="modal">
        <Button variant="primary">Sign in</Button>
      </SignInButton>
    </SpaceBetween>
  </Box>
);

const formatDateTime = (value?: string) => {
  if (!value) return '—';
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return value;
  }
  return new Date(parsed).toLocaleString();
};

const titleCase = (value?: string) => {
  if (!value) return '—';
  return value.charAt(0).toUpperCase() + value.slice(1);
};

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${DEMO_TOKEN}`,
    },
  });
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }
  return response.json() as Promise<T>;
}

const fetchInvestigations = async (): Promise<InvestigationSummary[]> => {
  const payload = await fetchJson<unknown>(`/investigations`);
  if (Array.isArray(payload)) {
    return payload as InvestigationSummary[];
  }
  if (payload && typeof payload === 'object' && 'items' in payload) {
    const { items } = payload as { items?: InvestigationSummary[] };
    return items ?? [];
  }
  return [];
};

const fetchInvestigationDetail = async (id: string): Promise<InvestigationDetail> => {
  return fetchJson<InvestigationDetail>(`/investigations/${id}`);
};

const fetchInvestigationTimeline = async (id: string): Promise<TimelineEvent[]> => {
  const payload = await fetchJson<unknown>(`/investigations/${id}/timeline`);
  return normalizeTimelineData(payload);
};

const normalizeTimelineData = (
  raw: unknown,
  fallback?: Array<Record<string, unknown>>,
): TimelineEvent[] => {
  const rawItems = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { items?: unknown[] })?.items)
    ? ((raw as { items?: unknown[] }).items as unknown[])
    : Array.isArray((raw as { results?: unknown[] })?.results)
    ? ((raw as { results?: unknown[] }).results as unknown[])
    : [];
  const source = rawItems.length ? rawItems : fallback ?? [];
  return source.map((entry, index) => {
    const record = (entry || {}) as Record<string, unknown>;
    const rawStage = (record.stage || record.label || record.step || 'Event') as string;
    const rawTimestamp =
      (record.time || record.startedAt || record.completedAt || '') as string;
    let duration = (record.durationSeconds || record.duration) as number | undefined;
    const start = record.startedAt ?? record.startTime ?? null;
    const end = record.completedAt ?? record.endTime ?? null;
    if (duration == null && typeof start === 'string' && typeof end === 'string') {
      const startMs = Date.parse(start);
      const endMs = Date.parse(end);
      if (!Number.isNaN(startMs) && !Number.isNaN(endMs)) {
        duration = Math.max((endMs - startMs) / 1000, 0);
      }
    }
    const detailValue =
      record.detail ?? record.description ?? record.step ?? record.payload ?? '';
    const detail =
      typeof detailValue === 'string'
        ? detailValue
        : detailValue
        ? JSON.stringify(detailValue, null, 2)
        : '';
    return {
      id: (record.id as string) ?? `${rawStage}-${index}`,
      timestamp: rawTimestamp,
      stage: rawStage,
      detail,
      durationSeconds:
        typeof duration === 'number' ? Math.round(duration * 100) / 100 : undefined,
    };
  });
};

type InvestigationMetricsProps = {
  items: InvestigationSummary[];
  isFallback: boolean;
};

const InvestigationMetrics = ({ items, isFallback }: InvestigationMetricsProps) => {
  const total = items.length;
  const open = items.filter((item) => {
    const stage = (item.stage ?? '').toLowerCase();
    return stage && !['completed', 'closed'].includes(stage);
  }).length;
  const completed = total - open;
  const highRisk = items.filter(
    (item) => (item.riskLevel ?? '').toLowerCase() === 'high',
  ).length;

  return (
    <Container
      header={
        <Header
          variant="h2"
          actions={
            <StatusIndicator type={isFallback ? 'warning' : 'success'}>
              {isFallback ? 'Demo data' : 'Live API'}
            </StatusIndicator>
          }
        >
          Queue overview
        </Header>
      }
    >
      <ColumnLayout columns={3} variant="text-grid">
        <Box>
          <Box variant="awsui-key-label">Open investigations</Box>
          <Box variant="h1">{open}</Box>
          <Box variant="p">Currently in progress</Box>
        </Box>
        <Box>
          <Box variant="awsui-key-label">Completed</Box>
          <Box variant="h1">{completed}</Box>
          <Box variant="p">Resolved by agents</Box>
        </Box>
        <Box>
          <Box variant="awsui-key-label">High risk</Box>
          <Box variant="h1">{highRisk}</Box>
          <Box variant="p">Escalations requiring review</Box>
        </Box>
      </ColumnLayout>
    </Container>
  );
};

type InvestigationsTableProps = {
  items: InvestigationSummary[];
  loading: boolean;
  error: Error | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onRefresh: () => void;
  isFallback: boolean;
};

const InvestigationsTable = ({
  items,
  loading,
  error,
  selectedId,
  onSelect,
  onRefresh,
  isFallback,
}: InvestigationsTableProps) => {
  const columnDefinitions: TableProps.ColumnDefinition<InvestigationSummary>[] = [
    {
      id: 'investigationId',
      header: 'Investigation ID',
      cell: (item) => item.investigationId,
      sortingField: 'investigationId',
    },
    {
      id: 'stage',
      header: 'Stage',
      cell: (item) => (
        <StatusIndicator
          type={
            stageIndicatorMap[(item.stage ?? '').toLowerCase()] ?? 'info'
          }
        >
          {titleCase(item.stage)}
        </StatusIndicator>
      ),
    },
    {
      id: 'riskLevel',
      header: 'Risk',
      cell: (item) => (
        <Badge
          color={
            riskBadgeColors[(item.riskLevel ?? '').toLowerCase()] ?? 'blue'
          }
        >
          {titleCase(item.riskLevel)}
        </Badge>
      ),
    },
    {
      id: 'tenantId',
      header: 'Tenant',
      cell: (item) => item.tenantId ?? '—',
    },
    {
      id: 'receivedAt',
      header: 'Received',
      cell: (item) => formatDateTime(item.receivedAt),
    },
    {
      id: 'updatedAt',
      header: 'Updated',
      cell: (item) => formatDateTime(item.updatedAt),
    },
  ];

  const selectedItems = useMemo(() => {
    if (!selectedId) return [];
    const match = items.find((item) => item.investigationId === selectedId);
    return match ? [match] : [];
  }, [items, selectedId]);

  const flashItems = [];
  if (error) {
    flashItems.push({
      type: 'warning' as const,
      id: 'investigations-fallback',
      header: 'Falling back to sample investigations',
      content: 'The API is unreachable. Showing pre-seeded demo data for continuity.',
    });
  }

  return (
    <Container
      id="investigations"
      header={
        <Header
          variant="h2"
          actions={
            <SpaceBetween size="xs" direction="horizontal">
              <StatusIndicator type={isFallback ? 'warning' : 'success'}>
                {isFallback ? 'Demo data' : 'Live API'}
              </StatusIndicator>
              <Button
                iconName="refresh"
                onClick={onRefresh}
                loading={loading}
                disabled={loading}
              >
                Refresh
              </Button>
            </SpaceBetween>
          }
        >
          Investigations
        </Header>
      }
    >
      {flashItems.length ? <Flashbar items={flashItems} /> : null}
      <Table<InvestigationSummary>
        items={items}
        columnDefinitions={columnDefinitions}
        trackBy="investigationId"
        selectionType="single"
        selectedItems={selectedItems}
        onSelectionChange={(
          event: NonCancelableCustomEvent<
            TableProps.SelectionChangeDetail<InvestigationSummary>
          >,
        ) => {
          const next = event.detail.selectedItems[0];
          onSelect(next ? next.investigationId : null);
        }}
        loading={loading}
        loadingText="Loading investigations"
        empty={<Box padding="s">No investigations available.</Box>}
        resizableColumns
        stickyHeader
        wrapLines
      />
    </Container>
  );
};

type InvestigationDetailPanelProps = {
  investigationId: string | null;
  detail: InvestigationDetail | undefined;
  isLoading: boolean;
  error: Error | null;
  timeline: TimelineEvent[];
  timelineLoading: boolean;
  timelineError: Error | null;
  onRefresh: () => void;
  isFallback: boolean;
};

const InvestigationDetailPanel = ({
  investigationId,
  detail,
  isLoading,
  error,
  timeline,
  timelineLoading,
  timelineError,
  onRefresh,
  isFallback,
}: InvestigationDetailPanelProps) => {
  if (!investigationId) {
    return (
      <Container header={<Header variant="h2">Investigation detail</Header>}>
        <Box>Select an investigation from the table to view detail.</Box>
      </Container>
    );
  }

  if (!detail) {
    return (
      <Container header={<Header variant="h2">Investigation detail</Header>}>
        <StatusIndicator type="info">No detail available.</StatusIndicator>
      </Container>
    );
  }

  const riskLevel = (detail.riskLevel ?? detail.summary?.risk_level ?? 'unknown').toLowerCase();
  const recommendedActions = detail.summary?.recommended_actions ?? [];
  const confidence = detail.summary?.confidence;
  const timelineItems = timeline.length
    ? timeline
    : normalizeTimelineData(undefined, detail.summary?.timeline);

  const summaryTabContent = (
    <SpaceBetween size="s">
      {isLoading ? (
        <Spinner size="large" />
      ) : (
        <Box variant="p">{detail.summary?.summary ?? 'Summary not available.'}</Box>
      )}
      {typeof confidence === 'number' ? (
        <Badge color="blue">Confidence {Math.round(confidence * 100)}%</Badge>
      ) : null}
      {recommendedActions.length ? (
        <Table<RecommendedAction>
          columnDefinitions={[
            {
              id: 'action',
              header: 'Action',
              cell: (action) => action.action_id ?? '—',
            },
            {
              id: 'description',
              header: 'Description',
              cell: (action) => action.description ?? '—',
            },
            {
              id: 'rationale',
              header: 'Rationale',
              cell: (action) => action.rationale ?? '—',
            },
          ]}
          items={recommendedActions}
          trackBy="action_id"
          wrapLines
          resizableColumns
          stickyHeader={false}
          empty={<Box padding="s">No automated actions recommended.</Box>}
        />
      ) : (
        <StatusIndicator type="info">No automated actions recommended.</StatusIndicator>
      )}
    </SpaceBetween>
  );

  const timelineTabContent = timelineLoading ? (
    <Spinner size="large" />
  ) : timelineItems.length ? (
    <Table<TimelineEvent>
      items={timelineItems.map((item, index) => ({
        ...item,
        id: item.id || `${investigationId}-${index}`,
      }))}
      columnDefinitions={[
        {
          id: 'timestamp',
          header: 'Timestamp',
          cell: (item) => formatDateTime(item.timestamp),
        },
        {
          id: 'stage',
          header: 'Stage',
          cell: (item) => titleCase(item.stage),
        },
        {
          id: 'detail',
          header: 'Detail',
          cell: (item) => item.detail || '—',
        },
        {
          id: 'duration',
          header: 'Duration (s)',
          cell: (item) =>
            item.durationSeconds != null ? item.durationSeconds.toString() : '—',
        },
      ]}
      trackBy="id"
      wrapLines
      resizableColumns
      stickyHeader
      empty={<Box padding="s">No timeline events captured.</Box>}
    />
  ) : (
    <StatusIndicator type="info">No timeline events captured.</StatusIndicator>
  );

  const contextTabContent = (
    <Box padding="s">
      <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
        {JSON.stringify(detail.context ?? {}, null, 2)}
      </pre>
    </Box>
  );

  const detailFlashItems = [];
  if (error || isFallback) {
    detailFlashItems.push({
      type: 'warning' as const,
      id: 'detail-fallback',
      header: 'Detail powered by cached data',
      content:
        'The API detail endpoint was unavailable. Displaying the latest cached investigation detail.',
    });
  }
  if (timelineError) {
    detailFlashItems.push({
      type: 'warning' as const,
      id: 'timeline-fallback',
      header: 'Timeline fallback',
      content:
        'Timeline events are pulled from the investigation summary because the live timeline endpoint is unavailable.',
    });
  }

  return (
    <Container
      header={
        <Header
          variant="h2"
          actions={
            <Button
              iconName="refresh"
              onClick={onRefresh}
              disabled={isLoading || timelineLoading}
              loading={isLoading || timelineLoading}
            >
              Refresh detail
            </Button>
          }
        >
          Investigation detail
        </Header>
      }
    >
      {detailFlashItems.length ? <Flashbar items={detailFlashItems} /> : null}
      <SpaceBetween size="m">
        <ColumnLayout columns={3} variant="text-grid">
          <Box>
            <Box variant="awsui-key-label">Risk level</Box>
            <StatusIndicator
              type={riskIndicatorMap[riskLevel] ?? 'info'}
            >
              {titleCase(detail.riskLevel ?? detail.summary?.risk_level)}
            </StatusIndicator>
          </Box>
          <Box>
            <Box variant="awsui-key-label">Stage</Box>
            <StatusIndicator
              type={
                stageIndicatorMap[(detail.stage ?? '').toLowerCase()] ?? 'info'
              }
            >
              {titleCase(detail.stage)}
            </StatusIndicator>
          </Box>
          <Box>
            <Box variant="awsui-key-label">Tenant</Box>
            <Box variant="p">{detail.tenantId ?? '—'}</Box>
          </Box>
          <Box>
            <Box variant="awsui-key-label">Received</Box>
            <Box variant="p">{formatDateTime(detail.receivedAt)}</Box>
          </Box>
          <Box>
            <Box variant="awsui-key-label">Updated</Box>
            <Box variant="p">{formatDateTime(detail.updatedAt)}</Box>
          </Box>
        </ColumnLayout>
        <Tabs
          tabs={[
            { id: 'summary', label: 'Summary', content: summaryTabContent },
            { id: 'timeline', label: 'Timeline', content: timelineTabContent },
            { id: 'context', label: 'Context', content: contextTabContent },
          ]}
        />
      </SpaceBetween>
    </Container>
  );
};

export default function App() {
  const [navigationOpen, setNavigationOpen] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const investigationsQuery = useQuery<InvestigationSummary[], Error>({
    queryKey: ['investigations'],
    queryFn: fetchInvestigations,
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: 1,
  });

  const investigations: InvestigationSummary[] = investigationsQuery.isError
    ? FALLBACK_INVESTIGATIONS
    : investigationsQuery.data ?? [];
  const isInvestigationsFallback = investigationsQuery.isError;

  useEffect(() => {
    if (investigations.length === 0) {
      setSelectedId(null);
      return;
    }
    if (
      !selectedId ||
      !investigations.some(
        (item: InvestigationSummary) => item.investigationId === selectedId,
      )
    ) {
      setSelectedId(investigations[0].investigationId);
    }
  }, [investigations, selectedId]);

  const detailQuery = useQuery<InvestigationDetail, Error>({
    queryKey: ['investigation', selectedId],
    queryFn: () => fetchInvestigationDetail(selectedId!),
    enabled: Boolean(selectedId),
    staleTime: 30_000,
    retry: 1,
  });

  const timelineQuery = useQuery<TimelineEvent[], Error>({
    queryKey: ['investigation', 'timeline', selectedId],
    queryFn: () => fetchInvestigationTimeline(selectedId!),
    enabled: Boolean(selectedId),
    staleTime: 30_000,
    retry: 1,
  });

  const detailData: InvestigationDetail | undefined = selectedId
    ? detailQuery.data ?? FALLBACK_DETAILS[selectedId]
    : undefined;
  const isDetailFallback = detailQuery.isError || (!detailQuery.data && !!detailData);
  const timelineData: TimelineEvent[] = timelineQuery.data ?? [];

  const refreshAll = () => {
    investigationsQuery.refetch();
    if (selectedId) {
      detailQuery.refetch();
      timelineQuery.refetch();
    }
  };

  const navItems = useMemo<SideNavigationProps['items']>(() => {
    const totalBadge = (
      <Badge color="blue">{investigations.length}</Badge>
    );
    return [
      { type: 'link', text: 'Investigations', href: '#investigations', info: totalBadge },
      ...defaultNavItems.slice(1),
    ];
  }, [investigations.length]);

  const topNav = (
    <TopNavigation
      identity={{
        href: '#',
        title: 'NeoHarbourSecurity',
        logo: {
          src: 'https://d1.awsstatic.com/logos/aws/cloudscape-design-dark.0804b1c3457f219c8bf4.svg',
          alt: 'NeoHarbourSecurity logo',
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
          text: '',
          ariaLabel: 'User menu',
          iconSvg: <UserButton afterSignOutUrl="/" />,
        } as any,
      ]}
    />
  );

  const appLayoutAriaLabels = {
    navigation: 'Main navigation',
    navigationToggle: 'Open navigation',
    navigationClose: 'Close navigation',
    notifications: 'Notifications',
  };

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
              activeHref="#investigations"
              items={navItems}
              header={{ text: 'Neo SOC', href: '#' }}
            />
          }
          navigationOpen={navigationOpen}
          onNavigationChange={(event: NavigationChangeEvent) => setNavigationOpen(event.detail.open)}
          breadcrumbs={
            <BreadcrumbGroup
              items={[{ text: 'Home', href: '#' }, { text: 'Investigations', href: '#investigations' }]}
            />
          }
          content={
            <ContentLayout
              header={
                <Header
                  variant="h1"
                  actions={
                    <Button
                      iconName="refresh"
                      onClick={refreshAll}
                      loading={investigationsQuery.isFetching || detailQuery.isFetching || timelineQuery.isFetching}
                    >
                      Refresh all
                    </Button>
                  }
                >
                  SOC command overview
                </Header>
              }
            >
              <SpaceBetween size="l">
                <InvestigationMetrics
                  items={investigations}
                  isFallback={isInvestigationsFallback}
                />
                <InvestigationsTable
                  items={investigations}
                  loading={investigationsQuery.isFetching}
                  error={investigationsQuery.error ?? null}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  onRefresh={() => investigationsQuery.refetch()}
                  isFallback={isInvestigationsFallback}
                />
                <InvestigationDetailPanel
                  investigationId={selectedId}
                  detail={detailData}
                  isLoading={detailQuery.isFetching}
                  error={detailQuery.error ?? null}
                  timeline={timelineData}
                  timelineLoading={timelineQuery.isFetching}
                  timelineError={timelineQuery.error ?? null}
                  onRefresh={() => {
                    detailQuery.refetch();
                    timelineQuery.refetch();
                  }}
                  isFallback={isDetailFallback}
                />
              </SpaceBetween>
            </ContentLayout>
          }
        />
      </SignedIn>
    </>
  );
}
