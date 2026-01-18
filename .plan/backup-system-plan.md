# Backup System Implementation Plan

## Overview

This plan outlines how to backup **user-generated data** that cannot be recovered from external APIs (Last.fm, Discogs). The focus is on preserving data that would be **permanently lost** if the app were deleted.

**Features:**
- Manual export/import via Settings page
- Configurable auto-backups (disabled by default)

---

## Data Classification

### Critical User Data (MUST Backup)

| Data | Location | Size | Description |
|------|----------|------|-------------|
| **API Credentials** | `settings/user-settings.json` | <1KB | Encrypted Discogs/Last.fm tokens, usernames |
| **Album Mappings** | `mappings/album-mappings.json` | ~3KB | Manual Last.fm → Discogs album corrections |
| **Artist Mappings** | `mappings/artist-mappings.json` | <1KB | Manual artist name corrections |
| **Hidden Albums** | `discovery/hidden-albums.json` | <1KB | Albums hidden from Discovery |
| **Hidden Artists** | `discovery/hidden-artists.json` | <1KB | Artists hidden from Discovery |
| **Local Want List** | `wishlist/local-want-list.json` | ~7KB | Manually tracked albums user wants |
| **Vinyl Watch List** | `wishlist/vinyl-watch-list.json` | <1KB | Albums being watched for vinyl availability |
| **Suggestion Settings** | `settings/suggestion-settings.json` | <1KB | Algorithm weight tuning |
| **AI Settings** | `settings/ai-settings.json` | <1KB | Ollama configuration |
| **Wishlist Settings** | `wishlist/settings.json` | <1KB | Price thresholds, notifications |
| **Sync Settings** | `history/sync-settings.json` | <1KB | Auto-sync preferences (pace, startup behavior) |
| **Monitored Sellers** | `sellers/monitored-sellers.json` | <1KB | Sellers being tracked |
| **Seller Settings** | `sellers/settings.json` | <1KB | Scan frequency preferences |

**Total Critical Data: ~15-20KB**

> **Note:** All paths are relative to `FileStorage.dataDir` (default: `./data`, configurable via `DATA_DIR` env var).

### Cached Data (Can be re-fetched from APIs)

| Data | Source | Can Recover? |
|------|--------|--------------|
| Scrobble History Index | Last.fm API | Yes (via sync) |
| Collection Items | Discogs API | Yes (via collection fetch) |
| Wishlist Items | Discogs API | Yes (via wishlist sync) |
| Version Cache | Discogs API | Yes (fetched on demand) |
| Album/Artist Images | Last.fm/Discogs | Yes (fetched on demand) |
| Stats Cache | Calculated | Yes (recalculated from history) |
| Seller Inventory Cache | Discogs API | Yes (via scan) |
| Seller Matches | Calculated | Yes (recalculated on scan) |

### Optional: Performance Restore Bundle

For users who want to avoid re-syncing large datasets, offer an optional "full backup" that includes:
- `history/scrobble-history-index.json` (~5.5MB) - Full listening history
- `sellers/matches.json` - Found seller matches

This is recoverable but time-consuming to rebuild.

---

## Implementation

### Backup File Structure

```typescript
interface BackupFile {
  version: 2;
  exportedAt: number;           // Unix timestamp
  appVersion: string;           // For compatibility checking
  includesCredentials: boolean; // Whether credentials are present

  data: {
    // Settings - credentials EXCLUDED by default (opt-in with password)
    userSettings: Omit<UserSettings, 'discogs' | 'lastfm'> | UserSettings;
    suggestionSettings: SuggestionSettings | null;
    aiSettings: AISettings | null;
    wishlistSettings: WishlistSettings | null;
    syncSettings: SyncSettings | null;
    sellerMonitoringSettings: SellerMonitoringSettings | null;

    // Mappings
    albumMappings: AlbumMapping[];
    artistMappings: ArtistMapping[];

    // Discovery preferences
    hiddenAlbums: HiddenAlbum[];
    hiddenArtists: HiddenArtist[];

    // Tracking lists
    localWantList: LocalWantItem[];
    vinylWatchList: VinylWatchItem[];
    monitoredSellers: MonitoredSeller[];
  };

  checksum: string;  // SHA-256 of stable JSON serialization of data
}

interface BackupSettings {
  enabled: boolean;                              // Default: false
  frequency: 'daily' | 'weekly' | 'monthly';    // Default: 'weekly'
  backupDir: string;                             // Default: relative 'backups/' in dataDir
  retentionCount: number;                        // Default: 5
  includeCredentials: boolean;                   // Default: false
}
```

### API Endpoints

All backup endpoints follow the `/api/v1/` convention established in roadmap.md (Feature 0B):

```
GET  /api/v1/backup/preview
  → Returns counts of items that would be backed up

POST /api/v1/backup/export
  Query params:
    - includeCredentials=true (requires password in body)
    - includePerformanceData=true (optional large caches)
  Body (if includeCredentials=true):
    { password: string }
  → Returns JSON file download

POST /api/v1/backup/import
  Content-Type: multipart/form-data
  Query params:
    - mode=merge|replace (default: merge)
    - dryRun=true (preview only)
  Body:
    - file: backup JSON file
    - password: string (if backup has encrypted credentials)
  → Returns import summary with counts and any conflicts

GET  /api/v1/backup/settings
  → Returns current auto-backup settings

PUT  /api/v1/backup/settings
  Body: Partial<BackupSettings>
  → Updates auto-backup settings
```

---

## Security

### Credential Handling

1. **Default: Exclude credentials**
   - Export without API tokens - user must re-authenticate after import
   - Simplest, most secure approach

2. **Opt-in: Password-protected credentials**
   - User provides export password
   - Credentials encrypted with PBKDF2-derived key from password
   - Stored in backup as encrypted blob
   - Import requires same password to decrypt
   - If decryption fails: import other data, prompt re-authentication

3. **ENCRYPTION_KEY changes**
   - If app's ENCRYPTION_KEY differs from when backup was created:
   - Credentials in backup won't decrypt properly
   - Fail gracefully: import all other data, log warning, prompt re-auth
   - Never crash or corrupt data

### Checksum Integrity

1. **Stable JSON serialization**
   - Sort object keys alphabetically before hashing
   - Use `JSON.stringify(data, Object.keys(data).sort(), 0)` pattern
   - Ensures deterministic output across exports

2. **Verification on import**
   - Compute checksum of incoming data
   - Compare with stored checksum
   - Reject if mismatch (file corrupted or tampered)

---

## Import Rules

### Merge Strategy (default)

For array data (mappings, hidden items, want lists, sellers):
1. **Dedupe by unique key:**
   - Album mappings: `historyArtist + historyAlbum`
   - Artist mappings: `historyArtist`
   - Hidden albums: `artist + album`
   - Hidden artists: `artist`
   - Local want list: `id`
   - Vinyl watch list: `masterId`
   - Monitored sellers: `username`

2. **Conflict resolution:**
   - If item exists with same key, keep newer `createdAt`/`addedAt`
   - Log conflicts in import summary

For settings objects:
- Deep merge: existing values preserved, new values added
- Explicit nulls in backup overwrite existing values

### Replace Strategy (opt-in)

- Wipe each section before importing
- User selects which sections to replace via checkboxes
- Sections not selected are left untouched

### Dry Run Preview

Before actual import:
1. Parse and validate backup file
2. Compute what would change:
   - New items to add
   - Existing items to update
   - Conflicts detected
3. Return summary without modifying anything
4. User confirms to proceed

---

## UI Design

### Settings Page: Backup & Restore Section

```
┌─────────────────────────────────────────────────────────┐
│ Backup & Restore                                         │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ Export your settings, mappings, and preferences.        │
│ Cached data from Last.fm/Discogs is not included        │
│ (it can be re-synced from the APIs).                    │
│                                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ What's included in the backup:                      │ │
│ │ • 13 album mappings                                 │ │
│ │ • 2 artist mappings                                 │ │
│ │ • 5 hidden albums, 3 hidden artists                 │ │
│ │ • 24 items in local want list                       │ │
│ │ • 2 monitored sellers                               │ │
│ │ • All preference settings                           │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ [ ] Include API credentials (requires password)         │
│     Password: [••••••••••••]                            │
│                                                         │
│ [Export Backup]  [Import Backup...]                     │
│                                                         │
│ ─────────────────────────────────────────────────────── │
│                                                         │
│ Automatic Backups                                       │
│                                                         │
│ [ ] Enable automatic backups                            │
│                                                         │
│     Frequency:  [Weekly ▼]                              │
│     Keep last:  [5] backups                             │
│     Location:   ./data/backups/                         │
│                                                         │
│     Last backup: Never                                  │
│     [Backup Now]                                        │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Import Dialog

```
┌─────────────────────────────────────────────────────────┐
│ Import Backup                                            │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ File: recordscrobbles-backup-2025-01-15.json            │
│ Created: January 15, 2025 at 3:42 PM                    │
│ App Version: 1.2.0                                      │
│                                                         │
│ ─────────────────────────────────────────────────────── │
│                                                         │
│ Import Summary:                                         │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Album mappings:     +5 new, 2 conflicts             │ │
│ │ Artist mappings:    +1 new                          │ │
│ │ Hidden items:       +3 new                          │ │
│ │ Local want list:    +8 new, 1 conflict              │ │
│ │ Settings:           Will merge with existing        │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                         │
│ Import mode:                                            │
│ (•) Merge with existing data                            │
│ ( ) Replace existing data                               │
│                                                         │
│ [ ] This backup contains credentials                    │
│     Password: [____________]                            │
│                                                         │
│                        [Cancel]  [Import]               │
└─────────────────────────────────────────────────────────┘
```

---

## Implementation Steps

### Phase 1: Core Backup Service

1. **Types** (`src/shared/types.ts`)
   - Add `BackupFile`, `BackupSettings`, `BackupPreview`, `ImportResult` interfaces

2. **Backend Service** (`src/backend/services/backupService.ts`)
   - `getBackupPreview()` - count items to backup
   - `exportBackup(options)` - gather and serialize data
   - `importBackup(file, options)` - validate and restore
   - `computeChecksum(data)` - stable JSON hash
   - `encryptCredentials(creds, password)` / `decryptCredentials(blob, password)`

3. **Backend Routes** (`src/backend/routes/backup.ts`)
   - Wire up REST endpoints
   - Handle file upload/download

4. **Frontend API** (`src/renderer/services/api.ts`)
   - `getBackupPreview()`, `exportBackup()`, `importBackup()`

5. **Frontend UI** (`src/renderer/pages/SettingsPage.tsx`)
   - Add Backup & Restore section
   - Export/import buttons with dialogs

### Phase 2: Auto-Backup

6. **Backend: Scheduler**
   - Add backup settings to `settings/backup-settings.json`
   - On server start, schedule next backup based on settings
   - Use `setInterval` or `node-cron` for scheduling
   - Automatic file rotation with retention limit

7. **Frontend: Auto-backup settings**
   - Toggle, frequency, retention controls
   - Show last backup time
   - Manual "Backup Now" button

---

## Test Checklist

Maintain 90%+ coverage baseline:

- [ ] **Round-trip integrity**: Export → Import produces identical data
- [ ] **Backward compatibility**: Import succeeds when optional sections missing
- [ ] **Checksum rejection**: Tampered file rejected with clear error
- [ ] **Password mismatch**: Wrong password fails credentials only, imports rest
- [ ] **Merge deduplication**: Deterministic handling of duplicate keys
- [ ] **Replace mode**: Correctly wipes target sections
- [ ] **Dry run accuracy**: Preview matches actual import
- [ ] **Auto-backup scheduling**: Fires at correct intervals
- [ ] **Retention cleanup**: Old backups removed, newest kept
- [ ] **ENCRYPTION_KEY change**: Graceful failure, prompts re-auth
- [ ] **Empty/missing files**: Handled gracefully (null in backup)
- [ ] **Large file handling**: Performance acceptable with full history

---

## File Structure After Implementation

```
src/
├── backend/
│   ├── routes/
│   │   └── backup.ts              # NEW: Backup API endpoints
│   └── services/
│       └── backupService.ts       # NEW: Backup logic
├── renderer/
│   ├── pages/
│   │   └── SettingsPage.tsx       # MODIFY: Add backup section
│   └── services/
│       └── api.ts                 # MODIFY: Add backup API calls
└── shared/
    └── types.ts                   # MODIFY: Add backup interfaces

data/                              # Respects FileStorage.dataDir
├── settings/
│   └── backup-settings.json       # NEW: Auto-backup configuration
└── backups/                       # NEW: Auto-backup storage
    ├── backup-2025-01-17.json
    └── backup-2025-01-10.json
```

---

## Decisions Made

Based on feedback review:

| Question | Decision |
|----------|----------|
| Include credentials? | Opt-in with password protection, excluded by default |
| Merge vs Replace? | Both options available, merge is default |
| Export format? | JSON (human-readable), credentials encrypted if included |
| Auto-backup default? | Disabled by default |
| Performance data? | Optional flag for large caches (history index) |

---

## Summary

- **Manual backup**: ~250 lines backend + ~150 lines frontend
- **Auto-backup**: ~100 additional lines
- **Total critical data**: ~15-20KB
- **Features**: Export/import, optional credentials, merge/replace, dry-run preview, auto-backup scheduling
