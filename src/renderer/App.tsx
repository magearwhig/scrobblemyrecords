import React, { useCallback, useState, useEffect, useRef } from 'react';

import { AuthStatus } from '../shared/types';

import ErrorBoundary from './components/ErrorBoundary';
import Header from './components/Header';
import KeyboardShortcutsHelp from './components/KeyboardShortcutsHelp';
import MainContent from './components/MainContent';
import Sidebar from './components/Sidebar';
import SyncStatusBar from './components/SyncStatusBar';
import ToastContainer from './components/ToastContainer';
import { AppProvider } from './context/AppContext';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './context/ToastContext';
import { useJobPoller } from './hooks/useJobPoller';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { PHONE_MEDIA_QUERY, useMediaQuery } from './hooks/useMediaQuery';
import { DEFAULT_ROUTE, ROUTE_REDIRECTS, ROUTES, navigate } from './routes';
import { recordRouteVisit } from './utils/collectionViewSnapshot';

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
  const [helpOpen, setHelpOpen] = useState(false);
  // On phones the sidebar is a drawer, closed until the header menu opens it
  const isPhone = useMediaQuery(PHONE_MEDIA_QUERY);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  // Where focus goes once the drawer has closed (and the page is no longer
  // inert): the chosen page after navigating, the menu button after dismissing
  const focusAfterCloseRef = useRef<'content' | 'menu' | null>(null);
  const closeMobileNav = useCallback((reason: 'navigate' | 'dismiss') => {
    focusAfterCloseRef.current = reason === 'navigate' ? 'content' : 'menu';
    setMobileNavOpen(false);
  }, []);
  const contentRef = useRef<HTMLDivElement>(null);

  const handleFocusSearch = useCallback(() => {
    const searchInput = document.querySelector<HTMLInputElement>(
      'input[type="search"], input[placeholder*="earch"], input.search-input'
    );
    searchInput?.focus();
  }, []);

  const handleSync = useCallback(() => {
    navigate(ROUTES.SCROBBLE);
  }, []);

  const handleNewScrobble = useCallback(() => {
    navigate(ROUTES.SCROBBLE);
  }, []);

  const handleToggleHelp = useCallback(() => {
    setHelpOpen(prev => !prev);
  }, []);

  const handleCloseHelp = useCallback(() => {
    setHelpOpen(false);
  }, []);

  useKeyboardShortcuts({
    onFocusSearch: handleFocusSearch,
    onSync: handleSync,
    onNewScrobble: handleNewScrobble,
    onToggleHelp: handleToggleHelp,
    onCloseHelp: handleCloseHelp,
  });

  const handleSidebarCollapsedChange = (collapsed: boolean) => {
    setSidebarCollapsed(collapsed);
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
  };

  // Leaving phone width closes the drawer, so it isn't open next time
  useEffect(() => {
    if (!isPhone) setMobileNavOpen(false);
  }, [isPhone]);

  useEffect(() => {
    if (mobileNavOpen || !focusAfterCloseRef.current) return;
    const target = focusAfterCloseRef.current;
    focusAfterCloseRef.current = null;
    if (target === 'content') contentRef.current?.focus();
    else document.querySelector<HTMLElement>('.header-menu-toggle')?.focus();
  }, [mobileNavOpen]);

  // Runs after child effects, so a newly mounted page can still see the
  // previous route when it initializes.
  useEffect(() => {
    recordRouteVisit(currentPage);
  }, [currentPage]);

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
        navigate(newHash);
        return;
      }

      setCurrentPage(hash);
      // Any navigation, from the drawer or a link in the page, closes it
      setMobileNavOpen(false);
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
              <SyncStatusBar globalBar />
              <Header
                showMenuButton={isPhone}
                menuOpen={mobileNavOpen}
                onMenuToggle={() => setMobileNavOpen(open => !open)}
              />
              <div
                className={`main-content ${sidebarCollapsed && !isPhone ? 'sidebar-collapsed' : ''}`}
              >
                {isPhone && mobileNavOpen && (
                  <div
                    className='sidebar-backdrop'
                    onClick={() => closeMobileNav('dismiss')}
                    aria-hidden='true'
                  />
                )}
                <Sidebar
                  currentPage={currentPage}
                  onPageChange={setCurrentPage}
                  collapsed={sidebarCollapsed && !isPhone}
                  onCollapsedChange={handleSidebarCollapsedChange}
                  isPhone={isPhone}
                  mobileOpen={mobileNavOpen}
                  onMobileClose={closeMobileNav}
                />
                <div
                  className='content'
                  ref={contentRef}
                  tabIndex={-1}
                  // Behind an open drawer: keep keyboard focus out of the page
                  inert={isPhone && mobileNavOpen ? true : undefined}
                >
                  <ErrorBoundary>
                    <div key={currentPage} className='page-enter'>
                      <MainContent currentPage={currentPage} />
                    </div>
                  </ErrorBoundary>
                </div>
              </div>
              <ToastContainer />
              <KeyboardShortcutsHelp
                isOpen={helpOpen}
                onClose={handleCloseHelp}
              />
            </div>
          </ToastProvider>
        </AuthProvider>
      </AppProvider>
    </ThemeProvider>
  );
};

export default App;
