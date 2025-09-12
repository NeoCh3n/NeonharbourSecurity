import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import InvestigationDetailPage from './InvestigationDetail';
import { investigationsApi } from '../services/api';

// Mock the API
vi.mock('../services/api', () => ({
  investigationsApi: {
    getStatus: vi.fn(),
    getTimeline: vi.fn(),
    getReport: vi.fn(),
    addFeedback: vi.fn(),
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
    useNavigate: () => mockNavigate,
    useParams: () => ({ id: 'inv-123' })
  };
});

const mockStatus = {
  status: 'executing',
  progress: 65
};

const mockTimeline = [
  {
    id: 'step-1',
    name: 'Initial Analysis',
    agent: 'AnalysisAgent',
    status: 'complete',
    startedAt: '2024-01-01T10:00:00Z',
    completedAt: '2024-01-01T10:02:00Z',
    duration: 120000,
    retries: 0,
    output: { result: 'analysis complete' }
  },
  {
    id: 'step-2',
    name: 'Evidence Collection',
    agent: 'ExecutionAgent',
    status: 'running',
    startedAt: '2024-01-01T10:02:00Z',
    retries: 0
  }
];

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

describe('InvestigationDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (investigationsApi.getStatus as any).mockResolvedValue({ status: mockStatus });
    (investigationsApi.getTimeline as any).mockResolvedValue({ timeline: mockTimeline });
    (investigationsApi.getReport as any).mockResolvedValue(null);
  });

  it('renders investigation header with ID', async () => {
    renderWithProviders(<InvestigationDetailPage />);
    
    await waitFor(() => {
      expect(screen.getByText('Investigation inv-123')).toBeInTheDocument();
    });
  });

  it('displays investigation status and progress', async () => {
    renderWithProviders(<InvestigationDetailPage />);
    
    await waitFor(() => {
      expect(screen.getByText('Executing')).toBeInTheDocument();
      expect(screen.getByText('65%')).toBeInTheDocument();
    });
  });

  it('shows timeline steps with correct status', async () => {
    renderWithProviders(<InvestigationDetailPage />);
    
    await waitFor(() => {
      expect(screen.getByText('Initial Analysis')).toBeInTheDocument();
      expect(screen.getByText('Evidence Collection')).toBeInTheDocument();
      expect(screen.getByText('AnalysisAgent')).toBeInTheDocument();
      expect(screen.getByText('ExecutionAgent')).toBeInTheDocument();
    });
  });

  it('displays step duration for completed steps', async () => {
    renderWithProviders(<InvestigationDetailPage />);
    
    await waitFor(() => {
      expect(screen.getByText('2m 0s')).toBeInTheDocument();
    });
  });

  it('shows pause button for active investigation', async () => {
    renderWithProviders(<InvestigationDetailPage />);
    
    await waitFor(() => {
      const pauseButton = screen.getByText('Pause');
      expect(pauseButton).toBeInTheDocument();
    });
  });

  it('shows resume button for paused investigation', async () => {
    (investigationsApi.getStatus as any).mockResolvedValue({
      status: { ...mockStatus, status: 'paused' }
    });
    
    renderWithProviders(<InvestigationDetailPage />);
    
    await waitFor(() => {
      const resumeButton = screen.getByText('Resume');
      expect(resumeButton).toBeInTheDocument();
    });
  });

  it('opens feedback form when add feedback button is clicked', async () => {
    renderWithProviders(<InvestigationDetailPage />);
    
    await waitFor(() => {
      const feedbackButton = screen.getByText('Add Feedback');
      fireEvent.click(feedbackButton);
      
      expect(screen.getByText('Add Feedback')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Provide your feedback on the investigation...')).toBeInTheDocument();
    });
  });

  it('submits feedback correctly', async () => {
    (investigationsApi.addFeedback as any).mockResolvedValue({ success: true });
    
    renderWithProviders(<InvestigationDetailPage />);
    
    await waitFor(() => {
      const feedbackButton = screen.getByText('Add Feedback');
      fireEvent.click(feedbackButton);
    });
    
    const textarea = screen.getByPlaceholderText('Provide your feedback on the investigation...');
    fireEvent.change(textarea, { target: { value: 'Great investigation!' } });
    
    const submitButton = screen.getByText('Submit Feedback');
    fireEvent.click(submitButton);
    
    await waitFor(() => {
      expect(investigationsApi.addFeedback).toHaveBeenCalledWith('inv-123', {
        type: 'general',
        content: {
          message: 'Great investigation!',
          stepId: null,
          timestamp: expect.any(String)
        }
      });
    });
  });

  it('expands step details when clicked', async () => {
    renderWithProviders(<InvestigationDetailPage />);
    
    await waitFor(() => {
      const stepCard = screen.getByText('Initial Analysis').closest('div');
      fireEvent.click(stepCard!);
      
      expect(screen.getByText('Step Output:')).toBeInTheDocument();
    });
  });

  it('pauses investigation when pause button is clicked', async () => {
    (investigationsApi.pause as any).mockResolvedValue({ success: true });
    
    renderWithProviders(<InvestigationDetailPage />);
    
    await waitFor(() => {
      const pauseButton = screen.getByText('Pause');
      fireEvent.click(pauseButton);
    });
    
    expect(investigationsApi.pause).toHaveBeenCalledWith('inv-123');
  });

  it('resumes investigation when resume button is clicked', async () => {
    (investigationsApi.getStatus as any).mockResolvedValue({
      status: { ...mockStatus, status: 'paused' }
    });
    (investigationsApi.resume as any).mockResolvedValue({ success: true });
    
    renderWithProviders(<InvestigationDetailPage />);
    
    await waitFor(() => {
      const resumeButton = screen.getByText('Resume');
      fireEvent.click(resumeButton);
    });
    
    expect(investigationsApi.resume).toHaveBeenCalledWith('inv-123');
  });

  it('navigates back to investigations list', async () => {
    renderWithProviders(<InvestigationDetailPage />);
    
    await waitFor(() => {
      const backButton = screen.getByText('← Back to Investigations');
      fireEvent.click(backButton);
    });
    
    expect(mockNavigate).toHaveBeenCalledWith('/investigations');
  });

  it('shows step progress indicators correctly', async () => {
    renderWithProviders(<InvestigationDetailPage />);
    
    await waitFor(() => {
      // Check for step status indicators (✓ for complete, ⟳ for running)
      const completeSteps = screen.getAllByText('✓');
      const runningSteps = screen.getAllByText('⟳');
      
      expect(completeSteps).toHaveLength(1);
      expect(runningSteps).toHaveLength(1);
    });
  });
});