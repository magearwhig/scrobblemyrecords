import React, { useState, useEffect, useCallback } from 'react';

import ApiService from '../../services/api';
import { createLogger } from '../../utils/logger';
import { Button } from '../ui/Button';

const logger = createLogger('SettingsPreferencesSection');

interface SettingsPreferencesSectionProps {
  api: ApiService;
}

const SettingsPreferencesSection: React.FC<SettingsPreferencesSectionProps> = ({
  api,
}) => {
  const [historyDefaultTab, setHistoryDefaultTab] = useState<
    'sessions' | 'lastfm'
  >('lastfm');
  const [loading, setLoading] = useState(false);
  const [saveError, setSaveError] = useState<string>('');
  const [saveSuccess, setSaveSuccess] = useState<string>('');

  const loadPreferences = useCallback(async () => {
    try {
      const prefs = await api.getUserPreferences();
      setHistoryDefaultTab(prefs.historyDefaultTab ?? 'lastfm');
    } catch (error) {
      logger.warn('Failed to load preferences', error);
    }
  }, [api]);

  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  const handleSave = async () => {
    setLoading(true);
    setSaveError('');
    setSaveSuccess('');

    try {
      await api.updateUserPreferences({ historyDefaultTab });
      setSaveSuccess('Preferences saved successfully');
      setTimeout(() => setSaveSuccess(''), 3000);
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : 'Failed to save preferences'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className='settings-section'>
      <div className='settings-section-header'>
        <h3>History Page</h3>
        <p className='settings-section-description'>
          Configure the default tab shown when opening the History page.
        </p>
      </div>

      <div className='form-group'>
        <label htmlFor='history-default-tab' className='form-label'>
          Default History Tab
        </label>
        <select
          id='history-default-tab'
          className='form-select'
          value={historyDefaultTab}
          onChange={e =>
            setHistoryDefaultTab(e.target.value as 'sessions' | 'lastfm')
          }
        >
          <option value='lastfm'>Last.fm History</option>
          <option value='sessions'>Local Scrobble Sessions</option>
        </select>
        <p className='form-helper-text'>
          Choose which tab is shown by default when navigating to the History
          page. Deep links (e.g., from notifications) override this preference.
        </p>
      </div>

      {saveError && <div className='error-message'>{saveError}</div>}
      {saveSuccess && <div className='success-message'>{saveSuccess}</div>}

      <div className='preferences-section-actions'>
        <Button onClick={handleSave} disabled={loading}>
          {loading ? 'Saving...' : 'Save Preferences'}
        </Button>
      </div>
    </div>
  );
};

export default SettingsPreferencesSection;
