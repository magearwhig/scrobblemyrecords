import React, { useEffect, useState, useCallback } from 'react';

import { DustyCornerAlbum } from '../../../shared/types';
import { statsApi } from '../../services/statsApi';
import { createLogger } from '../../utils/logger';
import { DustyCornersSection } from '../stats/DustyCornersSection';

const logger = createLogger('DustyCornersContainer');

const DustyCornersContainer: React.FC = () => {
  const [albums, setAlbums] = useState<DustyCornerAlbum[]>([]);
  const [loading, setLoading] = useState(true);

  const loadDustyCorners = useCallback(async () => {
    try {
      setLoading(true);
      const result = await statsApi.getDustyCorners(50);
      if (result.success && result.data) {
        setAlbums(result.data);
      }
    } catch (err) {
      logger.error('Failed to load dusty corners', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDustyCorners();
  }, [loadDustyCorners]);

  return <DustyCornersSection albums={albums} loading={loading} showAll />;
};

export default DustyCornersContainer;
