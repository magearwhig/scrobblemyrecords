import { AlertCircle, Check, FilePlus2, LayoutTemplate } from 'lucide-react';
import React, { useEffect, useId, useState } from 'react';

import { CRATE_NAME_MAX_LENGTH } from '../../../shared/crateTemplates';
import {
  Crate,
  CrateRule,
  CrateSort,
  CrateTemplate,
} from '../../../shared/types';
import { describeCrateRule } from '../../../shared/utils/crateReasons';
import type ApiService from '../../services/api';
import { Button } from '../ui';

import CrateRuleBuilder from './CrateRuleBuilder';
import { apiErrorInfo, ruleProblem, splitRuleErrors } from './crateRuleModel';
import './CrateEditor.css';

export type CrateEditorApi = Pick<
  ApiService,
  'previewCrate' | 'createCrate' | 'updateCrate' | 'getCrateTemplates'
>;

export interface CrateEditorProps {
  api: CrateEditorApi;
  /** The crate to edit; omit to create a new one */
  crate?: Crate;
  /** Template to start a new crate from */
  initialTemplateId?: string;
  onSaved: (crate: Crate) => void;
  onCancel: () => void;
}

const BLANK = '';

/** Create/edit form: name, description, rules and sort, with live preview */
const CrateEditor: React.FC<CrateEditorProps> = ({
  api,
  crate,
  initialTemplateId,
  onSaved,
  onCancel,
}) => {
  const isNew = !crate;
  const nameId = useId();
  const descriptionId = useId();

  const [name, setName] = useState(crate?.name ?? '');
  const [description, setDescription] = useState(crate?.description ?? '');
  const [rules, setRules] = useState<CrateRule[]>(crate?.rules ?? []);
  const [sort, setSort] = useState<CrateSort>(crate?.sort ?? 'artist');
  const [templateId, setTemplateId] = useState<string>(BLANK);
  const [templates, setTemplates] = useState<CrateTemplate[]>([]);
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [ruleErrors, setRuleErrors] = useState<Record<string, string[]>>({});

  const applyTemplate = (template: CrateTemplate | null) => {
    setTemplateId(template?.id ?? BLANK);
    setName(template?.name ?? '');
    setDescription(template?.description ?? '');
    setRules(template ? template.rules.map(rule => ({ ...rule })) : []);
    setSort(template?.sort ?? 'artist');
    setRuleErrors({});
    setFormErrors([]);
    setNameError(null);
  };

  useEffect(() => {
    if (!isNew) return;
    let cancelled = false;
    api
      .getCrateTemplates()
      .then(list => {
        if (cancelled) return;
        setTemplates(list);
        const initial = list.find(t => t.id === initialTemplateId);
        if (initial) applyTemplate(initial);
      })
      .catch(() => {
        // Templates are a convenience; the blank form still works
      });
    return () => {
      cancelled = true;
    };
    // Load once per editor
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, isNew]);

  const handleRulesChange = (next: CrateRule[]) => {
    setRules(next);
    setRuleErrors({});
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    setFormErrors([]);
    if (!trimmed) {
      setNameError('Enter a name for the crate.');
      return;
    }
    setNameError(null);
    if (rules.some(rule => ruleProblem(rule) !== null)) {
      setFormErrors(['Fix the highlighted rules before saving.']);
      return;
    }

    setSaving(true);
    try {
      const desc = description.trim();
      const saved = crate
        ? await api.updateCrate(crate.id, {
            name: trimmed,
            description: desc,
            rules,
            sort,
          })
        : await api.createCrate({
            name: trimmed,
            ...(desc ? { description: desc } : {}),
            rules,
            sort,
            ...(templateId ? { templateId } : {}),
          });
      onSaved(saved);
    } catch (err) {
      const info = apiErrorInfo(err);
      const { byRule, other } = splitRuleErrors(info.details, rules);
      setRuleErrors(byRule);
      const nameDetails = other.filter(d => /name/i.test(d));
      const rest = other.filter(d => !/name/i.test(d));
      if (nameDetails.length > 0 || (info.status === 409 && !rest.length)) {
        setNameError(nameDetails.join(' ') || info.message);
      }
      setFormErrors(
        rest.length > 0
          ? rest
          : nameDetails.length > 0 || info.status === 409
            ? []
            : [info.message]
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className='crate-editor' onSubmit={handleSave} noValidate>
      {isNew && templates.length > 0 && (
        <section className='crate-editor-templates' aria-label='Start from'>
          <h3 className='crate-editor-section-title'>Start from</h3>
          <div className='crate-template-grid' role='radiogroup'>
            <button
              type='button'
              role='radio'
              aria-checked={templateId === BLANK}
              className={`crate-template-card ${templateId === BLANK ? 'crate-template-card--selected' : ''}`}
              onClick={() => applyTemplate(null)}
            >
              <span className='crate-template-name'>
                <FilePlus2 size={16} aria-hidden='true' />
                Blank crate
              </span>
              <span className='crate-template-description'>
                Add your own rules, or none to pick albums by hand.
              </span>
            </button>
            {templates.map(template => (
              <button
                key={template.id}
                type='button'
                role='radio'
                aria-checked={templateId === template.id}
                className={`crate-template-card ${templateId === template.id ? 'crate-template-card--selected' : ''}`}
                onClick={() => applyTemplate(template)}
              >
                <span className='crate-template-name'>
                  {templateId === template.id ? (
                    <Check size={16} aria-hidden='true' />
                  ) : (
                    <LayoutTemplate size={16} aria-hidden='true' />
                  )}
                  {template.name}
                </span>
                <span className='crate-template-rules'>
                  {template.rules.map(describeCrateRule).join(' · ')}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <div className='crate-editor-fields'>
        <div className='form-group'>
          <label className='form-label' htmlFor={nameId}>
            Name
          </label>
          <input
            id={nameId}
            className='form-input'
            type='text'
            value={name}
            maxLength={CRATE_NAME_MAX_LENGTH}
            required
            aria-invalid={nameError ? true : undefined}
            onChange={e => {
              setName(e.target.value);
              setNameError(null);
            }}
          />
          {nameError && (
            <p className='crate-editor-field-error' role='alert'>
              {nameError}
            </p>
          )}
        </div>
        <div className='form-group'>
          <label className='form-label' htmlFor={descriptionId}>
            Description <span className='crate-editor-optional'>optional</span>
          </label>
          <textarea
            id={descriptionId}
            className='form-textarea crate-editor-description'
            value={description}
            rows={2}
            onChange={e => setDescription(e.target.value)}
          />
        </div>
      </div>

      <CrateRuleBuilder
        api={api}
        rules={rules}
        sort={sort}
        onRulesChange={handleRulesChange}
        onSortChange={setSort}
        ruleErrors={ruleErrors}
      />

      {formErrors.length > 0 && (
        <ul className='crate-editor-errors' role='alert'>
          {formErrors.map(message => (
            <li key={message}>
              <AlertCircle size={16} aria-hidden='true' />
              {message}
            </li>
          ))}
        </ul>
      )}

      <div className='crate-editor-actions'>
        <Button
          type='button'
          variant='secondary'
          onClick={onCancel}
          disabled={saving}
        >
          Cancel
        </Button>
        <Button type='submit' loading={saving}>
          {isNew ? 'Create crate' : 'Save changes'}
        </Button>
      </div>
    </form>
  );
};

export default CrateEditor;
