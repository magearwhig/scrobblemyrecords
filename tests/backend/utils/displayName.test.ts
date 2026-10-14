import { toDisplayName } from '../../../src/shared/utils/displayName';

describe('toDisplayName', () => {
  it.each([
    ['the go-betweens', 'The Go-Betweens'],
    ['heart of the congos', 'Heart of the Congos'],
    [
      'liberty belle and the black diamond express',
      'Liberty Belle and the Black Diamond Express',
    ],
    ['what we live for', 'What We Live For'],
    ['song (live at the casbah)', 'Song (Live at the Casbah)'],
    [
      'suitcase 2: american magnetic wave generator',
      'Suitcase 2: American Magnetic Wave Generator',
    ],
    ['live: of the bbc', 'Live: Of the Bbc'],
    ['rocky ii', 'Rocky II'],
    ['dr. dog', 'Dr. Dog'],
    ['élan vital', 'Élan Vital'],
  ])('title-cases %s', (input, expected) => {
    expect(toDisplayName(input)).toBe(expected);
  });

  it('leaves names that already have capitals alone', () => {
    expect(toDisplayName('LCD Soundsystem')).toBe('LCD Soundsystem');
    expect(toDisplayName('of Montreal')).toBe('of Montreal');
  });

  it('handles empty names', () => {
    expect(toDisplayName('')).toBe('');
  });
});
