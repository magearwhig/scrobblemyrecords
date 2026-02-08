import React, { useEffect, useState, useCallback } from 'react';

import {
  SuggestionResult,
  SuggestionSettings,
  SuggestionWeights,
  AISuggestion,
} from '../../shared/types';
import AISuggestionCard from '../components/AISuggestionCard';
import SuggestionCard from '../components/SuggestionCard';
import SuggestionWeightControls from '../components/SuggestionWeightControls';
import SyncStatusBar from '../components/SyncStatusBar';
import { EmptyState } from '../components/ui/EmptyState';
import { useApp } from '../context/AppContext';
import { getApiService } from '../services/api';
import { createLogger } from '../utils/logger';

const logger = createLogger('SuggestionsPage');

const SuggestionsPage: React.FC = () => {
  const { state } = useApp();
  const [suggestions, setSuggestions] = useState<SuggestionResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<SuggestionSettings | null>(null);
  const [defaultWeights, setDefaultWeights] =
    useState<SuggestionWeights | null>(null);
  const [showWeightControls, setShowWeightControls] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  // AI suggestion state
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<AISuggestion | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const api = getApiService(state.serverUrl);

  const loadSuggestions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getSuggestions(5);
      setSuggestions(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load suggestions'
      );
    } finally {
      setLoading(false);
    }
  }, [api]);

  const loadSettings = useCallback(async () => {
    try {
      const [currentSettings, defaults] = await Promise.all([
        api.getSuggestionSettings(),
        api.getSuggestionDefaults(),
      ]);
      setSettings(currentSettings);
      setDefaultWeights(defaults.weights);
    } catch (err) {
      logger.error('Failed to load settings', err);
    }
  }, [api]);

  const checkAIStatus = useCallback(async () => {
    try {
      const status = await api.getAIStatus();
      setAiEnabled(status.enabled && status.connected);
    } catch {
      setAiEnabled(false);
    }
  }, [api]);

  const loadAISuggestion = useCallback(async () => {
    if (!aiEnabled) return;

    try {
      setAiLoading(true);
      setAiError(null);
      const response = await api.getAISuggestion();
      // Take the first suggestion from the array
      if (response.suggestions && response.suggestions.length > 0) {
        const first = response.suggestions[0];
        setAiSuggestion({
          album: first.album,
          reasoning: first.reasoning,
          confidence: first.confidence,
        });
      } else {
        // AI returned but couldn't match any albums
        setAiError(
          "AI couldn't find a matching album in your collection. Try again!"
        );
        setAiSuggestion(null);
      }
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : 'Failed to get AI suggestion';
      // Provide more helpful error messages
      if (errorMsg.includes('timeout') || errorMsg.includes('ETIMEDOUT')) {
        setAiError(
          'AI request timed out. The model may still be loading - try again in a moment.'
        );
      } else if (errorMsg.includes('ECONNREFUSED')) {
        setAiError('Cannot connect to Ollama. Make sure it is running.');
      } else {
        setAiError(errorMsg);
      }
      setAiSuggestion(null);
    } finally {
      setAiLoading(false);
    }
  }, [api, aiEnabled]);

  useEffect(() => {
    loadSettings();
    loadSuggestions();
    checkAIStatus();
  }, []);

  useEffect(() => {
    if (aiEnabled && !aiSuggestion && !aiLoading) {
      loadAISuggestion();
    }
  }, [aiEnabled]);

  const handleDismiss = async (albumId: number) => {
    try {
      await api.dismissSuggestion(albumId);
      // Remove from local state and refresh
      setSuggestions(prev => prev.filter(s => s.album.id !== albumId));
      // Fetch a replacement suggestion
      const newSuggestions = await api.getSuggestions(1);
      if (newSuggestions.length > 0) {
        setSuggestions(prev => [...prev, ...newSuggestions]);
      }
    } catch (err) {
      logger.error('Failed to dismiss suggestion', err);
    }
  };

  const handleRefresh = async () => {
    try {
      await api.refreshSuggestions();
      await loadSuggestions();
    } catch (err) {
      logger.error('Failed to refresh suggestions', err);
    }
  };

  const handleWeightsChange = async (weights: SuggestionWeights) => {
    if (!settings) return;

    const newSettings = { ...settings, weights };
    setSettings(newSettings);

    // Debounce save
    setSavingSettings(true);
    try {
      await api.saveSuggestionSettings(newSettings);
    } catch (err) {
      logger.error('Failed to save settings', err);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleResetWeights = async () => {
    if (!defaultWeights || !settings) return;

    const newSettings = { ...settings, weights: defaultWeights };
    setSettings(newSettings);

    try {
      await api.saveSuggestionSettings(newSettings);
      await loadSuggestions();
    } catch (err) {
      logger.error('Failed to reset weights', err);
    }
  };

  const handleSyncComplete = () => {
    // Reload suggestions when sync completes
    loadSuggestions();
  };

  return (
    <div className='suggestions-page'>
      <div className='suggestions-header'>
        <h1>Play Suggestions</h1>
        <div className='suggestions-actions'>
          <button
            className='btn btn-secondary'
            onClick={() => setShowWeightControls(!showWeightControls)}
          >
            {showWeightControls ? 'Hide Weights' : 'Adjust Weights'}
          </button>
          <button className='btn' onClick={handleRefresh} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      <SyncStatusBar onSyncComplete={handleSyncComplete} />

      {showWeightControls && settings && (
        <div className='suggestions-weight-panel'>
          <SuggestionWeightControls
            weights={settings.weights}
            onChange={handleWeightsChange}
            onReset={handleResetWeights}
          />
          {savingSettings && (
            <span className='saving-indicator'>Saving...</span>
          )}
          <button
            className='btn btn-small'
            onClick={loadSuggestions}
            disabled={loading}
          >
            Apply Changes
          </button>
        </div>
      )}

      {error && (
        <div className='message error'>
          <p>{error}</p>
          <button className='btn btn-small' onClick={loadSuggestions}>
            Retry
          </button>
        </div>
      )}

      <div className={`suggestions-content ${aiEnabled ? 'with-ai' : ''}`}>
        {/* AI Suggestions Section */}
        {aiEnabled && (
          <div className='suggestions-ai-section'>
            <div className='suggestions-section-header'>
              <h2>AI Pick</h2>
              <span className='section-badge ai'>Powered by Ollama</span>
            </div>
            {aiError ? (
              <div className='ai-suggestion-error'>
                <p>{aiError}</p>
                <button
                  className='btn btn-small'
                  onClick={loadAISuggestion}
                  disabled={aiLoading}
                >
                  Retry
                </button>
              </div>
            ) : (
              <AISuggestionCard
                suggestion={
                  aiSuggestion || {
                    album: null,
                    reasoning: '',
                    confidence: 'low',
                  }
                }
                loading={aiLoading}
                onRefresh={loadAISuggestion}
              />
            )}
          </div>
        )}

        {/* Algorithm Suggestions Section */}
        <div className='suggestions-algo-section'>
          <div className='suggestions-section-header'>
            <h2>Algorithm Picks</h2>
            <span className='section-badge algo'>9 Weighted Factors</span>
          </div>
          {loading ? (
            <div className='loading-container'>
              <div className='loading-spinner' />
              <p>Analyzing your collection and listening history...</p>
            </div>
          ) : suggestions.length === 0 ? (
            <EmptyState
              icon='🎲'
              title='No Suggestions Available'
              description='We need more data to generate personalized suggestions for you.'
              suggestion='Make sure your collection is loaded and your scrobble history is synced.'
              actions={[
                {
                  label: 'Try Again',
                  onClick: loadSuggestions,
                },
                {
                  label: 'Sync History',
                  onClick: () => {
                    window.location.hash = 'stats';
                  },
                  variant: 'secondary',
                },
              ]}
            />
          ) : (
            <div className='suggestions-list'>
              {suggestions.map((suggestion, index) => (
                <SuggestionCard
                  key={`${suggestion.album.id}-${index}`}
                  suggestion={suggestion}
                  onDismiss={handleDismiss}
                  showScore={showWeightControls}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className='suggestions-footer'>
        <p className='suggestions-hint'>
          Suggestions are based on your listening history, collection, and
          personal preferences. Adjust the weights above to fine-tune
          recommendations.
        </p>
      </div>
    </div>
  );
};

export default SuggestionsPage;
