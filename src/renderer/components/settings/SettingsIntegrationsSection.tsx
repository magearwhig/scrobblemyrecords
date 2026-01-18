import React, { useState, useEffect, useCallback } from 'react';

import { SyncStatus, SyncSettings } from '../../../shared/types';
import { useAuth } from '../../context/AuthContext';
import ApiService from '../../services/api';
import SyncStatusBar from '../SyncStatusBar';

interface SettingsIntegrationsSectionProps {
  api: ApiService;
}

const SettingsIntegrationsSection: React.FC<
  SettingsIntegrationsSectionProps
> = ({ api }) => {
  const { authStatus } = useAuth();

  // Sync settings state
  const [syncData, setSyncData] = useState<{
    sync: SyncStatus;
    storage: {
      totalAlbums: number;
      totalScrobbles: number;
      oldestScrobble: Date | null;
      newestScrobble: Date | null;
      lastSync: Date | null;
      estimatedSizeBytes: number;
    };
  } | null>(null);
  const [syncSettings, setSyncSettings] = useState<SyncSettings | null>(null);
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncError, setSyncError] = useState<string>('');
  const [syncSuccess, setSyncSuccess] = useState<string>('');

  // AI settings state
  const [aiSettings, setAiSettings] = useState<{
    enabled: boolean;
    baseUrl: string;
    model: string;
    timeout: number;
  } | null>(null);
  const [aiStatus, setAiStatus] = useState<{
    connected: boolean;
    error?: string;
  } | null>(null);
  const [aiModels, setAiModels] = useState<
    Array<{ name: string; sizeFormatted: string }>
  >([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string>('');
  const [aiSuccess, setAiSuccess] = useState<string>('');

  useEffect(() => {
    loadAISettings();
    if (authStatus.lastfm.authenticated) {
      loadSyncStatus();
      loadSyncSettings();
    }
  }, [authStatus.lastfm.authenticated]);

  const loadSyncStatus = useCallback(async () => {
    try {
      const data = await api.getHistorySyncStatus();
      setSyncData(data);
    } catch (error) {
      console.warn('Failed to load sync status:', error);
    }
  }, [api]);

  const loadSyncSettings = useCallback(async () => {
    try {
      const settings = await api.getSyncSettings();
      setSyncSettings(settings);
    } catch (error) {
      console.warn('Failed to load sync settings:', error);
    }
  }, [api]);

  const handleStartSync = async (incremental: boolean = true) => {
    try {
      setSyncLoading(true);
      setSyncError('');
      await api.startHistorySync(incremental);
      setSyncSuccess(
        incremental
          ? 'Incremental sync started'
          : 'Full re-sync started - this may take a while'
      );
      setTimeout(loadSyncStatus, 500);
    } catch (error) {
      setSyncError(
        error instanceof Error ? error.message : 'Failed to start sync'
      );
    } finally {
      setSyncLoading(false);
    }
  };

  const handleClearHistoryIndex = async () => {
    if (
      !window.confirm(
        'Are you sure you want to clear the scrobble history index? This will require a full re-sync from Last.fm.'
      )
    ) {
      return;
    }

    try {
      setSyncLoading(true);
      setSyncError('');
      await api.clearHistoryIndex();
      setSyncSuccess('History index cleared successfully');
      await loadSyncStatus();
    } catch (error) {
      setSyncError(
        error instanceof Error ? error.message : 'Failed to clear history index'
      );
    } finally {
      setSyncLoading(false);
    }
  };

  const handleToggleAutoSync = async () => {
    if (!syncSettings) return;

    try {
      const newSettings = {
        ...syncSettings,
        autoSyncOnStartup: !syncSettings.autoSyncOnStartup,
      };
      await api.saveSyncSettings(newSettings);
      setSyncSettings(newSettings);
      setSyncSuccess(
        newSettings.autoSyncOnStartup
          ? 'Auto-sync enabled'
          : 'Auto-sync disabled'
      );
    } catch (error) {
      setSyncError(
        error instanceof Error ? error.message : 'Failed to update settings'
      );
    }
  };

  const loadAISettings = useCallback(async () => {
    try {
      const settings = await api.getAISettings();
      setAiSettings(settings);

      const status = await api.getAIStatus();
      setAiStatus({ connected: status.connected, error: status.error });

      if (status.connected) {
        try {
          const models = await api.getAIModels();
          setAiModels(models);

          if (
            models.length > 0 &&
            !models.some(
              (m: { name: string; sizeFormatted: string }) =>
                m.name === settings.model
            )
          ) {
            setAiSettings(prev =>
              prev ? { ...prev, model: models[0].name } : prev
            );
          }
        } catch {
          // Models endpoint may fail if Ollama just came online
        }
      }
    } catch (error) {
      console.warn('Failed to load AI settings:', error);
    }
  }, [api]);

  const handleTestAIConnection = async () => {
    if (!aiSettings) return;

    const testModel = aiSettings.model;

    try {
      setAiLoading(true);
      setAiError('');
      const result = await api.testAIConnection(aiSettings.baseUrl, testModel);

      setAiStatus({ connected: result.connected, error: result.error });

      if (result.connected) {
        setAiSuccess(
          result.modelAvailable
            ? `Connected! Model "${testModel}" is available.`
            : `Connected, but model "${testModel}" is not installed. Available: ${result.availableModels?.join(', ') || 'none'}`
        );
        if (result.availableModels) {
          const models = await api.getAIModels();
          setAiModels(models);
        }
      } else {
        setAiError(result.error || 'Connection failed');
      }
    } catch (error) {
      setAiError(
        error instanceof Error ? error.message : 'Failed to test connection'
      );
    } finally {
      setAiLoading(false);
    }
  };

  const handleToggleAI = async () => {
    if (!aiSettings) return;

    try {
      setAiLoading(true);
      setAiError('');
      const updated = await api.saveAISettings({
        enabled: !aiSettings.enabled,
      });
      setAiSettings(updated);
      setAiSuccess(
        updated.enabled ? 'AI suggestions enabled' : 'AI suggestions disabled'
      );
    } catch (error) {
      setAiError(
        error instanceof Error ? error.message : 'Failed to update settings'
      );
    } finally {
      setAiLoading(false);
    }
  };

  const handleSaveAISettings = async () => {
    if (!aiSettings) return;

    try {
      setAiLoading(true);
      setAiError('');
      const updated = await api.saveAISettings(aiSettings);
      setAiSettings(updated);
      setAiSuccess('AI settings saved');
    } catch (error) {
      setAiError(
        error instanceof Error ? error.message : 'Failed to save settings'
      );
    } finally {
      setAiLoading(false);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (date: Date | string | null): string => {
    if (!date) return 'Never';
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const clearSyncMessages = () => {
    setSyncError('');
    setSyncSuccess('');
  };

  const clearAIMessages = () => {
    setAiError('');
    setAiSuccess('');
  };

  return (
    <div className='settings-integrations-section'>
      {/* Last.fm Sync Section */}
      <div className='settings-section-card'>
        <div className='settings-section-header'>
          <span className='settings-section-icon'>🎵</span>
          <div>
            <h3>Last.fm Sync</h3>
            <p className='settings-section-description'>
              Sync your scrobble history for intelligent suggestions and
              tracking
            </p>
          </div>
        </div>

        {authStatus.lastfm.authenticated ? (
          <div className='settings-section-content'>
            {syncError && (
              <div className='error-message'>
                {syncError}
                <button className='btn btn-small' onClick={clearSyncMessages}>
                  Dismiss
                </button>
              </div>
            )}

            {syncSuccess && (
              <div className='message success'>
                {syncSuccess}
                <button className='btn btn-small' onClick={clearSyncMessages}>
                  Dismiss
                </button>
              </div>
            )}

            <SyncStatusBar compact={false} onSyncComplete={loadSyncStatus} />

            {syncData && (
              <div className='settings-sync-stats'>
                <div className='settings-sync-stat'>
                  <span className='settings-sync-stat-label'>
                    Total Scrobbles
                  </span>
                  <span className='settings-sync-stat-value'>
                    {syncData.storage.totalScrobbles?.toLocaleString() || 0}
                  </span>
                </div>
                <div className='settings-sync-stat'>
                  <span className='settings-sync-stat-label'>
                    Unique Albums
                  </span>
                  <span className='settings-sync-stat-value'>
                    {syncData.storage.totalAlbums?.toLocaleString() || 0}
                  </span>
                </div>
                <div className='settings-sync-stat'>
                  <span className='settings-sync-stat-label'>Last Synced</span>
                  <span className='settings-sync-stat-value'>
                    {formatDate(syncData.storage.lastSync)}
                  </span>
                </div>
                <div className='settings-sync-stat'>
                  <span className='settings-sync-stat-label'>
                    Oldest Scrobble
                  </span>
                  <span className='settings-sync-stat-value'>
                    {syncData.storage.oldestScrobble
                      ? formatDate(syncData.storage.oldestScrobble)
                      : 'Unknown'}
                  </span>
                </div>
                <div className='settings-sync-stat'>
                  <span className='settings-sync-stat-label'>Index Size</span>
                  <span className='settings-sync-stat-value'>
                    {formatBytes(syncData.storage.estimatedSizeBytes || 0)}
                  </span>
                </div>
              </div>
            )}

            <div className='settings-sync-controls'>
              <div className='settings-sync-toggle'>
                <label className='settings-toggle-label'>
                  <input
                    type='checkbox'
                    checked={syncSettings?.autoSyncOnStartup ?? true}
                    onChange={handleToggleAutoSync}
                    disabled={syncLoading}
                  />
                  <span>Auto-sync on startup</span>
                </label>
                <span className='settings-toggle-hint'>
                  Automatically fetch new scrobbles when the app starts
                </span>
              </div>

              <div className='settings-sync-actions'>
                <button
                  className='btn'
                  onClick={() => handleStartSync(true)}
                  disabled={syncLoading || syncData?.sync.status === 'syncing'}
                  title='Fetch new scrobbles since last sync'
                >
                  {syncLoading ? 'Starting...' : 'Sync New'}
                </button>
                <button
                  className='btn btn-secondary'
                  onClick={() => handleStartSync(false)}
                  disabled={syncLoading || syncData?.sync.status === 'syncing'}
                  title='Re-fetch all scrobbles from Last.fm'
                >
                  Full Re-sync
                </button>
                <button
                  className='btn btn-danger'
                  onClick={handleClearHistoryIndex}
                  disabled={
                    syncLoading ||
                    syncData?.sync.status === 'syncing' ||
                    !syncData?.storage.totalScrobbles
                  }
                >
                  Clear Index
                </button>
              </div>
            </div>

            <div className='settings-sync-info'>
              <p>
                <strong>Sync New:</strong> Fetches only scrobbles added since
                the last sync. Use this for regular updates.
              </p>
              <p>
                <strong>Full Re-sync:</strong> Re-fetches your entire Last.fm
                history. Use this if you&apos;ve edited scrobble metadata.
              </p>
            </div>
          </div>
        ) : (
          <div className='settings-empty-state'>
            <p>
              Please authenticate with Last.fm to sync your scrobble history.
            </p>
            <button
              className='btn'
              onClick={() => {
                window.location.hash = 'setup';
              }}
            >
              Go to Setup
            </button>
          </div>
        )}
      </div>

      {/* Discogs Collection Cache Section */}
      <div className='settings-section-card'>
        <div className='settings-section-header'>
          <span className='settings-section-icon'>💿</span>
          <div>
            <h3>Discogs Collection Cache</h3>
            <p className='settings-section-description'>
              Your collection is cached locally for fast access
            </p>
          </div>
        </div>

        <div className='settings-section-content'>
          <div className='settings-cache-info'>
            <p className='settings-hint-text'>
              Collection cache information is shown on the Collection page.
              Visit the Collection page to see cache status and manually refresh
              if needed.
            </p>
            <button
              className='btn btn-secondary'
              onClick={() => {
                window.location.hash = '#collection';
              }}
            >
              Go to Collection
            </button>
          </div>
        </div>
      </div>

      {/* AI Recommendations Section */}
      <div className='settings-section-card'>
        <div className='settings-section-header'>
          <span className='settings-section-icon'>🤖</span>
          <div>
            <h3>AI Recommendations (Ollama)</h3>
            <p className='settings-section-description'>
              Enable AI-powered suggestions using locally-running Ollama
            </p>
          </div>
        </div>

        <div className='settings-section-content'>
          {aiError && (
            <div className='error-message'>
              {aiError}
              <button className='btn btn-small' onClick={clearAIMessages}>
                Dismiss
              </button>
            </div>
          )}

          {aiSuccess && (
            <div className='message success'>
              {aiSuccess}
              <button className='btn btn-small' onClick={clearAIMessages}>
                Dismiss
              </button>
            </div>
          )}

          <div className='settings-ai-status'>
            <div className='settings-ai-status-indicator'>
              <span
                className={`settings-ai-dot ${aiStatus?.connected ? 'connected' : 'disconnected'}`}
              />
              <span>
                {aiStatus?.connected
                  ? 'Ollama is running'
                  : aiStatus?.error || 'Ollama is not connected'}
              </span>
            </div>
            <button
              className='btn btn-small btn-secondary'
              onClick={handleTestAIConnection}
              disabled={aiLoading}
            >
              {aiLoading ? 'Testing...' : 'Test Connection'}
            </button>
          </div>

          <div className='settings-ai-controls'>
            <div className='settings-sync-toggle'>
              <label className='settings-toggle-label'>
                <input
                  type='checkbox'
                  checked={aiSettings?.enabled ?? false}
                  onChange={handleToggleAI}
                  disabled={aiLoading || !aiStatus?.connected}
                />
                <span>Enable AI suggestions</span>
              </label>
              <span className='settings-toggle-hint'>
                Show AI-powered picks alongside algorithm suggestions
              </span>
            </div>
          </div>

          {aiSettings && (
            <div className='settings-ai-config'>
              <h4>Configuration</h4>

              <div className='form-group'>
                <label className='form-label'>Ollama URL</label>
                <input
                  type='text'
                  className='form-input'
                  value={aiSettings.baseUrl}
                  onChange={e =>
                    setAiSettings({ ...aiSettings, baseUrl: e.target.value })
                  }
                  placeholder='http://localhost:11434'
                />
                <span className='form-hint'>
                  Default: http://localhost:11434
                </span>
              </div>

              <div className='form-group'>
                <label className='form-label'>Model</label>
                {aiModels.length > 0 ? (
                  <select
                    className='form-input'
                    value={aiSettings.model}
                    onChange={e =>
                      setAiSettings({ ...aiSettings, model: e.target.value })
                    }
                  >
                    {!aiModels.some(m => m.name === aiSettings.model) &&
                      aiSettings.model && (
                        <option value={aiSettings.model}>
                          {aiSettings.model} (not installed)
                        </option>
                      )}
                    {aiModels.map(model => (
                      <option key={model.name} value={model.name}>
                        {model.name} ({model.sizeFormatted})
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type='text'
                    className='form-input'
                    value={aiSettings.model}
                    onChange={e =>
                      setAiSettings({ ...aiSettings, model: e.target.value })
                    }
                    placeholder='mistral'
                  />
                )}
                <span className='form-hint'>
                  Recommended: mistral, llama3, or phi3
                </span>
              </div>

              <button
                className='btn'
                onClick={handleSaveAISettings}
                disabled={aiLoading}
              >
                Save Settings
              </button>
            </div>
          )}

          {!aiStatus?.connected && (
            <div className='settings-ai-setup'>
              <h4>Setup Instructions</h4>
              <ol>
                <li>
                  Install Ollama from{' '}
                  <a
                    href='https://ollama.com'
                    target='_blank'
                    rel='noopener noreferrer'
                  >
                    ollama.com
                  </a>
                </li>
                <li>
                  Run <code>ollama serve</code> in your terminal
                </li>
                <li>
                  Pull a model: <code>ollama pull mistral</code>
                </li>
                <li>Click &quot;Test Connection&quot; above</li>
              </ol>
              <p className='settings-ai-tip'>
                <strong>Tip:</strong> Mistral 7B is a good balance of quality
                and speed. For faster responses, try Phi-3 or Llama 3.2 3B.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SettingsIntegrationsSection;
