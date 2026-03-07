import React, { useState, useCallback } from 'react';

import { EmbeddingStatus } from '../../../shared/types';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { ProgressBar } from '../ui/ProgressBar';

interface EmbeddingManagerProps {
  status: EmbeddingStatus | null;
  isLoading: boolean;
  onRebuild: () => void;
  onCancel: () => void;
}

const EmbeddingManager: React.FC<EmbeddingManagerProps> = ({
  status,
  isLoading,
  onRebuild,
  onCancel,
}) => {
  const [showConfirm, setShowConfirm] = useState(false);

  const handleRebuildClick = useCallback(() => {
    setShowConfirm(true);
  }, []);

  const handleConfirmRebuild = useCallback(() => {
    setShowConfirm(false);
    onRebuild();
  }, [onRebuild]);

  const handleCancelConfirm = useCallback(() => {
    setShowConfirm(false);
  }, []);

  if (isLoading && !status) {
    return (
      <div className='embedding-manager'>
        <div className='embedding-manager__loading'>
          Loading embedding status...
        </div>
      </div>
    );
  }

  if (!status) return null;

  const embeddedPercent =
    status.totalRecords > 0
      ? Math.round((status.embeddedRecords / status.totalRecords) * 100)
      : 0;

  const isFullyIndexed =
    status.embeddedRecords >= status.totalRecords && status.staleRecords === 0;

  const lastRebuildText = status.lastRebuildAt
    ? new Date(status.lastRebuildAt).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Never';

  return (
    <div className='embedding-manager'>
      <div className='embedding-manager__header'>
        <h2 className='embedding-manager__title'>Embedding Index</h2>
        {isFullyIndexed && !status.isRebuilding && (
          <Badge variant='success' pill>
            Up to date
          </Badge>
        )}
        {!isFullyIndexed && !status.isRebuilding && (
          <Badge variant='warning' pill>
            {status.staleRecords > 0
              ? `${status.staleRecords} records need indexing`
              : `${status.totalRecords - status.embeddedRecords} records not indexed`}
          </Badge>
        )}
        {status.isRebuilding && (
          <Badge variant='info' pill>
            Rebuilding...
          </Badge>
        )}
      </div>

      <div className='embedding-manager__stats'>
        <div className='embedding-manager__stat'>
          <span className='embedding-manager__stat-label'>Total Records</span>
          <span className='embedding-manager__stat-value'>
            {status.totalRecords}
          </span>
        </div>
        <div className='embedding-manager__stat'>
          <span className='embedding-manager__stat-label'>Indexed</span>
          <span className='embedding-manager__stat-value'>
            {status.embeddedRecords} / {status.totalRecords}
          </span>
        </div>
        <div className='embedding-manager__stat'>
          <span className='embedding-manager__stat-label'>Stale Records</span>
          <span className='embedding-manager__stat-value'>
            {status.staleRecords}
          </span>
        </div>
        <div className='embedding-manager__stat'>
          <span className='embedding-manager__stat-label'>Last Rebuilt</span>
          <span className='embedding-manager__stat-value'>
            {lastRebuildText}
          </span>
        </div>
        {status.averageEmbeddingAge !== null && (
          <div className='embedding-manager__stat'>
            <span className='embedding-manager__stat-label'>Avg Age</span>
            <span className='embedding-manager__stat-value'>
              {Math.round(status.averageEmbeddingAge)} days
            </span>
          </div>
        )}
      </div>

      {status.isRebuilding && status.rebuildProgress && (
        <div className='embedding-manager__progress'>
          <div className='embedding-manager__progress-header'>
            <span className='embedding-manager__progress-phase'>
              {status.rebuildProgress.phase}
            </span>
            <span className='embedding-manager__progress-count'>
              {status.rebuildProgress.current} / {status.rebuildProgress.total}
            </span>
          </div>
          <ProgressBar
            value={status.rebuildProgress.current}
            max={status.rebuildProgress.total}
            variant='primary'
            size='medium'
            showLabel
            animated
            striped
            aria-label={`Rebuild progress: ${status.rebuildProgress.current} of ${status.rebuildProgress.total}`}
          />
          <Button
            variant='danger'
            size='small'
            onClick={onCancel}
            aria-label='Cancel embedding rebuild'
            className='embedding-manager__cancel-btn'
          >
            Cancel Rebuild
          </Button>
        </div>
      )}

      {!status.isRebuilding && (
        <div className='embedding-manager__coverage'>
          <span className='embedding-manager__coverage-label'>
            Coverage: {embeddedPercent}%
          </span>
          <ProgressBar
            value={embeddedPercent}
            max={100}
            variant={
              embeddedPercent === 100
                ? 'success'
                : embeddedPercent >= 50
                  ? 'warning'
                  : 'danger'
            }
            size='small'
            aria-label={`Index coverage: ${embeddedPercent}%`}
          />
        </div>
      )}

      {!status.isRebuilding && (
        <Button
          variant='primary'
          size='medium'
          onClick={handleRebuildClick}
          disabled={status.isRebuilding}
          aria-label='Rebuild all embeddings'
          className='embedding-manager__rebuild-btn'
        >
          Rebuild All Embeddings
        </Button>
      )}

      <Modal
        isOpen={showConfirm}
        onClose={handleCancelConfirm}
        title='Rebuild All Embeddings?'
        size='small'
        footer={
          <div className='embedding-manager__confirm-footer'>
            <Button
              variant='secondary'
              onClick={handleCancelConfirm}
              aria-label='Cancel rebuild confirmation'
            >
              Cancel
            </Button>
            <Button
              variant='primary'
              onClick={handleConfirmRebuild}
              aria-label='Confirm rebuild all embeddings'
            >
              Start Rebuild
            </Button>
          </div>
        }
      >
        <p>
          This will re-index all {status.totalRecords} records in your
          collection. It fetches tags from Last.fm (rate-limited) and generates
          new embeddings via Ollama.
        </p>
        <p className='embedding-manager__confirm-note'>
          First-time indexing of a large collection may take 15-30+ minutes.
          Make sure Ollama is running locally.
        </p>
      </Modal>
    </div>
  );
};

export default EmbeddingManager;
