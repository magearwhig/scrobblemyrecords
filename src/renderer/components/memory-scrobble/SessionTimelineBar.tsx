import React from 'react';

import './SessionTimelineBar.css';

export interface SessionTimelineBarProps {
  totalDuration: number; // seconds - sum of all track durations
  sessionDuration: number; // seconds - session window length
}

/**
 * Format seconds into a time string: "H:MM:SS" or "MM:SS"
 */
function formatDuration(seconds: number): string {
  if (seconds < 0) seconds = 0;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

export const SessionTimelineBar: React.FC<SessionTimelineBarProps> = ({
  totalDuration,
  sessionDuration,
}) => {
  if (sessionDuration <= 0) {
    return (
      <div className='timeline-bar-container'>
        <div className='timeline-bar-track'>
          <div className='timeline-bar-fill timeline-bar-fill--empty' />
        </div>
        <span className='timeline-bar-label'>No session set</span>
      </div>
    );
  }

  const percentage = Math.min(100, (totalDuration / sessionDuration) * 100);
  const isOverflow = totalDuration > sessionDuration;
  const isWarning = !isOverflow && percentage > 90;

  let statusClass = '';
  if (isOverflow) {
    statusClass = 'timeline-bar-fill--error';
  } else if (isWarning) {
    statusClass = 'timeline-bar-fill--warning';
  } else {
    statusClass = 'timeline-bar-fill--normal';
  }

  return (
    <div className='timeline-bar-container'>
      <div
        className='timeline-bar-track'
        role='progressbar'
        aria-valuenow={Math.round(percentage)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Session fill: ${formatDuration(totalDuration)} of ${formatDuration(sessionDuration)}`}
      >
        <div
          className={`timeline-bar-fill ${statusClass}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className='timeline-bar-label'>
        {formatDuration(totalDuration)} / {formatDuration(sessionDuration)}
        {isOverflow && (
          <span className='timeline-bar-overflow-text'> (overflow)</span>
        )}
      </span>
    </div>
  );
};

export default SessionTimelineBar;
