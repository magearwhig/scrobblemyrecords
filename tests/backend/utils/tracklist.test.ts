import { DiscogsRawTrack, Track } from '../../../src/shared/types';
import {
  fromDiscogsTracklist,
  indexTrackPosition,
  isTracklistHeading,
  needsTracklistRefetch,
  trackSeconds,
  tracklistMatchTitles,
  tracksToScrobble,
  TRACKLIST_VERSION,
} from '../../../src/shared/utils/tracklist';

const part = (position: string, title: string): DiscogsRawTrack => ({
  position,
  title,
  duration: '',
  type_: 'track',
});

describe('indexTrackPosition', () => {
  it.each([
    [['A1a', 'A1b'], 'A1'],
    [['A1.a', 'A1.b'], 'A1'],
    [['B7-A', 'B7-B', 'B7-I'], 'B7'],
    [['A4a', 'A4b', 'A4c', 'A4d'], 'A4'],
    [['A1', 'A2', 'A3', 'A4'], 'A1–A4'],
    [['AI.1', 'AI.2', 'AI.3'], 'AI.1–AI.3'],
    [['C3'], 'C3'],
    [[], ''],
  ])('%j → %s', (positions, expected) => {
    expect(indexTrackPosition(positions)).toBe(expected);
  });
});

describe('fromDiscogsTracklist', () => {
  it('turns an index track into one track with its parts', () => {
    const tracks = fromDiscogsTracklist([
      {
        position: '',
        title: 'Intro / Sweet Jane',
        duration: '7:55',
        type_: 'index',
        sub_tracks: [part('A1a', 'Intro '), part('A1b', 'Sweet Jane')],
      },
      { position: 'A2', title: 'Heroin', duration: '13:11', type_: 'track' },
    ]);
    expect(tracks[0]).toEqual({
      position: 'A1',
      title: 'Intro / Sweet Jane',
      duration: '7:55',
      artist: undefined,
      subTracks: [
        { position: 'A1a', title: 'Intro', duration: '', artist: undefined },
        {
          position: 'A1b',
          title: 'Sweet Jane',
          duration: '',
          artist: undefined,
        },
      ],
    });
    expect(isTracklistHeading(tracks[0])).toBe(false);
    expect(tracks[1]).toMatchObject({ position: 'A2', title: 'Heroin' });
  });

  it('keeps headings as headings, even with a duration', () => {
    const [heading] = fromDiscogsTracklist([
      {
        position: '',
        title: 'Shaolin Sword',
        duration: '29:19',
        type_: 'heading',
      },
    ]);
    expect(isTracklistHeading(heading)).toBe(true);
    expect(heading.subTracks).toBeUndefined();
  });

  it('sums part durations when the index track has none', () => {
    const [track] = fromDiscogsTracklist([
      {
        position: '',
        title: 'Suite',
        duration: '',
        type_: 'index',
        sub_tracks: [
          { ...part('B1a', 'One'), duration: '1:30' },
          { ...part('B1b', 'Two'), duration: '2:45' },
        ],
      },
    ]);
    expect(track.duration).toBe('4:15');
  });

  it('keeps track artists', () => {
    const [track] = fromDiscogsTracklist([
      {
        position: 'A1',
        title: 'Song',
        duration: '3:00',
        artists: [
          { name: 'One', id: 1 },
          { name: 'Two', id: 2 },
        ] as DiscogsRawTrack['artists'],
      },
    ]);
    expect(track.artist).toBe('One, Two');
  });
});

describe('needsTracklistRefetch', () => {
  const heading = (duration?: string): Track => ({
    position: '',
    title: 'X',
    duration,
  });

  it('re-fetches an old release with a position-less row that has a duration', () => {
    expect(needsTracklistRefetch({ tracklist: [heading('7:55')] })).toBe(true);
  });

  it('keeps old releases whose headings have no duration', () => {
    expect(needsTracklistRefetch({ tracklist: [heading(''), heading()] })).toBe(
      false
    );
  });

  it('keeps releases saved with the current tracklist version', () => {
    expect(
      needsTracklistRefetch({
        tracklistVersion: TRACKLIST_VERSION,
        tracklist: [heading('29:19')],
      })
    ).toBe(false);
  });
});

describe('tracksToScrobble', () => {
  const tracklist: Track[] = [
    { position: '', title: 'Side A' },
    {
      position: 'A1',
      title: 'Intro / Sweet Jane',
      duration: '8:00',
      artist: 'Lou Reed',
      subTracks: [
        { position: 'A1a', title: 'Intro', duration: '' },
        { position: 'A1b', title: 'Sweet Jane', duration: '' },
      ],
    },
    { position: 'A2', title: 'Heroin', duration: '13:11' },
  ];

  it('skips headings and scrobbles a track with parts as one track', () => {
    const tracks = tracksToScrobble(tracklist, [2, 0, 1]);
    expect(tracks.map(t => t.title)).toEqual(['Intro / Sweet Jane', 'Heroin']);
    expect(tracks[0]).not.toHaveProperty('subTracks');
  });

  it('scrobbles a split track as its parts, sharing its duration', () => {
    const tracks = tracksToScrobble(tracklist, [1, 2], new Set([1]));
    expect(tracks).toEqual([
      {
        position: 'A1a',
        title: 'Intro',
        duration: '4:00',
        artist: 'Lou Reed',
      },
      {
        position: 'A1b',
        title: 'Sweet Jane',
        duration: '4:00',
        artist: 'Lou Reed',
      },
      { position: 'A2', title: 'Heroin', duration: '13:11', artist: undefined },
    ]);
  });

  it('treats a tracklist with no positions at all as tracks', () => {
    const unnumbered: Track[] = [
      { position: '', title: 'One', duration: '3:00' },
      { position: '', title: 'Two', duration: '3:00' },
    ];
    expect(tracksToScrobble(unnumbered, [0, 1]).map(t => t.title)).toEqual([
      'One',
      'Two',
    ]);
  });
});

describe('trackSeconds', () => {
  it('parses M:SS and falls back to 3 minutes', () => {
    expect(trackSeconds({ duration: '7:55' })).toBe(475);
    expect(trackSeconds({ duration: '' })).toBe(180);
  });
});

describe('tracklistMatchTitles', () => {
  it('lists tracks and their parts, without headings', () => {
    expect(
      tracklistMatchTitles([
        { position: '', title: 'Side A' },
        {
          position: 'A1',
          title: 'Storm',
          subTracks: [{ position: 'A1a', title: 'Gathering Storm' }],
        },
      ])
    ).toEqual([
      { position: 'A1', title: 'Storm' },
      { position: 'A1a', title: 'Gathering Storm' },
    ]);
  });
});
