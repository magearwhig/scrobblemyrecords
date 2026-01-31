import React, { useEffect, useState, useCallback } from 'react';

import './RankingsRace.css';

interface RankingItem {
  name: string;
  artist?: string;
  count: number;
  rank: number;
}

interface RankingSnapshot {
  period: string;
  timestamp: number;
  rankings: RankingItem[];
}

export interface RankingsRaceProps {
  snapshots: RankingSnapshot[];
  type: 'tracks' | 'artists' | 'albums';
  topN: number;
}

export const RankingsRace: React.FC<RankingsRaceProps> = ({
  snapshots,
  type,
  topN,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(300); // milliseconds per frame
  const [allItems, setAllItems] = useState<Set<string>>(new Set());

  // Get current snapshot data
  const currentSnapshot = snapshots[currentIndex] || null;
  const maxCount = currentSnapshot
    ? Math.max(...currentSnapshot.rankings.map(r => r.count))
    : 1;

  // Build a set of all items that appear in any snapshot
  // AND reset to first snapshot when snapshots change
  useEffect(() => {
    const items = new Set<string>();
    for (const snapshot of snapshots) {
      for (const ranking of snapshot.rankings) {
        items.add(ranking.name);
      }
    }
    setAllItems(items);

    // Reset animation state when snapshots change
    setCurrentIndex(0);
    setIsPlaying(false);
  }, [snapshots]);

  // Auto-play animation
  useEffect(() => {
    if (!isPlaying || currentIndex >= snapshots.length - 1) {
      return;
    }

    const timer = setTimeout(() => {
      setCurrentIndex(prev => Math.min(prev + 1, snapshots.length - 1));
    }, speed);

    return () => clearTimeout(timer);
  }, [isPlaying, currentIndex, snapshots.length, speed]);

  // Handle play/pause toggle
  const handlePlayPause = useCallback(() => {
    if (currentIndex >= snapshots.length - 1) {
      // Restart from beginning
      setCurrentIndex(0);
      setIsPlaying(true);
    } else {
      setIsPlaying(prev => !prev);
    }
  }, [currentIndex, snapshots.length]);

  // Handle manual scrubbing
  const handleSliderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newIndex = parseInt(e.target.value, 10);
      setCurrentIndex(newIndex);
      setIsPlaying(false);
    },
    []
  );

  // Handle speed change
  const handleSpeedChange = (e: { target: { value: string } }) => {
    setSpeed(parseInt(e.target.value, 10));
  };

  // Format period for display
  const formatPeriod = (period: string): string => {
    const [year, month] = period.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
    });
  };

  if (snapshots.length === 0) {
    return (
      <div className='rankings-race'>
        <div className='rankings-race-empty'>
          No ranking data available. Start scrobbling to see your rankings over
          time!
        </div>
      </div>
    );
  }

  return (
    <div className='rankings-race'>
      {/* Controls */}
      <div className='rankings-race-controls'>
        <button
          className='rankings-race-play-button'
          onClick={handlePlayPause}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>

        <input
          type='range'
          className='rankings-race-slider'
          min={0}
          max={snapshots.length - 1}
          value={currentIndex}
          onChange={handleSliderChange}
          aria-label='Time scrubber'
        />

        <div className='rankings-race-period'>
          {currentSnapshot && formatPeriod(currentSnapshot.period)}
        </div>

        <select
          className='rankings-race-speed'
          value={speed}
          onChange={handleSpeedChange}
          aria-label='Animation speed'
        >
          <option value={1000}>0.3x</option>
          <option value={600}>0.5x</option>
          <option value={300}>1x</option>
          <option value={150}>2x</option>
          <option value={75}>4x</option>
          <option value={30}>10x</option>
        </select>
      </div>

      {/* Rankings visualization */}
      <div className='rankings-race-chart'>
        {currentSnapshot &&
          Array.from(allItems).map(itemName => {
            // Find this item in the current snapshot
            const item = currentSnapshot.rankings.find(
              r => r.name === itemName
            );

            if (!item) {
              // Item not in current ranking - move it off screen
              return (
                <div
                  key={itemName}
                  className='rankings-race-bar rankings-race-bar-hidden'
                  style={{
                    transform: `translateY(${topN * 60 + 100}px)`,
                    opacity: 0,
                  }}
                />
              );
            }

            const widthPercent = (item.count / maxCount) * 100;
            const label =
              type === 'artists'
                ? item.name
                : `${item.name}${item.artist ? ` - ${item.artist}` : ''}`;
            // Use rank-1 (0-indexed) for positioning
            const position = (item.rank - 1) * 60;

            return (
              <div
                key={item.name}
                className='rankings-race-bar'
                style={{
                  transform: `translateY(${position}px)`,
                  opacity: 1,
                }}
              >
                <div className='rankings-race-rank'>{item.rank}</div>
                <div className='rankings-race-label'>{label}</div>
                <div className='rankings-race-bar-fill-container'>
                  <div
                    className='rankings-race-bar-fill'
                    style={{
                      width: `${widthPercent}%`,
                    }}
                  />
                </div>
                <div className='rankings-race-count'>{item.count}</div>
              </div>
            );
          })}
      </div>

      {/* Progress indicator */}
      <div className='rankings-race-progress'>
        {currentIndex + 1} / {snapshots.length} snapshots
      </div>
    </div>
  );
};

export default RankingsRace;
