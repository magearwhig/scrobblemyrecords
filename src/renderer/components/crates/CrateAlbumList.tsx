import React from 'react';

import { CrateAlbumResult, CrateRule } from '../../../shared/types';

import CrateAlbumRow from './CrateAlbumRow';
import './CrateAlbumList.css';

export interface CrateAlbumListProps {
  albums: CrateAlbumResult[];
  rules: CrateRule[];
  historyFrom?: number | null;
  variant?: 'member' | 'excluded';
  /** albumKeys with an override request in flight */
  busyKeys?: ReadonlySet<string>;
  onInclude: (album: CrateAlbumResult) => void;
  onExclude: (album: CrateAlbumResult) => void;
  onReset: (album: CrateAlbumResult) => void;
  onOpenRelease: (album: CrateAlbumResult) => void;
  label?: string;
}

/**
 * Album rows in a responsive grid: one column when narrow, two when the list
 * is wide enough to keep each row readable.
 */
const CrateAlbumList: React.FC<CrateAlbumListProps> = ({
  albums,
  busyKeys,
  label = 'Albums in this crate',
  ...rowProps
}) => (
  <div className='crate-album-list-container'>
    <ul className='crate-album-list' aria-label={label}>
      {albums.map(album => (
        <CrateAlbumRow
          key={album.albumKey}
          album={album}
          busy={busyKeys?.has(album.albumKey)}
          {...rowProps}
        />
      ))}
    </ul>
  </div>
);

export default CrateAlbumList;
