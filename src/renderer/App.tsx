import React, { useState, useEffect } from 'react';
import { AppProvider } from './context/AppContext';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import MainContent from './components/MainContent';
import { AuthStatus } from '../shared/types';

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<string>('home');
  const [authStatus, setAuthStatus] = useState<AuthStatus>({
    discogs: { authenticated: false },
    lastfm: { authenticated: false }
  });

  useEffect(() => {
    // Handle hash-based routing
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '') || 'home';
      setCurrentPage(hash);
    };

    // Set initial page based on hash
    handleHashChange();

    // Listen for hash changes
    window.addEventListener('hashchange', handleHashChange);

    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []);

  return (
    <ThemeProvider>
      <AppProvider>
        <AuthProvider value={{ authStatus, setAuthStatus }}>
          <div className="app">
            <Header />
            <div className="main-content">
              <Sidebar currentPage={currentPage} onPageChange={setCurrentPage} />
              <div className="content">
                <MainContent currentPage={currentPage} />
              </div>
            </div>
          </div>
        </AuthProvider>
      </AppProvider>
    </ThemeProvider>
  );
};

export default App;