import {
  collectionFiltersToCrateRules,
  readCrateRulesFromCollection,
  stashCrateRulesFromCollection,
} from '../../../src/renderer/utils/collectionFiltersToCrateRules';

const NONE = { format: '', yearFrom: '', yearTo: '', dateAdded: '' };

function ids() {
  let n = 0;
  return () => `r${++n}`;
}

describe('collectionFiltersToCrateRules', () => {
  it('returns no rules without filters', () => {
    expect(collectionFiltersToCrateRules(NONE, ids())).toEqual([]);
  });

  it('maps format to format anyOf', () => {
    expect(
      collectionFiltersToCrateRules({ ...NONE, format: 'Vinyl' }, ids())
    ).toEqual([{ id: 'r1', field: 'format', op: 'anyOf', values: ['Vinyl'] }]);
  });

  it('maps a year range to pressingYear between', () => {
    expect(
      collectionFiltersToCrateRules(
        { ...NONE, yearFrom: '1970', yearTo: '1979' },
        ids()
      )
    ).toEqual([
      { id: 'r1', field: 'pressingYear', op: 'between', from: 1970, to: 1979 },
    ]);
  });

  it('keeps a single year bound open-ended', () => {
    expect(
      collectionFiltersToCrateRules({ ...NONE, yearFrom: '2000' }, ids())
    ).toEqual([{ id: 'r1', field: 'pressingYear', op: 'between', from: 2000 }]);
    expect(
      collectionFiltersToCrateRules({ ...NONE, yearTo: '1965' }, ids())
    ).toEqual([
      {
        id: 'r1',
        field: 'pressingYear',
        op: 'between',
        to: 1965,
        ifUnknown: 'include',
      },
    ]);
  });

  it('swaps a reversed year range and ignores junk years', () => {
    expect(
      collectionFiltersToCrateRules(
        { ...NONE, yearFrom: '1990', yearTo: '1980' },
        ids()
      )
    ).toEqual([
      { id: 'r1', field: 'pressingYear', op: 'between', from: 1980, to: 1990 },
    ]);
    expect(
      collectionFiltersToCrateRules(
        { ...NONE, yearFrom: 'abc', yearTo: '0' },
        ids()
      )
    ).toEqual([]);
  });

  it.each([
    ['week', 7],
    ['month', 30],
    ['3months', 90],
    ['year', 365],
  ])('maps dateAdded %s to withinDays %i', (dateAdded, days) => {
    expect(
      collectionFiltersToCrateRules({ ...NONE, dateAdded }, ids())
    ).toEqual([{ id: 'r1', field: 'dateAdded', op: 'withinDays', days }]);
  });

  it('ignores an unknown dateAdded value', () => {
    expect(
      collectionFiltersToCrateRules({ ...NONE, dateAdded: 'decade' }, ids())
    ).toEqual([]);
  });

  it('combines all filters in order with unique ids', () => {
    const rules = collectionFiltersToCrateRules(
      { format: 'CD', yearFrom: '1990', yearTo: '1999', dateAdded: 'year' },
      ids()
    );
    expect(rules.map(rule => rule.field)).toEqual([
      'format',
      'pressingYear',
      'dateAdded',
    ]);
    expect(new Set(rules.map(rule => rule.id)).size).toBe(3);
  });

  it('generates ids by default', () => {
    const [rule] = collectionFiltersToCrateRules({ ...NONE, format: 'CD' });
    expect(typeof rule.id).toBe('string');
    expect(rule.id.length).toBeGreaterThan(0);
  });
});

describe('stash/read crate rules from Collection', () => {
  afterEach(() => {
    window.sessionStorage.clear();
    jest.restoreAllMocks();
  });

  it('round-trips rules through sessionStorage', () => {
    const rules = collectionFiltersToCrateRules(
      { ...NONE, format: 'Vinyl' },
      ids()
    );
    expect(stashCrateRulesFromCollection(rules)).toBe(true);
    expect(readCrateRulesFromCollection()).toEqual(rules);
    // Not cleared on read
    expect(readCrateRulesFromCollection()).toEqual(rules);
  });

  it('returns [] when nothing or junk is stored', () => {
    expect(readCrateRulesFromCollection()).toEqual([]);
    window.sessionStorage.setItem('crates.pendingRulesFromCollection', '{');
    expect(readCrateRulesFromCollection()).toEqual([]);
    window.sessionStorage.setItem(
      'crates.pendingRulesFromCollection',
      JSON.stringify([{ nope: true }, 3])
    );
    expect(readCrateRulesFromCollection()).toEqual([]);
  });

  it('reports failure when storage throws', () => {
    jest
      .spyOn(globalThis.Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('blocked');
      });
    expect(stashCrateRulesFromCollection([])).toBe(false);
  });
});
