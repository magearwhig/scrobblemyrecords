import React, { useState, useCallback, useEffect, useMemo } from 'react';

import { WrappedData } from '../../../shared/types';

import CollectionCoverageSlide from './CollectionCoverageSlide';
import HeatmapSlide from './HeatmapSlide';
import MostPlayedAdditionSlide from './MostPlayedAdditionSlide';
import NewArtistsSlide from './NewArtistsSlide';
import PeakDaySlide from './PeakDaySlide';
import PeakHourSlide from './PeakHourSlide';
import RecordsAddedSlide from './RecordsAddedSlide';
import StreakSlide from './StreakSlide';
import TopAlbumsSlide from './TopAlbumsSlide';
import TopArtistsSlide from './TopArtistsSlide';
import TopTracksSlide from './TopTracksSlide';
import TotalScrobblesSlide from './TotalScrobblesSlide';
import UniqueCountsSlide from './UniqueCountsSlide';
import VinylVsDigitalSlide from './VinylVsDigitalSlide';
import WrappedNav from './WrappedNav';

interface WrappedSlideshowProps {
  data: WrappedData;
  onExit: () => void;
}

const WrappedSlideshow: React.FC<WrappedSlideshowProps> = ({
  data,
  onExit,
}) => {
  const [currentSlide, setCurrentSlide] = useState(0);

  const slides = useMemo(() => {
    // Last.fm-only slides (always included)
    const slideList: React.ReactNode[] = [
      <TotalScrobblesSlide key='total' stats={data.listening} />,
      <TopArtistsSlide key='artists' artists={data.listening.topArtists} />,
      <TopAlbumsSlide key='albums' albums={data.listening.topAlbums} />,
      <TopTracksSlide key='tracks' tracks={data.listening.topTracks} />,
      <UniqueCountsSlide key='unique' stats={data.listening} />,
      <NewArtistsSlide key='new-artists' stats={data.listening} />,
      <PeakDaySlide key='peak-day' stats={data.listening} />,
      <PeakHourSlide key='peak-hour' stats={data.listening} />,
      <StreakSlide key='streak' stats={data.listening} />,
      <HeatmapSlide
        key='heatmap'
        stats={data.listening}
        startDate={data.startDate}
        endDate={data.endDate}
      />,
    ];

    // Discogs-dependent slides (conditionally included based on data availability)
    if (
      data.collection.recordsAdded > 0 ||
      data.collection.recordsList.length > 0
    ) {
      slideList.push(
        <RecordsAddedSlide key='records' collection={data.collection} />
      );
    }
    if (data.collection.mostPlayedNewAddition !== null) {
      slideList.push(
        <MostPlayedAdditionSlide
          key='most-played'
          collection={data.collection}
        />
      );
    }
    if (data.crossSource.totalCollectionSize > 0) {
      slideList.push(
        <CollectionCoverageSlide
          key='coverage'
          crossSource={data.crossSource}
        />,
        <VinylVsDigitalSlide key='vinyl' crossSource={data.crossSource} />
      );
    }

    return slideList;
  }, [data]);

  const totalSlides = slides.length;

  const goNext = useCallback(() => {
    setCurrentSlide(prev => Math.min(prev + 1, totalSlides - 1));
  }, [totalSlides]);

  const goBack = useCallback(() => {
    setCurrentSlide(prev => Math.max(prev - 1, 0));
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowRight':
        case ' ':
          e.preventDefault();
          goNext();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          goBack();
          break;
        case 'Escape':
          e.preventDefault();
          onExit();
          break;
        case 'Home':
          e.preventDefault();
          setCurrentSlide(0);
          break;
        case 'End':
          e.preventDefault();
          setCurrentSlide(totalSlides - 1);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goNext, goBack, onExit, totalSlides]);

  return (
    <div
      className='wrapped-slideshow'
      role='region'
      aria-label='Wrapped slideshow'
    >
      <div className='wrapped-slideshow-content'>{slides[currentSlide]}</div>
      <WrappedNav
        currentSlide={currentSlide}
        totalSlides={totalSlides}
        onNext={goNext}
        onBack={goBack}
        onExit={onExit}
      />
    </div>
  );
};

export default WrappedSlideshow;
