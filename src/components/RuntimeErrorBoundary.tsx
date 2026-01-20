import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';

type RuntimeErrorBoundaryProps = {
  children: ReactNode;
  onReset?: () => void;
};

type RuntimeErrorBoundaryState = {
  hasError: boolean;
  error?: Error;
};

export class RuntimeErrorBoundary extends Component<RuntimeErrorBoundaryProps, RuntimeErrorBoundaryState> {
  state: RuntimeErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(error: Error): RuntimeErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Runtime UI error:', error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined });
    this.props.onReset?.();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="p-6">
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2 text-white">
              <AlertTriangle className="h-5 w-5 text-orange-400" />
              <span>Runtime UI Error</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-slate-300">
            <p>
              The runtime interface encountered an unexpected error. You can reset the view or reload
              after checking connection settings.
            </p>
            {this.state.error && (
              <pre className="whitespace-pre-wrap rounded border border-slate-700 bg-slate-900/40 p-3 text-xs text-slate-400">
                {this.state.error.message}
              </pre>
            )}
            <div className="flex flex-wrap gap-2">
              <Button onClick={this.handleReset} className="bg-blue-600 hover:bg-blue-700">
                Reset View
              </Button>
              <Button
                variant="outline"
                className="border-slate-600 text-slate-200 hover:text-white hover:bg-slate-700/50"
                onClick={() => window.location.reload()}
              >
                Reload Page
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
}
