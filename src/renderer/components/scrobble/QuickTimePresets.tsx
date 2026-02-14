import React, { useCallback, useMemo } from 'react';

import { ListeningPatterns } from '../../../shared/types';

export interface QuickTimePresetsProps {
  /** Learned listening patterns (null if no history) */
  patterns: ListeningPatterns | null;
  /** Called with a unix timestamp (seconds) when a preset is selected */
  onSelectPreset: (timestamp: number) => void;
  /** Called when user wants custom time input */
  onSelectCustom: () => void;
}

function formatHour(hour: number): string {
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour} ${period}`;
}

export const QuickTimePresets: React.FC<QuickTimePresetsProps> = ({
  patterns,
  onSelectPreset,
  onSelectCustom,
}) => {
  const now = useMemo(() => new Date(), []);

  const getYesterdayEvening = useCallback(() => {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    const yesterdayDow = d.getDay();
    let hour = 20; // default
    if (patterns) {
      const dayPattern = patterns.typicalStartTimes[yesterdayDow];
      if (dayPattern?.evening !== null && dayPattern?.evening !== undefined) {
        hour = dayPattern.evening;
      } else {
        hour = patterns.weekdayPattern.peakHour;
      }
    }
    d.setHours(hour, 0, 0, 0);
    return Math.floor(d.getTime() / 1000);
  }, [now, patterns]);

  const getEarlierToday = useCallback(() => {
    const d = new Date(now);
    let hour = 14; // default
    if (patterns) {
      const dayPattern = patterns.typicalStartTimes[d.getDay()];
      if (
        dayPattern?.afternoon !== null &&
        dayPattern?.afternoon !== undefined
      ) {
        hour = dayPattern.afternoon;
      }
    }
    d.setHours(hour, 0, 0, 0);
    return Math.floor(d.getTime() / 1000);
  }, [now, patterns]);

  const handleJustNow = useCallback(() => {
    onSelectPreset(Math.floor(Date.now() / 1000));
  }, [onSelectPreset]);

  const handleEarlierToday = useCallback(() => {
    onSelectPreset(getEarlierToday());
  }, [onSelectPreset, getEarlierToday]);

  const handleYesterdayEvening = useCallback(() => {
    onSelectPreset(getYesterdayEvening());
  }, [onSelectPreset, getYesterdayEvening]);

  const patternHint = useMemo(() => {
    if (!patterns) return null;
    const peakHour = patterns.weekdayPattern.peakHour;
    return `You usually listen around ${formatHour(peakHour)} on weekday evenings`;
  }, [patterns]);

  return (
    <div className='quick-time-presets'>
      <div className='quick-time-presets__label'>When did you listen?</div>
      <div className='quick-time-presets__buttons'>
        <button
          type='button'
          className='quick-time-presets__btn'
          onClick={handleJustNow}
          aria-label='Set time to just now'
        >
          Just now
        </button>
        <button
          type='button'
          className='quick-time-presets__btn'
          onClick={handleEarlierToday}
          aria-label='Set time to earlier today'
        >
          Earlier today
        </button>
        <button
          type='button'
          className='quick-time-presets__btn'
          onClick={handleYesterdayEvening}
          aria-label='Set time to yesterday evening'
        >
          Yesterday evening
        </button>
        <button
          type='button'
          className='quick-time-presets__btn quick-time-presets__btn--custom'
          onClick={onSelectCustom}
          aria-label='Set a custom time'
        >
          Custom...
        </button>
      </div>
      {patternHint && (
        <div className='quick-time-presets__hint'>{patternHint}</div>
      )}
    </div>
  );
};

export default QuickTimePresets;
