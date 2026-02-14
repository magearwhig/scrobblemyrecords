import React, { useState, useEffect } from 'react';

import { AuthStatus } from '../shared/types';

import ErrorBoundary from './components/ErrorBoundary';
import Header from './components/Header';
import MainContent from './components/MainContent';
import Sidebar from './components/Sidebar';
import ToastContainer from './components/ToastContainer';
import { AppProvider } from './context/AppContext';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import { useJobPoller } from './hooks/useJobPoller';
import { DEFAULT_ROUTE, ROUTE_REDIRECTS } from './routes';

const JobPollerSetup: React.FC = () => {
  useJobPoller();
  return null;
};

const SIDEBAR_COLLAPSED_KEY = 'sidebar-collapsed';

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<string>(DEFAULT_ROUTE);
  const [authStatus, setAuthStatus] = useState<AuthStatus>({
    discogs: { authenticated: false },
    lastfm: { authenticated: false },
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    return saved === 'true';
  });

  const handleSidebarCollapsedChange = (collapsed: boolean) => {
    setSidebarCollapsed(collapsed);
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
  };

  useEffect(() => {
    // Handle hash-based routing
    const handleHashChange = () => {
      const fullHash = window.location.hash.replace('#', '') || DEFAULT_ROUTE;
      // Extract page name before any query params (e.g., 'marketplace?tab=sellers' -> 'marketplace')
      const hash = fullHash.split('?')[0];
      const queryPart = fullHash.includes('?') ? fullHash.split('?')[1] : '';

      // Redirect legacy routes to consolidated pages
      const redirect = ROUTE_REDIRECTS[hash];
      if (redirect) {
        // Preserve any extra query params from the original URL
        const redirectBase = redirect.split('?')[0];
        const redirectParams = redirect.includes('?')
          ? redirect.split('?')[1]
          : '';
        const merged = new URLSearchParams(redirectParams);
        if (queryPart) {
          const original = new URLSearchParams(queryPart);
          original.forEach((value, key) => {
            if (!merged.has(key)) merged.set(key, value);
          });
        }
        const newHash = merged.toString()
          ? `${redirectBase}?${merged.toString()}`
          : redirectBase;
        window.location.hash = newHash;
        return;
      }

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
          <ToastProvider>
            <JobPollerSetup />
            <div className='app'>
              <Header />
              <div
                className={`main-content ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}
              >
                <Sidebar
                  currentPage={currentPage}
                  onPageChange={setCurrentPage}
                  collapsed={sidebarCollapsed}
                  onCollapsedChange={handleSidebarCollapsedChange}
                />
                <div className='content'>
                  <ErrorBoundary>
                    <MainContent currentPage={currentPage} />
                  </ErrorBoundary>
                </div>
              </div>
              <ToastContainer />
            </div>
          </ToastProvider>
        </AuthProvider>
      </AppProvider>
    </ThemeProvider>
  );
};

export default App;
