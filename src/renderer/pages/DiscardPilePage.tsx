import React, { useEffect, useState, useCallback, useMemo } from 'react';

import {
  DiscardPileItem,
  DiscardPileStats,
  DiscardReason,
  DiscardStatus,
  MarketplaceStats,
} from '../../shared/types';
import { Modal, ModalFooter } from '../components/ui';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import {
  useNotifications,
  createSuccessNotification,
} from '../hooks/useNotifications';
import { getApiService } from '../services/api';

type TabType = 'all' | 'marked' | 'listed' | 'sold' | 'orphaned';
type SortOption = 'date' | 'artist' | 'title' | 'value' | 'status';

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
};

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

    // Filter by tab
    switch (activeTab) {
      case 'marked':
        filtered = filtered.filter(item => item.status === 'marked');
        break;
      case 'listed':
        filtered = filtered.filter(item => item.status === 'listed');
        break;
      case 'sold':
        filtered = filtered.filter(
          item => item.status === 'sold' || item.status === 'gifted'
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
    } catch (error) {
      console.error('Failed to fetch marketplace stats:', error);
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
        <div className='loading-spinner'>Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className='discard-pile-page'>
        <h1>Discard Pile</h1>
        <div className='alert alert-error'>
          {error}
          <button onClick={loadData} className='btn btn-secondary ml-2'>
            Retry
          </button>
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

      {/* Stats Summary */}
      {stats && (
        <div className='discard-stats-summary'>
          <div className='stat-card'>
            <div className='stat-value'>{stats.totalItems}</div>
            <div className='stat-label'>Total Items</div>
          </div>
          <div className='stat-card'>
            <div className='stat-value'>{stats.byStatus.marked}</div>
            <div className='stat-label'>Pending</div>
          </div>
          <div className='stat-card'>
            <div className='stat-value'>{stats.byStatus.listed}</div>
            <div className='stat-label'>Listed</div>
          </div>
          <div className='stat-card'>
            <div className='stat-value'>
              {stats.byStatus.sold + stats.byStatus.gifted}
            </div>
            <div className='stat-label'>Completed</div>
          </div>
          <div className='stat-card'>
            <div className='stat-value'>
              {formatCurrency(stats.totalEstimatedValue, stats.currency)}
            </div>
            <div className='stat-label'>Est. Value</div>
          </div>
          <div className='stat-card'>
            <div className='stat-value'>
              {formatCurrency(stats.totalActualSales, stats.currency)}
            </div>
            <div className='stat-label'>Actual Sales</div>
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className='filter-bar'>
        <div className='tabs'>
          {(['all', 'marked', 'listed', 'sold', 'orphaned'] as TabType[]).map(
            tab => (
              <button
                key={tab}
                className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab === 'all'
                  ? `All (${items.length})`
                  : tab === 'marked'
                    ? `Pending (${items.filter(i => i.status === 'marked').length})`
                    : tab === 'listed'
                      ? `Listed (${items.filter(i => i.status === 'listed').length})`
                      : tab === 'sold'
                        ? `Completed (${items.filter(i => i.status === 'sold' || i.status === 'gifted').length})`
                        : `Orphaned (${items.filter(i => i.orphaned).length})`}
              </button>
            )
          )}
        </div>

        <div className='filter-controls'>
          <input
            type='text'
            placeholder='Search artist or album...'
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className='search-input'
          />
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as SortOption)}
            className='sort-select'
          >
            <option value='date'>Sort by Date Added</option>
            <option value='artist'>Sort by Artist</option>
            <option value='title'>Sort by Title</option>
            <option value='value'>Sort by Value</option>
            <option value='status'>Sort by Status</option>
          </select>
        </div>
      </div>

      {/* Items List */}
      {filteredItems.length === 0 ? (
        <div className='empty-state'>
          <p>
            {searchQuery
              ? 'No items match your search.'
              : activeTab === 'all'
                ? 'Your discard pile is empty. Add items from your collection to track them here.'
                : 'No items in this category.'}
          </p>
        </div>
      ) : (
        <div className='discard-items-grid'>
          {filteredItems.map(item => (
            <div
              key={item.id}
              className={`discard-item-card ${item.orphaned ? 'orphaned' : ''}`}
            >
              <div className='item-cover'>
                {item.coverImage ? (
                  <img src={item.coverImage} alt={`${item.title} cover`} />
                ) : (
                  <div className='no-cover'>No Image</div>
                )}
                {item.orphaned && (
                  <div
                    className='orphaned-badge'
                    title='No longer in collection'
                  >
                    Orphaned
                  </div>
                )}
              </div>

              <div className='item-info'>
                <div className='item-title'>{item.title}</div>
                <div className='item-artist'>{item.artist}</div>
                {item.format && (
                  <div className='item-format'>{item.format.join(', ')}</div>
                )}
                {item.year && <div className='item-year'>{item.year}</div>}
              </div>

              <div className='item-badges'>
                <span className={`reason-badge reason-${item.reason}`}>
                  {REASON_LABELS[item.reason]}
                </span>
                <span className={`status-badge status-${item.status}`}>
                  {STATUS_LABELS[item.status]}
                </span>
              </div>

              <div className='item-details'>
                {item.estimatedValue !== undefined && (
                  <div className='item-value'>
                    Est: {formatCurrency(item.estimatedValue, item.currency)}
                  </div>
                )}
                {item.actualSalePrice !== undefined && (
                  <div className='item-sale-price'>
                    Sold: {formatCurrency(item.actualSalePrice, item.currency)}
                  </div>
                )}
                <div className='item-date'>
                  Added: {formatDate(item.addedAt)}
                </div>
              </div>

              {item.marketplaceUrl && (
                <a
                  href={item.marketplaceUrl}
                  target='_blank'
                  rel='noopener noreferrer'
                  className='marketplace-link'
                >
                  View Listing
                </a>
              )}

              {item.notes && (
                <div className='item-notes' title={item.notes}>
                  {item.notes.length > 50
                    ? `${item.notes.substring(0, 50)}...`
                    : item.notes}
                </div>
              )}

              <div className='item-actions'>
                <button
                  className='btn btn-small btn-secondary'
                  onClick={() => openEditModal(item)}
                  title='Edit'
                >
                  Edit
                </button>
                {item.status === 'marked' && (
                  <>
                    <button
                      className='btn btn-small btn-primary'
                      onClick={() =>
                        setListedModal({
                          isOpen: true,
                          item,
                          marketplaceUrl: '',
                        })
                      }
                      title='Mark as Listed'
                    >
                      Listed
                    </button>
                    <button
                      className='btn btn-small btn-success'
                      onClick={() =>
                        setSoldModal({ isOpen: true, item, salePrice: '' })
                      }
                      title='Mark as Sold'
                    >
                      Sold
                    </button>
                  </>
                )}
                {item.status === 'listed' && (
                  <button
                    className='btn btn-small btn-success'
                    onClick={() =>
                      setSoldModal({
                        isOpen: true,
                        item,
                        salePrice: item.estimatedValue?.toString() || '',
                      })
                    }
                    title='Mark as Sold'
                  >
                    Sold
                  </button>
                )}
                <button
                  className='btn btn-small btn-danger'
                  onClick={() => handleRemove(item)}
                  title='Remove'
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

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
            <button className='btn btn-secondary' onClick={closeEditModal}>
              Cancel
            </button>
            <button className='btn btn-primary' onClick={handleSaveEdit}>
              Save Changes
            </button>
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
            <button
              className='btn btn-secondary'
              onClick={() =>
                setSoldModal({ isOpen: false, item: null, salePrice: '' })
              }
            >
              Cancel
            </button>
            <button className='btn btn-success' onClick={handleMarkAsSold}>
              Mark as Sold
            </button>
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
            <button
              className='btn btn-secondary'
              onClick={() =>
                setListedModal({
                  isOpen: false,
                  item: null,
                  marketplaceUrl: '',
                })
              }
            >
              Cancel
            </button>
            <button
              className='btn btn-primary'
              onClick={handleMarkAsListed}
              disabled={!listedModal.marketplaceUrl}
            >
              Mark as Listed
            </button>
          </ModalFooter>
        </Modal>
      )}
    </div>
  );
};

export default DiscardPilePage;
