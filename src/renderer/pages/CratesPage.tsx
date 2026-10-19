import {
  ArrowLeft,
  Boxes,
  Link2Off,
  Pencil,
  Pin,
  Plus,
  Trash2,
} from 'lucide-react';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { CRATE_SORTS } from '../../shared/crateTemplates';
import {
  Crate,
  CrateAlbumResult,
  CrateEvaluation,
  CrateSort,
  CrateSummary,
  CrateTemplate,
} from '../../shared/types';
import { describeCrateRule } from '../../shared/utils/crateReasons';
import CrateAlbumList from '../components/crates/CrateAlbumList';
import CrateCard from '../components/crates/CrateCard';
import CrateCoverageNotice from '../components/crates/CrateCoverageNotice';
import CrateEditor from '../components/crates/CrateEditor';
import CrateExcludedSection from '../components/crates/CrateExcludedSection';
import CrateMightMatch from '../components/crates/CrateMightMatch';
import { sortLabel } from '../components/crates/CrateRuleBuilder';
import { apiErrorInfo } from '../components/crates/crateRuleModel';
import CrateStaleOverrides from '../components/crates/CrateStaleOverrides';
import CrateSuggestionHistoryReset from '../components/crates/CrateSuggestionHistoryReset';
import CrateSuggestions from '../components/crates/CrateSuggestions';
import { openCrateRelease } from '../components/crates/openCrateRelease';
import { Button, EmptyState } from '../components/ui';
import { ErrorState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useConfirmModal } from '../hooks/useConfirmModal';
import {
  createAlertNotification,
  createSuccessNotification,
  useNotifications,
} from '../hooks/useNotifications';
import { ROUTES, navigate } from '../routes';
import { getApiService } from '../services/api';
import { readCrateRulesFromCollection } from '../utils/collectionFiltersToCrateRules';
import { createLogger } from '../utils/logger';

import './CratesPage.page.css';

const logger = createLogger('CratesPage');

type CratesView =
  | { kind: 'list' }
  | { kind: 'new'; templateId?: string; fromCollection?: boolean }
  | { kind: 'detail'; id: string }
  | { kind: 'edit'; id: string };

/** Read the view from the hash: #crates, #crates?id=…, &edit=1, ?new=1&template=… */
export function readCratesView(): CratesView {
  const hash = window.location.hash;
  const queryStart = hash.indexOf('?');
  const params = new URLSearchParams(
    queryStart === -1 ? '' : hash.substring(queryStart)
  );
  const id = params.get('id');
  if (id) {
    return params.get('edit') === '1'
      ? { kind: 'edit', id }
      : { kind: 'detail', id };
  }
  if (params.get('new') === '1') {
    const templateId = params.get('template') ?? undefined;
    return {
      kind: 'new',
      ...(templateId ? { templateId } : {}),
      ...(params.get('from') === 'collection' ? { fromCollection: true } : {}),
    };
  }
  return { kind: 'list' };
}

function viewsEqual(a: CratesView, b: CratesView): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

interface CrateDetail {
  crate: Crate;
  evaluation: CrateEvaluation;
}

const NotConnected: React.FC = () => (
  <EmptyState
    icon={<Link2Off size={40} aria-hidden='true' />}
    title='Connect Discogs to use crates'
    description='Crates are built from your Discogs collection.'
    actions={[
      {
        label: 'Go to connections',
        onClick: () => navigate(ROUTES.SETTINGS, { tab: 'connections' }),
      },
    ]}
  />
);

const ListSkeleton: React.FC = () => (
  <div className='crates-grid' aria-hidden='true'>
    {Array.from({ length: 6 }).map((_, i) => (
      <div key={i} className='crates-skeleton-card'>
        <Skeleton variant='rectangular' width={96} height={96} />
        <div className='crates-skeleton-text'>
          <Skeleton variant='text' height={18} width='70%' />
          <Skeleton variant='text' height={14} width='40%' />
          <Skeleton variant='text' height={12} width='90%' />
        </div>
      </div>
    ))}
  </div>
);

const CratesPage: React.FC = () => {
  const { state } = useApp();
  const { authStatus } = useAuth();
  const { addNotification } = useNotifications();
  const [confirm, ConfirmModal] = useConfirmModal();
  const api = useMemo(() => getApiService(state.serverUrl), [state.serverUrl]);
  const discogsConnected = authStatus.discogs.authenticated;

  const [view, setView] = useState<CratesView>(readCratesView);

  // List
  const [summaries, setSummaries] = useState<CrateSummary[] | null>(null);
  const [templates, setTemplates] = useState<CrateTemplate[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [pinBusy, setPinBusy] = useState<ReadonlySet<string>>(new Set());
  const [suggestionsKey, setSuggestionsKey] = useState(0);

  // Detail
  const [detail, setDetail] = useState<CrateDetail | null>(null);
  const [detailError, setDetailError] = useState<{
    status?: number;
    message: string;
  } | null>(null);
  const [busyKeys, setBusyKeys] = useState<ReadonlySet<string>>(new Set());
  const [staleBusy, setStaleBusy] = useState(false);
  const [unauthorized, setUnauthorized] = useState(false);

  // Follow in-app navigation between list, detail and editor
  useEffect(() => {
    const handleHashChange = () => {
      const next = readCratesView();
      setView(prev => (viewsEqual(prev, next) ? prev : next));
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const loadList = useCallback(async () => {
    setListError(null);
    try {
      const [list, templateList] = await Promise.all([
        api.getCrates(),
        api.getCrateTemplates().catch(() => [] as CrateTemplate[]),
      ]);
      setSummaries(list);
      setTemplates(templateList);
    } catch (err) {
      const info = apiErrorInfo(err);
      if (info.status === 401) {
        setUnauthorized(true);
      } else {
        logger.error('Failed to load crates', err);
        setListError(info.message);
      }
    }
  }, [api]);

  const detailId =
    view.kind === 'detail' || view.kind === 'edit' ? view.id : null;

  // Only the latest detail request may update the view (A → B navigation,
  // refreshes after overrides)
  const detailRequestSeq = useRef(0);

  const loadDetail = useCallback(
    async (id: string) => {
      const seq = ++detailRequestSeq.current;
      try {
        const data = await api.getCrate(id);
        if (seq !== detailRequestSeq.current) return;
        setDetail(data);
        setDetailError(null);
      } catch (err) {
        if (seq !== detailRequestSeq.current) return;
        const info = apiErrorInfo(err);
        if (info.status === 401) {
          setUnauthorized(true);
        } else {
          logger.error('Failed to load crate', err);
          setDetailError({ status: info.status, message: info.message });
        }
      }
    },
    [api]
  );

  useEffect(() => {
    if (!discogsConnected || view.kind !== 'list') return;
    loadList();
  }, [discogsConnected, view.kind, loadList]);

  useEffect(() => {
    if (!discogsConnected || !detailId) return;
    setDetail(prev => (prev?.crate.id === detailId ? prev : null));
    setDetailError(null);
    loadDetail(detailId);
  }, [discogsConnected, detailId, loadDetail]);

  // ---- Actions ----

  const notifyError = useCallback(
    (title: string, err: unknown) => {
      addNotification(
        createAlertNotification(title, apiErrorInfo(err).message)
      );
    },
    [addNotification]
  );

  const togglePin = useCallback(
    async (id: string, pinned: boolean) => {
      const next = !pinned;
      setPinBusy(prev => new Set(prev).add(id));
      setSummaries(prev =>
        prev
          ? prev.map(s =>
              s.id === id ? { ...s, pinnedToWhatToPlay: next } : s
            )
          : prev
      );
      setDetail(prev =>
        prev && prev.crate.id === id
          ? { ...prev, crate: { ...prev.crate, pinnedToWhatToPlay: next } }
          : prev
      );
      try {
        await api.updateCrate(id, { pinnedToWhatToPlay: next });
      } catch (err) {
        setSummaries(prev =>
          prev
            ? prev.map(s =>
                s.id === id ? { ...s, pinnedToWhatToPlay: pinned } : s
              )
            : prev
        );
        setDetail(prev =>
          prev && prev.crate.id === id
            ? { ...prev, crate: { ...prev.crate, pinnedToWhatToPlay: pinned } }
            : prev
        );
        notifyError('Could not update crate', err);
      } finally {
        setPinBusy(prev => {
          const copy = new Set(prev);
          copy.delete(id);
          return copy;
        });
      }
    },
    [api, notifyError]
  );

  const handleDelete = useCallback(
    async (crate: Crate) => {
      const ok = await confirm(
        `Delete "${crate.name}"? Its rules and your include/exclude choices will be removed. Your collection is not changed.`,
        { title: 'Delete crate', confirmLabel: 'Delete' }
      );
      if (!ok) return;
      try {
        await api.deleteCrate(crate.id);
        addNotification(
          createSuccessNotification('Crate deleted', `"${crate.name}" deleted`)
        );
        setDetail(null);
        navigate(ROUTES.CRATES);
      } catch (err) {
        notifyError('Could not delete crate', err);
      }
    },
    [api, confirm, addNotification, notifyError]
  );

  const [sortBusy, setSortBusy] = useState(false);

  /** Save a new sort and reload the crate in that order */
  const changeSort = useCallback(
    async (id: string, sort: CrateSort) => {
      setSortBusy(true);
      setDetail(prev =>
        prev && prev.crate.id === id
          ? { ...prev, crate: { ...prev.crate, sort } }
          : prev
      );
      try {
        await api.updateCrate(id, { sort });
        await loadDetail(id);
      } catch (err) {
        notifyError('Could not change the sort', err);
        await loadDetail(id);
      } finally {
        setSortBusy(false);
      }
    },
    [api, loadDetail, notifyError]
  );

  const runOverride = useCallback(
    async (
      album: CrateAlbumResult,
      action: 'include' | 'exclude' | 'reset'
    ) => {
      if (!detail) return;
      const id = detail.crate.id;
      const releaseIds = album.copies.map(copy => copy.releaseId);
      setBusyKeys(prev => new Set(prev).add(album.albumKey));
      try {
        if (action === 'reset') {
          await api.clearCrateOverrides(id, releaseIds);
        } else {
          await api.setCrateOverride(id, releaseIds, action);
        }
        await loadDetail(id);
      } catch (err) {
        notifyError('Could not update crate', err);
      } finally {
        setBusyKeys(prev => {
          const copy = new Set(prev);
          copy.delete(album.albumKey);
          return copy;
        });
      }
    },
    [api, detail, loadDetail, notifyError]
  );

  const handleRemoveStale = useCallback(async () => {
    if (!detail) return;
    setStaleBusy(true);
    try {
      await api.removeStaleCrateOverrides(detail.crate.id);
      await loadDetail(detail.crate.id);
    } catch (err) {
      notifyError('Could not remove old choices', err);
    } finally {
      setStaleBusy(false);
    }
  }, [api, detail, loadDetail, notifyError]);

  const openRelease = useCallback(
    (album: CrateAlbumResult) => openCrateRelease(album, ROUTES.CRATES),
    []
  );

  const handleSaved = useCallback(
    (crate: Crate) => {
      addNotification(
        createSuccessNotification('Crate saved', `"${crate.name}" saved`)
      );
      // After an edit the crate id in the URL is unchanged, so the detail
      // effect won't refetch: reload the evaluation for the saved rules here
      if (detailId === crate.id) {
        loadDetail(crate.id);
      }
      navigate(ROUTES.CRATES, { id: crate.id });
    },
    [addNotification, detailId, loadDetail]
  );

  // ---- Render ----

  if (!discogsConnected || unauthorized) {
    return (
      <div className='crates-page'>
        <header className='crates-header'>
          <h1>Crates</h1>
        </header>
        <NotConnected />
      </div>
    );
  }

  const renderList = () => {
    if (listError) {
      return (
        <ErrorState
          description={listError}
          actions={[{ label: 'Try again', onClick: loadList }]}
        />
      );
    }
    if (!summaries) return <ListSkeleton />;
    if (summaries.length === 0) {
      return (
        <div className='crates-empty'>
          <EmptyState
            icon={<Boxes size={40} aria-hidden='true' />}
            title='No crates yet'
            description='A crate is a saved set of rules that keeps a selection of your collection up to date, like "Jazz in 40 minutes".'
            actions={[
              {
                label: 'New crate',
                onClick: () => navigate(ROUTES.CRATES, { new: '1' }),
              },
            ]}
          />
          {templates.length > 0 && (
            <section
              className='crates-empty-templates'
              aria-label='Start from a template'
            >
              <h2>Start from a template</h2>
              <div className='crates-template-grid'>
                {templates.map(template => (
                  <div key={template.id} className='crates-template'>
                    <h3>{template.name}</h3>
                    <p>{template.description}</p>
                    <Button
                      size='small'
                      variant='secondary'
                      onClick={() =>
                        navigate(ROUTES.CRATES, {
                          new: '1',
                          template: template.id,
                        })
                      }
                      aria-label={`Use template ${template.name}`}
                    >
                      Use template
                    </Button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      );
    }
    return (
      <div className='crates-grid'>
        {summaries.map(summary => (
          <CrateCard
            key={summary.id}
            crate={summary}
            pinBusy={pinBusy.has(summary.id)}
            onOpen={crate => navigate(ROUTES.CRATES, { id: crate.id })}
            onTogglePin={crate => togglePin(crate.id, crate.pinnedToWhatToPlay)}
          />
        ))}
      </div>
    );
  };

  const backToList = (
    <Button
      variant='ghost'
      size='small'
      className='crates-back'
      iconLeft={<ArrowLeft size={16} aria-hidden='true' />}
      onClick={() => navigate(ROUTES.CRATES)}
    >
      All crates
    </Button>
  );

  const renderDetailError = () =>
    detailError?.status === 404 ? (
      <EmptyState
        icon={<Boxes size={40} aria-hidden='true' />}
        title='Crate not found'
        description='It may have been deleted.'
        actions={[
          { label: 'All crates', onClick: () => navigate(ROUTES.CRATES) },
        ]}
      />
    ) : (
      <ErrorState
        description={detailError?.message}
        actions={[
          {
            label: 'Try again',
            onClick: () => detailId && loadDetail(detailId),
          },
        ]}
      />
    );

  const renderDetail = () => {
    if (detailError) return renderDetailError();
    if (!detail) {
      return (
        <div className='crates-detail-skeleton' aria-hidden='true'>
          <Skeleton variant='text' height={32} width='40%' />
          <Skeleton variant='text' height={16} width='60%' />
          <Skeleton variant='rectangular' height={240} width='100%' />
        </div>
      );
    }

    const { crate, evaluation } = detail;
    const count = evaluation.albums.length;
    const historyFrom = evaluation.coverage.historyFrom;

    return (
      <div className='crates-detail'>
        <header className='crates-detail-header'>
          <div className='crates-detail-title'>
            <h1>{crate.name}</h1>
            <span className='crates-detail-count'>
              {count.toLocaleString('en-US')} {count === 1 ? 'album' : 'albums'}
            </span>
          </div>
          {crate.description && (
            <p className='crates-detail-description'>{crate.description}</p>
          )}
          <div className='crates-detail-actions'>
            <Button
              size='small'
              variant={crate.pinnedToWhatToPlay ? 'primary' : 'secondary'}
              iconLeft={<Pin size={16} aria-hidden='true' />}
              aria-pressed={crate.pinnedToWhatToPlay}
              disabled={pinBusy.has(crate.id)}
              onClick={() => togglePin(crate.id, crate.pinnedToWhatToPlay)}
            >
              {crate.pinnedToWhatToPlay
                ? 'Pinned to What to Play'
                : 'Pin to What to Play'}
            </Button>
            <Button
              size='small'
              variant='secondary'
              iconLeft={<Pencil size={16} aria-hidden='true' />}
              onClick={() =>
                navigate(ROUTES.CRATES, { id: crate.id, edit: '1' })
              }
            >
              Edit
            </Button>
            <Button
              size='small'
              variant='danger'
              iconLeft={<Trash2 size={16} aria-hidden='true' />}
              onClick={() => handleDelete(crate)}
            >
              Delete
            </Button>
          </div>
        </header>

        <div className='crates-detail-layout'>
          <aside className='crates-detail-side'>
            <section className='crates-panel' aria-label='Rules'>
              <h2 className='crates-panel-title'>Rules</h2>
              {crate.rules.length === 0 ? (
                <p className='crates-panel-note'>
                  No rules: only albums you include are in this crate.
                </p>
              ) : (
                <ul className='crates-rule-summary'>
                  {crate.rules.map(rule => (
                    <li key={rule.id}>{describeCrateRule(rule)}</li>
                  ))}
                </ul>
              )}
            </section>
            <section className='crates-panel' aria-label='Coverage'>
              <CrateCoverageNotice
                coverage={evaluation.coverage}
                rules={crate.rules}
              />
            </section>
            {evaluation.unknownOnly.some(entry => entry.count > 0) && (
              <section className='crates-panel' aria-label='Might match'>
                <h2 className='crates-panel-title'>Might match</h2>
                <CrateMightMatch
                  unknownOnly={evaluation.unknownOnly}
                  rules={crate.rules}
                  total={evaluation.unknownOnlyAlbums}
                  showSamples
                />
              </section>
            )}
            <CrateStaleOverrides
              overrides={evaluation.staleOverrides}
              collectionComplete={evaluation.coverage.collection.complete}
              busy={staleBusy}
              onRemoveAll={handleRemoveStale}
            />
          </aside>

          <div className='crates-detail-main'>
            {count > 1 && (
              <div className='crates-detail-toolbar'>
                <label htmlFor='crate-detail-sort'>Sort by</label>
                <select
                  id='crate-detail-sort'
                  className='form-select'
                  value={crate.sort}
                  disabled={sortBusy}
                  onChange={e =>
                    changeSort(crate.id, e.target.value as CrateSort)
                  }
                >
                  {CRATE_SORTS.map(option => (
                    <option key={option} value={option}>
                      {sortLabel(option)}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {count === 0 ? (
              <EmptyState
                size='small'
                icon={<Boxes size={32} aria-hidden='true' />}
                title='No albums in this crate right now'
                description={
                  crate.rules.length === 0
                    ? 'Albums you include will appear here.'
                    : 'No owned albums match all of these rules.'
                }
              />
            ) : (
              <CrateAlbumList
                albums={evaluation.albums}
                rules={crate.rules}
                historyFrom={historyFrom}
                busyKeys={busyKeys}
                onInclude={album => runOverride(album, 'include')}
                onExclude={album => runOverride(album, 'exclude')}
                onReset={album => runOverride(album, 'reset')}
                onOpenRelease={openRelease}
              />
            )}
            <CrateExcludedSection
              albums={evaluation.excluded}
              rules={crate.rules}
              historyFrom={historyFrom}
              busyKeys={busyKeys}
              onRestore={album => runOverride(album, 'reset')}
              onInclude={album => runOverride(album, 'include')}
              onOpenRelease={openRelease}
            />
          </div>
        </div>
      </div>
    );
  };

  const renderEditor = () => {
    if (view.kind === 'new') {
      return (
        <>
          <header className='crates-header'>
            <h1>New crate</h1>
          </header>
          <CrateEditor
            key={
              view.fromCollection ? 'collection' : (view.templateId ?? 'blank')
            }
            api={api}
            initialTemplateId={view.templateId}
            initialRules={
              view.fromCollection ? readCrateRulesFromCollection() : undefined
            }
            onSaved={handleSaved}
            onCancel={() => navigate(ROUTES.CRATES)}
          />
        </>
      );
    }
    if (detailError) return renderDetailError();
    if (!detail) {
      return (
        <div className='crates-detail-skeleton' aria-hidden='true'>
          <Skeleton variant='text' height={32} width='40%' />
          <Skeleton variant='rectangular' height={240} width='100%' />
        </div>
      );
    }
    return (
      <>
        <header className='crates-header'>
          <h1>Edit crate</h1>
        </header>
        <CrateEditor
          key={detail.crate.id}
          api={api}
          crate={detail.crate}
          onSaved={handleSaved}
          onCancel={() => navigate(ROUTES.CRATES, { id: detail.crate.id })}
        />
      </>
    );
  };

  return (
    <div className='crates-page'>
      {view.kind === 'list' ? (
        <>
          <header className='crates-header'>
            <div>
              <h1>Crates</h1>
              <p className='crates-subtitle'>
                Saved rules that keep a selection of your collection up to date.
              </p>
            </div>
            <div className='crates-header-actions'>
              <CrateSuggestionHistoryReset
                api={api}
                onReset={() => setSuggestionsKey(key => key + 1)}
              />
              <Button
                iconLeft={<Plus size={16} aria-hidden='true' />}
                onClick={() => navigate(ROUTES.CRATES, { new: '1' })}
              >
                New crate
              </Button>
            </div>
          </header>
          {summaries && !listError && (
            <CrateSuggestions
              api={api}
              refreshKey={suggestionsKey}
              onAdded={crate => navigate(ROUTES.CRATES, { id: crate.id })}
            />
          )}
          {renderList()}
        </>
      ) : (
        <>
          {backToList}
          {view.kind === 'detail' ? renderDetail() : renderEditor()}
        </>
      )}
      {ConfirmModal}
    </div>
  );
};

export default CratesPage;
