import React, { useEffect, useState, useCallback, useMemo } from 'react';

import {
  DiscardPileItem,
  DiscardPileStats,
  DiscardReason,
  DiscardStatus,
  MarketplaceStats,
} from '../../shared/types';
import DiscardFilterBar, {
  TabType,
  SortOption,
} from '../components/discard/DiscardFilterBar';
import DiscardItemCard from '../components/discard/DiscardItemCard';
import DiscardStatsBar from '../components/discard/DiscardStatsBar';
import DiscardTradedInModal from '../components/discard/DiscardTradedInModal';
import { Modal, ModalFooter } from '../components/ui';
import { Button } from '../components/ui/Button';
import { ListItemSkeleton } from '../components/ui/Skeleton';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useDiscardPileSelection } from '../hooks/useDiscardPileSelection';
import {
  useNotifications,
  createSuccessNotification,
} from '../hooks/useNotifications';
import { getApiService } from '../services/api';
import { createLogger } from '../utils/logger';

const logger = createLogger('DiscardPilePage');

interface EditModalState {
  isOpen: boolean;
  item: DiscardPileItem | null;
}

interface SoldModalState {
  isOpen: boolean;
  item: DiscardPileItem | null;
  salePrice: string;
}

interface ListedModalState {
  isOpen: boolean;
  item: DiscardPileItem | null;
  marketplaceUrl: string;
}

const REASON_LABELS: Record<DiscardReason, string> = {
  selling: 'For Sale',
  duplicate: 'Duplicate',
  damaged: 'Damaged',
  upgrade: 'Upgrading',
  not_listening: 'Not Listening',
  gift: 'Giving Away',
  other: 'Other',
};

const STATUS_LABELS: Record<DiscardStatus, string> = {
  marked: 'Marked',
  listed: 'Listed',
  sold: 'Sold',
  gifted: 'Gifted',
  removed: 'Removed',
  traded_in: 'Traded In',
};

/** Terminal statuses that represent completed/history items */
const HISTORY_STATUSES: DiscardStatus[] = [
  'sold',
  'gifted',
  'removed',
  'traded_in',
];

const DiscardPilePage: React.FC = () => {
  const { state } = useApp();
  const { authStatus } = useAuth();
  const { addNotification } = useNotifications();
  const [items, setItems] = useState<DiscardPileItem[]>([]);
  const [stats, setStats] = useState<DiscardPileStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tab and sorting state
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [sortBy, setSortBy] = useState<SortOption>('date');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal states
  const [editModal, setEditModal] = useState<EditModalState>({
    isOpen: false,
    item: null,
  });
  const [soldModal, setSoldModal] = useState<SoldModalState>({
    isOpen: false,
    item: null,
    salePrice: '',
  });
  const [listedModal, setListedModal] = useState<ListedModalState>({
    isOpen: false,
    item: null,
    marketplaceUrl: '',
  });
  const [bulkTradedInModalOpen, setBulkTradedInModalOpen] = useState(false);

  // Edit form state
  const [editForm, setEditForm] = useState({
    reason: 'selling' as DiscardReason,
    reasonNote: '',
    estimatedValue: '',
    notes: '',
    status: 'marked' as DiscardStatus,
    marketplaceUrl: '',
    actualSalePrice: '',
  });

  // Marketplace stats for edit modal
  const [editMarketplaceStats, setEditMarketplaceStats] =
    useState<MarketplaceStats | null>(null);
  const [loadingEditMarketplaceStats, setLoadingEditMarketplaceStats] =
    useState<boolean>(false);

  const api = getApiService(state.serverUrl);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [discardItems, discardStats] = await Promise.all([
        api.getDiscardPile(),
        api.getDiscardPileStats(),
      ]);

      setItems(discardItems);
      setStats(discardStats);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load discard pile data'
      );
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filter and sort items
  const filteredItems = useMemo(() => {
    let filtered = [...items];

    // Filter by tab ('all' shows only active/non-terminal items)
    switch (activeTab) {
      case 'all':
        filtered = filtered.filter(
          item => !HISTORY_STATUSES.includes(item.status)
        );
        break;
      case 'marked':
        filtered = filtered.filter(item => item.status === 'marked');
        break;
      case 'listed':
        filtered = filtered.filter(item => item.status === 'listed');
        break;
      case 'history':
        filtered = filtered.filter(item =>
          HISTORY_STATUSES.includes(item.status)
        );
        break;
      case 'orphaned':
        filtered = filtered.filter(item => item.orphaned);
        break;
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        item =>
          item.artist.toLowerCase().includes(query) ||
          item.title.toLowerCase().includes(query)
      );
    }

    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'artist':
          return a.artist.localeCompare(b.artist);
        case 'title':
          return a.title.localeCompare(b.title);
        case 'value':
          return (b.estimatedValue || 0) - (a.estimatedValue || 0);
        case 'status':
          return a.status.localeCompare(b.status);
        case 'date':
        default:
          return b.addedAt - a.addedAt;
      }
    });

    return filtered;
  }, [items, activeTab, searchQuery, sortBy]);

  // Selection hook (Phase 2)
  const {
    selectedIds,
    selectionMode,
    toggleSelectionMode,
    toggleSelect,
    clearSelection,
    selectedItems: getSelectedItems,
  } = useDiscardPileSelection(filteredItems);

  const currentSelectedItems = useMemo(
    () => getSelectedItems(items),
    [getSelectedItems, items]
  );

  const handleRemove = async (item: DiscardPileItem) => {
    if (
      !confirm(`Remove "${item.artist} - ${item.title}" from discard pile?`)
    ) {
      return;
    }

    try {
      await api.removeFromDiscardPile(item.id);
      setItems(prev => prev.filter(i => i.id !== item.id));
      addNotification(
        createSuccessNotification('Removed', 'Item removed from discard pile')
      );
      // Reload stats
      const newStats = await api.getDiscardPileStats();
      setStats(newStats);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove item');
    }
  };

  const handleMarkAsSold = async () => {
    if (!soldModal.item) return;

    try {
      const salePrice = soldModal.salePrice
        ? parseFloat(soldModal.salePrice)
        : undefined;
      const updated = await api.markDiscardItemSold(
        soldModal.item.id,
        salePrice
      );
      setItems(prev => prev.map(i => (i.id === updated.id ? updated : i)));
      setSoldModal({ isOpen: false, item: null, salePrice: '' });
      addNotification(createSuccessNotification('Sold', 'Item marked as sold'));
      // Reload stats
      const newStats = await api.getDiscardPileStats();
      setStats(newStats);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark as sold');
    }
  };

  const handleMarkAsListed = async () => {
    if (!listedModal.item || !listedModal.marketplaceUrl) return;

    try {
      const updated = await api.markDiscardItemListed(
        listedModal.item.id,
        listedModal.marketplaceUrl
      );
      setItems(prev => prev.map(i => (i.id === updated.id ? updated : i)));
      setListedModal({ isOpen: false, item: null, marketplaceUrl: '' });
      addNotification(
        createSuccessNotification('Listed', 'Item marked as listed')
      );
      // Reload stats
      const newStats = await api.getDiscardPileStats();
      setStats(newStats);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark as listed');
    }
  };

  const handleMarkAsTradedIn = async (item: DiscardPileItem) => {
    try {
      const updated = await api.markDiscardItemTradedIn(item.id);
      setItems(prev => prev.map(i => (i.id === updated.id ? updated : i)));
      addNotification(
        createSuccessNotification('Traded In', 'Item marked as traded in')
      );
      const newStats = await api.getDiscardPileStats();
      setStats(newStats);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to mark as traded in'
      );
    }
  };

  const handleBulkTradedIn = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    try {
      const result = await api.bulkMarkDiscardItemsTradedIn(ids);

      // Update items that succeeded
      if (result.succeeded.length > 0) {
        const succeededSet = new Set(result.succeeded);
        setItems(prev =>
          prev.map(item =>
            succeededSet.has(item.id)
              ? {
                  ...item,
                  status: 'traded_in' as DiscardStatus,
                  statusChangedAt: Date.now(),
                }
              : item
          )
        );
      }

      setBulkTradedInModalOpen(false);
      toggleSelectionMode(); // Clears selection and exits selection mode

      addNotification(
        createSuccessNotification(
          'Traded In',
          `${result.succeeded.length} item${result.succeeded.length !== 1 ? 's' : ''} marked as traded in${result.failed.length > 0 ? ` (${result.failed.length} failed)` : ''}`
        )
      );

      const newStats = await api.getDiscardPileStats();
      setStats(newStats);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to bulk mark as traded in'
      );
    }
  };

  // Card action handlers that open modals
  const handleSoldClick = useCallback((item: DiscardPileItem) => {
    setSoldModal({
      isOpen: true,
      item,
      salePrice:
        item.status === 'listed' ? item.estimatedValue?.toString() || '' : '',
    });
  }, []);

  const handleListedClick = useCallback((item: DiscardPileItem) => {
    setListedModal({ isOpen: true, item, marketplaceUrl: '' });
  }, []);

  const handleSaveEdit = async () => {
    if (!editModal.item) return;

    try {
      const updated = await api.updateDiscardPileItem(editModal.item.id, {
        reason: editForm.reason,
        reasonNote: editForm.reasonNote || undefined,
        status: editForm.status,
        estimatedValue: editForm.estimatedValue
          ? parseFloat(editForm.estimatedValue)
          : undefined,
        notes: editForm.notes || undefined,
        marketplaceUrl: editForm.marketplaceUrl || undefined,
        actualSalePrice: editForm.actualSalePrice
          ? parseFloat(editForm.actualSalePrice)
          : undefined,
      });
      setItems(prev => prev.map(i => (i.id === updated.id ? updated : i)));
      closeEditModal();
      addNotification(createSuccessNotification('Updated', 'Item updated'));
      // Reload stats
      const newStats = await api.getDiscardPileStats();
      setStats(newStats);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update item');
    }
  };

  const openEditModal = async (item: DiscardPileItem) => {
    setEditForm({
      reason: item.reason,
      reasonNote: item.reasonNote || '',
      estimatedValue: item.estimatedValue?.toString() || '',
      notes: item.notes || '',
      status: item.status,
      marketplaceUrl: item.marketplaceUrl || '',
      actualSalePrice: item.actualSalePrice?.toString() || '',
    });
    setEditModal({ isOpen: true, item });
    setEditMarketplaceStats(null);

    // Fetch marketplace stats in background
    setLoadingEditMarketplaceStats(true);
    try {
      const stats = await api.getMarketplaceStats(item.releaseId);
      setEditMarketplaceStats(stats);
      // Auto-populate estimated value if not already set
      if (!item.estimatedValue && stats) {
        const autoValue =
          stats.priceSuggestions?.veryGoodPlus?.value ??
          stats.medianPrice ??
          stats.lowestPrice;
        if (autoValue != null) {
          setEditForm(prev => ({
            ...prev,
            estimatedValue: autoValue.toFixed(2),
          }));
        }
      }
    } catch (error) {
      logger.error('Failed to fetch marketplace stats', error);
    } finally {
      setLoadingEditMarketplaceStats(false);
    }
  };

  const closeEditModal = () => {
    setEditModal({ isOpen: false, item: null });
    setEditMarketplaceStats(null);
  };

  const formatCurrency = (value: number | undefined, currency: string) => {
    if (value === undefined) return '-';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(value);
  };

  const [refreshing, setRefreshing] = useState(false);

  const handleRefreshValues = async () => {
    try {
      setRefreshing(true);
      const result = await api.refreshDiscardPileValues();

      if (!result.jobId) {
        // No background job (e.g. no items to refresh)
        setRefreshing(false);
        return;
      }

      // Poll for job completion, then reload data
      const interval = setInterval(async () => {
        try {
          const jobs = await api.getJobStatuses();
          const job = jobs.find(
            (j: { id: string; status: string }) => j.id === result.jobId
          );
          if (job && (job.status === 'completed' || job.status === 'failed')) {
            clearInterval(interval);
            setRefreshing(false);
            loadData();
          }
        } catch {
          // Ignore polling errors
        }
      }, 3000);
    } catch (err) {
      setRefreshing(false);
      setError(err instanceof Error ? err.message : 'Failed to refresh values');
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString();
  };

  if (!authStatus.discogs.authenticated) {
    return (
      <div className='discard-pile-page'>
        <h1>Discard Pile</h1>
        <div className='alert alert-warning'>
          Please connect your Discogs account to use the Discard Pile feature.
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className='discard-pile-page'>
        <h1>Discard Pile</h1>
        <ListItemSkeleton count={5} />
      </div>
    );
  }

  if (error) {
    return (
      <div className='discard-pile-page'>
        <h1>Discard Pile</h1>
        <div className='alert alert-error'>
          {error}
          <Button variant='secondary' className='ml-2' onClick={loadData}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className='discard-pile-page'>
      <div className='page-header'>
        <h1>Discard Pile</h1>
        <p className='page-description'>
          Track records you want to sell, gift, or remove from your collection.
        </p>
      </div>

      {stats && (
        <DiscardStatsBar
          stats={stats}
          filteredItems={filteredItems}
          formatCurrency={formatCurrency}
        />
      )}

      <div className='discard-pile-actions'>
        <Button
          variant='secondary'
          onClick={handleRefreshValues}
          disabled={refreshing || items.length === 0}
        >
          {refreshing ? 'Refreshing...' : 'Refresh Marketplace Values'}
        </Button>
        <Button
          variant={selectionMode ? 'primary' : 'secondary'}
          onClick={toggleSelectionMode}
          disabled={items.length === 0}
          aria-label={
            selectionMode ? 'Exit selection mode' : 'Enter selection mode'
          }
        >
          {selectionMode ? 'Cancel Selection' : 'Select Items'}
        </Button>
      </div>

      <DiscardFilterBar
        items={items}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        sortBy={sortBy}
        onSortChange={setSortBy}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      {filteredItems.length === 0 ? (
        <div className='empty-state'>
          <p>
            {searchQuery
              ? 'No items match your search.'
              : activeTab === 'all'
                ? 'No active items. Add items from your collection or check the History tab.'
                : 'No items in this category.'}
          </p>
        </div>
      ) : (
        <div className='discard-items-grid'>
          {filteredItems.map(item => (
            <DiscardItemCard
              key={item.id}
              item={item}
              selected={selectedIds.has(item.id)}
              selectionMode={selectionMode}
              onEdit={openEditModal}
              onSold={handleSoldClick}
              onListed={handleListedClick}
              onTradedIn={handleMarkAsTradedIn}
              onRemove={handleRemove}
              onToggleSelect={toggleSelect}
              formatCurrency={formatCurrency}
              formatDate={formatDate}
            />
          ))}
        </div>
      )}

      {selectionMode && selectedIds.size > 0 && (
        <div className='floating-action-bar'>
          <div className='floating-action-bar-content'>
            <div className='floating-action-bar-info'>
              <span className='floating-action-bar-count'>
                {selectedIds.size} selected
              </span>
            </div>
            <div className='floating-action-bar-actions'>
              <Button
                variant='warning'
                onClick={() => setBulkTradedInModalOpen(true)}
                aria-label={`Trade in ${selectedIds.size} selected items`}
              >
                Trade In ({selectedIds.size})
              </Button>
              <Button
                variant='secondary'
                onClick={clearSelection}
                aria-label='Clear selection'
              >
                Clear
              </Button>
            </div>
          </div>
        </div>
      )}

      <DiscardTradedInModal
        isOpen={bulkTradedInModalOpen}
        items={currentSelectedItems}
        onConfirm={handleBulkTradedIn}
        onClose={() => setBulkTradedInModalOpen(false)}
      />

      {/* Edit Modal */}
      {editModal.item && (
        <Modal
          isOpen={editModal.isOpen}
          onClose={closeEditModal}
          title='Edit Item'
          size='medium'
        >
          {/* Marketplace Price Stats */}
          <div className='marketplace-stats-info'>
            {loadingEditMarketplaceStats ? (
              <div className='marketplace-stats-loading'>
                Loading marketplace prices...
              </div>
            ) : editMarketplaceStats ? (
              <div className='marketplace-stats-content'>
                <div className='marketplace-stats-prices'>
                  <span className='marketplace-stats-label'>
                    Discogs Marketplace:
                  </span>
                  {editMarketplaceStats.lowestPrice !== undefined ? (
                    <>
                      <span className='marketplace-stats-range'>
                        {editMarketplaceStats.highestPrice !== undefined &&
                        editMarketplaceStats.highestPrice !==
                          editMarketplaceStats.lowestPrice ? (
                          <>
                            {new Intl.NumberFormat('en-US', {
                              style: 'currency',
                              currency: editMarketplaceStats.currency || 'USD',
                            }).format(editMarketplaceStats.lowestPrice)}
                            {' - '}
                            {new Intl.NumberFormat('en-US', {
                              style: 'currency',
                              currency: editMarketplaceStats.currency || 'USD',
                            }).format(editMarketplaceStats.highestPrice)}
                          </>
                        ) : (
                          <>
                            from{' '}
                            {new Intl.NumberFormat('en-US', {
                              style: 'currency',
                              currency: editMarketplaceStats.currency || 'USD',
                            }).format(editMarketplaceStats.lowestPrice)}
                          </>
                        )}
                      </span>
                      <span className='marketplace-stats-count'>
                        ({editMarketplaceStats.numForSale} for sale)
                      </span>
                    </>
                  ) : (
                    <span className='marketplace-stats-none'>No listings</span>
                  )}
                </div>
                {editMarketplaceStats.priceSuggestions ? (
                  <div className='marketplace-stats-suggestions'>
                    <span className='marketplace-stats-suggestion-label'>
                      Suggested prices by condition:
                    </span>
                    <div className='marketplace-stats-condition-list'>
                      {editMarketplaceStats.priceSuggestions.nearMint && (
                        <span className='condition-price'>
                          NM:{' '}
                          {new Intl.NumberFormat('en-US', {
                            style: 'currency',
                            currency:
                              editMarketplaceStats.priceSuggestions.nearMint
                                .currency || 'USD',
                          }).format(
                            editMarketplaceStats.priceSuggestions.nearMint.value
                          )}
                        </span>
                      )}
                      {editMarketplaceStats.priceSuggestions.veryGoodPlus && (
                        <span className='condition-price'>
                          VG+:{' '}
                          {new Intl.NumberFormat('en-US', {
                            style: 'currency',
                            currency:
                              editMarketplaceStats.priceSuggestions.veryGoodPlus
                                .currency || 'USD',
                          }).format(
                            editMarketplaceStats.priceSuggestions.veryGoodPlus
                              .value
                          )}
                        </span>
                      )}
                      {editMarketplaceStats.priceSuggestions.veryGood && (
                        <span className='condition-price'>
                          VG:{' '}
                          {new Intl.NumberFormat('en-US', {
                            style: 'currency',
                            currency:
                              editMarketplaceStats.priceSuggestions.veryGood
                                .currency || 'USD',
                          }).format(
                            editMarketplaceStats.priceSuggestions.veryGood.value
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  editMarketplaceStats.lowestPrice !== undefined && (
                    <div className='marketplace-stats-suggestions'>
                      <span className='marketplace-stats-no-suggestions'>
                        Seller profile required for price suggestions
                      </span>
                    </div>
                  )
                )}
              </div>
            ) : (
              <div className='marketplace-stats-unavailable'>
                Marketplace data unavailable
              </div>
            )}
          </div>

          <div className='form-group'>
            <label>Reason</label>
            <select
              value={editForm.reason}
              onChange={e =>
                setEditForm({
                  ...editForm,
                  reason: e.target.value as DiscardReason,
                })
              }
            >
              {Object.entries(REASON_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          {editForm.reason === 'other' && (
            <div className='form-group'>
              <label>Reason Note</label>
              <input
                type='text'
                value={editForm.reasonNote}
                onChange={e =>
                  setEditForm({ ...editForm, reasonNote: e.target.value })
                }
                placeholder='Custom reason...'
              />
            </div>
          )}
          <div className='form-group'>
            <label>Status</label>
            <select
              value={editForm.status}
              onChange={e =>
                setEditForm({
                  ...editForm,
                  status: e.target.value as DiscardStatus,
                })
              }
            >
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className='form-group'>
            <label>Estimated Value ({editModal.item.currency})</label>
            <input
              type='number'
              step='0.01'
              value={editForm.estimatedValue}
              onChange={e =>
                setEditForm({ ...editForm, estimatedValue: e.target.value })
              }
              placeholder='0.00'
            />
          </div>
          <div className='form-group'>
            <label>Notes</label>
            <textarea
              value={editForm.notes}
              onChange={e =>
                setEditForm({ ...editForm, notes: e.target.value })
              }
              placeholder='Additional notes...'
              rows={3}
            />
          </div>
          <div className='form-group'>
            <label>Marketplace URL</label>
            <input
              type='url'
              value={editForm.marketplaceUrl}
              onChange={e =>
                setEditForm({ ...editForm, marketplaceUrl: e.target.value })
              }
              placeholder='https://www.discogs.com/sell/item/...'
            />
          </div>
          <div className='form-group'>
            <label>Actual Sale Price ({editModal.item.currency})</label>
            <input
              type='number'
              step='0.01'
              value={editForm.actualSalePrice}
              onChange={e =>
                setEditForm({
                  ...editForm,
                  actualSalePrice: e.target.value,
                })
              }
              placeholder='0.00'
            />
          </div>
          <ModalFooter>
            <Button variant='secondary' onClick={closeEditModal}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit}>Save Changes</Button>
          </ModalFooter>
        </Modal>
      )}

      {/* Mark as Sold Modal */}
      {soldModal.item && (
        <Modal
          isOpen={soldModal.isOpen}
          onClose={() =>
            setSoldModal({ isOpen: false, item: null, salePrice: '' })
          }
          title='Mark as Sold'
          size='small'
        >
          <p>
            Marking <strong>{soldModal.item.artist}</strong> -{' '}
            <strong>{soldModal.item.title}</strong> as sold.
          </p>
          <div className='form-group'>
            <label>Sale Price ({soldModal.item.currency}, optional)</label>
            <input
              type='number'
              step='0.01'
              value={soldModal.salePrice}
              onChange={e =>
                setSoldModal({ ...soldModal, salePrice: e.target.value })
              }
              placeholder='0.00'
            />
          </div>
          <ModalFooter>
            <Button
              variant='secondary'
              onClick={() =>
                setSoldModal({ isOpen: false, item: null, salePrice: '' })
              }
            >
              Cancel
            </Button>
            <Button variant='success' onClick={handleMarkAsSold}>
              Mark as Sold
            </Button>
          </ModalFooter>
        </Modal>
      )}

      {/* Mark as Listed Modal */}
      {listedModal.item && (
        <Modal
          isOpen={listedModal.isOpen}
          onClose={() =>
            setListedModal({ isOpen: false, item: null, marketplaceUrl: '' })
          }
          title='Mark as Listed'
          size='small'
        >
          <p>
            Marking <strong>{listedModal.item.artist}</strong> -{' '}
            <strong>{listedModal.item.title}</strong> as listed for sale.
          </p>
          <div className='form-group'>
            <label>Marketplace URL</label>
            <input
              type='url'
              value={listedModal.marketplaceUrl}
              onChange={e =>
                setListedModal({
                  ...listedModal,
                  marketplaceUrl: e.target.value,
                })
              }
              placeholder='https://discogs.com/sell/item/...'
            />
          </div>
          <ModalFooter>
            <Button
              variant='secondary'
              onClick={() =>
                setListedModal({
                  isOpen: false,
                  item: null,
                  marketplaceUrl: '',
                })
              }
            >
              Cancel
            </Button>
            <Button
              onClick={handleMarkAsListed}
              disabled={!listedModal.marketplaceUrl}
            >
              Mark as Listed
            </Button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  );
};

export default DiscardPilePage;
