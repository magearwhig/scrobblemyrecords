import React from 'react';

import { createLogger } from '../utils/logger';

import { Button } from './ui/Button';

const log = createLogger('ErrorBoundary');

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    log.error('Unhandled render error', {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    });
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className='error-boundary'>
          <div className='error-boundary-content'>
            <h2 className='error-boundary-title'>Something went wrong</h2>
            <p className='error-boundary-message'>
              An unexpected error occurred. You can try again or reload the
              page.
            </p>
            {this.state.error && (
              <pre className='error-boundary-details'>
                {this.state.error.message}
              </pre>
            )}
            <div className='error-boundary-actions'>
              <Button onClick={this.handleRetry}>Try Again</Button>
              <Button
                variant='secondary'
                onClick={() => window.location.reload()}
              >
                Reload Page
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
