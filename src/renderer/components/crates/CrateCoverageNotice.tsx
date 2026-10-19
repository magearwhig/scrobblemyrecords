import { AlertTriangle, Info, Loader2 } from 'lucide-react';
import React from 'react';

import { CrateCoverage, CrateRule } from '../../../shared/types';
import { formatCrateCoverage } from '../../../shared/utils/crateReasons';
import { ROUTES, navigate } from '../../routes';
import { Button } from '../ui';

import { formatCoverageCounts, hasListeningRules } from './crateRuleModel';
import './CrateCoverageNotice.css';

export interface CrateCoverageNoticeProps {
  coverage: CrateCoverage;
  rules: CrateRule[];
  now?: Date;
}

/**
 * Data coverage for a crate (plan section 8.1): the listening-history window,
 * a banner when listening rules depend on stale or missing history, a notice
 * while the collection is still loading, and runtime/genre/rating coverage
 * for the rules that use them.
 */
const CrateCoverageNotice: React.FC<CrateCoverageNoticeProps> = ({
  coverage,
  rules,
  now,
}) => {
  const copy = formatCrateCoverage(coverage, {
    hasListeningRules: hasListeningRules(rules),
    now,
  });
  const counts = formatCoverageCounts(coverage, rules);

  return (
    <section className='crate-coverage' aria-label='Data coverage'>
      {copy.banner && (
        <div className='crate-coverage-banner' role='status'>
          <AlertTriangle size={16} aria-hidden='true' />
          <span>{copy.banner}</span>
          <Button
            size='small'
            variant='secondary'
            onClick={() => navigate(ROUTES.SETTINGS, { tab: 'integrations' })}
          >
            Sync settings
          </Button>
        </div>
      )}
      {copy.collectionNotice && (
        <div className='crate-coverage-banner' role='status'>
          <Loader2 size={16} aria-hidden='true' />
          <span>{copy.collectionNotice}</span>
        </div>
      )}
      <ul className='crate-coverage-lines'>
        <li>
          <Info size={16} aria-hidden='true' />
          <span>{copy.header}</span>
        </li>
        {counts.map(line => (
          <li key={line}>
            <Info size={16} aria-hidden='true' />
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </section>
  );
};

export default CrateCoverageNotice;
