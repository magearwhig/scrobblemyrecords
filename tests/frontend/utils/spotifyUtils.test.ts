/**
 * @jest-environment jsdom
 */
/* eslint-disable no-undef */
import {
  playTrackOnSpotify,
  playAlbumOnSpotify,
} from '../../../src/renderer/utils/spotifyUtils';

describe('spotifyUtils', () => {
  let appendChildSpy: jest.SpyInstance;
  let removeChildSpy: jest.SpyInstance;
  let createElementSpy: jest.SpyInstance;
  let windowOpenSpy: jest.SpyInstance;
  let mockLink: HTMLAnchorElement;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockLink = {
      href: '',
      style: { display: '' },
      click: jest.fn(),
    } as unknown as HTMLAnchorElement;

    createElementSpy = jest
      .spyOn(document, 'createElement')
      .mockReturnValue(mockLink as unknown as HTMLElement);
    appendChildSpy = jest
      .spyOn(document.body, 'appendChild')
      .mockImplementation(node => node);
    removeChildSpy = jest
      .spyOn(document.body, 'removeChild')
      .mockImplementation(node => node);
    windowOpenSpy = jest.spyOn(window, 'open').mockImplementation(() => null);
  });

  afterEach(() => {
    jest.useRealTimers();
    createElementSpy.mockRestore();
    appendChildSpy.mockRestore();
    removeChildSpy.mockRestore();
    windowOpenSpy.mockRestore();
  });

  describe('playTrackOnSpotify', () => {
    it('creates a link element for spotify desktop URI', () => {
      playTrackOnSpotify('Radiohead', 'Paranoid Android');

      expect(createElementSpy).toHaveBeenCalledWith('a');
      expect(mockLink.href).toContain('spotify:search:');
      expect(mockLink.style.display).toBe('none');
    });

    it('constructs correct search query without album', () => {
      playTrackOnSpotify('Radiohead', 'Paranoid Android');

      const expectedQuery = encodeURIComponent(
        'track:Paranoid Android artist:Radiohead'
      );
      expect(mockLink.href).toBe(`spotify:search:${expectedQuery}`);
    });

    it('constructs correct search query with album', () => {
      playTrackOnSpotify('Radiohead', 'Paranoid Android', 'OK Computer');

      const expectedQuery = encodeURIComponent(
        'track:Paranoid Android artist:Radiohead album:OK Computer'
      );
      expect(mockLink.href).toBe(`spotify:search:${expectedQuery}`);
    });

    it('appends link, clicks it, and removes it', () => {
      playTrackOnSpotify('Radiohead', 'Paranoid Android');

      expect(appendChildSpy).toHaveBeenCalledWith(mockLink);
      expect(mockLink.click).toHaveBeenCalled();
      expect(removeChildSpy).toHaveBeenCalledWith(mockLink);
    });

    it('opens web fallback after 500ms timeout without album', () => {
      playTrackOnSpotify('Radiohead', 'Paranoid Android');

      expect(windowOpenSpy).not.toHaveBeenCalled();

      jest.advanceTimersByTime(500);

      const expectedWebQuery = encodeURIComponent('Radiohead Paranoid Android');
      expect(windowOpenSpy).toHaveBeenCalledWith(
        `https://open.spotify.com/search/${expectedWebQuery}`,
        '_blank'
      );
    });

    it('opens web fallback after 500ms timeout with album', () => {
      playTrackOnSpotify('Radiohead', 'Paranoid Android', 'OK Computer');

      jest.advanceTimersByTime(500);

      const expectedWebQuery = encodeURIComponent(
        'Radiohead Paranoid Android OK Computer'
      );
      expect(windowOpenSpy).toHaveBeenCalledWith(
        `https://open.spotify.com/search/${expectedWebQuery}`,
        '_blank'
      );
    });

    it('does not open web fallback before 500ms', () => {
      playTrackOnSpotify('Radiohead', 'Paranoid Android');

      jest.advanceTimersByTime(499);
      expect(windowOpenSpy).not.toHaveBeenCalled();
    });

    it('handles special characters in artist and track names', () => {
      playTrackOnSpotify('Sigur Ros', 'Hoppipolla');

      const expectedQuery = encodeURIComponent(
        'track:Hoppipolla artist:Sigur Ros'
      );
      expect(mockLink.href).toBe(`spotify:search:${expectedQuery}`);
    });

    it('handles ampersands and special chars', () => {
      playTrackOnSpotify('Simon & Garfunkel', 'Mrs. Robinson');

      expect(mockLink.href).toContain('spotify:search:');
      // encodeURIComponent should encode & as %26
      expect(mockLink.href).toContain(
        encodeURIComponent('artist:Simon & Garfunkel')
      );
    });
  });

  describe('playAlbumOnSpotify', () => {
    it('creates a link element for spotify desktop URI', () => {
      playAlbumOnSpotify('Radiohead', 'OK Computer');

      expect(createElementSpy).toHaveBeenCalledWith('a');
      expect(mockLink.style.display).toBe('none');
    });

    it('constructs correct album search query', () => {
      playAlbumOnSpotify('Radiohead', 'OK Computer');

      const expectedQuery = encodeURIComponent(
        'album:OK Computer artist:Radiohead'
      );
      expect(mockLink.href).toBe(`spotify:search:${expectedQuery}`);
    });

    it('appends link, clicks it, and removes it', () => {
      playAlbumOnSpotify('Radiohead', 'OK Computer');

      expect(appendChildSpy).toHaveBeenCalledWith(mockLink);
      expect(mockLink.click).toHaveBeenCalled();
      expect(removeChildSpy).toHaveBeenCalledWith(mockLink);
    });

    it('opens web fallback after 500ms timeout', () => {
      playAlbumOnSpotify('Radiohead', 'OK Computer');

      expect(windowOpenSpy).not.toHaveBeenCalled();

      jest.advanceTimersByTime(500);

      const expectedWebQuery = encodeURIComponent('Radiohead OK Computer');
      expect(windowOpenSpy).toHaveBeenCalledWith(
        `https://open.spotify.com/search/${expectedWebQuery}`,
        '_blank'
      );
    });

    it('does not open web fallback before 500ms', () => {
      playAlbumOnSpotify('Radiohead', 'OK Computer');

      jest.advanceTimersByTime(499);
      expect(windowOpenSpy).not.toHaveBeenCalled();
    });

    it('handles special characters in names', () => {
      playAlbumOnSpotify('Bjork', 'Homogenic');

      const expectedQuery = encodeURIComponent('album:Homogenic artist:Bjork');
      expect(mockLink.href).toBe(`spotify:search:${expectedQuery}`);
    });
  });
});
