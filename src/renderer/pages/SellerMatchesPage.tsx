import React, { useState, useEffect, useCallback } from 'react';

import { MonitoredSeller, SellerMatch } from '../../shared/types';
import MatchCard from '../components/MatchCard';
import { useApp } from '../context/AppContext';
import { getApiService } from '../services/api';
import { createLogger } from '../utils/logger';

const logger = createLogger('SellerMatchesPage');

type SortOption = 'newest' | 'price' | 'artist';

interface CacheInfo {
  lastUpdated: number;
  oldestScanAge: number;
  nextScanDue: number;
}

const SellerMatchesPage: React.FC = () => {
  const { state } = useApp();
  const api = getApiService(state.serverUrl);

  // State
  const [matches, setMatches] = useState<SellerMatch[]>([]);
  const [sellers, setSellers] = useState<MonitoredSeller[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterSeller, setFilterSeller] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [showSold, setShowSold] = useState(false);
  const [markingAsSeen, setMarkingAsSeen] = useState<Set<string>>(new Set());
  const [cacheInfo, setCacheInfo] = useState<CacheInfo | null>(null);
  const [verifying, setVerifying] = useState<Set<string>>(new Set());

  // Parse query param for seller filter
  useEffect(() => {
    const hash = window.location.hash;
    const queryStart = hash.indexOf('?');
    if (queryStart !== -1) {
      const params = new URLSearchParams(hash.substring(queryStart));
      const sellerParam = params.get('seller');
      if (sellerParam) {
        setFilterSeller(sellerParam);
      }
    }
  }, []);

  // Load data
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [matchesResponse, sellersData] = await Promise.all([
        api.getSellerMatchesWithCacheInfo(),
        api.getSellers(),
      ]);
      setMatches(matchesResponse.matches);
      setCacheInfo(matchesResponse.cacheInfo);
      setSellers(sellersData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load matches');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle mark as seen
  const handleMarkAsSeen = async (matchId: string) => {
    try {
      setMarkingAsSeen(prev => new Set([...prev, matchId]));
      await api.markMatchAsSeen(matchId);
      setMatches(prev =>
        prev.map(m => (m.id === matchId ? { ...m, status: 'seen' } : m))
      );
    } catch (err) {
      window.alert(
        err instanceof Error ? err.message : 'Failed to mark as seen'
      );
    } finally {
      setMarkingAsSeen(prev => {
        const next = new Set(prev);
        next.delete(matchId);
        return next;
      });
    }
  };

  // Handle verify listing status
  const handleVerify = async (matchId: string) => {
    try {
      setVerifying(prev => new Set([...prev, matchId]));
      const result = await api.verifyMatch(matchId);
      logger.info('Verify result', result);

      if (result.error) {
        window.alert(`Could not verify: ${result.error}`);
      } else {
        // Reload from server to ensure UI is in sync with backend
        const matchesResponse = await api.getSellerMatchesWithCacheInfo();
        logger.info('Reloaded matches', {
          total: matchesResponse.matches.length,
          matchStatuses: matchesResponse.matches.map(m => ({
            id: m.id,
            status: m.status,
          })),
        });

        // Find the verified match in the response
        const verifiedMatch = matchesResponse.matches.find(
          m => m.id === matchId
        );
        logger.info('Verified match in response', verifiedMatch);

        setMatches(matchesResponse.matches);
        setCacheInfo(matchesResponse.cacheInfo);

        if (result.updated) {
          window.alert(
            result.status === 'active'
              ? 'Good news! This item is still available.'
              : 'Confirmed: This item has been sold.'
          );
        }
      }
    } catch (err) {
      logger.error('Verify error', err);
      window.alert(
        err instanceof Error ? err.message : 'Failed to verify listing'
      );
    } finally {
      setVerifying(prev => {
        const next = new Set(prev);
        next.delete(matchId);
        return next;
      });
    }
  };

  // Format cache age
  const formatCacheAge = (ageMs: number): string => {
    const hours = Math.floor(ageMs / (1000 * 60 * 60));
    const minutes = Math.floor((ageMs % (1000 * 60 * 60)) / (1000 * 60));

    if (hours === 0) {
      return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
    }
    return `${hours}h ${minutes}m ago`;
  };

  // Get seller display name
  const getSellerDisplayName = (sellerId: string): string => {
    const seller = sellers.find(
      s => s.username.toLowerCase() === sellerId.toLowerCase()
    );
    return seller?.displayName || sellerId;
  };

  // Format price
  const formatPrice = (price: number, currency: string): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
    }).format(price);
  };

  // Format relative time
  const formatRelativeTime = (timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
    if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
    return `${days} day${days !== 1 ? 's' : ''} ago`;
  };

  // Filter and sort matches
  const filteredMatches = matches
    .filter(m => {
      // Hide sold matches unless showSold is enabled
      if (m.status === 'sold' && !showSold) return false;
      // Apply seller filter
      if (
        filterSeller &&
        m.sellerId.toLowerCase() !== filterSeller.toLowerCase()
      ) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'newest':
          return b.dateFound - a.dateFound;
        case 'price':
          return a.price - b.price;
        case 'artist':
          return a.artist.localeCompare(b.artist);
        default:
          return 0;
      }
    });

  // Loading state
  if (loading) {
    return (
      <div className='seller-matches-page'>
        <h1>Wishlist Matches</h1>
        <div className='loading-container'>
          <div className='spinner'></div>
          <p>Loading matches...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className='seller-matches-page'>
        <h1>Wishlist Matches</h1>
        <div className='error-state'>
          <p>{error}</p>
          <button className='btn' onClick={loadData}>
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className='seller-matches-page'>
      <h1>Wishlist Matches</h1>
      <p className='page-description'>
        {filteredMatches.length === 0
          ? 'No matches found from your monitored sellers.'
          : `Showing ${filteredMatches.length} item${filteredMatches.length !== 1 ? 's' : ''} found at your monitored sellers.`}
      </p>

      {/* Cache info banner */}
      {cacheInfo && (
        <div className='seller-matches-cache-info'>
          <span className='cache-info-icon'>ℹ️</span>
          <span>
            Data from {formatCacheAge(cacheInfo.oldestScanAge)}
            {cacheInfo.nextScanDue === 0 && ' (refresh recommended)'}
          </span>
        </div>
      )}

      {/* Back link */}
      <div className='seller-matches-back'>
        <button
          className='btn btn-outline btn-small'
          onClick={() => {
            window.location.hash = 'sellers';
          }}
        >
          &larr; Back to Sellers
        </button>
      </div>

      {/* Filter and sort controls */}
      {matches.length > 0 && (
        <div className='seller-matches-controls'>
          <div className='form-group'>
            <label className='form-label'>Filter by Seller</label>
            <select
              className='form-input'
              value={filterSeller || ''}
              onChange={e => setFilterSeller(e.target.value || null)}
            >
              <option value=''>All Sellers</option>
              {sellers.map(seller => (
                <option key={seller.username} value={seller.username}>
                  {seller.displayName}
                </option>
              ))}
            </select>
          </div>
          <div className='form-group'>
            <label className='form-label'>Sort by</label>
            <select
              className='form-input'
              value={sortBy}
              onChange={e => setSortBy(e.target.value as SortOption)}
            >
              <option value='newest'>Newest First</option>
              <option value='price'>Price (Low to High)</option>
              <option value='artist'>Artist A-Z</option>
            </select>
          </div>
          <div className='form-group'>
            <label className='settings-toggle-label'>
              <input
                type='checkbox'
                checked={showSold}
                onChange={e => setShowSold(e.target.checked)}
              />
              <span>Show Sold</span>
            </label>
          </div>
        </div>
      )}

      {/* Matches list */}
      {filteredMatches.length === 0 ? (
        <div className='card'>
          <div className='empty-state'>
            <h2>No Matches Found</h2>
            <p>
              {filterSeller
                ? 'No wishlist items found at this seller.'
                : "Your monitored sellers don't currently have any of your wishlist items. Try scanning again or adding more sellers."}
            </p>
            {filterSeller && (
              <button
                className='btn btn-outline'
                onClick={() => setFilterSeller(null)}
              >
                Show All Sellers
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className='seller-match-list'>
          {filteredMatches.map(match => (
            <MatchCard
              key={match.id}
              match={match}
              formatPrice={formatPrice}
              formatRelativeTime={formatRelativeTime}
              getSellerDisplayName={getSellerDisplayName}
              onMarkAsSeen={handleMarkAsSeen}
              onVerify={handleVerify}
              markingAsSeen={markingAsSeen.has(match.id)}
              verifying={verifying.has(match.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default SellerMatchesPage;
