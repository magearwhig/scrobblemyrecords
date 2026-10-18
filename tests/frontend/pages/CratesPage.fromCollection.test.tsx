import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import '@testing-library/jest-dom';

import { AppProvider } from '../../../src/renderer/context/AppContext';
import { AuthProvider } from '../../../src/renderer/context/AuthContext';
import CratesPage, {
  readCratesView,
} from '../../../src/renderer/pages/CratesPage';
import { stashCrateRulesFromCollection } from '../../../src/renderer/utils/collectionFiltersToCrateRules';
import { CRATE_TEMPLATES } from '../../../src/shared/crateTemplates';
import { AuthStatus, CrateRule } from '../../../src/shared/types';
import { makeCrate, makeEvaluation } from '../components/crates/crateFixtures';

// Collection "Save as crate" opens #crates?new=1&from=collection with the
// rules stashed in sessionStorage; the new-crate editor starts from them.

const mockApi = {
  getCrates: jest.fn(),
  getCrateTemplates: jest.fn(),
  getCrate: jest.fn(),
  createCrate: jest.fn(),
  updateCrate: jest.fn(),
  deleteCrate: jest.fn(),
  previewCrate: jest.fn(),
  getCrateSuggestions: jest.fn(),
};

jest.mock('../../../src/renderer/services/api', () => ({
  getApiService: () => mockApi,
}));

jest.mock('../../../src/renderer/hooks/useNotifications', () => ({
  useNotifications: () => ({
    addNotification: jest.fn(),
    notifications: [],
    unreadCount: 0,
  }),
  createSuccessNotification: jest.fn(),
  createAlertNotification: jest.fn(),
}));

jest.mock('../../../src/renderer/utils/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  }),
}));

const connected: AuthStatus = {
  discogs: { authenticated: true, username: 'tester' },
  lastfm: { authenticated: true, username: 'tester' },
};

const RULES: CrateRule[] = [
  { id: 'c1', field: 'format', op: 'anyOf', values: ['Vinyl'] },
  { id: 'c2', field: 'dateAdded', op: 'withinDays', days: 30 },
];

describe('CratesPage new crate from Collection filters', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.sessionStorage.clear();
    mockApi.getCrates.mockResolvedValue([]);
    mockApi.getCrateTemplates.mockResolvedValue(CRATE_TEMPLATES);
    mockApi.previewCrate.mockResolvedValue(makeEvaluation());
    mockApi.getCrateSuggestions.mockResolvedValue({
      suggestions: [],
      exhausted: true,
    });
  });

  afterEach(() => {
    window.location.hash = '';
  });

  it('reads from=collection from the hash', () => {
    window.location.hash = '#crates?new=1&from=collection';
    expect(readCratesView()).toEqual({ kind: 'new', fromCollection: true });
    window.location.hash = '#crates?new=1';
    expect(readCratesView()).toEqual({ kind: 'new' });
  });

  it('prefills the editor with the stashed rules and saves them', async () => {
    stashCrateRulesFromCollection(RULES);
    window.location.hash = '#crates?new=1&from=collection';
    mockApi.createCrate.mockResolvedValue(
      makeCrate({ id: 'new-id', name: 'New vinyl', rules: RULES })
    );
    const user = userEvent.setup();
    render(
      <AppProvider>
        <AuthProvider
          value={{ authStatus: connected, setAuthStatus: jest.fn() }}
        >
          <CratesPage />
        </AuthProvider>
      </AppProvider>
    );

    await waitFor(() =>
      expect(mockApi.previewCrate).toHaveBeenCalledWith(RULES, 'artist')
    );
    await user.type(await screen.findByLabelText('Name'), 'New vinyl');
    await user.click(screen.getByRole('button', { name: 'Create crate' }));

    expect(mockApi.createCrate).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'New vinyl', rules: RULES })
    );
  });
});
