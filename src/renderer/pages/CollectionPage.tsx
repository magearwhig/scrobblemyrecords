import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useApp } from '../context/AppContext';
import { getApiService } from '../services/api';
import { CollectionItem, DiscogsRelease } from '../../shared/types';
import AlbumCard from '../components/AlbumCard';
import SearchBar from '../components/SearchBar';

const CollectionPage: React.FC = () => {
  const { authStatus, setAuthStatus } = useAuth();
  const { state, dispatch } = useApp();
  const [entireCollection, setEntireCollection] = useState<CollectionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [preloading, setPreloading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredCollection, setFilteredCollection] = useState<CollectionItem[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [searchPage, setSearchPage] = useState(1);
  const [searchTotalPages, setSearchTotalPages] = useState(1);
  const [searchTotal, setSearchTotal] = useState(0);
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [selectedAlbums, setSelectedAlbums] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string>('');
  const [cacheProgress, setCacheProgress] = useState<any>(null);
  const [sortBy, setSortBy] = useState<'artist' | 'title' | 'year' | 'date_added'>('artist');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [usingCache, setUsingCache] = useState<boolean>(false);
  const [authChecked, setAuthChecked] = useState<boolean>(false);

  const api = getApiService(state.serverUrl);
  const itemsPerPage = 50;

  useEffect(() => {
    console.log('🔍 useEffect triggered:', { 
      authenticated: authStatus.discogs.authenticated, 
      username: authStatus.discogs.username
    });
    
    if (authStatus.discogs.authenticated && authStatus.discogs.username) {
      console.log('✅ Starting collection load...');
      loadCollection();
      // Start preloading in background
      startPreloadingCollection();
      // Start monitoring cache progress
      startCacheProgressMonitoring();
    } else if (!authChecked) {
      console.log('❌ Not authenticated or no username - checking auth status...');
      checkAuthStatus();
    }
  }, [authStatus.discogs.authenticated, authStatus.discogs.username]);

  const checkAuthStatus = async () => {
    try {
      console.log('🔐 Checking authentication status...');
      setAuthChecked(true);
      const status = await api.getAuthStatus();
      console.log('📡 Auth status response:', status);
      setAuthStatus(status);
    } catch (error) {
      console.error('💥 Error checking auth status:', error);
    }
  };

  useEffect(() => {
    if (isSearchMode && searchQuery.trim()) {
      console.log('🔍 Search useEffect triggered:', { searchQuery, searchPage, sortBy, sortOrder });
      performSearch(searchQuery, searchPage);
    }
  }, [searchPage, sortBy, sortOrder]);

  useEffect(() => {
    console.log('🔄 Search mode changed:', { isSearchMode, searchQuery: searchQuery.trim() });
    if (!isSearchMode && searchQuery.trim() === '') {
      // When exiting search mode, let the sorting useEffect handle the collection
      console.log('🔄 Exiting search mode, collection will be re-sorted');
    }
  }, [isSearchMode, searchQuery]);

  useEffect(() => {
    console.log('🔄 Sorting useEffect triggered:', { 
      collectionLength: entireCollection.length, 
      isSearchMode, 
      sortBy, 
      sortOrder 
    });
    
    // Only use local filtering if not in search mode
    if (!isSearchMode && entireCollection.length > 0) {
      const sorted = sortCollection(entireCollection);
      console.log(`📊 Setting filtered collection: ${sorted.length} items (original: ${entireCollection.length})`);
      console.log('📋 First few items:', sorted.slice(0, 3).map(item => `${item.release.artist} - ${item.release.title}`));
      setFilteredCollection(sorted);
    } else if (!isSearchMode && entireCollection.length === 0) {
      console.log('📭 Collection is empty, clearing filtered collection');
      setFilteredCollection([]);
    }
  }, [entireCollection.length, isSearchMode, sortBy, sortOrder]);

  const loadCollection = async (forceReload: boolean = false) => {
    if (!authStatus.discogs.username) {
      console.log('❌ No username available for collection loading');
      return;
    }

    console.log(`🔄 Loading entire collection for ${authStatus.discogs.username}, forceReload: ${forceReload}`);
    setLoading(true);
    setError('');

    try {
      const startTime = Date.now();
      const response = await api.getEntireCollection(
        authStatus.discogs.username,
        forceReload
      );

      console.log('📡 API Response:', response);

      if (response.success && response.data) {
        console.log(`📦 Setting entire collection data: ${response.data.length} items`);
        console.log('📋 Sample items:', response.data.slice(0, 2).map(item => ({
          id: item.id,
          artist: item.release.artist,
          title: item.release.title,
          year: item.release.year
        })));
        setEntireCollection(response.data);
        
        // Calculate total pages based on items per page
        const totalPages = Math.ceil(response.data.length / itemsPerPage);
        setTotalPages(totalPages);
        console.log(`📄 Total pages: ${totalPages} (${response.data.length} items, ${itemsPerPage} per page)`);
        
        // Check if we used cache based on response time (cache should be much faster)
        const responseTime = Date.now() - startTime;
        const wasFromCache = responseTime < 100; // Cache responses should be under 100ms
        setUsingCache(wasFromCache);
        
        if (wasFromCache) {
          console.log(`✅ Loaded entire collection from cache (${responseTime}ms)`);
        } else {
          console.log(`🌐 Loaded entire collection from API (${responseTime}ms)`);
        }

        // Check if we have a complete cache
        if (response.data.length < 100) { // Likely incomplete cache
          console.log('⚠️ Collection appears incomplete, starting background preloading');
          startPreloadingCollection();
        }
      } else {
        console.log('❌ API response not successful:', response);
        setError('Failed to load collection');
      }
    } catch (error) {
      console.error('💥 Error loading collection:', error);
      setError(error instanceof Error ? error.message : 'Failed to load collection');
    } finally {
      setLoading(false);
    }
  };

  const startPreloadingCollection = async () => {
    if (!authStatus.discogs.username || preloading) return;

    // Check if we already have a recent cache before starting preloading
    try {
      const progress = await api.getCacheProgress(authStatus.discogs.username);
      if (progress && progress.status === 'completed') {
        console.log('Collection already cached, skipping preload');
        return;
      }
    } catch (error) {
      console.error('Error checking cache progress:', error);
    }

    setPreloading(true);
    try {
      await api.preloadCollection(authStatus.discogs.username);
      console.log('Collection preloading started');
    } catch (error) {
      console.error('Failed to start preloading:', error);
    } finally {
      setPreloading(false);
    }
  };

  const performSearch = async (query: string, page: number = 1) => {
    if (!authStatus.discogs.username) return;

    setLoading(true);
    setError('');
    
    try {
      const results = await api.searchCollectionPaginated(authStatus.discogs.username, query, page, itemsPerPage);
      console.log(`🔍 Search results: ${results.items.length} items found`);
      // Apply sorting to search results
      const sortedResults = sortCollection(results.items);
      setFilteredCollection(sortedResults);
      setSearchTotalPages(results.totalPages);
      setSearchTotal(results.total);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (query: string) => {
    if (!authStatus.discogs.username) return;

    setSearchQuery(query);
    
    if (query.trim()) {
      setIsSearchMode(true);
      setSearchPage(1);
      await performSearch(query, 1);
    } else {
      setIsSearchMode(false);
      // Don't set filteredCollection directly - let the useEffect handle it
      console.log('🔍 Search cleared, switching back to normal mode');
    }
  };

  const handleAlbumSelect = (releaseId: number) => {
    const newSelected = new Set(selectedAlbums);
    if (newSelected.has(releaseId)) {
      newSelected.delete(releaseId);
    } else {
      newSelected.add(releaseId);
    }
    setSelectedAlbums(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedAlbums.size === filteredCollection.length) {
      setSelectedAlbums(new Set());
    } else {
      setSelectedAlbums(new Set(filteredCollection.map(item => item.release.id)));
    }
  };

  const handleForceReloadCache = async () => {
    setLoading(true);
    try {
      await loadCollection(true); // Force reload from API
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to force reload cache');
    } finally {
      setLoading(false);
    }
  };

  const handleClearCache = async () => {
    setLoading(true);
    try {
      await api.clearCollectionCache();
      await loadCollection();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to clear cache');
    } finally {
      setLoading(false);
    }
  };

  const startCacheProgressMonitoring = async () => {
    if (!authStatus.discogs.username) return;

    const monitorProgress = async () => {
      try {
        const progress = await api.getCacheProgress(authStatus.discogs.username!);
        setCacheProgress(progress);
        
        // Continue monitoring if still loading
        if (progress && progress.status === 'loading') {
          setTimeout(monitorProgress, 2000); // Check every 2 seconds
        } else if (progress && progress.status === 'completed') {
          console.log('Cache monitoring completed');
          // Reload collection after cache completion
          await loadCollection();
        }
      } catch (error) {
        console.error('Error monitoring cache progress:', error);
      }
    };

    monitorProgress();
  };

  const sortCollection = (items: CollectionItem[]): CollectionItem[] => {
    console.log(`🔀 Sorting ${items.length} items by ${sortBy} (${sortOrder})`);
    const sorted = [...items].sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortBy) {
        case 'artist':
          aValue = a.release.artist || '';
          bValue = b.release.artist || '';
          break;
        case 'title':
          aValue = a.release.title || '';
          bValue = b.release.title || '';
          break;
        case 'year':
          aValue = a.release.year || 0;
          bValue = b.release.year || 0;
          break;
        case 'date_added':
          aValue = new Date(a.date_added || '').getTime();
          bValue = new Date(b.date_added || '').getTime();
          break;
        default:
          aValue = a.release.artist || '';
          bValue = b.release.artist || '';
      }

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        aValue = aValue.toLowerCase();
        bValue = bValue.toLowerCase();
      }

      if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
    console.log(`✅ Sorted ${sorted.length} items successfully`);
    return sorted;
  };

  // Get current page of items from the sorted collection
  const getCurrentPageItems = (): CollectionItem[] => {
    if (isSearchMode) {
      return filteredCollection;
    }
    
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredCollection.slice(startIndex, endIndex);
  };

  if (!authStatus.discogs.authenticated) {
    return (
      <div className="card">
        <h2>Browse Collection</h2>
        <p>Please authenticate with Discogs first to browse your collection.</p>
        <div style={{ marginTop: '1rem' }}>
          <a href="#" onClick={() => window.location.hash = '#setup'} className="btn">
            Go to Setup
          </a>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2>Browse Collection</h2>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              {selectedAlbums.size} selected
            </span>
            {preloading && (
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Preloading collection...
              </span>
            )}
            {cacheProgress && cacheProgress.status === 'loading' && (
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.5rem',
                fontSize: '0.8rem',
                color: 'var(--text-secondary)',
                padding: '0.25rem 0.5rem',
                backgroundColor: 'var(--bg-tertiary)',
                borderRadius: '4px'
              }}>
                <div className="spinner" style={{ width: '12px', height: '12px' }}></div>
                Caching: {cacheProgress.currentPage}/{cacheProgress.totalPages} pages
                ({Math.round((cacheProgress.currentPage / cacheProgress.totalPages) * 100)}%)
              </div>
            )}
            {cacheProgress && cacheProgress.status === 'completed' && (
              <div style={{ 
                fontSize: '0.8rem',
                color: 'var(--success-color)',
                padding: '0.25rem 0.5rem',
                backgroundColor: 'var(--bg-tertiary)',
                borderRadius: '4px'
              }}>
                ✓ Cache complete ({cacheProgress.totalPages} pages) - Using cached data
              </div>
            )}
            {usingCache && (
              <div style={{ 
                fontSize: '0.8rem',
                color: 'var(--success-color)',
                padding: '0.25rem 0.5rem',
                backgroundColor: 'var(--bg-tertiary)',
                borderRadius: '4px'
              }}>
                ⚡ Using cached data
              </div>
            )}
            <button
              className="btn btn-small btn-secondary"
              onClick={handleForceReloadCache}
              disabled={loading}
            >
              Force Reload Cache
            </button>
            <button
              className="btn btn-small btn-secondary"
              onClick={handleClearCache}
              disabled={loading}
            >
              Clear Cache
            </button>
          </div>
        </div>

        {error && (
          <div className="error-message">
            {error}
            <button 
              className="btn btn-small" 
              onClick={() => loadCollection()}
              style={{ marginLeft: '1rem' }}
            >
              Retry
            </button>
          </div>
        )}

        {entireCollection.length > 0 && entireCollection.length < 100 && !cacheProgress && (
          <div className="card" style={{ backgroundColor: '#fff3cd', border: '1px solid #ffeaa7', marginBottom: '1rem' }}>
            <h4 style={{ color: '#856404', margin: '0 0 0.5rem 0' }}>⚠️ Incomplete Collection Cache</h4>
            <p style={{ color: '#856404', margin: '0 0 1rem 0', fontSize: '0.9rem' }}>
              Only {entireCollection.length} items are currently cached. Your full collection may not be displayed.
              The system is automatically preloading your complete collection in the background.
            </p>
            <button
              className="btn btn-small"
              onClick={startPreloadingCollection}
              style={{ backgroundColor: '#856404', color: 'white' }}
            >
              Start Preloading Now
            </button>
          </div>
        )}

        <SearchBar
          onSearch={handleSearch}
          placeholder="Search your collection..."
          disabled={loading}
        />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '1rem 0' }}>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              Sort by:
            </label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              style={{
                padding: '0.25rem 0.5rem',
                borderRadius: '4px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                fontSize: '0.9rem'
              }}
            >
              <option value="artist">Artist</option>
              <option value="title">Title</option>
              <option value="year">Year</option>
              <option value="date_added">Date Added</option>
            </select>
            <button
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              style={{
                padding: '0.25rem 0.5rem',
                borderRadius: '4px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                fontSize: '0.9rem',
                cursor: 'pointer'
              }}
              title={sortOrder === 'asc' ? 'Sort ascending' : 'Sort descending'}
            >
              {sortOrder === 'asc' ? '↑' : '↓'}
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '1rem 0' }}>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <button
              className="btn btn-small"
              onClick={handleSelectAll}
              disabled={loading || filteredCollection.length === 0}
            >
              {selectedAlbums.size === filteredCollection.length ? 'Deselect All' : 'Select All'}
            </button>
            
            {selectedAlbums.size > 0 && (
              <button
                className="btn btn-small"
                onClick={() => {
                  // Navigate to scrobble page with selected albums
                  const selectedItems = filteredCollection.filter(item => 
                    selectedAlbums.has(item.release.id)
                  );
                  // Store selected items in localStorage for now
                  localStorage.setItem('selectedAlbums', JSON.stringify(selectedItems));
                  window.location.hash = '#scrobble';
                }}
              >
                Scrobble Selected ({selectedAlbums.size})
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {isSearchMode ? (
              <>
                <button
                  className="btn btn-small"
                  onClick={() => setSearchPage(Math.max(1, searchPage - 1))}
                  disabled={searchPage <= 1 || loading}
                >
                  Previous
                </button>
                <span style={{ fontSize: '0.9rem', color: '#666' }}>
                  Page {searchPage} of {searchTotalPages} ({searchTotal} results)
                </span>
                <button
                  className="btn btn-small"
                  onClick={() => setSearchPage(Math.min(searchTotalPages, searchPage + 1))}
                  disabled={searchPage >= searchTotalPages || loading}
                >
                  Next
                </button>
              </>
            ) : (
              <>
                <button
                  className="btn btn-small"
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage <= 1 || loading}
                >
                  Previous
                </button>
                <span style={{ fontSize: '0.9rem', color: '#666' }}>
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  className="btn btn-small"
                  onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage >= totalPages || loading}
                >
                  Next
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {loading && (
        <div className="card">
          <div className="loading">
            <div className="spinner"></div>
            Loading collection...
          </div>
        </div>
      )}

      {!loading && filteredCollection.length === 0 && !error && (
        <div className="card">
          <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
            {searchQuery ? `No results found for "${searchQuery}"` : 'No items in your collection'}
          </div>
          <div style={{ fontSize: '0.8rem', color: '#999', textAlign: 'center', marginTop: '1rem' }}>
            Debug: entireCollection={entireCollection.length}, filtered={filteredCollection.length}, searchMode={isSearchMode.toString()}
          </div>
        </div>
      )}

      {!loading && filteredCollection.length > 0 && (
        <div className="collection-grid">
          {getCurrentPageItems().map((item) => (
            <AlbumCard
              key={item.id}
              item={item}
              selected={selectedAlbums.has(item.release.id)}
              onSelect={() => handleAlbumSelect(item.release.id)}
              onViewDetails={(release) => {
                // Store release for details view
                localStorage.setItem('selectedRelease', JSON.stringify(release));
                window.location.hash = '#release-details';
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default CollectionPage;