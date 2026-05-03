import {
  AlertTriangle,
  Check,
  CheckCheck,
  CheckCircle,
  Eye,
  Globe,
  Pencil,
  Plus,
  RefreshCw,
  Settings as SettingsIcon,
  Trash2,
  X,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import './WebsitesPage.page.css';

import {
  MonitoredWebsite,
  WebsiteItem,
  WebsiteMonitoringSettings,
  WebsiteScanStatus,
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

interface WebsitesPageProps {
  embedded?: boolean;
}

type SortOption = 'newest' | 'confidence' | 'artist' | 'title';
type StatusFilter =
  | 'active'
  | 'all'
  | 'new'
  | 'seen'
  | 'purchased'
  | 'dismissed';

interface WebsiteFormState {
  id?: string;
  name: string;
  url: string;
  cssSelector: string;
  useOllama: boolean;
  enabled: boolean;
}

const EMPTY_FORM: WebsiteFormState = {
  name: '',
  url: '',
  cssSelector: '',
  useOllama: true,
  enabled: true,
};

const WebsitesPage: React.FC<WebsitesPageProps> = ({ embedded = false }) => {
  const { state } = useApp();
  const { showToast } = useToast();
  const [confirmAction, ConfirmModal] = useConfirmModal();
  const api = getApiService(state.serverUrl);

  // Data
  const [websites, setWebsites] = useState<MonitoredWebsite[]>([]);
  const [items, setItems] = useState<WebsiteItem[]>([]);
  const [scanStatus, setScanStatus] = useState<WebsiteScanStatus | null>(null);
  const [settings, setSettings] = useState<WebsiteMonitoringSettings | null>(
    null
  );
  const [ollamaStatus, setOllamaStatus] = useState<{
    available: boolean;
    model?: string;
    error?: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add/Edit modal state
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<WebsiteFormState>(EMPTY_FORM);
  const [formMode, setFormMode] = useState<'add' | 'edit'>('add');
  const [savingForm, setSavingForm] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewItems, setPreviewItems] = useState<WebsiteItem[] | null>(null);
  const [previewWarning, setPreviewWarning] = useState<string | null>(null);
  const [suggestedCssSelector, setSuggestedCssSelector] = useState<
    string | null
  >(null);
  const [labelWebsiteSuggestions, setLabelWebsiteSuggestions] = useState<
    Array<{
      url: string;
      suggestedName: string;
      sourceType: 'label' | 'artist';
      sourceName: string;
      kind: 'bandcamp' | 'soundcloud' | 'homepage' | 'other';
    }>
  >([]);
  const [labelSuggestionsLoading, setLabelSuggestionsLoading] = useState(false);
  const [wishlistArtistOptions, setWishlistArtistOptions] = useState<
    Array<{
      name: string;
      count: number;
      sources: Array<'wishlist' | 'local-want'>;
    }>
  >([]);
  const [artistOptionsLoading, setArtistOptionsLoading] = useState(false);
  const [selectedArtist, setSelectedArtist] = useState<string>('');
  const [artistUrls, setArtistUrls] = useState<
    Array<{
      url: string;
      kind: 'bandcamp' | 'soundcloud' | 'homepage' | 'other';
    }>
  >([]);
  const [artistUrlsLoading, setArtistUrlsLoading] = useState(false);

  // Settings modal state
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsDraft, setSettingsDraft] =
    useState<WebsiteMonitoringSettings | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  // Per-row state
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [scanningId, setScanningId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  // Filter / sort
  const [filterWebsiteId, setFilterWebsiteId] = useState<string | null>(null);
  type MatchFilter =
    | 'all'
    | 'any-match'
    | 'no-match'
    | 'wishlist'
    | 'want-list'
    | 'collection'
    | 'lastfm';
  const [matchFilter, setMatchFilter] = useState<MatchFilter>('all');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');

  // Per-item action state
  const [actionItemId, setActionItemId] = useState<string | null>(null);
  const [bulkMarkingSeen, setBulkMarkingSeen] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [websitesData, itemsData, statusData, settingsData, ollama] =
        await Promise.all([
          api.getWebsites(),
          api.getWebsiteItems(),
          api.getWebsiteScanStatus(),
          api.getWebsiteSettings(),
          api.getOllamaStatus().catch(err => ({
            available: false,
            error: err instanceof Error ? err.message : 'Unknown error',
          })),
        ]);
      setWebsites(websitesData);
      setItems(itemsData);
      setScanStatus(statusData);
      setSettings(settingsData);
      setOllamaStatus(ollama);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load website data');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // When Add Website opens, load the monitored-label suggestion chips AND the
  // wishlist artist dropdown options in parallel. `api` is intentionally NOT
  // in the dep arrays — it's a stable singleton in production, but the test
  // mock returns a fresh object on every render which would loop fetches.
  useEffect(() => {
    if (!formOpen || formMode !== 'add') return;
    let cancelled = false;
    (async () => {
      try {
        setLabelSuggestionsLoading(true);
        const list = await api.getWebsiteSuggestions(websites.map(w => w.url));
        if (!cancelled) setLabelWebsiteSuggestions(list);
      } catch {
        if (!cancelled) setLabelWebsiteSuggestions([]);
      } finally {
        if (!cancelled) setLabelSuggestionsLoading(false);
      }
    })();
    (async () => {
      try {
        setArtistOptionsLoading(true);
        const list = await api.getWishlistArtistOptions();
        if (!cancelled) setWishlistArtistOptions(list);
      } catch {
        if (!cancelled) setWishlistArtistOptions([]);
      } finally {
        if (!cancelled) setArtistOptionsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formOpen, formMode, websites.length]);

  // Reset artist-derived state whenever the dialog re-opens
  useEffect(() => {
    if (!formOpen) {
      setSelectedArtist('');
      setArtistUrls([]);
    }
  }, [formOpen]);

  const handleSelectArtist = useCallback(
    async (artistName: string) => {
      setSelectedArtist(artistName);
      setArtistUrls([]);
      if (!artistName) return;
      try {
        setArtistUrlsLoading(true);
        const urls = await api.getArtistWebsiteUrls(artistName);
        setArtistUrls(urls);
        if (urls.length === 0) {
          showToast(
            'info',
            `No bandcamp / homepage URLs found on Discogs for ${artistName}`
          );
        }
      } catch (e) {
        showToast(
          'error',
          e instanceof Error
            ? e.message
            : `Could not look up URLs for ${artistName}`
        );
      } finally {
        setArtistUrlsLoading(false);
      }
    },
    [api, showToast]
  );

  // Poll while scanning
  useEffect(() => {
    if (scanStatus?.status !== 'scanning') return undefined;
    const id = window.setInterval(async () => {
      try {
        const next = await api.getWebsiteScanStatus();
        setScanStatus(next);
        if (next.status !== 'scanning') {
          const [websitesData, itemsData] = await Promise.all([
            api.getWebsites(),
            api.getWebsiteItems(),
          ]);
          setWebsites(websitesData);
          setItems(itemsData);
          if (next.status === 'completed') {
            const found = next.itemsFound ?? 0;
            showToast(
              'success',
              found > 0
                ? `Scan complete — ${found} new item${found !== 1 ? 's' : ''} found`
                : 'Scan complete — no new items'
            );
          } else if (next.status === 'error') {
            showToast('error', next.error || 'Website scan failed');
          }
        }
      } catch {
        // Ignore polling errors
      }
    }, 2500);
    return () => window.clearInterval(id);
  }, [scanStatus?.status, api, showToast]);

  const openAddDialog = () => {
    setForm(EMPTY_FORM);
    setFormMode('add');
    setPreviewItems(null);
    setPreviewWarning(null);
    setSuggestedCssSelector(null);
    setFormOpen(true);
  };

  const openEditDialog = (website: MonitoredWebsite) => {
    setForm({
      id: website.id,
      name: website.name,
      url: website.url,
      cssSelector: website.cssSelector ?? '',
      useOllama: website.useOllama,
      enabled: website.enabled,
    });
    setFormMode('edit');
    setPreviewItems(null);
    setPreviewWarning(null);
    setSuggestedCssSelector(null);
    setFormOpen(true);
  };

  const handlePreview = async () => {
    if (!form.url.trim()) {
      showToast('warning', 'URL is required for preview');
      return;
    }
    try {
      setPreviewing(true);
      setPreviewItems(null);
      setPreviewWarning(null);
      setSuggestedCssSelector(null);
      const result = await api.previewWebsite({
        url: form.url.trim(),
        cssSelector: form.cssSelector.trim() || undefined,
        useOllama: form.useOllama,
      });
      setPreviewItems(result.items);
      setSuggestedCssSelector(result.suggestedCssSelector ?? null);
      if (result.warning) {
        setPreviewWarning(result.warning);
      } else if (!result.ollamaAvailable && form.useOllama) {
        setPreviewWarning(
          'Ollama is not available — showing best-effort fallback extraction.'
        );
      }
    } catch (e) {
      showToast(
        'error',
        e instanceof Error ? e.message : 'Could not preview extraction'
      );
    } finally {
      setPreviewing(false);
    }
  };

  const handleSaveWebsite = async () => {
    if (!form.name.trim() || !form.url.trim()) {
      showToast('warning', 'Name and URL are required');
      return;
    }
    try {
      setSavingForm(true);
      if (formMode === 'add') {
        const created = await api.addWebsite({
          name: form.name.trim(),
          url: form.url.trim(),
          cssSelector: form.cssSelector.trim() || undefined,
          useOllama: form.useOllama,
          enabled: form.enabled,
        });
        setWebsites(prev => [...prev, created]);
        showToast('success', `Now monitoring ${created.name}`);
      } else if (form.id) {
        const updated = await api.updateWebsite(form.id, {
          name: form.name.trim(),
          url: form.url.trim(),
          cssSelector: form.cssSelector.trim() || undefined,
          useOllama: form.useOllama,
          enabled: form.enabled,
        });
        setWebsites(prev => prev.map(w => (w.id === updated.id ? updated : w)));
        showToast('success', `Updated ${updated.name}`);
      }
      setFormOpen(false);
    } catch (e) {
      showToast(
        'error',
        e instanceof Error ? e.message : 'Could not save website'
      );
    } finally {
      setSavingForm(false);
    }
  };

  const handleRemoveWebsite = async (website: MonitoredWebsite) => {
    const confirmed = await confirmAction(
      `Stop monitoring ${website.name}? This will also remove its detected items.`,
      { title: 'Remove Website', confirmLabel: 'Remove' }
    );
    if (!confirmed) return;
    try {
      setRemovingId(website.id);
      await api.removeWebsite(website.id);
      setWebsites(prev => prev.filter(w => w.id !== website.id));
      setItems(prev => prev.filter(i => i.websiteId !== website.id));
    } catch (e) {
      showToast(
        'error',
        e instanceof Error ? e.message : 'Could not remove website'
      );
    } finally {
      setRemovingId(null);
    }
  };

  const handleToggleEnabled = async (website: MonitoredWebsite) => {
    try {
      setTogglingId(website.id);
      const updated = await api.updateWebsite(website.id, {
        enabled: !website.enabled,
      });
      setWebsites(prev => prev.map(w => (w.id === updated.id ? updated : w)));
    } catch (e) {
      showToast(
        'error',
        e instanceof Error ? e.message : 'Could not update website'
      );
    } finally {
      setTogglingId(null);
    }
  };

  const handleScanAll = async () => {
    try {
      const next = await api.scanWebsites();
      setScanStatus(next);
    } catch (e) {
      showToast(
        'error',
        e instanceof Error ? e.message : 'Could not start scan'
      );
    }
  };

  const handleScanSingle = async (website: MonitoredWebsite) => {
    try {
      setScanningId(website.id);
      const next = await api.scanSingleWebsite(website.id);
      setScanStatus(next);
    } catch (e) {
      showToast(
        'error',
        e instanceof Error ? e.message : 'Could not start scan'
      );
    } finally {
      setScanningId(null);
    }
  };

  const handleCancelScan = async () => {
    try {
      setCancelling(true);
      await api.cancelWebsiteScan();
      const next = await api.getWebsiteScanStatus();
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
      const updated = await api.updateWebsiteSettings({
        ollamaEnabled: settingsDraft.ollamaEnabled,
        ollamaModel: settingsDraft.ollamaModel,
        fetchTimeoutMs: settingsDraft.fetchTimeoutMs,
        maxBytes: settingsDraft.maxBytes,
      });
      setSettings(updated);
      setSettingsOpen(false);
      showToast('success', 'Website settings saved');
    } catch (e) {
      showToast(
        'error',
        e instanceof Error ? e.message : 'Could not save settings'
      );
    } finally {
      setSavingSettings(false);
    }
  };

  const itemCountByWebsiteId = useMemo(() => {
    const counts = new Map<string, number>();
    for (const i of items) {
      counts.set(i.websiteId, (counts.get(i.websiteId) ?? 0) + 1);
    }
    return counts;
  }, [items]);

  const filteredItems = useMemo(() => {
    let filtered = items.slice();
    if (filterWebsiteId) {
      filtered = filtered.filter(i => i.websiteId === filterWebsiteId);
    }
    if (statusFilter === 'active') {
      // Default — hide both seen and dismissed (the noise the user has acted on).
      filtered = filtered.filter(
        i => i.status !== 'seen' && i.status !== 'dismissed'
      );
    } else if (statusFilter !== 'all') {
      filtered = filtered.filter(i => i.status === statusFilter);
    }
    // 'all' → no status filter applied (shows seen + dismissed too)
    if (matchFilter !== 'all') {
      filtered = filtered.filter(i => {
        const m = i.matches;
        const hasAny = !!(
          m?.onWishlist ||
          m?.onLocalWant ||
          m?.artistInCollection ||
          m?.artistInLastfmTop
        );
        switch (matchFilter) {
          case 'any-match':
            return hasAny;
          case 'no-match':
            return !hasAny;
          case 'wishlist':
            return !!m?.onWishlist;
          case 'want-list':
            return !!m?.onLocalWant;
          case 'collection':
            return !!m?.artistInCollection;
          case 'lastfm':
            return !!m?.artistInLastfmTop;
          default:
            return true;
        }
      });
    }
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'newest':
          return b.extractedAt - a.extractedAt;
        case 'confidence':
          return b.confidence - a.confidence;
        case 'artist':
          return (a.artist ?? '').localeCompare(b.artist ?? '');
        case 'title':
          return a.title.localeCompare(b.title);
        default:
          return 0;
      }
    });
    return filtered;
  }, [items, filterWebsiteId, statusFilter, matchFilter, sortBy]);

  const markAllVisibleSeenCount = useMemo(
    () => filteredItems.filter(i => i.status === 'new').length,
    [filteredItems]
  );

  const handleMarkItemSeen = async (item: WebsiteItem) => {
    try {
      setActionItemId(item.id);
      await api.markWebsiteItemSeen(item.id);
      setItems(prev =>
        prev.map(i => (i.id === item.id ? { ...i, status: 'seen' } : i))
      );
    } catch (e) {
      showToast(
        'error',
        e instanceof Error ? e.message : 'Could not mark item as seen'
      );
    } finally {
      setActionItemId(null);
    }
  };

  const handleDismissItem = async (item: WebsiteItem) => {
    try {
      setActionItemId(item.id);
      await api.dismissWebsiteItem(item.id);
      setItems(prev =>
        prev.map(i => (i.id === item.id ? { ...i, status: 'dismissed' } : i))
      );
    } catch (e) {
      showToast(
        'error',
        e instanceof Error ? e.message : 'Could not dismiss item'
      );
    } finally {
      setActionItemId(null);
    }
  };

  const handleMarkAllVisibleSeen = async () => {
    const targetIds = filteredItems
      .filter(i => i.status === 'new')
      .map(i => i.id);
    if (targetIds.length === 0) return;
    try {
      setBulkMarkingSeen(true);
      // Single bulk request — concurrent single-item writes race against the
      // shared items.json file and only the last write survives.
      const result = await api.bulkMarkWebsiteItemsSeen(targetIds);
      const succeeded = new Set(
        targetIds.filter(id => !result.missing.includes(id))
      );
      setItems(prev =>
        prev.map(i => (succeeded.has(i.id) ? { ...i, status: 'seen' } : i))
      );
      if (result.missing.length > 0) {
        showToast(
          'warning',
          `Marked ${result.updated} as seen — ${result.missing.length} not found`
        );
      } else {
        showToast(
          'success',
          `Marked ${result.updated} item${result.updated !== 1 ? 's' : ''} as seen`
        );
      }
    } catch (e) {
      showToast(
        'error',
        e instanceof Error ? e.message : 'Could not mark items as seen'
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

  const renderConfidenceBadge = (confidence: number) => {
    if (confidence >= 0.75) {
      return (
        <Badge variant='success' size='small'>
          High
        </Badge>
      );
    }
    if (confidence >= 0.4) {
      return (
        <Badge variant='warning' size='small'>
          Medium
        </Badge>
      );
    }
    return (
      <Badge variant='secondary' size='small'>
        Low
      </Badge>
    );
  };

  if (loading) {
    return (
      <div className='websites-page'>
        {!embedded && <h1>Monitored Websites</h1>}
        <div className='websites-loading'>
          <ListItemSkeleton count={4} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className='websites-page'>
        {!embedded && <h1>Monitored Websites</h1>}
        <EmptyState
          title='Could not load websites'
          description={error}
          actions={[{ label: 'Try Again', onClick: loadAll }]}
        />
      </div>
    );
  }

  const isScanning = scanStatus?.status === 'scanning';
  const ollamaOk = ollamaStatus?.available ?? false;

  return (
    <div className='websites-page'>
      {ConfirmModal}
      {!embedded && (
        <>
          <h1>Monitored Websites</h1>
          <p className='page-description'>
            Watch label and artist websites for new pre-orders and exclusives.
          </p>
        </>
      )}

      {/* Ollama status indicator */}
      <div
        className={`websites-ollama-status websites-ollama-status--${
          ollamaOk ? 'ok' : 'warn'
        }`}
        role='status'
      >
        <span
          className={`websites-ollama-dot websites-ollama-dot--${
            ollamaOk ? 'ok' : 'warn'
          }`}
          aria-hidden='true'
        />
        {ollamaOk ? (
          <>
            <CheckCircle size={16} aria-hidden='true' />
            <span>
              Ollama connected
              {ollamaStatus?.model ? ` · ${ollamaStatus.model}` : ''}
            </span>
          </>
        ) : (
          <>
            <AlertTriangle size={16} aria-hidden='true' />
            <span>
              Ollama unavailable — extraction will fall back to plain text.
              {ollamaStatus?.error ? ` (${ollamaStatus.error})` : ''}
            </span>
          </>
        )}
      </div>

      <div className='websites-header'>
        <Button
          onClick={openAddDialog}
          iconLeft={<Plus size={16} aria-hidden='true' />}
        >
          Add Website
        </Button>
        <div className='websites-header-actions'>
          <Button
            variant='secondary'
            onClick={handleScanAll}
            disabled={isScanning || websites.length === 0}
            iconLeft={<RefreshCw size={16} aria-hidden='true' />}
          >
            {isScanning ? 'Scanning...' : 'Scan All Websites'}
          </Button>
          <IconButton
            variant='outline'
            aria-label='Website monitoring settings'
            onClick={handleOpenSettings}
            icon={<SettingsIcon size={18} aria-hidden='true' />}
          />
        </div>
      </div>

      {isScanning && (
        <div className='websites-scan-progress'>
          <div className='websites-scan-progress-text'>
            Scanning {scanStatus?.currentWebsiteName || '...'}
            {scanStatus?.totalWebsites
              ? ` (${scanStatus.processedWebsites ?? 0} of ${scanStatus.totalWebsites} websites)`
              : ''}
          </div>
          <ProgressBar
            value={
              scanStatus?.totalWebsites && scanStatus.totalWebsites > 0
                ? Math.round(
                    ((scanStatus.processedWebsites ?? 0) /
                      scanStatus.totalWebsites) *
                      100
                  )
                : 0
            }
            indeterminate={!scanStatus?.totalWebsites}
            size='small'
            animated
          />
          {(scanStatus?.itemsFound ?? 0) > 0 && (
            <div className='websites-scan-found'>
              {scanStatus?.itemsFound} new item
              {scanStatus?.itemsFound !== 1 ? 's' : ''} found
            </div>
          )}
          <div className='websites-scan-actions'>
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
        <div className='websites-scan-meta'>
          Last scan: {formatRelativeTime(scanStatus.completedAt)}
          {(scanStatus.itemsFound ?? 0) > 0 &&
            ` — ${scanStatus.itemsFound} item${scanStatus.itemsFound !== 1 ? 's' : ''} found`}
        </div>
      )}

      {scanStatus?.status === 'error' && scanStatus.error && (
        <div className='websites-scan-error'>
          Scan error: {scanStatus.error}
        </div>
      )}

      {websites.length === 0 ? (
        <div className='card'>
          <EmptyState
            icon={<Globe size={40} aria-hidden='true' />}
            title='No Websites Monitored'
            description='Add a label or artist URL to track new pre-orders and exclusives. Use the preview button to confirm extraction works before saving.'
            actions={[
              { label: 'Add Your First Website', onClick: openAddDialog },
            ]}
          />
        </div>
      ) : (
        <div className='websites-list'>
          {websites.map(website => {
            const itemCount = itemCountByWebsiteId.get(website.id) ?? 0;
            return (
              <article key={website.id} className='website-card'>
                <div className='website-card-info'>
                  <div className='website-card-name'>
                    <Globe size={16} aria-hidden='true' /> {website.name}
                    {!website.enabled && (
                      <Badge variant='secondary' size='small'>
                        Disabled
                      </Badge>
                    )}
                  </div>
                  <a
                    className='website-card-url'
                    href={website.url}
                    target='_blank'
                    rel='noopener noreferrer'
                  >
                    {website.url}
                  </a>
                  <div className='website-card-meta'>
                    Added {formatRelativeTime(website.addedAt)} · Last scanned{' '}
                    {formatRelativeTime(website.lastScannedAt)} · {itemCount}{' '}
                    item{itemCount !== 1 ? 's' : ''} detected ·{' '}
                    {website.useOllama ? 'Ollama extraction' : 'Plain extract'}
                  </div>
                </div>
                <div className='website-card-actions'>
                  <label className='website-toggle-label'>
                    <input
                      type='checkbox'
                      checked={website.enabled}
                      disabled={togglingId === website.id}
                      onChange={() => handleToggleEnabled(website)}
                    />
                    <span>Enabled</span>
                  </label>
                  <Button
                    variant='secondary'
                    size='small'
                    onClick={() => handleScanSingle(website)}
                    disabled={isScanning || scanningId === website.id}
                    iconLeft={<RefreshCw size={16} aria-hidden='true' />}
                  >
                    Scan
                  </Button>
                  <IconButton
                    variant='outline'
                    size='small'
                    aria-label={`Edit ${website.name}`}
                    onClick={() => openEditDialog(website)}
                    icon={<Pencil size={16} aria-hidden='true' />}
                  />
                  <IconButton
                    variant='outline'
                    size='small'
                    aria-label={`Remove ${website.name}`}
                    onClick={() => handleRemoveWebsite(website)}
                    disabled={removingId === website.id}
                    icon={<Trash2 size={16} aria-hidden='true' />}
                  />
                </div>
              </article>
            );
          })}
        </div>
      )}

      {websites.length > 0 && (
        <section className='website-items-section'>
          <header className='website-items-header'>
            <h2 className='website-items-title'>
              <Eye size={20} aria-hidden='true' /> Extracted Items
              <span className='website-items-count'>
                ({filteredItems.length}
                {filteredItems.length !== items.length
                  ? ` of ${items.length}`
                  : ''}
                )
              </span>
            </h2>
            <div className='website-items-controls'>
              <div className='form-group'>
                <label className='form-label' htmlFor='website-filter-site'>
                  Website
                </label>
                <select
                  id='website-filter-site'
                  className='form-input'
                  value={filterWebsiteId ?? ''}
                  onChange={e => setFilterWebsiteId(e.target.value || null)}
                >
                  <option value=''>All Websites</option>
                  {websites.map(w => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className='form-group'>
                <label className='form-label' htmlFor='website-filter-status'>
                  Status
                </label>
                <select
                  id='website-filter-status'
                  className='form-input'
                  value={statusFilter}
                  onChange={e =>
                    setStatusFilter(e.target.value as StatusFilter)
                  }
                >
                  <option value='active'>Active (hide seen + dismissed)</option>
                  <option value='new'>New</option>
                  <option value='seen'>Seen</option>
                  <option value='purchased'>Purchased</option>
                  <option value='dismissed'>Dismissed</option>
                  <option value='all'>Show all</option>
                </select>
              </div>
              <div className='form-group'>
                <label className='form-label' htmlFor='website-filter-match'>
                  Badge
                </label>
                <select
                  id='website-filter-match'
                  className='form-input'
                  value={matchFilter}
                  onChange={e => setMatchFilter(e.target.value as MatchFilter)}
                >
                  <option value='all'>All</option>
                  <option value='any-match'>Any badge</option>
                  <option value='wishlist'>On wishlist</option>
                  <option value='want-list'>On want list</option>
                  <option value='collection'>Artist in collection</option>
                  <option value='lastfm'>Listened (last.fm)</option>
                  <option value='no-match'>No badge</option>
                </select>
              </div>
              <div className='form-group'>
                <label className='form-label' htmlFor='website-sort'>
                  Sort by
                </label>
                <select
                  id='website-sort'
                  className='form-input'
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value as SortOption)}
                >
                  <option value='newest'>Newest First</option>
                  <option value='confidence'>Confidence (High → Low)</option>
                  <option value='artist'>Artist A-Z</option>
                  <option value='title'>Title A-Z</option>
                </select>
              </div>
              <div className='website-items-bulk-action'>
                <Button
                  variant='secondary'
                  size='small'
                  onClick={handleMarkAllVisibleSeen}
                  disabled={bulkMarkingSeen || markAllVisibleSeenCount === 0}
                  iconLeft={<CheckCheck size={16} aria-hidden='true' />}
                  title={
                    markAllVisibleSeenCount === 0
                      ? 'No new items in current view'
                      : `Mark ${markAllVisibleSeenCount} new item${markAllVisibleSeenCount !== 1 ? 's' : ''} as seen`
                  }
                >
                  {bulkMarkingSeen
                    ? 'Marking...'
                    : `Mark ${markAllVisibleSeenCount > 0 ? markAllVisibleSeenCount : 'all'} as seen`}
                </Button>
              </div>
            </div>
          </header>

          {filteredItems.length === 0 ? (
            <div className='card'>
              <EmptyState
                icon={<Eye size={40} aria-hidden='true' />}
                title='No Items Extracted'
                description={
                  items.length === 0
                    ? 'Run a scan to discover product listings on your monitored websites.'
                    : 'No items match the current filters.'
                }
                size='small'
              />
            </div>
          ) : (
            <ul className='website-item-list'>
              {filteredItems.map(item => {
                const websiteName =
                  websites.find(w => w.id === item.websiteId)?.name ??
                  'Unknown website';
                const isActioning = actionItemId === item.id;
                const canMarkSeen = item.status === 'new';
                const canDismiss =
                  item.status !== 'dismissed' && item.status !== 'seen';
                return (
                  <li key={item.id} className='website-item-card'>
                    <div className='website-item-info'>
                      <div className='website-item-title'>
                        {item.artist && (
                          <span className='website-item-artist'>
                            {item.artist} —{' '}
                          </span>
                        )}
                        {item.title}
                      </div>
                      <div className='website-item-meta'>
                        {websiteName}
                        {item.format ? ` · ${item.format}` : ''}
                        {item.price !== undefined ? ` · $${item.price}` : ''}
                        {item.releaseDate ? ` · ${item.releaseDate}` : ''}
                        {' · '}detected {formatRelativeTime(item.extractedAt)}
                      </div>
                    </div>
                    <div className='website-item-status'>
                      {renderConfidenceBadge(item.confidence)}
                      {item.matches?.onWishlist && (
                        <Badge variant='success' size='small'>
                          On wishlist
                        </Badge>
                      )}
                      {item.matches?.onLocalWant &&
                        !item.matches?.onWishlist && (
                          <Badge variant='success' size='small'>
                            On want list
                          </Badge>
                        )}
                      {item.matches?.artistInCollection &&
                        !item.matches?.onWishlist &&
                        !item.matches?.onLocalWant && (
                          <Badge variant='info' size='small'>
                            In collection
                          </Badge>
                        )}
                      {item.matches?.artistInLastfmTop &&
                        !item.matches?.artistInCollection &&
                        !item.matches?.onWishlist &&
                        !item.matches?.onLocalWant && (
                          <Badge variant='info' size='small'>
                            Listened
                          </Badge>
                        )}
                      {item.status !== 'new' && (
                        <Badge variant='secondary' size='small'>
                          {item.status === 'purchased'
                            ? 'Purchased'
                            : item.status === 'dismissed'
                              ? 'Dismissed'
                              : 'Seen'}
                        </Badge>
                      )}
                      {item.url && (
                        <a
                          className='website-item-link'
                          href={item.url}
                          target='_blank'
                          rel='noopener noreferrer'
                        >
                          View
                        </a>
                      )}
                      {(canMarkSeen || canDismiss) && (
                        <div className='website-item-actions'>
                          {canMarkSeen && (
                            <IconButton
                              variant='ghost'
                              size='small'
                              aria-label={`Mark ${item.title} as seen`}
                              title='Mark as seen'
                              onClick={() => handleMarkItemSeen(item)}
                              disabled={isActioning}
                              icon={<Check size={16} aria-hidden='true' />}
                            />
                          )}
                          {canDismiss && (
                            <IconButton
                              variant='ghost'
                              size='small'
                              aria-label={`Dismiss ${item.title}`}
                              title='Dismiss'
                              onClick={() => handleDismissItem(item)}
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

      {/* Add/Edit Modal */}
      <Modal
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        title={formMode === 'add' ? 'Add Website' : 'Edit Website'}
        size='medium'
      >
        {formMode === 'add' && (
          <>
            {(labelSuggestionsLoading ||
              labelWebsiteSuggestions.length > 0) && (
              <div className='form-group'>
                <span className='form-label'>
                  Suggested from your monitored labels
                </span>
                {labelSuggestionsLoading ? (
                  <span className='form-hint'>Loading suggestions…</span>
                ) : (
                  <div className='website-suggestion-chips'>
                    {labelWebsiteSuggestions.map(s => (
                      <button
                        key={s.url}
                        type='button'
                        className='website-suggestion-chip'
                        onClick={() =>
                          setForm(prev => ({
                            ...prev,
                            name: s.suggestedName,
                            url: s.url,
                          }))
                        }
                        disabled={savingForm}
                        title={`From label: ${s.sourceName} · ${s.kind}`}
                      >
                        <span className='website-suggestion-chip-kind'>
                          {s.kind}
                        </span>
                        <span className='website-suggestion-chip-name'>
                          {s.suggestedName}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {(artistOptionsLoading || wishlistArtistOptions.length > 0) && (
              <div className='form-group'>
                <label className='form-label' htmlFor='website-artist-select'>
                  Pick from wishlist artist
                </label>
                <select
                  id='website-artist-select'
                  className='form-input'
                  value={selectedArtist}
                  disabled={
                    artistOptionsLoading || artistUrlsLoading || savingForm
                  }
                  onChange={e => handleSelectArtist(e.target.value)}
                >
                  <option value=''>
                    {artistOptionsLoading
                      ? 'Loading…'
                      : `Select an artist (${wishlistArtistOptions.length})`}
                  </option>
                  {wishlistArtistOptions.map(opt => (
                    <option key={opt.name} value={opt.name}>
                      {opt.name}
                      {opt.sources.includes('local-want') &&
                      !opt.sources.includes('wishlist')
                        ? ' (local)'
                        : ''}
                    </option>
                  ))}
                </select>
                <span className='form-hint'>
                  Looks up the artist on Discogs and offers their bandcamp,
                  soundcloud, and homepage URLs.
                </span>
                {artistUrlsLoading && (
                  <span className='form-hint'>Looking up Discogs profile…</span>
                )}
                {!artistUrlsLoading && artistUrls.length > 0 && (
                  <div className='website-suggestion-chips'>
                    {artistUrls.map(u => (
                      <button
                        key={u.url}
                        type='button'
                        className='website-suggestion-chip'
                        onClick={() =>
                          setForm(prev => ({
                            ...prev,
                            name:
                              u.kind === 'homepage'
                                ? selectedArtist
                                : `${selectedArtist} (${u.kind})`,
                            url: u.url,
                          }))
                        }
                        disabled={savingForm}
                        title={u.url}
                      >
                        <span className='website-suggestion-chip-kind'>
                          {u.kind}
                        </span>
                        <span className='website-suggestion-chip-name'>
                          {u.url}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {!artistUrlsLoading &&
                  selectedArtist &&
                  artistUrls.length === 0 && (
                    <span className='form-hint'>
                      No bandcamp / homepage URLs on Discogs for{' '}
                      {selectedArtist}.
                    </span>
                  )}
              </div>
            )}
          </>
        )}
        <div className='form-group'>
          <label className='form-label' htmlFor='website-form-name'>
            Display Name
          </label>
          <input
            id='website-form-name'
            type='text'
            className='form-input'
            placeholder='e.g. Backwoodz Studioz Store'
            value={form.name}
            onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
            disabled={savingForm}
            autoFocus
          />
        </div>
        <div className='form-group'>
          <label className='form-label' htmlFor='website-form-url'>
            URL
          </label>
          <input
            id='website-form-url'
            type='url'
            className='form-input'
            placeholder='https://example.com/store'
            value={form.url}
            onChange={e => setForm(prev => ({ ...prev, url: e.target.value }))}
            disabled={savingForm}
          />
        </div>
        <div className='form-group'>
          <label className='form-label' htmlFor='website-form-selector'>
            CSS Selector (optional)
          </label>
          <input
            id='website-form-selector'
            type='text'
            className='form-input'
            placeholder='.product-grid'
            value={form.cssSelector}
            onChange={e =>
              setForm(prev => ({ ...prev, cssSelector: e.target.value }))
            }
            disabled={savingForm}
          />
          <span className='form-hint'>
            Limit extraction to a section of the page (improves accuracy).
          </span>
        </div>
        <div className='form-group'>
          <label className='website-toggle-label'>
            <input
              type='checkbox'
              checked={form.useOllama}
              onChange={e =>
                setForm(prev => ({ ...prev, useOllama: e.target.checked }))
              }
              disabled={savingForm}
            />
            <span>Use Ollama for structured extraction</span>
          </label>
        </div>
        <div className='form-group'>
          <label className='website-toggle-label'>
            <input
              type='checkbox'
              checked={form.enabled}
              onChange={e =>
                setForm(prev => ({ ...prev, enabled: e.target.checked }))
              }
              disabled={savingForm}
            />
            <span>Enabled (include in scans)</span>
          </label>
        </div>

        <div className='website-preview-actions'>
          <Button
            variant='outline'
            onClick={handlePreview}
            disabled={previewing || !form.url.trim()}
            iconLeft={<Eye size={16} aria-hidden='true' />}
          >
            {previewing ? 'Previewing...' : 'Preview Extraction'}
          </Button>
        </div>

        {previewWarning && (
          <div className='website-preview-warning'>
            <AlertTriangle size={14} aria-hidden='true' /> {previewWarning}
          </div>
        )}

        {suggestedCssSelector && !form.cssSelector.trim() && (
          <div className='website-suggested-selector'>
            <span>
              Ollama suggests <code>{suggestedCssSelector}</code> as the product
              container.
            </span>
            <Button
              size='small'
              variant='outline'
              onClick={() =>
                setForm(prev => ({
                  ...prev,
                  cssSelector: suggestedCssSelector,
                }))
              }
            >
              Use it
            </Button>
          </div>
        )}

        {previewItems !== null && (
          <div className='website-preview-results'>
            <h3 className='website-preview-title'>
              Preview · {previewItems.length} item
              {previewItems.length !== 1 ? 's' : ''}
            </h3>
            {previewItems.length === 0 ? (
              <p className='website-preview-empty'>
                No items extracted. Try a more specific CSS selector or a
                different URL.
              </p>
            ) : (
              <ul className='website-preview-list'>
                {previewItems.slice(0, 10).map(item => (
                  <li key={item.id} className='website-preview-item'>
                    <span className='website-preview-item-title'>
                      {item.artist ? `${item.artist} — ` : ''}
                      {item.title}
                    </span>
                    {item.format && (
                      <span className='website-preview-item-meta'>
                        {item.format}
                      </span>
                    )}
                    {renderConfidenceBadge(item.confidence)}
                  </li>
                ))}
                {previewItems.length > 10 && (
                  <li className='website-preview-item-more'>
                    +{previewItems.length - 10} more
                  </li>
                )}
              </ul>
            )}
          </div>
        )}

        <ModalFooter>
          <Button
            variant='secondary'
            onClick={() => setFormOpen(false)}
            disabled={savingForm}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSaveWebsite}
            disabled={savingForm || !form.name.trim() || !form.url.trim()}
          >
            {savingForm
              ? 'Saving...'
              : formMode === 'add'
                ? 'Add Website'
                : 'Save Changes'}
          </Button>
        </ModalFooter>
      </Modal>

      {/* Settings Modal */}
      <Modal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title='Website Monitoring Settings'
        size='small'
      >
        <div className='form-group'>
          <label className='website-toggle-label'>
            <input
              type='checkbox'
              checked={settingsDraft?.ollamaEnabled ?? false}
              onChange={e =>
                setSettingsDraft(prev =>
                  prev ? { ...prev, ollamaEnabled: e.target.checked } : prev
                )
              }
            />
            <span>Use Ollama for structured extraction (default)</span>
          </label>
        </div>
        <div className='form-group'>
          <label className='form-label' htmlFor='website-settings-ollama-model'>
            Ollama model
          </label>
          <input
            id='website-settings-ollama-model'
            type='text'
            className='form-input'
            placeholder='llama3.1:8b'
            value={settingsDraft?.ollamaModel ?? ''}
            onChange={e =>
              setSettingsDraft(prev =>
                prev ? { ...prev, ollamaModel: e.target.value } : prev
              )
            }
          />
        </div>
        <div className='form-group'>
          <label className='form-label' htmlFor='website-settings-timeout'>
            Fetch timeout (ms)
          </label>
          <input
            id='website-settings-timeout'
            type='number'
            className='form-input'
            min={1000}
            max={120000}
            step={500}
            value={settingsDraft?.fetchTimeoutMs ?? 30000}
            onChange={e =>
              setSettingsDraft(prev =>
                prev
                  ? {
                      ...prev,
                      fetchTimeoutMs: Math.max(
                        1000,
                        Math.min(120000, Number(e.target.value) || 30000)
                      ),
                    }
                  : prev
              )
            }
          />
        </div>
        <div className='form-group'>
          <label className='form-label' htmlFor='website-settings-maxbytes'>
            Max bytes per page
          </label>
          <input
            id='website-settings-maxbytes'
            type='number'
            className='form-input'
            min={50000}
            max={5000000}
            step={50000}
            value={settingsDraft?.maxBytes ?? 500000}
            onChange={e =>
              setSettingsDraft(prev =>
                prev
                  ? {
                      ...prev,
                      maxBytes: Math.max(
                        50000,
                        Math.min(5000000, Number(e.target.value) || 500000)
                      ),
                    }
                  : prev
              )
            }
          />
          <span className='form-hint'>
            Caps how much HTML we read from a single page.
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

export default WebsitesPage;
