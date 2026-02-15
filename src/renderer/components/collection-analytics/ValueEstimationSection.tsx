import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

import {
  CollectionValueEstimation,
  ValueScanStatus,
} from '../../../shared/types';
import { collectionAnalyticsApi } from '../../services/statsApi';
import { createLogger } from '../../utils/logger';
import { ProgressBar } from '../ui/ProgressBar';

const log = createLogger('ValueEstimationSection');

const POLL_INTERVAL = 3000;

const CHART_TOOLTIP_STYLE = {
  backgroundColor: 'var(--card-bg)',
  border: '1px solid var(--border-color)',
  borderRadius: '4px',
  color: 'var(--text-primary)',
};

function formatCurrency(value: number, currency: string): string {
  return value.toLocaleString('en-US', { style: 'currency', currency });
}

function formatTimeRemaining(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s remaining`;
  const minutes = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${minutes}m ${secs}s remaining`;
}

const ValueEstimationSection: React.FC = () => {
  const [estimation, setEstimation] =
    useState<CollectionValueEstimation | null>(null);
  const [scanStatus, setScanStatus] = useState<ValueScanStatus>({
    status: 'idle',
    itemsScanned: 0,
    totalItems: 0,
    progress: 0,
  });
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const fetchValueData = useCallback(async () => {
    try {
      const response = await collectionAnalyticsApi.getValue();
      if (response.success && response.data) {
        setEstimation(response.data.estimation);
        setScanStatus(response.data.scanStatus);
        return response.data.scanStatus;
      }
    } catch (err) {
      log.error('Failed to fetch value data', err);
    }
    return null;
  }, []);

  const startPolling = useCallback(() => {
    if (pollRef.current) return;
    setScanning(true);
    pollRef.current = setInterval(async () => {
      try {
        const res = await collectionAnalyticsApi.getValueScanStatus();
        if (res.success && res.data) {
          setScanStatus(res.data);
          if (res.data.status === 'completed' || res.data.status === 'error') {
            stopPolling();
            setScanning(false);
            fetchValueData();
          }
        }
      } catch {
        // Ignore poll errors
      }
    }, POLL_INTERVAL);
  }, [stopPolling, fetchValueData]);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      const status = await fetchValueData();
      if (status && status.status === 'scanning') {
        startPolling();
      }
      setLoading(false);
    };
    init();

    return () => {
      stopPolling();
    };
  }, [fetchValueData, startPolling, stopPolling]);

  const handleStartScan = useCallback(async () => {
    try {
      setScanning(true);
      setScanStatus(prev => ({
        ...prev,
        status: 'scanning',
        progress: 0,
        itemsScanned: 0,
      }));
      const res = await collectionAnalyticsApi.startValueScan();
      if (res.success) {
        startPolling();
      } else {
        log.error('Failed to start value scan', res.error);
        setScanning(false);
      }
    } catch (err) {
      log.error('Failed to start value scan', err);
      setScanning(false);
    }
  }, [startPolling]);

  if (loading) {
    return (
      <div className='analytics-section'>
        <div className='analytics-scan-section'>
          <p className='analytics-scan-info'>Loading value data...</p>
        </div>
      </div>
    );
  }

  if (!estimation) {
    return (
      <div className='analytics-section'>
        <div className='analytics-scan-section'>
          <h3>Collection Value Estimation</h3>
          <p className='analytics-scan-info'>
            Scan your collection to estimate its market value based on Discogs
            marketplace data. This checks median sale prices for each item in
            your collection.
          </p>
          {scanStatus.status === 'scanning' || scanning ? (
            <div className='analytics-scan-progress'>
              <ProgressBar
                value={scanStatus.progress}
                showLabel
                animated
                striped
              />
              <div className='analytics-scan-progress-text' aria-live='polite'>
                {scanStatus.currentItem
                  ? `Scanning: ${scanStatus.currentItem}`
                  : `Scanned ${scanStatus.itemsScanned} of ${scanStatus.totalItems} items`}
                {scanStatus.estimatedTimeRemaining != null && (
                  <>
                    {' '}
                    &mdash;{' '}
                    {formatTimeRemaining(scanStatus.estimatedTimeRemaining)}
                  </>
                )}
              </div>
            </div>
          ) : (
            <button
              className='btn'
              onClick={handleStartScan}
              disabled={scanning}
            >
              Scan Collection Value
            </button>
          )}
          {scanStatus.status === 'error' && scanStatus.error && (
            <p className='analytics-scan-info'>{scanStatus.error}</p>
          )}
        </div>
      </div>
    );
  }

  const currency = estimation.currency;

  return (
    <div className='analytics-section'>
      {/* Value summary cards */}
      <div className='analytics-value-cards'>
        <div className='analytics-summary-card'>
          <div className='analytics-summary-card-value'>
            {formatCurrency(estimation.totalEstimatedValue, currency)}
          </div>
          <div className='analytics-summary-card-label'>
            Estimated Value (VG+)
          </div>
        </div>
        <div className='analytics-summary-card'>
          <div className='analytics-summary-card-value'>
            {formatCurrency(estimation.totalLowestValue, currency)}
          </div>
          <div className='analytics-summary-card-label'>Low Estimate</div>
        </div>
        <div className='analytics-summary-card'>
          <div className='analytics-summary-card-value'>
            {formatCurrency(estimation.totalHighestValue, currency)}
          </div>
          <div className='analytics-summary-card-label'>High Estimate</div>
        </div>
        <div className='analytics-summary-card'>
          <div className='analytics-summary-card-value'>
            {estimation.itemsWithPricing}
            <span className='analytics-summary-card-sublabel'>
              {' '}
              / {estimation.totalItems}
            </span>
          </div>
          <div className='analytics-summary-card-label'>Items Priced</div>
        </div>
      </div>

      {/* Scan section */}
      <div className='analytics-scan-section'>
        <div className='analytics-scan-header'>
          <div className='analytics-scan-info'>
            {estimation.itemsWithoutPricing > 0
              ? `${estimation.itemsWithoutPricing} items could not be priced`
              : 'All items have pricing data'}
            {estimation.mixedCurrencies && ' (mixed currencies detected)'}
          </div>
          <button
            className='btn btn-small'
            onClick={handleStartScan}
            disabled={scanning || scanStatus.status === 'scanning'}
          >
            {scanning || scanStatus.status === 'scanning'
              ? 'Scanning...'
              : 'Rescan Values'}
          </button>
        </div>
        {(scanning || scanStatus.status === 'scanning') && (
          <div className='analytics-scan-progress'>
            <ProgressBar
              value={scanStatus.progress}
              showLabel
              animated
              striped
            />
            <div className='analytics-scan-progress-text' aria-live='polite'>
              {scanStatus.currentItem
                ? `Scanning: ${scanStatus.currentItem}`
                : `Scanned ${scanStatus.itemsScanned} of ${scanStatus.totalItems} items`}
              {scanStatus.estimatedTimeRemaining != null && (
                <>
                  {' '}
                  &mdash;{' '}
                  {formatTimeRemaining(scanStatus.estimatedTimeRemaining)}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Most Valuable Items */}
      {estimation.mostValuableItems.length > 0 && (
        <div className='analytics-valuable-list'>
          <h3>Most Valuable Items</h3>
          {estimation.mostValuableItems.slice(0, 10).map(item => (
            <div key={item.releaseId} className='analytics-valuable-item'>
              {item.coverImage ? (
                <img
                  className='analytics-valuable-cover'
                  src={item.coverImage}
                  alt={`${item.artist} - ${item.title}`}
                  loading='lazy'
                />
              ) : (
                <div className='analytics-valuable-cover' />
              )}
              <div className='analytics-valuable-info'>
                <div className='analytics-valuable-title'>{item.title}</div>
                <div className='analytics-valuable-artist'>{item.artist}</div>
                <div className='analytics-valuable-meta'>
                  {item.format.join(', ')}
                  {item.year ? ` (${item.year})` : ''}
                  {item.numForSale > 0 && ` \u00B7 ${item.numForSale} for sale`}
                </div>
              </div>
              <div className='analytics-valuable-price'>
                {formatCurrency(item.estimatedValue, item.currency)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Chart row: Value by Decade + Value by Format */}
      <div className='analytics-chart-row'>
        {estimation.valueByDecade.length > 0 && (
          <div className='analytics-chart-card'>
            <h3>Value by Decade</h3>
            <ResponsiveContainer width='100%' height={250}>
              <BarChart
                data={estimation.valueByDecade}
                margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
              >
                <XAxis
                  dataKey='decade'
                  stroke='var(--text-secondary)'
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke='var(--text-secondary)'
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) =>
                    formatCurrency(v, currency).replace(/\.00$/, '')
                  }
                />
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  formatter={(value: number | undefined) => [
                    formatCurrency(Number(value || 0), currency),
                    'Value',
                  ]}
                />
                <Bar
                  dataKey='value'
                  fill='var(--accent-color)'
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {estimation.valueByFormat.length > 0 && (
          <div className='analytics-chart-card'>
            <h3>Value by Format</h3>
            <ResponsiveContainer width='100%' height={250}>
              <BarChart
                data={estimation.valueByFormat}
                layout='vertical'
                margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
              >
                <XAxis
                  type='number'
                  stroke='var(--text-secondary)'
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) =>
                    formatCurrency(v, currency).replace(/\.00$/, '')
                  }
                />
                <YAxis
                  type='category'
                  dataKey='format'
                  width={60}
                  stroke='var(--text-secondary)'
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  formatter={(value: number | undefined) => [
                    formatCurrency(Number(value || 0), currency),
                    'Value',
                  ]}
                />
                <Bar
                  dataKey='value'
                  fill='var(--accent-color)'
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
};

export default React.memo(ValueEstimationSection);
