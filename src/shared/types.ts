export interface DiscogsRelease {
  id: number;
  master_id?: number;
  title: string;
  artist: string;
  year?: number;
  format: string[];
  label: string[];
  catalog_number?: string;
  cover_image?: string;
  resource_url: string;
  tracklist?: Track[];
}

export interface Track {
  position: string;
  title: string;
  duration?: string;
  artist?: string;
}

export interface CollectionItem {
  id: number;
  release: DiscogsRelease;
  folder_id?: number;
  date_added: string;
  rating?: number;
  notes?: any[];
  selected?: boolean;
}

export interface ScrobbleTrack {
  artist: string;
  track: string;
  album?: string;
  timestamp?: number;
  duration?: number;
}

export interface ScrobbleSession {
  id: string;
  tracks: ScrobbleTrack[];
  timestamp: number;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  error?: string;
  progress?: {
    current: number;
    total: number;
    success: number;
    failed: number;
    ignored: number;
  };
}

export interface UserSettings {
  discogs: {
    token?: string;
    username?: string;
  };
  lastfm: {
    apiKey?: string;
    sessionKey?: string;
    username?: string;
  };
  preferences: {
    defaultTimestamp: 'now' | 'custom';
    batchSize: number;
    autoScrobble: boolean;
  };
  temp?: {
    oauthTokenSecret?: string;
  };
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  pagination?: {
    page: number;
    pages: number;
    per_page: number;
    items: number;
  };
  timestamp?: number;
}

export interface AuthStatus {
  discogs: {
    authenticated: boolean;
    username?: string;
  };
  lastfm: {
    authenticated: boolean;
    username?: string;
  };
}

export interface AppState {
  loading: boolean;
  error: string | null;
  serverUrl: string;
}

export interface ScrobbleProgress {
  current: number;
  total: number;
  track?: string;
  status: 'preparing' | 'scrobbling' | 'completed' | 'error';
}