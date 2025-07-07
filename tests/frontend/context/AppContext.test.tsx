import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { AppProvider, useApp } from '../../../src/renderer/context/AppContext';
import { AppState } from '../../../src/shared/types';

const TestComponent: React.FC = () => {
  const { state, dispatch } = useApp();
  
  return (
    <div>
      <div data-testid="loading">{state.loading.toString()}</div>
      <div data-testid="error">{state.error || 'no-error'}</div>
      <div data-testid="server-url">{state.serverUrl}</div>
      
      <button onClick={() => dispatch({ type: 'SET_LOADING', payload: true })}>
        Set Loading
      </button>
      <button onClick={() => dispatch({ type: 'SET_ERROR', payload: 'Test error' })}>
        Set Error
      </button>
      <button onClick={() => dispatch({ type: 'CLEAR_ERROR' })}>
        Clear Error
      </button>
      <button onClick={() => dispatch({ type: 'SET_SERVER_URL', payload: 'http://localhost:4000' })}>
        Set Server URL
      </button>
    </div>
  );
};

describe('AppContext', () => {
  it('provides initial state correctly', () => {
    render(
      <AppProvider>
        <TestComponent />
      </AppProvider>
    );

    expect(screen.getByTestId('loading')).toHaveTextContent('false');
    expect(screen.getByTestId('error')).toHaveTextContent('no-error');
    expect(screen.getByTestId('server-url')).toHaveTextContent('http://localhost:3001');
  });

  it('handles SET_LOADING action', () => {
    render(
      <AppProvider>
        <TestComponent />
      </AppProvider>
    );

    const setLoadingButton = screen.getByText('Set Loading');
    
    act(() => {
      setLoadingButton.click();
    });

    expect(screen.getByTestId('loading')).toHaveTextContent('true');
  });

  it('handles SET_ERROR action', () => {
    render(
      <AppProvider>
        <TestComponent />
      </AppProvider>
    );

    const setErrorButton = screen.getByText('Set Error');
    
    act(() => {
      setErrorButton.click();
    });

    expect(screen.getByTestId('error')).toHaveTextContent('Test error');
    expect(screen.getByTestId('loading')).toHaveTextContent('false'); // SET_ERROR also sets loading to false
  });

  it('handles CLEAR_ERROR action', () => {
    render(
      <AppProvider>
        <TestComponent />
      </AppProvider>
    );

    const setErrorButton = screen.getByText('Set Error');
    const clearErrorButton = screen.getByText('Clear Error');
    
    // First set an error
    act(() => {
      setErrorButton.click();
    });
    expect(screen.getByTestId('error')).toHaveTextContent('Test error');

    // Then clear it
    act(() => {
      clearErrorButton.click();
    });
    expect(screen.getByTestId('error')).toHaveTextContent('no-error');
  });

  it('handles SET_SERVER_URL action', () => {
    render(
      <AppProvider>
        <TestComponent />
      </AppProvider>
    );

    const setServerUrlButton = screen.getByText('Set Server URL');
    
    act(() => {
      setServerUrlButton.click();
    });

    expect(screen.getByTestId('server-url')).toHaveTextContent('http://localhost:4000');
  });

  it('throws error when useApp is used outside provider', () => {
    const TestComponentWithoutProvider = () => {
      useApp();
      return <div>Test</div>;
    };

    // Suppress console.error for this test since we expect an error
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      render(<TestComponentWithoutProvider />);
    }).toThrow('useApp must be used within an AppProvider');

    consoleSpy.mockRestore();
  });

  it('sets server URL on mount via useEffect', () => {
    render(
      <AppProvider>
        <TestComponent />
      </AppProvider>
    );

    // The useEffect should set the server URL to localhost:3001
    expect(screen.getByTestId('server-url')).toHaveTextContent('http://localhost:3001');
  });

  it('handles unknown action type gracefully', () => {
    const TestComponentWithInvalidAction: React.FC = () => {
      const { state, dispatch } = useApp();
      
      return (
        <div>
          <div data-testid="loading">{state.loading.toString()}</div>
          <button onClick={() => dispatch({ type: 'UNKNOWN_ACTION' as any })}>
            Unknown Action
          </button>
        </div>
      );
    };

    render(
      <AppProvider>
        <TestComponentWithInvalidAction />
      </AppProvider>
    );

    const initialLoading = screen.getByTestId('loading').textContent;
    
    const unknownActionButton = screen.getByText('Unknown Action');
    
    act(() => {
      unknownActionButton.click();
    });

    // State should remain unchanged for unknown actions
    expect(screen.getByTestId('loading')).toHaveTextContent(initialLoading!);
  });

  it('maintains state immutability', () => {
    let capturedStates: AppState[] = [];
    
    const TestComponentForImmutability: React.FC = () => {
      const { state, dispatch } = useApp();
      
      // Capture state reference on each render
      React.useEffect(() => {
        capturedStates.push(state);
      });
      
      return (
        <div>
          <button onClick={() => dispatch({ type: 'SET_LOADING', payload: true })}>
            Set Loading
          </button>
        </div>
      );
    };

    render(
      <AppProvider>
        <TestComponentForImmutability />
      </AppProvider>
    );

    const setLoadingButton = screen.getByText('Set Loading');
    
    act(() => {
      setLoadingButton.click();
    });

    // Should have at least 2 states captured (initial and after action)
    expect(capturedStates.length).toBeGreaterThanOrEqual(2);
    
    // States should be different objects (immutability)
    if (capturedStates.length >= 2) {
      expect(capturedStates[0]).not.toBe(capturedStates[capturedStates.length - 1]);
    }
  });
});