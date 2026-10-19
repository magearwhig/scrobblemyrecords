import { History } from 'lucide-react';
import React, { useState } from 'react';

import { useToast } from '../../context/ToastContext';
import { useConfirmModal } from '../../hooks/useConfirmModal';
import type ApiService from '../../services/api';
import { Button } from '../ui';

import { apiErrorInfo } from './crateRuleModel';

export interface CrateSuggestionHistoryResetProps {
  api: Pick<ApiService, 'resetCrateSuggestionHistory'>;
  /** Called after the history was reset (refetch the suggestions) */
  onReset: () => void;
}

/**
 * "Reset suggestion history" behind a confirm dialog (plan section 10.5).
 * Kept outside the suggestions row, which hides itself when everything has
 * been dismissed: this is how a user gets those suggestions back.
 */
const CrateSuggestionHistoryReset: React.FC<
  CrateSuggestionHistoryResetProps
> = ({ api, onReset }) => {
  const { showToast } = useToast();
  const [confirm, ConfirmModal] = useConfirmModal();
  const [resetting, setResetting] = useState(false);

  const handleClick = async () => {
    const ok = await confirm(
      'Suggestions you dismissed, added or already saw can be shown again. Your crates are not changed.',
      { title: 'Reset suggestion history', confirmLabel: 'Reset' }
    );
    if (!ok) return;
    setResetting(true);
    try {
      await api.resetCrateSuggestionHistory();
      showToast('success', 'Suggestion history reset');
      onReset();
    } catch (err) {
      showToast('error', apiErrorInfo(err).message);
    } finally {
      setResetting(false);
    }
  };

  return (
    <>
      <Button
        size='small'
        variant='ghost'
        iconLeft={<History size={16} aria-hidden='true' />}
        loading={resetting}
        onClick={handleClick}
      >
        Reset suggestion history
      </Button>
      {ConfirmModal}
    </>
  );
};

export default CrateSuggestionHistoryReset;
