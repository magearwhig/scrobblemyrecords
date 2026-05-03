import {
  Check,
  CheckCheck,
  Disc3,
  Plus,
  RefreshCw,
  Search,
  Settings as SettingsIcon,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import './LabelsPage.page.css';

import {
  LabelMonitoringSettings,
  LabelRelease,
  LabelScanStatus,
  MonitoredLabel,
} from '../../shared/types';
import { Badge } from '../components/ui/Badge';
import { Button, IconButton } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Modal, ModalFooter } from '../components/ui/Modal';
import { ProgressBar } from '../components/ui/ProgressBar';
import { ListItemSkeleton } from '../components/ui/Skeleton';
import { useApp } from '../context/AppContext';
import { useToast } from '../context/ToastContext';
import { useConfirmModal } from '../hooks/useConfirmModal';
import { getApiService } from '../services/api';

interface LabelsPageProps {
  embedded?: boolean;
}

type SortOption = 'newest' | 'year' | 'artist' | 'title';
type StatusFilter =
  | 'active'
  | 'all'
  | 'new'
  | 'in-collection'
  | 'in-wishlist'
  | 'seen'
  | 'dismissed';

interface DiscogsLabelMatch {
  id: number;
  name: string;
  thumbUrl?: string;
}

const LabelsPage: React.FC<LabelsPageProps> = ({ embedded = false }) => {
  const { state } = useApp();
  const { showToast } = useToast();
  const [confirmAction, ConfirmModal] = useConfirmModal();
  const api = getApiService(state.serverUrl);

  // Data state
  const [labels, setLabels] = useState<MonitoredLabel[]>([]);
  const [releases, setReleases] = useState<LabelRelease[]>([]);
  const [scanStatus, setScanStatus] = useState<LabelScanStatus | null>(null);
  const [settings, setSettings] = useState<LabelMonitoringSettings | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add-label modal state
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<DiscogsLabelMatch[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [addingLabelId, setAddingLabelId] = useState<number | null>(null);
  const [lookbackMonths, setLookbackMonths] = useState<number>(6);
  const [wishlistLabelOptions, setWishlistLabelOptions] = useState<
    Array<{ name: string; artists: string[]; count: number }>
  >([]);
  const [wishlistOptionsLoading, setWishlistOptionsLoading] = useState(false);

  // Settings modal state
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsDraft, setSettingsDraft] =
    useState<LabelMonitoringSettings | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  // Per-label action state
  const [removingLabelId, setRemovingLabelId] = useState<string | null>(null);
  const [scanningLabelId, setScanningLabelId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  // Filter / sort state
  const [filterLabelId, setFilterLabelId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');

  // Per-release action state
  const [actionReleaseId, setActionReleaseId] = useState<string | null>(null);
  const [bulkMarkingSeen, setBulkMarkingSeen] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [labelsData, releasesData, statusData, settingsData] =
        await Promise.all([
          api.getLabels(),
          api.getLabelReleases(),
          api.getLabelScanStatus(),
          api.getLabelSettings(),
        ]);
      setLabels(labelsData);
      setReleases(releasesData);
      setScanStatus(statusData);
      setSettings(settingsData);
      setLookbackMonths(settingsData.defaultLookbackMonths);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load label data');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Load wishlist label dropdown options when the Add dialog opens.
  // `api` is intentionally NOT in the dep array — it's a stable singleton in
  // production, but the test mock returns a fresh object on every render,
  // which would trigger an infinite refetch loop.
  useEffect(() => {
    if (!addDialogOpen) return;
    let cancelled = false;
    (async () => {
      try {
        setWishlistOptionsLoading(true);
        const list = await api.getWishlistLabelOptions();
        if (!cancelled) setWishlistLabelOptions(list);
      } catch {
        if (!cancelled) setWishlistLabelOptions([]);
      } finally {
        if (!cancelled) setWishlistOptionsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addDialogOpen, labels.length]);

  // Poll while scanning
  useEffect(() => {
    if (scanStatus?.status !== 'scanning') return undefined;
    const id = window.setInterval(async () => {
      try {
        const next = await api.getLabelScanStatus();
        setScanStatus(next);
        if (next.status !== 'scanning') {
          // Scan finished — refresh dependent data
          const [labelsData, releasesData] = await Promise.all([
            api.getLabels(),
            api.getLabelReleases(),
          ]);
          setLabels(labelsData);
          setReleases(releasesData);
          if (next.status === 'completed') {
            const found = next.releasesFound ?? 0;
            showToast(
              'success',
              found > 0
                ? `Scan complete — ${found} new release${found !== 1 ? 's' : ''} found`
                : 'Scan complete — no new releases'
            );
          } else if (next.status === 'error') {
            showToast('error', next.error || 'Label scan failed');
          }
        }
      } catch {
        // Polling errors are non-critical
      }
    }, 2500);
    return () => window.clearInterval(id);
  }, [scanStatus?.status, api, showToast]);

  const handleSearchLabels = useCallback(
    async (overrideQuery?: string) => {
      const q = (overrideQuery ?? searchQuery).trim();
      if (q.length < 2) {
        setSearchError('Enter at least 2 characters');
        return;
      }
      try {
        setSearchLoading(true);
        setSearchError(null);
        const results = await api.searchDiscogsLabels(q);
        setSearchResults(results);
        if (results.length === 0) {
          setSearchError('No labels matched that query');
        }
      } catch (e) {
        setSearchError(
          e instanceof Error ? e.message : 'Could not search Discogs labels'
        );
      } finally {
        setSearchLoading(false);
      }
    },
    [api, searchQuery]
  );

  const handleWishlistLabelSelect = (name: string) => {
    if (!name) return;
    setSearchQuery(name);
    handleSearchLabels(name);
  };

  const resetAddDialog = () => {
    setSearchQuery('');
    setSearchResults([]);
    setSearchError(null);
    setAddingLabelId(null);
  };

  const handleAddLabel = async (match: DiscogsLabelMatch) => {
    try {
      setAddingLabelId(match.id);
      await api.addLabel(match.id, match.name, lookbackMonths);
      showToast('success', `Now monitoring ${match.name}`);
      // Keep the modal open so power users can add several labels in succession.
      // Just clear the search so they can immediately query a different name.
      setSearchQuery('');
      setSearchResults([]);
      setSearchError(null);
      // Reload labels
      const labelsData = await api.getLabels();
      setLabels(labelsData);
    } catch (e) {
      showToast(
        'error',
        e instanceof Error ? e.message : 'Could not add label'
      );
    } finally {
      setAddingLabelId(null);
    }
  };

  const handleMarkReleaseSeen = async (release: LabelRelease) => {
    try {
      setActionReleaseId(release.id);
      await api.markLabelReleaseSeen(release.id);
      setReleases(prev =>
        prev.map(r => (r.id === release.id ? { ...r, status: 'seen' } : r))
      );
    } catch (e) {
      showToast(
        'error',
        e instanceof Error ? e.message : 'Could not mark release as seen'
      );
    } finally {
      setActionReleaseId(null);
    }
  };

  const handleDismissRelease = async (release: LabelRelease) => {
    try {
      setActionReleaseId(release.id);
      await api.dismissLabelRelease(release.id);
      setReleases(prev =>
        prev.map(r => (r.id === release.id ? { ...r, status: 'dismissed' } : r))
      );
    } catch (e) {
      showToast(
        'error',
        e instanceof Error ? e.message : 'Could not dismiss release'
      );
    } finally {
      setActionReleaseId(null);
    }
  };

  const handleRemoveLabel = async (label: MonitoredLabel) => {
    const confirmed = await confirmAction(
      `Stop monitoring ${label.name}? This will also remove its detected releases.`,
      { title: 'Remove Label', confirmLabel: 'Remove' }
    );
    if (!confirmed) return;
    try {
      setRemovingLabelId(label.id);
      await api.removeLabel(label.id);
      setLabels(prev => prev.filter(l => l.id !== label.id));
      setReleases(prev => prev.filter(r => r.labelId !== label.id));
    } catch (e) {
      showToast(
        'error',
        e instanceof Error ? e.message : 'Could not remove label'
      );
    } finally {
      setRemovingLabelId(null);
    }
  };

  const handleScanAll = async () => {
    try {
      const next = await api.scanLabels();
      setScanStatus(next);
    } catch (e) {
      showToast(
        'error',
        e instanceof Error ? e.message : 'Could not start scan'
      );
    }
  };

  const handleScanSingle = async (label: MonitoredLabel) => {
    try {
      setScanningLabelId(label.id);
      const next = await api.scanSingleLabel(label.id);
      setScanStatus(next);
    } catch (e) {
      showToast(
        'error',
        e instanceof Error ? e.message : 'Could not start label scan'
      );
    } finally {
      setScanningLabelId(null);
    }
  };

  const handleCancelScan = async () => {
    try {
      setCancelling(true);
      await api.cancelLabelScan();
      const next = await api.getLabelScanStatus();
      setScanStatus(next);
    } catch (e) {
      showToast(
        'error',
        e instanceof Error ? e.message : 'Could not cancel scan'
      );
    } finally {
      setCancelling(false);
    }
  };

  const handleOpenSettings = () => {
    setSettingsDraft(settings);
    setSettingsOpen(true);
  };

  const handleSaveSettings = async () => {
    if (!settingsDraft) return;
    try {
      setSavingSettings(true);
      const updated = await api.updateLabelSettings({
        defaultLookbackMonths: settingsDraft.defaultLookbackMonths,
        autoScanIntervalHours: settingsDraft.autoScanIntervalHours,
      });
      setSettings(updated);
      setSettingsOpen(false);
      showToast('success', 'Label settings saved');
    } catch (e) {
      showToast(
        'error',
        e instanceof Error ? e.message : 'Could not save settings'
      );
    } finally {
      setSavingSettings(false);
    }
  };

  const releaseCountByLabelId = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of releases) {
      counts.set(r.labelId, (counts.get(r.labelId) ?? 0) + 1);
    }
    return counts;
  }, [releases]);

  const filteredReleases = useMemo(() => {
    let filtered = releases.slice();
    if (filterLabelId) {
      filtered = filtered.filter(r => r.labelId === filterLabelId);
    }
    if (statusFilter === 'active') {
      // Default — hide both seen and dismissed (the noise the user has acted on).
      filtered = filtered.filter(
        r => r.status !== 'seen' && r.status !== 'dismissed'
      );
    } else if (statusFilter !== 'all') {
      filtered = filtered.filter(r => r.status === statusFilter);
    }
    // 'all' → no status filter applied (shows seen + dismissed too)
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'newest':
          return b.addedAt - a.addedAt;
        case 'year':
          // Newest year first; missing year sinks to bottom
          return (b.year ?? 0) - (a.year ?? 0);
        case 'artist':
          return a.artist.localeCompare(b.artist);
        case 'title':
          return a.title.localeCompare(b.title);
        default:
          return 0;
      }
    });
    return filtered;
  }, [releases, filterLabelId, statusFilter, sortBy]);

  // "Mark all as seen" — apply to currently visible (filtered) releases.
  const markAllVisibleSeenCount = useMemo(
    () => filteredReleases.filter(r => r.status === 'new').length,
    [filteredReleases]
  );

  const handleMarkAllVisibleSeen = async () => {
    const targetIds = filteredReleases
      .filter(r => r.status === 'new')
      .map(r => r.id);
    if (targetIds.length === 0) return;
    try {
      setBulkMarkingSeen(true);
      // Single bulk request — concurrent single-item writes race against the
      // shared releases.json file and only the last write survives.
      const result = await api.bulkMarkLabelReleasesSeen(targetIds);
      const succeeded = new Set(
        targetIds.filter(id => !result.missing.includes(id))
      );
      setReleases(prev =>
        prev.map(r => (succeeded.has(r.id) ? { ...r, status: 'seen' } : r))
      );
      if (result.missing.length > 0) {
        showToast(
          'warning',
          `Marked ${result.updated} as seen — ${result.missing.length} not found`
        );
      } else {
        showToast(
          'success',
          `Marked ${result.updated} release${result.updated !== 1 ? 's' : ''} as seen`
        );
      }
    } catch (e) {
      showToast(
        'error',
        e instanceof Error ? e.message : 'Could not mark releases as seen'
      );
    } finally {
      setBulkMarkingSeen(false);
    }
  };

  const formatRelativeTime = (timestamp?: number): string => {
    if (!timestamp) return 'Never';
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
    if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
    return `${days} day${days !== 1 ? 's' : ''} ago`;
  };

  const renderStatusBadge = (status: LabelRelease['status']) => {
    switch (status) {
      case 'in-collection':
        return (
          <Badge variant='success' size='small'>
            In Collection
          </Badge>
        );
      case 'in-wishlist':
        return (
          <Badge variant='info' size='small'>
            In Wishlist
          </Badge>
        );
      case 'seen':
        return (
          <Badge variant='secondary' size='small'>
            Seen
          </Badge>
        );
      case 'dismissed':
        return (
          <Badge variant='secondary' size='small'>
            Dismissed
          </Badge>
        );
      case 'new':
      default:
        return (
          <Badge variant='primary' size='small'>
            New
          </Badge>
        );
    }
  };

  if (loading) {
    return (
      <div className='labels-page'>
        {!embedded && <h1>Monitored Labels</h1>}
        <div className='labels-loading'>
          <ListItemSkeleton count={4} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className='labels-page'>
        {!embedded && <h1>Monitored Labels</h1>}
        <EmptyState
          title='Could not load labels'
          description={error}
          actions={[{ label: 'Try Again', onClick: loadAll }]}
        />
      </div>
    );
  }

  const isScanning = scanStatus?.status === 'scanning';

  return (
    <div className='labels-page'>
      {ConfirmModal}
      {!embedded && (
        <>
          <h1>Monitored Labels</h1>
          <p className='page-description'>
            Watch specific Discogs labels for new releases.
          </p>
        </>
      )}

      <div className='labels-header'>
        <Button
          onClick={() => setAddDialogOpen(true)}
          iconLeft={<Plus size={16} aria-hidden='true' />}
        >
          Add Label
        </Button>
        <div className='labels-header-actions'>
          <Button
            variant='secondary'
            onClick={handleScanAll}
            disabled={isScanning || labels.length === 0}
            iconLeft={<RefreshCw size={16} aria-hidden='true' />}
          >
            {isScanning ? 'Scanning...' : 'Scan All Labels'}
          </Button>
          <IconButton
            variant='outline'
            aria-label='Label monitoring settings'
            onClick={handleOpenSettings}
            icon={<SettingsIcon size={18} aria-hidden='true' />}
          />
        </div>
      </div>

      {isScanning && (
        <div className='labels-scan-progress'>
          <div className='labels-scan-progress-text'>
            Scanning {scanStatus?.currentLabelName || '...'}
            {scanStatus?.totalLabels
              ? ` (${scanStatus.processedLabels ?? 0} of ${scanStatus.totalLabels} labels)`
              : ''}
          </div>
          <ProgressBar
            value={
              scanStatus?.totalLabels && scanStatus.totalLabels > 0
                ? Math.round(
                    ((scanStatus.processedLabels ?? 0) /
                      scanStatus.totalLabels) *
                      100
                  )
                : 0
            }
            indeterminate={!scanStatus?.totalLabels}
            size='small'
            animated
          />
          {(scanStatus?.releasesFound ?? 0) > 0 && (
            <div className='labels-scan-found'>
              {scanStatus?.releasesFound} new release
              {scanStatus?.releasesFound !== 1 ? 's' : ''} found
            </div>
          )}
          <div className='labels-scan-actions'>
            <Button
              variant='outline'
              size='small'
              onClick={handleCancelScan}
              disabled={cancelling}
            >
              {cancelling ? 'Cancelling...' : 'Cancel Scan'}
            </Button>
          </div>
        </div>
      )}

      {scanStatus?.status === 'completed' && scanStatus.completedAt && (
        <div className='labels-scan-meta'>
          Last scan: {formatRelativeTime(scanStatus.completedAt)}
          {(scanStatus.releasesFound ?? 0) > 0 &&
            ` — ${scanStatus.releasesFound} release${scanStatus.releasesFound !== 1 ? 's' : ''} found`}
        </div>
      )}

      {scanStatus?.status === 'error' && scanStatus.error && (
        <div className='labels-scan-error'>Scan error: {scanStatus.error}</div>
      )}

      {labels.length === 0 ? (
        <div className='card'>
          <EmptyState
            icon={<Tag size={40} aria-hidden='true' />}
            title='No Labels Monitored'
            description='Add a Discogs label to track its newest releases. Try a label that recently released something you missed.'
            actions={[
              {
                label: 'Add Your First Label',
                onClick: () => setAddDialogOpen(true),
              },
            ]}
          />
        </div>
      ) : (
        <div className='labels-list'>
          {labels.map(label => {
            const releaseCount = releaseCountByLabelId.get(label.id) ?? 0;
            return (
              <article key={label.id} className='label-card'>
                <div className='label-card-info'>
                  <div className='label-card-name'>
                    <Tag size={16} aria-hidden='true' /> {label.name}
                  </div>
                  <div className='label-card-meta'>
                    Added {formatRelativeTime(label.addedAt)} · Last scanned{' '}
                    {formatRelativeTime(label.lastScannedAt)} · {releaseCount}{' '}
                    release{releaseCount !== 1 ? 's' : ''} detected · Lookback{' '}
                    {label.lookbackMonths} mo
                  </div>
                </div>
                <div className='label-card-actions'>
                  <Button
                    variant='secondary'
                    size='small'
                    onClick={() => handleScanSingle(label)}
                    disabled={isScanning || scanningLabelId === label.id}
                    iconLeft={<RefreshCw size={16} aria-hidden='true' />}
                  >
                    Scan
                  </Button>
                  <IconButton
                    variant='outline'
                    size='small'
                    aria-label={`Remove ${label.name}`}
                    onClick={() => handleRemoveLabel(label)}
                    disabled={removingLabelId === label.id}
                    icon={<Trash2 size={16} aria-hidden='true' />}
                  />
                </div>
              </article>
            );
          })}
        </div>
      )}

      {labels.length > 0 && (
        <section className='label-releases-section'>
          <header className='label-releases-header'>
            <h2 className='label-releases-title'>
              <Disc3 size={20} aria-hidden='true' /> Detected Releases
              <span className='label-releases-count'>
                ({filteredReleases.length}
                {filteredReleases.length !== releases.length
                  ? ` of ${releases.length}`
                  : ''}
                )
              </span>
            </h2>
            <div className='label-releases-controls'>
              <div className='form-group'>
                <label className='form-label' htmlFor='label-filter-label'>
                  Label
                </label>
                <select
                  id='label-filter-label'
                  className='form-input'
                  value={filterLabelId ?? ''}
                  onChange={e => setFilterLabelId(e.target.value || null)}
                >
                  <option value=''>All Labels</option>
                  {labels.map(l => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className='form-group'>
                <label className='form-label' htmlFor='label-filter-status'>
                  Status
                </label>
                <select
                  id='label-filter-status'
                  className='form-input'
                  value={statusFilter}
                  onChange={e =>
                    setStatusFilter(e.target.value as StatusFilter)
                  }
                >
                  <option value='active'>Active (hide seen + dismissed)</option>
                  <option value='new'>New</option>
                  <option value='in-wishlist'>In Wishlist</option>
                  <option value='in-collection'>In Collection</option>
                  <option value='seen'>Seen</option>
                  <option value='dismissed'>Dismissed</option>
                  <option value='all'>Show all</option>
                </select>
              </div>
              <div className='form-group'>
                <label className='form-label' htmlFor='label-sort'>
                  Sort by
                </label>
                <select
                  id='label-sort'
                  className='form-input'
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value as SortOption)}
                >
                  <option value='newest'>Detected (Newest First)</option>
                  <option value='year'>Release Year (Newest First)</option>
                  <option value='artist'>Artist A-Z</option>
                  <option value='title'>Title A-Z</option>
                </select>
              </div>
              <div className='label-releases-bulk-action'>
                <Button
                  variant='secondary'
                  size='small'
                  onClick={handleMarkAllVisibleSeen}
                  disabled={bulkMarkingSeen || markAllVisibleSeenCount === 0}
                  iconLeft={<CheckCheck size={16} aria-hidden='true' />}
                  title={
                    markAllVisibleSeenCount === 0
                      ? 'No new releases in current view'
                      : `Mark ${markAllVisibleSeenCount} new release${markAllVisibleSeenCount !== 1 ? 's' : ''} as seen`
                  }
                >
                  {bulkMarkingSeen
                    ? 'Marking...'
                    : `Mark ${markAllVisibleSeenCount > 0 ? markAllVisibleSeenCount : 'all'} as seen`}
                </Button>
              </div>
            </div>
          </header>

          {filteredReleases.length === 0 ? (
            <div className='card'>
              <EmptyState
                icon={<Disc3 size={40} aria-hidden='true' />}
                title='No Releases Detected'
                description={
                  releases.length === 0
                    ? 'Run a scan to discover recent releases for your monitored labels.'
                    : 'No releases match the current filters.'
                }
                size='small'
              />
            </div>
          ) : (
            <ul className='label-release-list'>
              {filteredReleases.map(release => {
                const labelName =
                  labels.find(l => l.id === release.labelId)?.name ??
                  'Unknown label';
                const isActioning = actionReleaseId === release.id;
                const canMarkSeen = release.status === 'new';
                const canDismiss =
                  release.status !== 'dismissed' && release.status !== 'seen';
                return (
                  <li key={release.id} className='label-release-card'>
                    {release.thumbUrl && (
                      <img
                        className='label-release-thumb'
                        src={release.thumbUrl}
                        alt=''
                        loading='lazy'
                      />
                    )}
                    <div className='label-release-info'>
                      <div className='label-release-title'>
                        <span className='label-release-artist'>
                          {release.artist}
                        </span>{' '}
                        — {release.title}
                      </div>
                      <div className='label-release-meta'>
                        {labelName}
                        {release.year ? ` · ${release.year}` : ''}
                        {release.format && release.format.length > 0
                          ? ` · ${release.format.join(', ')}`
                          : ''}
                        {' · '}detected {formatRelativeTime(release.addedAt)}
                      </div>
                    </div>
                    <div className='label-release-status'>
                      {renderStatusBadge(release.status)}
                      {(canMarkSeen || canDismiss) && (
                        <div className='label-release-actions'>
                          {canMarkSeen && (
                            <IconButton
                              variant='ghost'
                              size='small'
                              aria-label={`Mark ${release.title} as seen`}
                              title='Mark as seen'
                              onClick={() => handleMarkReleaseSeen(release)}
                              disabled={isActioning}
                              icon={<Check size={16} aria-hidden='true' />}
                            />
                          )}
                          {canDismiss && (
                            <IconButton
                              variant='ghost'
                              size='small'
                              aria-label={`Dismiss ${release.title}`}
                              title='Dismiss'
                              onClick={() => handleDismissRelease(release)}
                              disabled={isActioning}
                              icon={<X size={16} aria-hidden='true' />}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {/* Add Label Modal */}
      <Modal
        isOpen={addDialogOpen}
        onClose={() => {
          setAddDialogOpen(false);
          resetAddDialog();
        }}
        title='Add Label to Monitor'
        size='medium'
      >
        {(wishlistOptionsLoading || wishlistLabelOptions.length > 0) && (
          <div className='form-group'>
            <label className='form-label' htmlFor='label-wishlist-select'>
              Pick from wishlist
            </label>
            <select
              id='label-wishlist-select'
              className='form-input'
              value=''
              disabled={wishlistOptionsLoading || searchLoading}
              onChange={e => {
                handleWishlistLabelSelect(e.target.value);
                e.target.value = '';
              }}
            >
              <option value=''>
                {wishlistOptionsLoading
                  ? 'Loading…'
                  : `Select a label (${wishlistLabelOptions.length})`}
              </option>
              {wishlistLabelOptions.map(opt => (
                <option key={opt.name} value={opt.name}>
                  {opt.artists.length > 0
                    ? `${opt.name} — ${opt.artists.join(', ')}`
                    : opt.name}
                </option>
              ))}
            </select>
            <span className='form-hint'>
              Every label that appears on a release in your Discogs wishlist.
              Selecting one fills the search box and runs the Discogs label
              search so you can pick the right label.
            </span>
          </div>
        )}
        <div className='form-group'>
          <label className='form-label' htmlFor='label-search-input'>
            Search Discogs labels
          </label>
          <div className='label-search-row'>
            <input
              id='label-search-input'
              type='text'
              className='form-input'
              placeholder='e.g. Backwoodz Studioz'
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSearchLabels();
                }
              }}
              autoFocus
            />
            <Button
              onClick={() => handleSearchLabels()}
              disabled={searchLoading || searchQuery.trim().length < 2}
              iconLeft={<Search size={16} aria-hidden='true' />}
            >
              {searchLoading ? 'Searching...' : 'Search'}
            </Button>
          </div>
          <span className='form-hint'>
            Pick the closest match — Discogs labels often have similar names.
          </span>
        </div>
        <div className='form-group'>
          <label className='form-label' htmlFor='label-lookback-input'>
            Lookback window (months)
          </label>
          <input
            id='label-lookback-input'
            type='number'
            className='form-input'
            min={1}
            max={36}
            value={lookbackMonths}
            onChange={e =>
              setLookbackMonths(
                Math.max(1, Math.min(36, Number(e.target.value) || 1))
              )
            }
          />
          <span className='form-hint'>
            How far back to scan for new releases. Lower = faster scans.
          </span>
        </div>
        {searchError && <div className='form-error'>{searchError}</div>}
        {searchResults.length > 0 && (
          <ul className='label-search-results'>
            {searchResults.map(match => {
              const alreadyMonitored = labels.some(
                l => l.discogsLabelId === match.id
              );
              return (
                <li key={match.id} className='label-search-result'>
                  {match.thumbUrl && (
                    <img
                      className='label-search-thumb'
                      src={match.thumbUrl}
                      alt=''
                      loading='lazy'
                    />
                  )}
                  <span className='label-search-name'>{match.name}</span>
                  <Button
                    size='small'
                    onClick={() => handleAddLabel(match)}
                    disabled={addingLabelId === match.id || alreadyMonitored}
                  >
                    {alreadyMonitored
                      ? 'Already added'
                      : addingLabelId === match.id
                        ? 'Adding...'
                        : 'Add'}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
        <ModalFooter>
          <Button
            variant='secondary'
            onClick={() => {
              setAddDialogOpen(false);
              resetAddDialog();
            }}
            iconLeft={<X size={16} aria-hidden='true' />}
          >
            Close
          </Button>
        </ModalFooter>
      </Modal>

      {/* Settings Modal */}
      <Modal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title='Label Monitoring Settings'
        size='small'
      >
        <div className='form-group'>
          <label className='form-label' htmlFor='label-settings-lookback'>
            Default lookback (months)
          </label>
          <input
            id='label-settings-lookback'
            type='number'
            className='form-input'
            min={1}
            max={36}
            value={settingsDraft?.defaultLookbackMonths ?? 6}
            onChange={e =>
              setSettingsDraft(prev =>
                prev
                  ? {
                      ...prev,
                      defaultLookbackMonths: Math.max(
                        1,
                        Math.min(36, Number(e.target.value) || 1)
                      ),
                    }
                  : prev
              )
            }
          />
          <span className='form-hint'>
            Default lookback window applied to newly added labels.
          </span>
        </div>
        <div className='form-group'>
          <label className='form-label' htmlFor='label-settings-autoscan'>
            Auto-scan interval (hours)
          </label>
          <input
            id='label-settings-autoscan'
            type='number'
            className='form-input'
            min={0}
            max={168}
            value={settingsDraft?.autoScanIntervalHours ?? 0}
            onChange={e =>
              setSettingsDraft(prev =>
                prev
                  ? {
                      ...prev,
                      autoScanIntervalHours:
                        Number(e.target.value) > 0
                          ? Number(e.target.value)
                          : undefined,
                    }
                  : prev
              )
            }
          />
          <span className='form-hint'>
            Set to 0 to disable automatic scans.
          </span>
        </div>
        <ModalFooter>
          <Button
            variant='secondary'
            onClick={() => setSettingsOpen(false)}
            disabled={savingSettings}
          >
            Cancel
          </Button>
          <Button onClick={handleSaveSettings} disabled={savingSettings}>
            {savingSettings ? 'Saving...' : 'Save Settings'}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
};

export default LabelsPage;
