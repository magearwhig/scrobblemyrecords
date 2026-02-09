import React from 'react';

interface CacheProgress {
  status: 'loading' | 'completed';
  currentPage: number;
  totalPages: number;
}

interface NewItemsResult {
  newItemsCount: number;
  latestCacheDate?: string;
}

interface CacheStatusIndicatorProps {
  preloading: boolean;
  cacheProgress: CacheProgress | null;
  cacheStatus: string;
  cacheRefreshing: boolean;
  usingCache: boolean;
  checkingForNewItems: boolean;
  updatingWithNewItems: boolean;
  infoMessage: string;
  newItemsResult: NewItemsResult | null;
  loading: boolean;
  onCheckForNewItems: () => void;
  onUpdateWithNewItems: () => void;
  onForceReload: () => void;
  onClearCache: () => void;
}

const CacheStatusIndicator: React.FC<CacheStatusIndicatorProps> = ({
  preloading,
  cacheProgress,
  cacheStatus,
  cacheRefreshing,
  usingCache,
  checkingForNewItems,
  updatingWithNewItems,
  infoMessage,
  newItemsResult,
  loading,
  onCheckForNewItems,
  onUpdateWithNewItems,
  onForceReload,
  onClearCache,
}) => {
  return (
    <div className='collection-cache-management'>
      {/* Status Indicators */}
      <div className='collection-status-indicators'>
        {preloading && (
          <div className='collection-status-badge'>Preloading...</div>
        )}

        {cacheProgress && cacheProgress.status === 'loading' && (
          <div className='collection-status-loading'>
            <div className='spinner collection-spinner-small'></div>
            Caching: {cacheProgress.currentPage}/{cacheProgress.totalPages}{' '}
            pages (
            {Math.round(
              (cacheProgress.currentPage / cacheProgress.totalPages) * 100
            )}
            %)
          </div>
        )}

        {cacheProgress && cacheProgress.status === 'completed' && (
          <div className='collection-status-success'>
            &#10003; Cache complete ({cacheProgress.totalPages} pages)
          </div>
        )}

        {usingCache && !cacheRefreshing && cacheStatus === 'valid' && (
          <div className='collection-status-success'>
            &#9889; Using cached data
          </div>
        )}

        {cacheStatus === 'expired' && cacheRefreshing && (
          <div className='collection-status-warning'>
            <div className='spinner collection-spinner-small'></div>
            &#9200; Cache expired - Refreshing...
          </div>
        )}

        {cacheStatus === 'partially_expired' && cacheRefreshing && (
          <div className='collection-status-warning'>
            <div className='spinner collection-spinner-small'></div>
            &#9888;&#65039; Some cache expired - Refreshing...
          </div>
        )}

        {checkingForNewItems && (
          <div className='collection-status-loading'>
            <div className='spinner collection-spinner-small'></div>
            Checking for new items...
          </div>
        )}

        {updatingWithNewItems && (
          <div className='collection-status-loading'>
            <div className='spinner collection-spinner-small'></div>
            Adding new items to cache...
          </div>
        )}

        {infoMessage && (
          <div
            className={`collection-status-info ${newItemsResult?.newItemsCount ? 'collection-status-info--warning' : 'collection-status-info--success'}`}
          >
            {newItemsResult?.newItemsCount ? '\u26A0\uFE0F' : '\u2139\uFE0F'}{' '}
            {infoMessage}
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className='collection-cache-actions'>
        <button
          className='btn btn-small btn-secondary'
          onClick={onCheckForNewItems}
          disabled={loading || checkingForNewItems || updatingWithNewItems}
          title='Check if new items have been added to your Discogs collection'
        >
          {checkingForNewItems ? 'Checking...' : 'Check for New Items'}
        </button>
        {newItemsResult && newItemsResult.newItemsCount > 0 && (
          <button
            className='btn btn-small btn-primary'
            onClick={onUpdateWithNewItems}
            disabled={loading || checkingForNewItems || updatingWithNewItems}
            title='Add only the new items to your cache without refreshing everything'
          >
            {updatingWithNewItems
              ? 'Adding...'
              : `Update with New Items (${newItemsResult.newItemsCount})`}
          </button>
        )}
        <button
          className='btn btn-small btn-secondary'
          onClick={onForceReload}
          disabled={loading || updatingWithNewItems}
          title='Force reload the entire cache from Discogs'
        >
          Force Reload
        </button>
        <button
          className='btn btn-small btn-secondary'
          onClick={onClearCache}
          disabled={loading || updatingWithNewItems}
          title='Clear the local cache'
        >
          Clear Cache
        </button>
      </div>
    </div>
  );
};

export default React.memo(CacheStatusIndicator);
