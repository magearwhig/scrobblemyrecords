import { HelpCircle } from 'lucide-react';
import React from 'react';

import { CrateEvaluation, CrateRule } from '../../../shared/types';
import { phraseCount } from '../../../shared/utils/crateCopy';
import { formatUnknownCount } from '../../../shared/utils/crateReasons';

import './CrateMightMatch.css';

interface CrateMightMatchProps {
  unknownOnly: CrateEvaluation['unknownOnly'];
  rules: CrateRule[];
  /** Albums kept out only by missing data, each counted once */
  total?: number;
  /** Show a few sample album names under each line */
  showSamples?: boolean;
}

/**
 * "Might match — data missing": albums kept out only because a rule's data is
 * missing, per rule (plan section 4.2).
 */
const CrateMightMatch: React.FC<CrateMightMatchProps> = ({
  unknownOnly,
  rules,
  total,
  showSamples = false,
}) => {
  const lines = unknownOnly
    .filter(entry => entry.count > 0)
    .map(entry => ({
      entry,
      rule: rules.find(rule => rule.id === entry.ruleId),
    }))
    .filter(
      (item): item is { entry: typeof item.entry; rule: CrateRule } =>
        item.rule !== undefined
    );

  if (lines.length === 0) return null;

  // Per-rule counts overlap (an album can miss both genre and runtime), so
  // the unique total is shown when more than one rule has gaps
  const showTotal = total !== undefined && total > 0 && lines.length > 1;

  return (
    <div className='crate-might-match-block'>
      {showTotal && (
        <p className='crate-might-match-total'>
          {phraseCount('unknownCount.total', total)}
        </p>
      )}
      <ul className='crate-might-match' aria-label='Albums with missing data'>
        {lines.map(({ entry, rule }) => (
          <li key={entry.ruleId} className='crate-might-match-line'>
            <HelpCircle size={16} aria-hidden='true' />
            <div>
              <span>{formatUnknownCount(rule, entry.count)}</span>
              {showSamples && entry.sample.length > 0 && (
                <span className='crate-might-match-sample'>
                  {entry.sample
                    .slice(0, 3)
                    .map(album => `${album.artist} – ${album.album}`)
                    .join(', ')}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default CrateMightMatch;
