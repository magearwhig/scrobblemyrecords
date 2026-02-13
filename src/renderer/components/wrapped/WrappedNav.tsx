import React from 'react';

import { Button } from '../ui/Button';

interface WrappedNavProps {
  currentSlide: number;
  totalSlides: number;
  onNext: () => void;
  onBack: () => void;
  onExit: () => void;
}

const WrappedNav: React.FC<WrappedNavProps> = ({
  currentSlide,
  totalSlides,
  onNext,
  onBack,
  onExit,
}) => {
  return (
    <div className='wrapped-nav'>
      <div className='wrapped-nav-buttons'>
        <Button
          variant='ghost'
          size='medium'
          onClick={onBack}
          disabled={currentSlide === 0}
          aria-label='Previous slide'
        >
          ← Back
        </Button>
        <Button
          variant='ghost'
          size='medium'
          onClick={onExit}
          aria-label='Exit slideshow'
        >
          ✕ Exit
        </Button>
        <Button
          variant='ghost'
          size='medium'
          onClick={onNext}
          disabled={currentSlide === totalSlides - 1}
          aria-label='Next slide'
        >
          Next →
        </Button>
      </div>
      <div
        className='wrapped-progress-dots'
        role='tablist'
        aria-label='Slide progress'
      >
        {Array.from({ length: totalSlides }).map((_, i) => (
          <span
            key={i}
            className={`wrapped-dot ${i === currentSlide ? 'wrapped-dot-active' : ''}`}
            role='tab'
            aria-selected={i === currentSlide}
            aria-label={`Slide ${i + 1} of ${totalSlides}`}
          />
        ))}
      </div>
    </div>
  );
};

export default WrappedNav;
