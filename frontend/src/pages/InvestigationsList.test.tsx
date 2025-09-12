import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import InvestigationsListPage from './InvestigationsList';
import { investigationsApi } from '../services/api';

// Mock the API
vi.mock('../services/api', () => ({
  investigationsApi: {
    list: vi.fn(),
    getStats: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn()
  }
}));

// Mock react-router-dom
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate
  };
});

const mockInvestigations = [
  {
    id: 'inv-1',
    alert_id: 123,
    status: 'executing',
    priority: 2,
    created_at: '2024-01-01T10:00:00Z',
    alert_summary: 'Test alert 1',
    alert_severity: 'high'
  },
  {
    id: 'inv-2',
    alert_id: 124,
    status: 'complete',
    priority: 3,
    created_at: '2024-01-01T09:00:00Z',
    completed_at: '2024-01-01T09:05:00Z',
    alert_summary: 'Test alert 2',
    alert_severity: 'medium'
  }
];

const mockStats = {
  totalInvestigations: 10,
  activeInvestigations: 3,
  successRate: 85,
  averageDurationMinutes: 8
};

const renderWithProviders = (component: React.ReactElement) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        {component}
      </BrowserRouter>
    </QueryClientProvider>
  );
};

describe('InvestigationsListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (investigationsApi.list as any).mockResolvedValue({
      investigations: mockInvestigations,
      total: 2,
      hasMore: false
    });
    (investigationsApi.getStats as any).mockResolvedValue({
      summary: mockStats
    });
  });

  it('renders the page title and description', async () => {
    renderWithProviders(<InvestigationsListPage />);
    
    expect(screen.getByText('AI Investigations')).toBeInTheDocument();
    expect(screen.getByText('Monitor and manage autonomous security investigations')).toBeInTheDocument();
  });

  it('displays investigation statistics', async () => {
    renderWithProviders(<InvestigationsListPage />);
    
    await waitFor(() => {
      expect(screen.getByText('10')).toBeInTheDocument(); // Total investigations
      expect(screen.getByText('3')).toBeInTheDocument(); // Active investigations
      expect(screen.getByText('85%')).toBeInTheDocument(); // Success rate
      expect(screen.getByText('8m')).toBeInTheDocument(); // Average duration
    });
  });

  it('displays investigations in the table', async () => {
    renderWithProviders(<InvestigationsListPage />);
    
    await waitFor(() => {
      expect(screen.getByText('inv-1')).toBeInTheDocument();
      expect(screen.getByText('inv-2')).toBeInTheDocument();
      expect(screen.getByText('#123')).toBeInTheDocument();
      expect(screen.getByText('#124')).toBeInTheDocument();
    });
  });

  it('filters investigations by status', async () => {
    renderWithProviders(<InvestigationsListPage />);
    
    const statusSelect = screen.getByDisplayValue('All');
    fireEvent.change(statusSelect, { target: { value: 'executing' } });
    
    await waitFor(() => {
      expect(investigationsApi.list).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'executing' })
      );
    });
  });

  it('filters investigations by priority', async () => {
    renderWithProviders(<InvestigationsListPage />);
    
    const prioritySelect = screen.getAllByDisplayValue('All')[1]; // Second "All" select is for priority
    fireEvent.change(prioritySelect, { target: { value: '2' } });
    
    await waitFor(() => {
      expect(investigationsApi.list).toHaveBeenCalledWith(
        expect.objectContaining({ priority: 2 })
      );
    });
  });

  it('navigates to investigation detail when view button is clicked', async () => {
    renderWithProviders(<InvestigationsListPage />);
    
    await waitFor(() => {
      const viewButtons = screen.getAllByText('View');
      fireEvent.click(viewButtons[0]);
      expect(mockNavigate).toHaveBeenCalledWith('/investigations/inv-1');
    });
  });

  it('pauses an active investigation', async () => {
    (investigationsApi.pause as any).mockResolvedValue({ success: true });
    
    renderWithProviders(<InvestigationsListPage />);
    
    await waitFor(() => {
      const pauseButton = screen.getByText('Pause');
      fireEvent.click(pauseButton);
    });
    
    expect(investigationsApi.pause).toHaveBeenCalledWith('inv-1');
  });

  it('handles pagination correctly', async () => {
    (investigationsApi.list as any).mockResolvedValue({
      investigations: mockInvestigations,
      total: 100,
      hasMore: true
    });
    
    renderWithProviders(<InvestigationsListPage />);
    
    await waitFor(() => {
      expect(screen.getByText('Showing 1-50 of 100')).toBeInTheDocument();
      expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
    });
    
    const nextButton = screen.getByText('Next');
    expect(nextButton).not.toBeDisabled();
    
    const prevButton = screen.getByText('Previous');
    expect(prevButton).toBeDisabled();
  });

  it('shows auto-refresh indicator', async () => {
    renderWithProviders(<InvestigationsListPage />);
    
    await waitFor(() => {
      expect(screen.getByText('Auto-refresh: 5s')).toBeInTheDocument();
    });
  });

  it('navigates to metrics page', async () => {
    renderWithProviders(<InvestigationsListPage />);
    
    const metricsButton = screen.getByText('View Metrics');
    fireEvent.click(metricsButton);
    
    expect(mockNavigate).toHaveBeenCalledWith('/investigations/metrics');
  });
});