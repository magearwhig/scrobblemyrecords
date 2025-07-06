import React, { createContext, useContext, useReducer, ReactNode, useEffect } from 'react';
import { AppState } from '../../shared/types';

interface AppAction {
  type: 'SET_LOADING' | 'SET_ERROR' | 'SET_SERVER_URL' | 'CLEAR_ERROR';
  payload?: any;
}

const initialState: AppState = {
  loading: false,
  error: null,
  serverUrl: 'http://localhost:3001'
};

const AppContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
} | undefined>(undefined);

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload, loading: false };
    case 'CLEAR_ERROR':
      return { ...state, error: null };
    case 'SET_SERVER_URL':
      return { ...state, serverUrl: action.payload };
    default:
      return state;
  }
}

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(appReducer, initialState);

  useEffect(() => {
    // For web app, server URL is fixed to localhost:3001
    dispatch({ type: 'SET_SERVER_URL', payload: 'http://localhost:3001' });
  }, []);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};