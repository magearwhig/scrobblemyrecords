import React, { createContext, useContext, ReactNode } from 'react';
import { AuthStatus } from '../../shared/types';

interface AuthContextType {
  authStatus: AuthStatus;
  setAuthStatus: (status: AuthStatus) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ 
  children: ReactNode; 
  value: AuthContextType;
}> = ({ children, value }) => {
  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};