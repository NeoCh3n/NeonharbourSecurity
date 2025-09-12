import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import InvestigationCard from './InvestigationCard';

const mockInvestigation = {
  id: 'inv-123',
  alert_id: 456,
  status: 'executing' as const,
  priority: 2,
  created_at: '2024-01-01T10:00:00Z',
  completed_at: null,
  alert_summary: 'Suspicious network activity detected',
  alert_severity: 'high'
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

describe('InvestigationCard', () => {
  it('renders investigation information correctly', () => {
    const onView = vi.fn();
    const onPause = vi.fn();
    const onResume = vi.fn();

    renderWithProviders(
      <InvestigationCard
        investigation={mockInvestigation}
        onView={onView}
        onPause={onPause}
        onResume={onResume}
      />
    );

    expect(screen.getByText('inv-123')).toBeInTheDocument();
    expect(screen.getByText(/Alert #/)).toBeInTheDocument();
    expect(screen.getByText('Suspicious network activity detected')).toBeInTheDocument();
    expect(screen.getByText('Executing')).toBeInTheDocument();
    expect(screen.getAllByText('High')).toHaveLength(2); // Priority and severity
  });

  it('shows pause button for active investigations', () => {
    const onView = vi.fn();
    const onPause = vi.fn();
    const onResume = vi.fn();

    renderWithProviders(
      <InvestigationCard
        investigation={mockInvestigation}
        onView={onView}
        onPause={onPause}
        onResume={onResume}
      />
    );

    const pauseButton = screen.getByText('Pause');
    expect(pauseButton).toBeInTheDocument();
    
    fireEvent.click(pauseButton);
    expect(onPause).toHaveBeenCalledWith('inv-123');
  });

  it('shows resume button for paused investigations', () => {
    const pausedInvestigation = { ...mockInvestigation, status: 'paused' as const };
    const onView = vi.fn();
    const onPause = vi.fn();
    const onResume = vi.fn();

    renderWithProviders(
      <InvestigationCard
        investigation={pausedInvestigation}
        onView={onView}
        onPause={onPause}
        onResume={onResume}
      />
    );

    const resumeButton = screen.getByText('Resume');
    expect(resumeButton).toBeInTheDocument();
    
    fireEvent.click(resumeButton);
    expect(onResume).toHaveBeenCalledWith('inv-123');
  });

  it('calls onView when view button is clicked', () => {
    const onView = vi.fn();
    const onPause = vi.fn();
    const onResume = vi.fn();

    renderWithProviders(
      <InvestigationCard
        investigation={mockInvestigation}
        onView={onView}
        onPause={onPause}
        onResume={onResume}
      />
    );

    const viewButton = screen.getByText('View');
    fireEvent.click(viewButton);
    expect(onView).toHaveBeenCalledWith('inv-123');
  });

  it('displays duration correctly for completed investigations', () => {
    const completedInvestigation = {
      ...mockInvestigation,
      status: 'complete' as const,
      completed_at: '2024-01-01T10:05:30Z'
    };
    const onView = vi.fn();
    const onPause = vi.fn();
    const onResume = vi.fn();

    renderWithProviders(
      <InvestigationCard
        investigation={completedInvestigation}
        onView={onView}
        onPause={onPause}
        onResume={onResume}
      />
    );

    expect(screen.getByText('5m 30s')).toBeInTheDocument();
  });

  it('displays running time for active investigations', () => {
    const onView = vi.fn();
    const onPause = vi.fn();
    const onResume = vi.fn();

    renderWithProviders(
      <InvestigationCard
        investigation={mockInvestigation}
        onView={onView}
        onPause={onPause}
        onResume={onResume}
      />
    );

    // Should show some running time (will vary based on current time)
    expect(screen.getByText(/\d+m \(running\)/)).toBeInTheDocument();
  });
});