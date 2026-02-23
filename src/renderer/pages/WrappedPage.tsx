import React, { useState, useCallback, useMemo } from 'react';

import { WrappedData } from '../../shared/types';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { ProgressBar } from '../components/ui/ProgressBar';
import { Skeleton } from '../components/ui/Skeleton';
import WrappedSlideshow from '../components/wrapped/WrappedSlideshow';
import { getApiService } from '../services/api';
import { createLogger } from '../utils/logger';

const log = createLogger('WrappedPage');

interface DatePreset {
  label: string;
  getRange: () => { start: number; end: number };
}

const WrappedPage: React.FC = () => {
  const [wrappedData, setWrappedData] = useState<WrappedData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSlideshow, setShowSlideshow] = useState(false);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const presets = useMemo<DatePreset[]>(() => {
    const now = new Date();
    const currentYear = now.getFullYear();

    return [
      {
        label: 'This Year',
        getRange: () => ({
          start: new Date(currentYear, 0, 1).getTime(),
          end: now.getTime(),
        }),
      },
      {
        label: String(currentYear - 1),
        getRange: () => ({
          start: new Date(currentYear - 1, 0, 1).getTime(),
          end: new Date(currentYear - 1, 11, 31, 23, 59, 59, 999).getTime(),
        }),
      },
      {
        label: 'Last 6 Months',
        getRange: () => {
          const start = new Date(now);
          start.setMonth(start.getMonth() - 6);
          return { start: start.getTime(), end: now.getTime() };
        },
      },
      {
        label: 'Last 3 Months',
        getRange: () => {
          const start = new Date(now);
          start.setMonth(start.getMonth() - 3);
          return { start: start.getTime(), end: now.getTime() };
        },
      },
      {
        label: 'This Month',
        getRange: () => ({
          start: new Date(currentYear, now.getMonth(), 1).getTime(),
          end: now.getTime(),
        }),
      },
      {
        label: 'Last Month',
        getRange: () => {
          const start = new Date(currentYear, now.getMonth() - 1, 1);
          const end = new Date(currentYear, now.getMonth(), 0, 23, 59, 59, 999);
          return { start: start.getTime(), end: end.getTime() };
        },
      },
    ];
  }, []);

  const generateWrapped = useCallback(
    async (startDate: number, endDate: number) => {
      setLoading(true);
      setError(null);
      setWrappedData(null);

      try {
        const api = getApiService();
        const data = await api.getWrapped(startDate, endDate);
        setWrappedData(data);

        if (data.listening.totalScrobbles === 0) {
          setError('No listening data found for this period.');
        } else {
          setShowSlideshow(true);
        }
      } catch (err) {
        log.error('Failed to generate wrapped', err);
        setError('Failed to generate your Wrapped. Please try again.');
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const handlePresetClick = useCallback(
    (preset: DatePreset) => {
      const { start, end } = preset.getRange();
      generateWrapped(start, end);
    },
    [generateWrapped]
  );

  const handleCustomGenerate = useCallback(() => {
    if (!customStart || !customEnd) {
      setError('Please select both start and end dates.');
      return;
    }

    const start = new Date(customStart).getTime();
    const end = new Date(`${customEnd}T23:59:59.999`).getTime();

    if (start >= end) {
      setError('Start date must be before end date.');
      return;
    }

    if (end > Date.now()) {
      setError('End date cannot be in the future.');
      return;
    }

    generateWrapped(start, end);
  }, [customStart, customEnd, generateWrapped]);

  const handleExitSlideshow = useCallback(() => {
    setShowSlideshow(false);
  }, []);

  // Slideshow mode
  if (showSlideshow && wrappedData) {
    return <WrappedSlideshow data={wrappedData} onExit={handleExitSlideshow} />;
  }

  // Date picker mode
  return (
    <div className='wrapped-page'>
      <div className='wrapped-date-picker'>
        <h1 className='wrapped-title'>Your Wrapped</h1>
        <p className='wrapped-description'>
          Choose a time period to generate your personal listening recap.
        </p>

        <div className='wrapped-presets-section'>
          <h3 className='wrapped-section-label'>Quick Presets</h3>
          <div className='wrapped-preset-buttons'>
            {presets.map(preset => (
              <Button
                key={preset.label}
                variant='outline'
                size='medium'
                onClick={() => handlePresetClick(preset)}
                disabled={loading}
                aria-label={`Generate wrapped for ${preset.label}`}
              >
                {preset.label}
              </Button>
            ))}
          </div>
        </div>

        <div className='wrapped-custom-section'>
          <h3 className='wrapped-section-label'>Or pick a custom range</h3>
          <div className='wrapped-custom-inputs'>
            <label className='wrapped-date-label'>
              From:
              <input
                type='date'
                className='form-input wrapped-date-input'
                value={customStart}
                onChange={e => setCustomStart(e.target.value)}
                disabled={loading}
                aria-label='Start date'
              />
            </label>
            <label className='wrapped-date-label'>
              To:
              <input
                type='date'
                className='form-input wrapped-date-input'
                value={customEnd}
                onChange={e => setCustomEnd(e.target.value)}
                disabled={loading}
                aria-label='End date'
              />
            </label>
          </div>
          <Button
            variant='primary'
            size='large'
            onClick={handleCustomGenerate}
            disabled={loading || !customStart || !customEnd}
            loading={loading}
            aria-label='Generate your wrapped'
          >
            Generate Your Wrapped
          </Button>
        </div>

        {loading && (
          <div className='wrapped-loading'>
            <Skeleton variant='rectangular' width='100%' height={200} />
            <ProgressBar value={0} indeterminate size='small' animated />
            <p className='wrapped-loading-text'>
              Crunching your listening data...
            </p>
          </div>
        )}

        {error && !loading && (
          <EmptyState
            icon='🎵'
            title='No Data Found'
            description={error}
            suggestion='Try selecting a different date range or sync your listening history first.'
          />
        )}
      </div>
    </div>
  );
};

export default WrappedPage;
