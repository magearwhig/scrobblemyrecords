import React, { useEffect, useRef, useState } from 'react';

import { GenreData } from '../../../shared/types';
import { useTabKeyNavigation } from '../../hooks/useTabKeyNavigation';
import { statsApi } from '../../services/statsApi';
import { createLogger } from '../../utils/logger';

import { GenreTreemap } from './GenreTreemap';
import { TasteDriftChart } from './TasteDriftChart';
import './TasteSection.css';

const logger = createLogger('TasteSection');

type View = 'genres' | 'drift';

/**
 * Taste: genre share (Music DNA) or how it changed over time (Taste Drift),
 * one at a time. Genres load when the section scrolls into view; the drift
 * chart loads when first shown.
 */
export const TasteSection: React.FC = () => {
  const [view, setView] = useState<View>('genres');
  const [genres, setGenres] = useState<GenreData[]>([]);
  const [totalArtists, setTotalArtists] = useState(0);
  const [loading, setLoading] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const fetched = useRef(false);
  const handleTabKeyDown = useTabKeyNavigation();

  useEffect(() => {
    const node = sectionRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      entries => {
        if (!entries[0].isIntersecting || fetched.current) return;
        fetched.current = true;
        setLoading(true);
        statsApi
          .getGenreDistribution()
          .then(res => {
            if (res.success && res.data) {
              setGenres(res.data.genres);
              setTotalArtists(res.data.totalArtistsAnalyzed);
            }
          })
          .catch(err => logger.error('Failed to load genre distribution', err))
          .finally(() => setLoading(false));
      },
      { threshold: 0.1 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const tab = (value: View, label: string) => (
    <button
      type='button'
      role='tab'
      id={`taste-tab-${value}`}
      aria-selected={view === value}
      aria-controls='taste-panel'
      tabIndex={view === value ? 0 : -1}
      className={`taste-tab${view === value ? ' taste-tab--active' : ''}`}
      onClick={() => setView(value)}
      onKeyDown={handleTabKeyDown}
    >
      {label}
    </button>
  );

  return (
    <section
      className='taste-section'
      ref={sectionRef}
      aria-labelledby='taste-title'
    >
      <div className='taste-header'>
        <h2 id='taste-title'>Taste</h2>
        <div className='taste-tabs' role='tablist' aria-label='Taste view'>
          {tab('genres', 'Genres')}
          {tab('drift', 'Change over time')}
        </div>
      </div>
      <div
        id='taste-panel'
        role='tabpanel'
        aria-labelledby={`taste-tab-${view}`}
      >
        {view === 'genres' ? (
          <GenreTreemap
            data={genres}
            totalArtists={totalArtists}
            loading={loading}
          />
        ) : (
          <TasteDriftChart />
        )}
      </div>
    </section>
  );
};

export default TasteSection;
