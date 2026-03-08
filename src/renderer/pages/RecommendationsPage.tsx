import { Bot, FolderOpen, Music } from 'lucide-react';
import React, { useState, useCallback } from 'react';

import './RecommendationsPage.page.css';

import EmbeddingManager from '../components/recommendations/EmbeddingManager';
import RecommendationCard from '../components/recommendations/RecommendationCard';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Modal } from '../components/ui/Modal';
import { AlbumCardSkeleton } from '../components/ui/Skeleton';
import useEmbeddingStatus from '../hooks/useEmbeddingStatus';
import {
  createSuccessNotification,
  useNotifications,
} from '../hooks/useNotifications';
import useRecommendations from '../hooks/useRecommendations';
import { ROUTES } from '../routes';

interface WindowOption {
  label: string;
  hours: number;
}

const WINDOW_OPTIONS: WindowOption[] = [
  { label: '1 day', hours: 24 },
  { label: '3 days', hours: 72 },
  { label: '1 week', hours: 168 },
  { label: '2 weeks', hours: 336 },
  { label: '1 month', hours: 720 },
];

const RecommendationsPage: React.FC = () => {
  const [showSettings, setShowSettings] = useState(false);
  const { addNotification } = useNotifications();

  const {
    recommendations,
    isLoading,
    error,
    refresh,
    windowHours,
    setWindowHours,
    submitFeedback,
  } = useRecommendations();

  const {
    status: embeddingStatus,
    isLoading: embeddingLoading,
    rebuild: rebuildEmbeddings,
    cancel: cancelRebuild,
  } = useEmbeddingStatus();

  const handleNavigate = useCallback((releaseId: number) => {
    window.location.hash = `${ROUTES.RELEASE_DETAILS}?id=${releaseId}`;
  }, []);

  const handleWindowChange = useCallback(
    (hours: number) => {
      setWindowHours(hours);
    },
    [setWindowHours]
  );

  const handleFeedback = useCallback(
    (
      releaseId: number,
      action: 'played' | 'skipped' | 'not_interested',
      releaseTitle: string
    ) => {
      submitFeedback(releaseId, action);
      if (action === 'played') {
        addNotification(
          createSuccessNotification(
            'Marked as played',
            `"${releaseTitle}" has been removed from your recommendations.`
          )
        );
      } else if (action === 'not_interested') {
        addNotification(
          createSuccessNotification(
            'Got it',
            `"${releaseTitle}" won't be recommended again for a while.`
          )
        );
      }
    },
    [submitFeedback, addNotification]
  );

  const hasNoEmbeddings =
    embeddingStatus !== null &&
    embeddingStatus.embeddedRecords === 0 &&
    !embeddingStatus.isRebuilding;

  const isOllamaError =
    error !== null &&
    (error.toLowerCase().includes('ollama') ||
      error.toLowerCase().includes('econnrefused') ||
      error.toLowerCase().includes('connect'));

  const showEmbeddingBanner =
    embeddingStatus !== null &&
    !embeddingStatus.isRebuilding &&
    (embeddingStatus.embeddedRecords < embeddingStatus.totalRecords ||
      embeddingStatus.staleRecords > 0);

  return (
    <div className='recommendations-page'>
      <div className='recommendations-page__header'>
        <div className='recommendations-page__title-row'>
          <h1>Recommendations</h1>
          <div className='recommendations-page__controls'>
            <Button
              variant='ghost'
              size='small'
              onClick={refresh}
              disabled={isLoading}
              aria-label='Refresh recommendations'
            >
              Refresh
            </Button>
            <Button
              variant='ghost'
              size='small'
              onClick={() => setShowSettings(true)}
              aria-label='Open recommendations settings'
            >
              Settings
            </Button>
          </div>
        </div>

        <div className='listening-window-selector'>
          <span className='listening-window-selector__label'>
            Listening window:
          </span>
          <div
            className='listening-window-selector__options'
            role='group'
            aria-label='Select listening window'
          >
            {WINDOW_OPTIONS.map(opt => (
              <button
                key={opt.hours}
                className={`listening-window-selector__option ${windowHours === opt.hours ? 'listening-window-selector__option--active' : ''}`}
                onClick={() => handleWindowChange(opt.hours)}
                aria-label={`Set listening window to ${opt.label}`}
                aria-pressed={windowHours === opt.hours}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {(showEmbeddingBanner || embeddingStatus?.isRebuilding) && (
        <EmbeddingManager
          status={embeddingStatus}
          isLoading={embeddingLoading}
          onRebuild={rebuildEmbeddings}
          onCancel={cancelRebuild}
        />
      )}

      {isLoading && (
        <div className='recommendations-grid'>
          <AlbumCardSkeleton count={6} />
        </div>
      )}

      {!isLoading && error && !isOllamaError && (
        <div className='recommendations-page__error'>
          <p className='recommendations-page__error-message'>{error}</p>
          <Button
            variant='primary'
            onClick={refresh}
            aria-label='Retry loading recommendations'
          >
            Retry
          </Button>
        </div>
      )}

      {!isLoading && isOllamaError && (
        <EmptyState
          icon={<Bot size={48} aria-hidden='true' />}
          title='Ollama is not running'
          description='Recommendations require Ollama to be running locally to generate embeddings.'
          suggestion='Start Ollama with: ollama serve — then make sure nomic-embed-text is available: ollama pull nomic-embed-text'
          actions={[{ label: 'Retry', onClick: refresh }]}
        />
      )}

      {!isLoading && !error && hasNoEmbeddings && (
        <EmptyState
          icon={<FolderOpen size={48} aria-hidden='true' />}
          title='No embeddings yet'
          description='Your collection has not been indexed yet. Build embeddings to get recommendations based on your listening history.'
          suggestion='Click "Rebuild All Embeddings" above to start indexing your collection.'
          actions={[
            {
              label: 'Build Embeddings',
              onClick: rebuildEmbeddings,
            },
          ]}
        />
      )}

      {!isLoading &&
        !error &&
        !hasNoEmbeddings &&
        recommendations.length === 0 && (
          <EmptyState
            icon={<Music size={48} aria-hidden='true' />}
            title='No recommendations found'
            description='Could not find matching recommendations for your recent listening.'
            suggestion='Try broadening your listening window or scrobble some records to get personalized recommendations.'
            actions={[{ label: 'Refresh', onClick: refresh }]}
          />
        )}

      {!isLoading && !error && recommendations.length > 0 && (
        <div className='recommendations-grid'>
          {recommendations.map(rec => (
            <RecommendationCard
              key={rec.release.id}
              recommendation={rec}
              onFeedback={handleFeedback}
              onNavigate={handleNavigate}
            />
          ))}
        </div>
      )}

      {!showEmbeddingBanner &&
        !embeddingStatus?.isRebuilding &&
        embeddingStatus && (
          <div className='recommendations-page__embedding-footer'>
            <button
              className='recommendations-page__embedding-toggle'
              onClick={() => setShowSettings(true)}
              aria-label='Open embedding manager'
            >
              Manage embeddings ({embeddingStatus.embeddedRecords}/
              {embeddingStatus.totalRecords} indexed)
            </button>
          </div>
        )}

      <Modal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        title='Recommendation Settings'
        size='medium'
      >
        <EmbeddingManager
          status={embeddingStatus}
          isLoading={embeddingLoading}
          onRebuild={() => {
            setShowSettings(false);
            rebuildEmbeddings();
          }}
          onCancel={cancelRebuild}
        />
      </Modal>
    </div>
  );
};

export default RecommendationsPage;
