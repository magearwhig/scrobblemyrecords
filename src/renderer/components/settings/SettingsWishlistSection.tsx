import React, { useState, useEffect, useCallback } from 'react';

import {
  WishlistSettings,
  VinylWatchItem,
  SellerMonitoringSettings,
} from '../../../shared/types';
import { useAuth } from '../../context/AuthContext';
import ApiService from '../../services/api';

interface SettingsWishlistSectionProps {
  api: ApiService;
}

const SettingsWishlistSection: React.FC<SettingsWishlistSectionProps> = ({
  api,
}) => {
  const { authStatus } = useAuth();

  // Wishlist settings state
  const [wishlistSettings, setWishlistSettings] =
    useState<WishlistSettings | null>(null);
  const [vinylWatchList, setVinylWatchList] = useState<VinylWatchItem[]>([]);
  const [wishlistLoading, setWishlistLoading] = useState(false);
  const [wishlistError, setWishlistError] = useState<string>('');
  const [wishlistSuccess, setWishlistSuccess] = useState<string>('');

  // Seller monitoring settings state
  const [sellerSettings, setSellerSettings] =
    useState<SellerMonitoringSettings | null>(null);
  const [sellerLoading, setSellerLoading] = useState(false);
  const [sellerError, setSellerError] = useState<string>('');
  const [sellerSuccess, setSellerSuccess] = useState<string>('');
  const [quickAddUsername, setQuickAddUsername] = useState('');

  useEffect(() => {
    if (authStatus.discogs.authenticated && authStatus.discogs.username) {
      loadWishlistSettings();
      loadSellerSettings();
    }
  }, [authStatus.discogs.authenticated, authStatus.discogs.username]);

  const loadWishlistSettings = useCallback(async () => {
    try {
      setWishlistLoading(true);
      const [settings, watchList] = await Promise.all([
        api.getWishlistSettings(),
        api.getVinylWatchList(),
      ]);
      setWishlistSettings(settings);
      setVinylWatchList(watchList);
    } catch (error) {
      console.warn('Failed to load wishlist settings:', error);
    } finally {
      setWishlistLoading(false);
    }
  }, [api]);

  const handleSaveWishlistSettings = async () => {
    if (!wishlistSettings) return;

    try {
      setWishlistLoading(true);
      setWishlistError('');
      const updated = await api.saveWishlistSettings(wishlistSettings);
      setWishlistSettings(updated);
      setWishlistSuccess('Wishlist settings saved');
    } catch (error) {
      setWishlistError(
        error instanceof Error ? error.message : 'Failed to save settings'
      );
    } finally {
      setWishlistLoading(false);
    }
  };

  const handleRemoveFromWatchList = async (masterId: number) => {
    try {
      await api.removeFromVinylWatch(masterId);
      setVinylWatchList(prev =>
        prev.filter(item => item.masterId !== masterId)
      );
      setWishlistSuccess('Removed from vinyl watch list');
    } catch (error) {
      setWishlistError(
        error instanceof Error
          ? error.message
          : 'Failed to remove from watch list'
      );
    }
  };

  const clearWishlistMessages = () => {
    setWishlistError('');
    setWishlistSuccess('');
  };

  // Seller monitoring functions
  const loadSellerSettings = useCallback(async () => {
    try {
      setSellerLoading(true);
      const settings = await api.getSellerSettings();
      setSellerSettings(settings);
    } catch (error) {
      console.warn('Failed to load seller settings:', error);
    } finally {
      setSellerLoading(false);
    }
  }, [api]);

  const handleSaveSellerSettings = async () => {
    if (!sellerSettings) return;

    try {
      setSellerLoading(true);
      setSellerError('');
      const updated = await api.saveSellerSettings(sellerSettings);
      setSellerSettings(updated);
      setSellerSuccess('Seller monitoring settings saved');
    } catch (error) {
      setSellerError(
        error instanceof Error ? error.message : 'Failed to save settings'
      );
    } finally {
      setSellerLoading(false);
    }
  };

  const handleQuickAddSeller = async () => {
    if (!quickAddUsername.trim()) {
      setSellerError('Username is required');
      return;
    }

    try {
      setSellerLoading(true);
      setSellerError('');
      await api.addSeller(quickAddUsername.trim());
      setQuickAddUsername('');
      setSellerSuccess(`Added seller: ${quickAddUsername.trim()}`);
    } catch (error) {
      setSellerError(
        error instanceof Error ? error.message : 'Failed to add seller'
      );
    } finally {
      setSellerLoading(false);
    }
  };

  const clearSellerMessages = () => {
    setSellerError('');
    setSellerSuccess('');
  };

  return (
    <div className='settings-wishlist-section'>
      {/* Wishlist Settings */}
      <div className='settings-section-card'>
        <div className='settings-section-header'>
          <span className='settings-section-icon'>💰</span>
          <div>
            <h3>Wishlist Settings</h3>
            <p className='settings-section-description'>
              Configure wishlist sync and price tracking preferences
            </p>
          </div>
        </div>

        <div className='settings-section-content'>
          {wishlistError && (
            <div className='error-message'>
              {wishlistError}
              <button className='btn btn-small' onClick={clearWishlistMessages}>
                Dismiss
              </button>
            </div>
          )}

          {wishlistSuccess && (
            <div className='message success'>
              {wishlistSuccess}
              <button className='btn btn-small' onClick={clearWishlistMessages}>
                Dismiss
              </button>
            </div>
          )}

          {wishlistLoading ? (
            <div className='loading'>
              <div className='spinner'></div>
              Loading wishlist settings...
            </div>
          ) : wishlistSettings ? (
            <div className='settings-form-grid'>
              {/* Price Threshold */}
              <div className='form-group'>
                <label className='form-label'>Price Threshold</label>
                <div className='settings-price-input'>
                  <input
                    type='number'
                    className='form-input'
                    value={wishlistSettings.priceThreshold || ''}
                    onChange={e =>
                      setWishlistSettings({
                        ...wishlistSettings,
                        priceThreshold: e.target.value
                          ? parseFloat(e.target.value)
                          : undefined,
                      })
                    }
                    placeholder='No limit'
                    min='0'
                    step='0.01'
                  />
                  <select
                    className='form-input'
                    value={wishlistSettings.currency}
                    onChange={e =>
                      setWishlistSettings({
                        ...wishlistSettings,
                        currency: e.target.value,
                      })
                    }
                  >
                    <option value='USD'>USD</option>
                    <option value='EUR'>EUR</option>
                    <option value='GBP'>GBP</option>
                    <option value='CAD'>CAD</option>
                    <option value='AUD'>AUD</option>
                    <option value='JPY'>JPY</option>
                  </select>
                </div>
                <span className='form-hint'>
                  Only show vinyl pressings below this price
                </span>
              </div>

              {/* Auto-Sync Interval */}
              <div className='form-group'>
                <label className='form-label'>Auto-Sync Interval</label>
                <select
                  className='form-input'
                  value={wishlistSettings.autoSyncInterval}
                  onChange={e =>
                    setWishlistSettings({
                      ...wishlistSettings,
                      autoSyncInterval: parseInt(e.target.value, 10),
                    })
                  }
                >
                  <option value='0'>Manual only</option>
                  <option value='1'>Every day</option>
                  <option value='3'>Every 3 days</option>
                  <option value='7'>Every week</option>
                  <option value='14'>Every 2 weeks</option>
                  <option value='30'>Every month</option>
                </select>
                <span className='form-hint'>
                  How often to sync your Discogs wishlist
                </span>
              </div>

              {/* Notify on Vinyl Available */}
              <div className='settings-sync-toggle'>
                <label className='settings-toggle-label'>
                  <input
                    type='checkbox'
                    checked={wishlistSettings.notifyOnVinylAvailable}
                    onChange={e =>
                      setWishlistSettings({
                        ...wishlistSettings,
                        notifyOnVinylAvailable: e.target.checked,
                      })
                    }
                  />
                  <span>Notify when vinyl becomes available</span>
                </label>
                <span className='settings-toggle-hint'>
                  Get notified when a watched item gets a vinyl pressing
                </span>
              </div>

              <button
                className='btn'
                onClick={handleSaveWishlistSettings}
                disabled={wishlistLoading}
              >
                Save Settings
              </button>
            </div>
          ) : (
            <div className='settings-empty-state'>
              {!authStatus.discogs.authenticated ? (
                <>
                  <p>
                    Please authenticate with Discogs to configure wishlist
                    settings.
                  </p>
                  <button
                    className='btn'
                    onClick={() => {
                      window.location.hash = 'settings?tab=connections';
                    }}
                  >
                    Connect Discogs
                  </button>
                </>
              ) : (
                <p>Unable to load wishlist settings. Please try again.</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Vinyl Watch List */}
      <div className='settings-section-card'>
        <div className='settings-section-header'>
          <span className='settings-section-icon'>👀</span>
          <div>
            <h3>Vinyl Watch List</h3>
            <p className='settings-section-description'>
              Albums you&apos;re watching for vinyl releases
            </p>
          </div>
          {vinylWatchList.length > 0 && (
            <span className='settings-section-badge'>
              {vinylWatchList.length}
            </span>
          )}
        </div>

        <div className='settings-section-content'>
          {vinylWatchList.length === 0 ? (
            <div className='settings-empty-state'>
              <p>No items in your vinyl watch list.</p>
              <p className='settings-hint-text'>
                Add items from the Wishlist page by clicking &quot;Watch for
                Vinyl&quot; on CD-only releases.
              </p>
            </div>
          ) : (
            <div className='settings-watch-list'>
              {vinylWatchList.map(item => (
                <div key={item.masterId} className='settings-watch-item'>
                  {item.coverImage && (
                    <img
                      src={item.coverImage}
                      alt={`${item.artist} - ${item.title}`}
                      className='settings-watch-item-cover'
                    />
                  )}
                  <div className='settings-watch-item-info'>
                    <div className='settings-watch-item-title'>
                      {item.title}
                    </div>
                    <div className='settings-watch-item-artist'>
                      {item.artist}
                    </div>
                    <div className='settings-watch-item-meta'>
                      Added: {new Date(item.addedAt).toLocaleDateString()}
                      {item.lastChecked && (
                        <span>
                          {' '}
                          · Last checked:{' '}
                          {new Date(item.lastChecked).toLocaleDateString()}
                        </span>
                      )}
                      {item.notified && (
                        <span className='settings-watch-item-notified'>
                          {' '}
                          · Vinyl available!
                        </span>
                      )}
                    </div>
                  </div>
                  <div className='settings-watch-item-actions'>
                    <a
                      href={`https://www.discogs.com/master/${item.masterId}`}
                      target='_blank'
                      rel='noopener noreferrer'
                      className='btn btn-small btn-secondary'
                    >
                      View on Discogs
                    </a>
                    <button
                      className='btn btn-small btn-danger'
                      onClick={() => handleRemoveFromWatchList(item.masterId)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Local Sellers Settings */}
      <div className='settings-section-card'>
        <div className='settings-section-header'>
          <span className='settings-section-icon'>🏪</span>
          <div>
            <h3>Local Sellers</h3>
            <p className='settings-section-description'>
              Configure local seller inventory scanning
            </p>
          </div>
        </div>

        <div className='settings-section-content'>
          {sellerError && (
            <div className='error-message'>
              {sellerError}
              <button className='btn btn-small' onClick={clearSellerMessages}>
                Dismiss
              </button>
            </div>
          )}

          {sellerSuccess && (
            <div className='message success'>
              {sellerSuccess}
              <button className='btn btn-small' onClick={clearSellerMessages}>
                Dismiss
              </button>
            </div>
          )}

          {sellerLoading ? (
            <div className='loading'>
              <div className='spinner'></div>
              Loading seller settings...
            </div>
          ) : sellerSettings ? (
            <div className='settings-form-grid'>
              {/* Quick Add Seller */}
              <div className='form-group'>
                <label className='form-label'>Quick Add Seller</label>
                <div className='settings-add-seller-row'>
                  <input
                    type='text'
                    className='form-input'
                    placeholder='Discogs username'
                    value={quickAddUsername}
                    onChange={e => setQuickAddUsername(e.target.value)}
                  />
                  <button
                    className='btn btn-secondary'
                    onClick={handleQuickAddSeller}
                    disabled={sellerLoading || !quickAddUsername.trim()}
                  >
                    Add
                  </button>
                </div>
                <span className='form-hint'>
                  Add a seller by their Discogs Marketplace username
                </span>
              </div>

              {/* Full Scan Frequency */}
              <div className='form-group'>
                <label className='form-label'>Full Scan Frequency</label>
                <select
                  className='form-input'
                  value={sellerSettings.scanFrequencyDays}
                  onChange={e =>
                    setSellerSettings({
                      ...sellerSettings,
                      scanFrequencyDays: parseInt(e.target.value, 10),
                    })
                  }
                >
                  <option value='1'>Daily</option>
                  <option value='3'>Every 3 days</option>
                  <option value='7'>Weekly</option>
                  <option value='14'>Every 2 weeks</option>
                </select>
                <span className='form-hint'>
                  How often to do a complete inventory scan
                </span>
              </div>

              {/* Notify on New Match */}
              <div className='settings-sync-toggle'>
                <label className='settings-toggle-label'>
                  <input
                    type='checkbox'
                    checked={sellerSettings.notifyOnNewMatch}
                    onChange={e =>
                      setSellerSettings({
                        ...sellerSettings,
                        notifyOnNewMatch: e.target.checked,
                      })
                    }
                  />
                  <span>Notify when matches are found</span>
                </label>
                <span className='settings-toggle-hint'>
                  Get notified when wishlist items are found at local sellers
                </span>
              </div>

              {/* Vinyl Only */}
              <div className='settings-sync-toggle'>
                <label className='settings-toggle-label'>
                  <input
                    type='checkbox'
                    checked={sellerSettings.vinylFormatsOnly}
                    onChange={e =>
                      setSellerSettings({
                        ...sellerSettings,
                        vinylFormatsOnly: e.target.checked,
                      })
                    }
                  />
                  <span>Only match vinyl formats</span>
                </label>
                <span className='settings-toggle-hint'>
                  Only show matches for vinyl records (LP, 12&quot;, 10&quot;,
                  7&quot;)
                </span>
              </div>

              <div className='settings-actions-row'>
                <button
                  className='btn'
                  onClick={handleSaveSellerSettings}
                  disabled={sellerLoading}
                >
                  Save Settings
                </button>

                <button
                  className='btn btn-outline'
                  onClick={() => {
                    window.location.hash = 'sellers';
                  }}
                >
                  Manage Sellers &rarr;
                </button>
              </div>
            </div>
          ) : (
            <div className='settings-empty-state'>
              {!authStatus.discogs.authenticated ? (
                <>
                  <p>
                    Please authenticate with Discogs to configure seller
                    monitoring.
                  </p>
                  <button
                    className='btn'
                    onClick={() => {
                      window.location.hash = 'settings?tab=connections';
                    }}
                  >
                    Connect Discogs
                  </button>
                </>
              ) : (
                <p>Unable to load seller settings. Please try again.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SettingsWishlistSection;
