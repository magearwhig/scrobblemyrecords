import { CheckCircle, Circle, ArrowRight } from 'lucide-react';
import React, { useCallback } from 'react';

import { AuthStatus } from '../../shared/types';
import { navigate as navigateTo } from '../routes';

import './SetupProgress.css';

interface SetupProgressProps {
  authStatus: AuthStatus;
  hasSyncedHistory: boolean;
}

interface SetupStep {
  number: number;
  label: string;
  done: boolean;
  actionRoute?: string;
  actionLabel?: string;
}

/**
 * Onboarding checklist banner shown on the dashboard when setup is incomplete.
 * Auto-hides when Discogs, Last.fm, and sync are all complete.
 */
export const SetupProgress: React.FC<SetupProgressProps> = ({
  authStatus,
  hasSyncedHistory,
}) => {
  const navigate = useCallback((path: string) => {
    navigateTo(path);
  }, []);

  const discogsConnected = authStatus.discogs.authenticated;
  const lastfmConnected = authStatus.lastfm.authenticated;
  const allDone = discogsConnected && lastfmConnected && hasSyncedHistory;

  if (allDone) return null;

  const steps: SetupStep[] = [
    {
      number: 1,
      label: 'Connect Discogs',
      done: discogsConnected,
      actionRoute: '/settings',
      actionLabel: 'Connect',
    },
    {
      number: 2,
      label: 'Connect Last.fm',
      done: lastfmConnected,
      actionRoute: '/settings',
      actionLabel: 'Connect',
    },
    {
      number: 3,
      label: 'Sync collection',
      done: hasSyncedHistory,
      actionRoute: '/settings',
      actionLabel: 'Sync',
    },
  ];

  const completedCount = steps.filter(s => s.done).length;

  return (
    <div className='setup-progress' role='region' aria-label='Setup progress'>
      <div className='setup-progress-header'>
        <span className='setup-progress-title'>Getting started</span>
        <span className='setup-progress-count'>
          {completedCount} of {steps.length} complete
        </span>
      </div>
      <ol className='setup-progress-steps'>
        {steps.map(step => (
          <li
            key={step.number}
            className={`setup-progress-step${step.done ? ' setup-progress-step-done' : ''}`}
          >
            <span className='setup-progress-step-icon' aria-hidden='true'>
              {step.done ? <CheckCircle size={18} /> : <Circle size={18} />}
            </span>
            <span className='setup-progress-step-number'>{step.number}.</span>
            <span className='setup-progress-step-label'>{step.label}</span>
            {!step.done && step.actionRoute && (
              <button
                type='button'
                className='setup-progress-step-action'
                onClick={() => navigate(step.actionRoute!)}
                aria-label={`${step.actionLabel} — ${step.label}`}
              >
                {step.actionLabel}
                <ArrowRight size={14} aria-hidden='true' />
              </button>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
};

export default SetupProgress;
