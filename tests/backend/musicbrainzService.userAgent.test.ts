import { musicBrainzUserAgent } from '../../src/backend/services/musicbrainzService';

describe('musicBrainzUserAgent', () => {
  it('points at the public project page when no contact is set', () => {
    expect(musicBrainzUserAgent(undefined)).toBe(
      'Listenography/1.0 ( https://github.com/magearwhig/scrobblemyrecords )'
    );
    expect(musicBrainzUserAgent('   ')).toBe(
      'Listenography/1.0 ( https://github.com/magearwhig/scrobblemyrecords )'
    );
  });

  it('uses the contact from the environment when one is set', () => {
    expect(musicBrainzUserAgent(' someone@example.com ')).toBe(
      'Listenography/1.0 ( someone@example.com )'
    );
  });

  it('never puts a hard-coded email in the default', () => {
    expect(musicBrainzUserAgent(undefined)).not.toMatch(/@/);
  });
});
