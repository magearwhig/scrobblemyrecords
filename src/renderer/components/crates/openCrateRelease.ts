import { CrateAlbumResult } from '../../../shared/types';
import { navigate, ROUTES } from '../../routes';

/**
 * Open Release Details for an album's witness copy (the copy that matched the
 * crate's copy-level rules, plan section 4.3). ReleaseDetailsPage reads the
 * release from localStorage, as on Album Detail.
 */
export function openCrateRelease(album: CrateAlbumResult, from: string): void {
  const witness =
    album.copies.find(copy => copy.releaseId === album.witnessReleaseId) ??
    album.copies[0];
  const releaseId = witness?.releaseId ?? album.witnessReleaseId;
  localStorage.setItem(
    'selectedRelease',
    JSON.stringify({
      id: releaseId,
      title: witness?.title ?? album.album,
      artist: witness?.artist ?? album.artist,
    })
  );
  localStorage.setItem('selectedCollectionItemId', String(releaseId));
  navigate(ROUTES.RELEASE_DETAILS, { from });
}
