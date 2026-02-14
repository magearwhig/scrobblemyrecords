import React, { useEffect, useState, useCallback } from 'react';

import { ForgottenTrack } from '../../../shared/types';
import { useApp } from '../../context/AppContext';
import { useCollectionLookup } from '../../hooks/useCollectionLookup';
import { getApiService } from '../../services/api';
import ForgottenFavoritesTab from '../discovery/ForgottenFavoritesTab';

type ForgottenSortOption = 'plays' | 'artist' | 'track' | 'dormant';

const ForgottenFavoritesContainer: React.FC = () => {
  const { state } = useApp();
  const { collection } = useCollectionLookup();
  const api = getApiService(state.serverUrl);

  const [forgottenTracks, setForgottenTracks] = useState<ForgottenTrack[]>([]);
  const [forgottenLoading, setForgottenLoading] = useState(true);
  const [forgottenError, setForgottenError] = useState<string | null>(null);
  const [forgottenTotalMatching, setForgottenTotalMatching] = useState(0);
  const [dormantDays, setDormantDays] = useState(90);
  const [minPlays, setMinPlays] = useState(10);
  const [forgottenSort, setForgottenSort] =
    useState<ForgottenSortOption>('plays');

  const loadForgottenFavorites = useCallback(async () => {
    try {
      setForgottenLoading(true);
      setForgottenError(null);
      const result = await api.getForgottenFavorites(
        dormantDays,
        minPlays,
        100
      );
      setForgottenTracks(result.tracks);
      setForgottenTotalMatching(result.meta.totalMatching);
    } catch (err) {
      setForgottenError(
        err instanceof Error
          ? err.message
          : 'Failed to load forgotten favorites'
      );
    } finally {
      setForgottenLoading(false);
    }
  }, [api, dormantDays, minPlays]);

  useEffect(() => {
    loadForgottenFavorites();
  }, [loadForgottenFavorites]);

  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString();
  };

  const openLink = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <ForgottenFavoritesTab
      forgottenTracks={forgottenTracks}
      forgottenLoading={forgottenLoading}
      forgottenError={forgottenError}
      forgottenTotalMatching={forgottenTotalMatching}
      dormantDays={dormantDays}
      setDormantDays={setDormantDays}
      minPlays={minPlays}
      setMinPlays={setMinPlays}
      forgottenSort={forgottenSort}
      setForgottenSort={setForgottenSort}
      loadForgottenFavorites={loadForgottenFavorites}
      formatDate={formatDate}
      openLink={openLink}
      api={api}
      collection={collection}
    />
  );
};

export default ForgottenFavoritesContainer;
