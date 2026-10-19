import { AlertCircle, Plus, Trash2, X } from 'lucide-react';
import React, { useEffect, useId, useRef, useState } from 'react';

import { CRATE_MAX_RULES, CRATE_SORTS } from '../../../shared/crateTemplates';
import {
  CrateEvaluation,
  CratePeriod,
  CrateRule,
  CrateRuleField,
  CrateSort,
} from '../../../shared/types';
import { CratePhraseKey, phrase } from '../../../shared/utils/crateCopy';
import type ApiService from '../../services/api';
import { Badge, Button, IconButton } from '../ui';

import CrateCover from './CrateCover';
import CrateMightMatch from './CrateMightMatch';
import {
  CRATE_BOUNDS,
  CRATE_FIELD_ORDER,
  CRATE_OPS,
  CRATE_VALUE_SUGGESTIONS,
  apiErrorInfo,
  changeRuleOp,
  defaultRule,
  fieldHelp,
  fieldLabel,
  formatCoverageCounts,
  isoDate,
  newRuleId,
  ruleProblem,
  setIfUnknown,
  supportsIfUnknown,
} from './crateRuleModel';
import './CrateRuleBuilder.css';

export function sortLabel(sort: CrateSort): string {
  return phrase(`builder.sort.${sort}` as CratePhraseKey);
}

export const PREVIEW_DEBOUNCE_MS = 400;
const PREVIEW_SAMPLE_SIZE = 6;

// ---- Small inputs ----

interface NumberFieldProps {
  label: string;
  value: number | undefined;
  min: number;
  max: number;
  onChange: (value: number | undefined) => void;
  suffix?: string;
  placeholder?: string;
}

/** Whole-number input; an empty or invalid entry reports `undefined` */
const NumberField: React.FC<NumberFieldProps> = ({
  label,
  value,
  min,
  max,
  onChange,
  suffix,
  placeholder,
}) => (
  <span className='crate-rule-number'>
    <input
      type='number'
      className='form-input'
      inputMode='numeric'
      min={min}
      max={max}
      step={1}
      value={value !== undefined && Number.isFinite(value) ? value : ''}
      placeholder={placeholder}
      aria-label={label}
      onChange={e => {
        const raw = e.target.value.trim();
        const parsed = raw === '' ? undefined : Number(raw);
        onChange(
          parsed !== undefined && Number.isFinite(parsed) ? parsed : undefined
        );
      }}
    />
    {suffix && <span className='crate-rule-suffix'>{suffix}</span>}
  </span>
);

interface DateFieldProps {
  label: string;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
}

const DateField: React.FC<DateFieldProps> = ({ label, value, onChange }) => (
  <input
    type='date'
    className='form-input crate-rule-date'
    aria-label={label}
    value={value ?? ''}
    onChange={e => onChange(e.target.value || undefined)}
  />
);

interface ChipInputProps {
  label: string;
  values: string[];
  suggestions?: string[];
  onChange: (values: string[]) => void;
}

/** Multi-value entry: pill chips plus a text box (Enter or comma adds) */
const ChipInput: React.FC<ChipInputProps> = ({
  label,
  values,
  suggestions,
  onChange,
}) => {
  const [draft, setDraft] = useState('');
  const listId = useId();

  const add = (raw: string) => {
    const value = raw.trim();
    if (!value) return;
    if (!values.some(v => v.toLowerCase() === value.toLowerCase())) {
      onChange([...values, value]);
    }
    setDraft('');
  };

  return (
    <div className='crate-chip-input'>
      {values.map(value => (
        <Badge key={value} pill variant='primary' className='crate-chip'>
          {value}
          <button
            type='button'
            className='crate-chip-remove'
            aria-label={`Remove ${value}`}
            onClick={() => onChange(values.filter(v => v !== value))}
          >
            <X size={12} aria-hidden='true' />
          </button>
        </Badge>
      ))}
      <input
        type='text'
        className='form-input crate-chip-text'
        aria-label={label}
        placeholder={values.length === 0 ? 'Type and press Enter' : 'Add…'}
        value={draft}
        list={suggestions ? listId : undefined}
        onChange={e => {
          const next = e.target.value;
          // Picking a datalist suggestion adds it straight away
          if (suggestions?.includes(next)) {
            add(next);
          } else {
            setDraft(next);
          }
        }}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            add(draft);
          } else if (e.key === 'Backspace' && draft === '' && values.length) {
            onChange(values.slice(0, -1));
          }
        }}
        onBlur={() => add(draft)}
      />
      {suggestions && (
        <datalist id={listId}>
          {suggestions
            .filter(s => !values.includes(s))
            .map(s => (
              <option key={s} value={s} />
            ))}
        </datalist>
      )}
    </div>
  );
};

interface PeriodPickerProps {
  period: CratePeriod;
  onChange: (period: CratePeriod) => void;
}

const PeriodPicker: React.FC<PeriodPickerProps> = ({ period, onChange }) => (
  <div className='crate-rule-period'>
    <select
      className='form-select'
      aria-label='Period'
      value={period.kind}
      onChange={e => {
        const kind = e.target.value as CratePeriod['kind'];
        if (kind === 'calendarYear') onChange({ kind });
        else if (kind === 'lastDays') onChange({ kind, days: 30 });
        else onChange({ kind, date: isoDate(new Date()) });
      }}
    >
      <option value='calendarYear'>this calendar year</option>
      <option value='lastDays'>in the last … days</option>
      <option value='since'>since a date</option>
    </select>
    {period.kind === 'lastDays' && (
      <NumberField
        label='Number of days'
        value={period.days}
        min={CRATE_BOUNDS.days.min}
        max={CRATE_BOUNDS.days.max}
        suffix='days'
        onChange={days => onChange({ kind: 'lastDays', days: days ?? NaN })}
      />
    )}
    {period.kind === 'since' && (
      <DateField
        label='Since date'
        value={period.date}
        onChange={date => onChange({ kind: 'since', date: date ?? '' })}
      />
    )}
  </div>
);

// ---- Value editor per field/operator ----

type Patch = Record<string, unknown>;

function RuleValueEditor({
  rule,
  onPatch,
}: {
  rule: CrateRule;
  onPatch: (patch: Patch) => void;
}): React.ReactElement | null {
  const label = fieldLabel(rule.field);
  switch (rule.field) {
    case 'format':
    case 'artist':
    case 'genre':
    case 'style':
      return (
        <ChipInput
          label={`${label} values`}
          values={rule.values}
          suggestions={CRATE_VALUE_SUGGESTIONS[rule.field]}
          onChange={values => onPatch({ values })}
        />
      );
    case 'pressingYear':
      return (
        <div className='crate-rule-range'>
          <NumberField
            label='From year'
            placeholder='From'
            value={rule.from}
            min={CRATE_BOUNDS.year.min}
            max={CRATE_BOUNDS.year.max}
            onChange={from => onPatch({ from })}
          />
          <span className='crate-rule-suffix'>to</span>
          <NumberField
            label='To year'
            placeholder='To'
            value={rule.to}
            min={CRATE_BOUNDS.year.min}
            max={CRATE_BOUNDS.year.max}
            onChange={to => onPatch({ to })}
          />
        </div>
      );
    case 'dateAdded':
      if (rule.op === 'between') {
        return (
          <div className='crate-rule-range'>
            <DateField
              label='From date'
              value={rule.from}
              onChange={from => onPatch({ from })}
            />
            <span className='crate-rule-suffix'>to</span>
            <DateField
              label='To date'
              value={rule.to}
              onChange={to => onPatch({ to })}
            />
          </div>
        );
      }
      return (
        <NumberField
          label='Number of days'
          value={rule.days}
          min={CRATE_BOUNDS.days.min}
          max={CRATE_BOUNDS.days.max}
          suffix={rule.op === 'olderThanDays' ? 'days ago' : 'days'}
          onChange={days => onPatch({ days: days ?? NaN })}
        />
      );
    case 'rating':
      if (rule.op === 'isUnrated') return null;
      return (
        <NumberField
          label='Minimum rating'
          value={rule.value}
          min={CRATE_BOUNDS.rating.min}
          max={CRATE_BOUNDS.rating.max}
          suffix='of 5'
          onChange={value => onPatch({ value: value ?? NaN })}
        />
      );
    case 'runtime':
      if (rule.op === 'between') {
        return (
          <div className='crate-rule-range'>
            <NumberField
              label='Minimum minutes'
              value={rule.minMinutes}
              min={CRATE_BOUNDS.minutes.min}
              max={CRATE_BOUNDS.minutes.max}
              onChange={minMinutes =>
                onPatch({ minMinutes: minMinutes ?? NaN })
              }
            />
            <span className='crate-rule-suffix'>and</span>
            <NumberField
              label='Maximum minutes'
              value={rule.maxMinutes}
              min={CRATE_BOUNDS.minutes.min}
              max={CRATE_BOUNDS.minutes.max}
              suffix='min'
              onChange={maxMinutes =>
                onPatch({ maxMinutes: maxMinutes ?? NaN })
              }
            />
          </div>
        );
      }
      return (
        <NumberField
          label='Minutes'
          value={rule.minutes}
          min={CRATE_BOUNDS.minutes.min}
          max={CRATE_BOUNDS.minutes.max}
          suffix='min'
          onChange={minutes => onPatch({ minutes: minutes ?? NaN })}
        />
      );
    case 'discardPile':
      return null;
    case 'scrobbleCount':
      if (rule.op === 'topPercent') {
        return (
          <NumberField
            label='Percent'
            value={rule.percent}
            min={CRATE_BOUNDS.percent.min}
            max={CRATE_BOUNDS.percent.max}
            suffix='%'
            onChange={percent => onPatch({ percent: percent ?? NaN })}
          />
        );
      }
      return (
        <NumberField
          label='Scrobble count'
          value={rule.value}
          min={CRATE_BOUNDS.count.min}
          max={CRATE_BOUNDS.count.max}
          onChange={value => onPatch({ value: value ?? NaN })}
        />
      );
    case 'scrobblesInPeriod':
      return (
        <div className='crate-rule-range'>
          {rule.op !== 'none' && (
            <NumberField
              label='Scrobble count'
              value={rule.value}
              min={CRATE_BOUNDS.count.min}
              max={CRATE_BOUNDS.count.max}
              onChange={value => onPatch({ value: value ?? NaN })}
            />
          )}
          <PeriodPicker
            period={rule.period}
            onChange={period => onPatch({ period })}
          />
        </div>
      );
    case 'lastRecordedPlay':
      return (
        <NumberField
          label='Number of days'
          value={rule.days}
          min={CRATE_BOUNDS.days.min}
          max={CRATE_BOUNDS.days.max}
          suffix={rule.op === 'olderThanDays' ? 'days ago' : 'days'}
          onChange={days => onPatch({ days: days ?? NaN })}
        />
      );
    case 'playsSinceAdded':
      if (rule.op === 'none') return null;
      return (
        <NumberField
          label='Scrobble count'
          value={rule.value}
          min={CRATE_BOUNDS.countSinceAdded.min}
          max={CRATE_BOUNDS.countSinceAdded.max}
          onChange={value => onPatch({ value: value ?? NaN })}
        />
      );
  }
}

// ---- One rule row ----

interface CrateRuleRowProps {
  rule: CrateRule;
  index: number;
  errors?: string[];
  onChange: (rule: CrateRule) => void;
  onRemove: () => void;
}

const CrateRuleRow: React.FC<CrateRuleRowProps> = ({
  rule,
  index,
  errors,
  onChange,
  onRemove,
}) => {
  const helpId = useId();
  const problem = ruleProblem(rule);
  const shownErrors = errors && errors.length > 0 ? errors : [];
  const patch = (p: Patch) => onChange({ ...rule, ...p } as CrateRule);

  return (
    <li
      className={`crate-rule-row ${shownErrors.length ? 'crate-rule-row--error' : ''}`}
      aria-label={`Rule ${index + 1}`}
    >
      <div className='crate-rule-controls'>
        <select
          className='form-select crate-rule-field'
          aria-label={`Rule ${index + 1} field`}
          aria-describedby={helpId}
          value={rule.field}
          onChange={e =>
            onChange(defaultRule(e.target.value as CrateRuleField, rule.id))
          }
        >
          {CRATE_FIELD_ORDER.map(field => (
            <option key={field} value={field}>
              {fieldLabel(field)}
            </option>
          ))}
        </select>
        {CRATE_OPS[rule.field].length > 1 ? (
          <select
            className='form-select crate-rule-op'
            aria-label={`Rule ${index + 1} operator`}
            value={rule.op}
            onChange={e => onChange(changeRuleOp(rule, e.target.value))}
          >
            {CRATE_OPS[rule.field].map(option => (
              <option key={option.op} value={option.op}>
                {option.label}
              </option>
            ))}
          </select>
        ) : (
          <span className='crate-rule-op-static'>
            {CRATE_OPS[rule.field][0].label}
          </span>
        )}
        <div className='crate-rule-value'>
          <RuleValueEditor rule={rule} onPatch={patch} />
        </div>
        <IconButton
          icon={<Trash2 size={16} aria-hidden='true' />}
          aria-label={`Remove rule ${index + 1}`}
          size='small'
          className='crate-rule-remove'
          type='button'
          onClick={onRemove}
        />
      </div>

      <p id={helpId} className='crate-rule-help'>
        {fieldHelp(rule.field)}
      </p>

      {(supportsIfUnknown(rule) || rule.field === 'lastRecordedPlay') && (
        <div className='crate-rule-options'>
          {supportsIfUnknown(rule) && (
            <label className='crate-rule-checkbox'>
              <input
                type='checkbox'
                checked={'ifUnknown' in rule && rule.ifUnknown === 'include'}
                onChange={e =>
                  onChange(
                    setIfUnknown(rule, e.target.checked ? 'include' : 'exclude')
                  )
                }
              />
              Include albums with missing data
            </label>
          )}
          {rule.field === 'lastRecordedPlay' && rule.op === 'olderThanDays' && (
            <label className='crate-rule-checkbox'>
              <input
                type='checkbox'
                checked={rule.includeNoRecordedPlays}
                onChange={e =>
                  patch({ includeNoRecordedPlays: e.target.checked })
                }
              />
              {phrase('builder.includeNoRecordedPlays')}
            </label>
          )}
        </div>
      )}

      {(shownErrors.length > 0 || problem) && (
        <ul className='crate-rule-errors' role='alert'>
          {(shownErrors.length > 0 ? shownErrors : [problem]).map(message => (
            <li key={message}>
              <AlertCircle size={16} aria-hidden='true' />
              {message}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
};

// ---- Live preview ----

type PreviewState = 'idle' | 'loading' | 'ready' | 'invalid' | 'error';

interface CratePreviewProps {
  state: PreviewState;
  evaluation: CrateEvaluation | null;
  rules: CrateRule[];
  error: string | null;
}

const CratePreview: React.FC<CratePreviewProps> = ({
  state,
  evaluation,
  rules,
  error,
}) => {
  let body: React.ReactNode;
  if (rules.length === 0) {
    body = (
      <p className='crate-preview-note'>
        No rules yet. A crate without rules holds only the albums you include by
        hand.
      </p>
    );
  } else if (state === 'invalid') {
    body = (
      <p className='crate-preview-note'>
        Finish the highlighted rules to see matching albums.
      </p>
    );
  } else if (state === 'error') {
    body = (
      <p className='crate-preview-note crate-preview-note--error'>
        Preview unavailable: {error}
      </p>
    );
  } else if (!evaluation) {
    body = <p className='crate-preview-note'>Checking your collection…</p>;
  } else {
    const count = evaluation.albums.length;
    const coverage = formatCoverageCounts(evaluation.coverage, rules);
    body = (
      <>
        <p className='crate-preview-count' aria-live='polite'>
          <strong>{count.toLocaleString('en-US')}</strong>{' '}
          {count === 1 ? 'album matches' : 'albums match'}
        </p>
        <CrateMightMatch
          unknownOnly={evaluation.unknownOnly}
          rules={rules}
          total={evaluation.unknownOnlyAlbums}
        />
        {coverage.length > 0 && (
          <ul className='crate-preview-coverage'>
            {coverage.map(line => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
        {count > 0 && (
          <ul className='crate-preview-sample' aria-label='First matches'>
            {evaluation.albums.slice(0, PREVIEW_SAMPLE_SIZE).map(album => (
              <li key={album.albumKey}>
                <CrateCover
                  url={album.coverUrl}
                  title={album.album}
                  size='small'
                />
                <span className='crate-preview-sample-text'>
                  <span className='crate-preview-sample-album'>
                    {album.album}
                  </span>
                  <span className='crate-preview-sample-artist'>
                    {album.artist}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </>
    );
  }

  return (
    <aside
      className={`crate-preview ${state === 'loading' ? 'crate-preview--loading' : ''}`}
      aria-label='Preview'
      aria-busy={state === 'loading'}
    >
      <h3 className='crate-preview-title'>Preview</h3>
      {body}
    </aside>
  );
};

// ---- Builder ----

export interface CrateRuleBuilderProps {
  api: Pick<ApiService, 'previewCrate'>;
  rules: CrateRule[];
  sort: CrateSort;
  onRulesChange: (rules: CrateRule[]) => void;
  onSortChange: (sort: CrateSort) => void;
  /** Server validation messages per rule id */
  ruleErrors?: Record<string, string[]>;
}

/**
 * Rule rows (field → operator → value), sort order and a debounced live
 * preview of the matching albums (plan sections 2.2 and 11.3).
 */
const CrateRuleBuilder: React.FC<CrateRuleBuilderProps> = ({
  api,
  rules,
  sort,
  onRulesChange,
  onSortChange,
  ruleErrors,
}) => {
  const [previewState, setPreviewState] = useState<PreviewState>('idle');
  const [preview, setPreview] = useState<CrateEvaluation | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const requestSeq = useRef(0);
  const sortId = useId();

  useEffect(() => {
    const seq = ++requestSeq.current;
    if (rules.length === 0) {
      setPreviewState('idle');
      setPreview(null);
      return;
    }
    if (rules.some(rule => ruleProblem(rule) !== null)) {
      setPreviewState('invalid');
      return;
    }
    setPreviewState('loading');
    const timer = setTimeout(() => {
      api
        .previewCrate(rules, sort)
        .then(evaluation => {
          if (seq !== requestSeq.current) return;
          setPreview(evaluation);
          setPreviewError(null);
          setPreviewState('ready');
        })
        .catch((err: unknown) => {
          if (seq !== requestSeq.current) return;
          setPreviewError(apiErrorInfo(err).message);
          setPreviewState('error');
        });
    }, PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [api, rules, sort]);

  const updateRule = (index: number, rule: CrateRule) => {
    onRulesChange(rules.map((r, i) => (i === index ? rule : r)));
  };

  const addRule = () => {
    onRulesChange([...rules, defaultRule('genre', newRuleId())]);
  };

  const atLimit = rules.length >= CRATE_MAX_RULES;

  return (
    <div className='crate-rule-builder-container'>
      <div className='crate-rule-builder'>
        <div className='crate-rule-builder-main'>
          <div className='crate-rule-builder-header'>
            <h3>Rules</h3>
            <span className='crate-rule-builder-hint'>
              Albums must match every rule.
            </span>
          </div>
          {rules.length > 0 && (
            <ol className='crate-rule-list'>
              {rules.map((rule, index) => (
                <CrateRuleRow
                  key={rule.id}
                  rule={rule}
                  index={index}
                  errors={ruleErrors?.[rule.id]}
                  onChange={next => updateRule(index, next)}
                  onRemove={() =>
                    onRulesChange(rules.filter((_, i) => i !== index))
                  }
                />
              ))}
            </ol>
          )}
          <div className='crate-rule-builder-footer'>
            <Button
              variant='secondary'
              size='small'
              iconLeft={<Plus size={16} aria-hidden='true' />}
              type='button'
              onClick={addRule}
              disabled={atLimit}
            >
              Add rule
            </Button>
            {atLimit && (
              <span className='crate-rule-builder-hint'>
                A crate can have up to {CRATE_MAX_RULES} rules.
              </span>
            )}
            <label className='crate-sort' htmlFor={sortId}>
              Sort by
              <select
                id={sortId}
                className='form-select'
                value={sort}
                onChange={e => onSortChange(e.target.value as CrateSort)}
              >
                {CRATE_SORTS.map(option => (
                  <option key={option} value={option}>
                    {sortLabel(option)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <CratePreview
          state={previewState}
          evaluation={preview}
          rules={rules}
          error={previewError}
        />
      </div>
    </div>
  );
};

export default CrateRuleBuilder;
