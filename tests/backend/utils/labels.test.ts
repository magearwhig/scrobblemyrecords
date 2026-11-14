import {
  albumMatchName,
  isPlaceholderLabel,
  labelDisplayName,
  labelKey,
  releaseLabels,
} from '../../../src/shared/utils/labels';

describe('labelKey', () => {
  it('groups spellings that differ only by a company suffix or case', () => {
    expect(labelKey('Sub Pop')).toBe('sub pop');
    expect(labelKey('Sub Pop Records')).toBe('sub pop');
    expect(labelKey('  SUB POP  ')).toBe('sub pop');
    expect(labelKey('Merge Records')).toBe('merge');
  });

  it('only drops a suffix that is a separate word', () => {
    expect(labelKey('Disco')).toBe('disco');
    expect(labelKey('Disco Records')).toBe('disco');
    expect(labelKey('Tropicalia Music')).toBe('tropicalia');
    expect(labelKey('Electroco')).toBe('electroco');
  });

  it('ignores the number Discogs adds to tell same-named labels apart', () => {
    expect(labelKey('Dirty Looks (4)')).toBe('dirty looks');
    expect(labelKey('Elevator Music (2)')).toBe('elevator');
    expect(labelKey('Domino (2) Records')).toBe('domino (2)');
  });

  it('keeps a name that is only a suffix word', () => {
    expect(labelKey('Records')).toBe('records');
  });
});

describe('labelDisplayName', () => {
  it("drops Discogs' trailing number and spaces", () => {
    expect(labelDisplayName(' Dirty Looks (4) ')).toBe('Dirty Looks');
    expect(labelDisplayName('Sub Pop')).toBe('Sub Pop');
    expect(labelDisplayName('(4)')).toBe('(4)');
  });
});

describe('isPlaceholderLabel', () => {
  it.each([
    'Not On Label',
    'Not On Label (Why? Self-released)',
    'not on label',
    'none',
    'No Label',
    '',
    '   ',
  ])('treats "%s" as no real label', name => {
    expect(isPlaceholderLabel(name)).toBe(true);
  });

  it.each(['Waterlines', 'Sub Pop', 'Labels Unlimited'])(
    'treats "%s" as a real label',
    name => {
      expect(isPlaceholderLabel(name)).toBe(false);
    }
  );
});

describe('releaseLabels', () => {
  it('lists each real label once, by key, keeping the first spelling', () => {
    expect(
      releaseLabels(['Sub Pop', 'Sub Pop Records', 'Not On Label', 'Merge'])
    ).toEqual([
      { key: 'sub pop', name: 'Sub Pop' },
      { key: 'merge', name: 'Merge' },
    ]);
  });

  it('handles a missing label list', () => {
    expect(releaseLabels(undefined)).toEqual([]);
  });
});

describe('albumMatchName', () => {
  it('ignores case, punctuation, a leading The, & vs and, and edition notes', () => {
    expect(albumMatchName('The Body, The Blood (Deluxe Edition)')).toBe(
      albumMatchName('body the blood')
    );
    expect(albumMatchName('Simon & Garfunkel')).toBe(
      albumMatchName('Simon and Garfunkel')
    );
    expect(albumMatchName('Kid A [Remastered]')).toBe(albumMatchName('Kid A'));
  });

  it('keeps notes that make a different album', () => {
    expect(albumMatchName('Gimme Fiction (Live)')).not.toBe(
      albumMatchName('Gimme Fiction')
    );
  });

  it('keeps letters from any script', () => {
    expect(albumMatchName('教育')).not.toBe(albumMatchName('大人'));
    expect(albumMatchName('教育')).not.toBe('');
  });
});
