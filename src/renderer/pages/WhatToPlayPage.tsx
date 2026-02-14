import React, { useState, useEffect } from 'react';

import DustyCornersContainer from '../components/whattoplay/DustyCornersContainer';
import ForgottenFavoritesContainer from '../components/whattoplay/ForgottenFavoritesContainer';
import { getTabFromUrl } from '../utils/tabUtils';

import SuggestionsPage from './SuggestionsPage';

type WhatToPlayTab = 'suggestions' | 'forgotten' | 'dusty';

const VALID_TABS: WhatToPlayTab[] = ['suggestions', 'forgotten', 'dusty'];

const TAB_LABELS: Record<WhatToPlayTab, string> = {
  suggestions: 'Play Suggestions',
  forgotten: 'Forgotten Favorites',
  dusty: 'Dusty Corners',
};

const WhatToPlayPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<WhatToPlayTab>(
    () => getTabFromUrl(VALID_TABS, 'suggestions') as WhatToPlayTab
  );

  // Sync active tab when the URL hash changes (e.g., redirects, back/forward)
  useEffect(() => {
    const handleHashChange = () => {
      const tab = getTabFromUrl(VALID_TABS, 'suggestions') as WhatToPlayTab;
      setActiveTab(tab);
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []);

  const handleTabChange = (tab: WhatToPlayTab) => {
    setActiveTab(tab);
    window.location.hash = `what-to-play?tab=${tab}`;
  };

  return (
    <div className='what-to-play-page'>
      <h1>What to Play</h1>
      <p className='page-description'>
        Discover what to spin next from your collection.
      </p>

      <div className='tabs' role='tablist' aria-label='What to Play sections'>
        {VALID_TABS.map(tab => (
          <button
            key={tab}
            role='tab'
            className={`tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => handleTabChange(tab)}
            aria-selected={activeTab === tab}
            aria-controls={`what-to-play-panel-${tab}`}
            aria-label={TAB_LABELS[tab]}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      <div
        className='what-to-play-tab-content'
        role='tabpanel'
        id={`what-to-play-panel-${activeTab}`}
      >
        {activeTab === 'suggestions' && <SuggestionsPage embedded />}
        {activeTab === 'forgotten' && <ForgottenFavoritesContainer />}
        {activeTab === 'dusty' && <DustyCornersContainer />}
      </div>
    </div>
  );
};

export default WhatToPlayPage;
