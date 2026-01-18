# Discard Pile Feature Plan

## Overview
Add a "Discard Pile" feature to track records from the Discogs collection that the user wants to get rid of during their next collection cleanup. This follows the established patterns used by the wishlist/local-want-list features.

---

## Open Questions (Resolved)

| Question | Decision |
|----------|----------|
| Should entries be tied to `CollectionItem.id` or just `releaseId`? | **Use `collectionItemId`** - This is the Discogs collection instance ID, allowing tracking of duplicate copies of the same release separately. |
| Should we support bulk operations from collection view? | **Yes** - Add bulk add/remove to support multi-select in collection view. |
| Should items auto-clear if collection resync removes the `collectionItemId`? | **No** - Keep orphaned items with a flag; user may have sold/removed the item and want to track that. Add `orphaned` boolean field. |

---

## Data Model

### New Types (add to `src/shared/types.ts`)

```typescript
/**
 * Reasons for discarding a record
 */
export type DiscardReason =
  | 'selling'       // Planning to sell
  | 'duplicate'     // Have multiple copies
  | 'damaged'       // Physical damage
  | 'upgrade'       // Replacing with better pressing
  | 'not_listening' // No longer interested
  | 'gift'          // Giving away
  | 'other';        // Custom reason

/**
 * Status of a discard pile item
 */
export type DiscardStatus =
  | 'marked'    // Just added to discard pile
  | 'listed'    // Listed for sale somewhere
  | 'sold'      // Successfully sold
  | 'gifted'    // Given away
  | 'removed';  // Actually removed from collection

/**
 * Item marked for discard/sale tracking
 */
export interface DiscardPileItem {
  id: string;                    // Generated hash of collectionItemId
  collectionItemId: number;      // Discogs collection instance ID (CollectionItem.id)
  releaseId: number;             // Discogs release ID (for lookups)
  masterId?: number;             // Discogs master ID (for grouping pressings)
  artist: string;
  title: string;
  coverImage?: string;
  format?: string[];             // ["Vinyl", "LP", "Album"]
  year?: number;
  reason: DiscardReason;
  reasonNote?: string;           // Custom note for 'other' reason
  rating?: number;               // Original rating from collection
  addedAt: number;               // When added to discard pile (timestamp)
  status: DiscardStatus;
  statusChangedAt: number;       // When status last changed (initialize to addedAt)
  estimatedValue?: number;       // User's estimate
  actualSalePrice?: number;      // What it actually sold for
  currency: string;              // ISO currency code (e.g., 'USD', 'EUR', 'GBP')
  marketplaceUrl?: string;       // Link if listed for sale (Discogs, eBay, etc.)
  notes?: string;                // General notes
  orphaned: boolean;             // True if no longer in collection (sold/removed externally)
}

export interface DiscardPileStore {
  schemaVersion: 1;
  items: DiscardPileItem[];
  lastUpdated: number;
}

export interface DiscardPileStats {
  totalItems: number;
  byStatus: Record<DiscardStatus, number>;
  byReason: Record<DiscardReason, number>;
  totalEstimatedValue: number;
  totalActualSales: number;
  currency: string;              // Primary currency for totals
}

/**
 * Request DTO for adding item to discard pile
 */
export interface AddDiscardPileItemRequest {
  collectionItemId: number;      // Required: Discogs collection instance ID
  releaseId: number;             // Required: Discogs release ID
  masterId?: number;
  artist: string;
  title: string;
  coverImage?: string;
  format?: string[];
  year?: number;
  reason: DiscardReason;
  reasonNote?: string;
  rating?: number;
  estimatedValue?: number;
  currency?: string;             // Defaults to 'USD' if not provided
  notes?: string;
}

/**
 * Request DTO for updating discard pile item
 */
export interface UpdateDiscardPileItemRequest {
  reason?: DiscardReason;
  reasonNote?: string;
  status?: DiscardStatus;
  estimatedValue?: number;
  actualSalePrice?: number;
  currency?: string;
  marketplaceUrl?: string;
  notes?: string;
}
```

---

## Backend Implementation

### 1. Service Layer (`src/backend/services/discardPileService.ts`)

```typescript
import crypto from 'crypto';
import { FileStorage } from '../utils/fileStorage';
import { createLogger } from '../utils/logger';
import {
  DiscardPileItem,
  DiscardPileStore,
  DiscardPileStats,
  AddDiscardPileItemRequest,
  UpdateDiscardPileItemRequest,
  DiscardStatus,
  DiscardReason,
} from '../../shared/types';

export class DiscardPileService {
  private fileStorage: FileStorage;
  private logger = createLogger('DiscardPileService');
  private readonly DISCARD_PILE_FILE = 'collections/discard-pile.json';
  private readonly DEFAULT_CURRENCY = 'USD';

  constructor(fileStorage: FileStorage) {
    this.fileStorage = fileStorage;
  }

  /**
   * Generate deterministic ID from collectionItemId
   */
  private generateId(collectionItemId: number): string {
    return crypto
      .createHash('md5')
      .update(collectionItemId.toString())
      .digest('hex')
      .slice(0, 12);
  }

  /**
   * Load store from file, return empty store if not exists
   */
  private async loadStore(): Promise<DiscardPileStore> {
    const store = await this.fileStorage.readJSON<DiscardPileStore>(
      this.DISCARD_PILE_FILE
    );
    if (!store) {
      return { schemaVersion: 1, items: [], lastUpdated: Date.now() };
    }
    return store;
  }

  /**
   * Save store to file
   */
  private async saveStore(store: DiscardPileStore): Promise<void> {
    store.lastUpdated = Date.now();
    await this.fileStorage.writeJSON(this.DISCARD_PILE_FILE, store);
  }

  // Core CRUD operations
  async getDiscardPile(): Promise<DiscardPileItem[]>
  async addToDiscardPile(item: AddDiscardPileItemRequest): Promise<DiscardPileItem>
  async updateDiscardPileItem(id: string, updates: UpdateDiscardPileItemRequest): Promise<DiscardPileItem | null>
  async removeFromDiscardPile(id: string): Promise<boolean>

  // Bulk operations
  async bulkAddToDiscardPile(items: AddDiscardPileItemRequest[]): Promise<DiscardPileItem[]>
  async bulkRemoveFromDiscardPile(ids: string[]): Promise<number>

  // Query helpers
  async getDiscardPileStats(): Promise<DiscardPileStats>
  async isInDiscardPile(collectionItemId: number): Promise<boolean>
  async getDiscardPileCollectionIds(): Promise<Set<number>>  // For efficient lookup in collection view

  // Status management (updates statusChangedAt automatically)
  async markAsSold(id: string, salePrice?: number): Promise<DiscardPileItem | null>
  async markAsListed(id: string, marketplaceUrl: string): Promise<DiscardPileItem | null>

  // Orphan management
  async markAsOrphaned(collectionItemIds: number[]): Promise<number>  // Called after collection resync
}
```

**Key Implementation Details:**
- Generate deterministic ID using `collectionItemId` (not releaseId) to support duplicates
- Always update `statusChangedAt` when `status` field changes
- Default `currency` to `'USD'` if not provided
- Return empty store (not null) when file doesn't exist
- Store file at `data/collections/discard-pile.json` (note: `collections` plural)

### 2. Routes (`src/backend/routes/discardPile.ts`)

```typescript
import express from 'express';
import { FileStorage } from '../utils/fileStorage';
import { AuthService } from '../services/authService';
import { DiscardPileService } from '../services/discardPileService';
import { createLogger } from '../utils/logger';
import { validateNumericId, validateIdentifier } from '../utils/validation';

export default function createDiscardPileRouter(
  fileStorage: FileStorage,
  authService: AuthService,
  discardPileService: DiscardPileService
) {
  const router = express.Router();
  const logger = createLogger('DiscardPileRoutes');

  /**
   * IMPORTANT: Route ordering matters in Express!
   * Static routes must be defined BEFORE parameterized routes.
   */

  // GET /api/v1/discard-pile - Get all discard pile items
  router.get('/', async (_req, res) => { ... });

  // GET /api/v1/discard-pile/stats - Get aggregated statistics
  router.get('/stats', async (_req, res) => { ... });

  // GET /api/v1/discard-pile/ids - Get just collection IDs (for badges)
  router.get('/ids', async (_req, res) => { ... });

  // POST /api/v1/discard-pile - Add item to discard pile
  router.post('/', async (req, res) => {
    // Validate required fields
    if (!validateNumericId(req.body.collectionItemId)) {
      return res.status(400).json({ success: false, error: 'Invalid collectionItemId' });
    }
    if (!validateNumericId(req.body.releaseId)) {
      return res.status(400).json({ success: false, error: 'Invalid releaseId' });
    }
    // ... rest of validation and handling
  });

  // POST /api/v1/discard-pile/bulk - Bulk add multiple items
  router.post('/bulk', async (req, res) => { ... });

  // DELETE /api/v1/discard-pile/bulk - Bulk remove multiple items
  router.delete('/bulk', async (req, res) => { ... });

  // --- Parameterized routes AFTER static routes ---

  // GET /api/v1/discard-pile/:id - Get single item
  router.get('/:id', async (req, res) => {
    if (!validateIdentifier(req.params.id)) {
      return res.status(400).json({ success: false, error: 'Invalid id format' });
    }
    // ... handling
  });

  // PUT /api/v1/discard-pile/:id - Update item
  router.put('/:id', async (req, res) => {
    if (!validateIdentifier(req.params.id)) {
      return res.status(400).json({ success: false, error: 'Invalid id format' });
    }
    // ... handling
  });

  // DELETE /api/v1/discard-pile/:id - Remove item
  router.delete('/:id', async (req, res) => {
    if (!validateIdentifier(req.params.id)) {
      return res.status(400).json({ success: false, error: 'Invalid id format' });
    }
    // ... handling
  });

  // POST /api/v1/discard-pile/:id/sold - Quick action: mark as sold
  router.post('/:id/sold', async (req, res) => { ... });

  // POST /api/v1/discard-pile/:id/listed - Quick action: mark as listed
  router.post('/:id/listed', async (req, res) => { ... });

  return router;
}
```

**Route Summary:**
```
GET    /api/v1/discard-pile           - Get all discard pile items
GET    /api/v1/discard-pile/stats     - Get aggregated statistics
GET    /api/v1/discard-pile/ids       - Get just collection IDs (for badges)
POST   /api/v1/discard-pile           - Add item to discard pile
POST   /api/v1/discard-pile/bulk      - Bulk add multiple items
DELETE /api/v1/discard-pile/bulk      - Bulk remove multiple items
GET    /api/v1/discard-pile/:id       - Get single item by ID
PUT    /api/v1/discard-pile/:id       - Update item
DELETE /api/v1/discard-pile/:id       - Remove item from discard pile
POST   /api/v1/discard-pile/:id/sold  - Quick action: mark as sold
POST   /api/v1/discard-pile/:id/listed - Quick action: mark as listed
```

**Response Format (matches existing patterns):**
```typescript
// Success
{ success: true, data: T }

// Error
{ success: false, error: string }
```

### 3. Server Registration (`src/server.ts`)

```typescript
import createDiscardPileRouter from './backend/routes/discardPile';
import { DiscardPileService } from './backend/services/discardPileService';

// Initialize service
const discardPileService = new DiscardPileService(fileStorage);

// Register route
app.use(
  '/api/v1/discard-pile',
  createDiscardPileRouter(fileStorage, authService, discardPileService)
);

// Add to API info endpoint
endpoints: {
  // ... other endpoints
  discardPile: '/api/v1/discard-pile',
}
```

---

## Frontend Implementation

### 1. API Service Methods (`src/renderer/services/api.ts`)

```typescript
// Discard Pile methods
async getDiscardPile(): Promise<DiscardPileItem[]> {
  const response = await this.api.get('/discard-pile');
  return response.data.data;
}

async getDiscardPileStats(): Promise<DiscardPileStats> {
  const response = await this.api.get('/discard-pile/stats');
  return response.data.data;
}

async getDiscardPileCollectionIds(): Promise<number[]> {
  const response = await this.api.get('/discard-pile/ids');
  return response.data.data;
}

async addToDiscardPile(item: AddDiscardPileItemRequest): Promise<DiscardPileItem> {
  const response = await this.api.post('/discard-pile', item);
  return response.data.data;
}

async bulkAddToDiscardPile(items: AddDiscardPileItemRequest[]): Promise<DiscardPileItem[]> {
  const response = await this.api.post('/discard-pile/bulk', { items });
  return response.data.data;
}

async updateDiscardPileItem(id: string, updates: UpdateDiscardPileItemRequest): Promise<DiscardPileItem> {
  const response = await this.api.put(`/discard-pile/${id}`, updates);
  return response.data.data;
}

async removeFromDiscardPile(id: string): Promise<void> {
  await this.api.delete(`/discard-pile/${id}`);
}

async bulkRemoveFromDiscardPile(ids: string[]): Promise<void> {
  await this.api.delete('/discard-pile/bulk', { data: { ids } });
}

async markDiscardItemSold(id: string, salePrice?: number): Promise<DiscardPileItem> {
  const response = await this.api.post(`/discard-pile/${id}/sold`, { salePrice });
  return response.data.data;
}

async markDiscardItemListed(id: string, marketplaceUrl: string): Promise<DiscardPileItem> {
  const response = await this.api.post(`/discard-pile/${id}/listed`, { marketplaceUrl });
  return response.data.data;
}
```

### 2. Discard Pile Page (`src/renderer/pages/DiscardPilePage.tsx`)

**Layout:**
- Stats summary at top (total items, estimated value, sold value)
- Filter bar: status filter, reason filter, search
- Sort options: date added, artist, title, estimated value
- Grid/list view of items with album art

**Item Card Features:**
- Album cover, artist, title, format, year
- Reason badge (color-coded)
- Status badge (marked/listed/sold)
- Estimated value display with currency
- Orphaned indicator if item no longer in collection
- Quick actions: Edit, Mark as Sold, Mark as Listed, Remove
- Link to marketplace if listed

**Modals/Dialogs:**
- Add to Discard Pile modal (triggered from collection view)
- Edit Item modal (reason, notes, estimated value, marketplace URL)
- Mark as Sold modal (enter actual sale price)
- Confirm removal dialog

### 3. Collection View Integration

**Modifications to existing collection view:**
- Add "Discard" badge/indicator on items in the discard pile
- Add "Add to Discard Pile" option to item context menu / action buttons
- Support multi-select + bulk "Add to Discard Pile" action
- Optionally: filter to show/hide discard pile items

### 4. Navigation

- Add "Discard Pile" to sidebar navigation
- Icon suggestion: `trash-2` or `package-x` from Lucide icons
- Position: near Collection and Wishlist

---

## CSS Styling

Add to `src/renderer/styles.css`:

```css
/* Discard Pile Page */
.discard-pile-page { ... }
.discard-stats-summary { ... }
.discard-item-card { ... }

/* Status badges */
.discard-status-marked { background: var(--warning-bg); }
.discard-status-listed { background: var(--info-bg); }
.discard-status-sold { background: var(--success-bg); }
.discard-status-gifted { background: var(--accent-bg); }
.discard-status-removed { background: var(--muted-bg); }

/* Reason badges */
.discard-reason-selling { ... }
.discard-reason-duplicate { ... }
/* etc. */

/* Orphaned indicator */
.discard-item-orphaned {
  opacity: 0.7;
  border-style: dashed;
}
.orphaned-badge { ... }

/* Collection view indicator */
.collection-item.in-discard-pile { ... }
.discard-pile-badge { ... }
```

---

## File Changes Summary

### New Files
1. `src/backend/services/discardPileService.ts` - Service layer
2. `src/backend/routes/discardPile.ts` - API routes
3. `src/renderer/pages/DiscardPilePage.tsx` - Main page component
4. `tests/backend/services/discardPileService.test.ts` - Service tests
5. `tests/backend/routes/discardPile.test.ts` - Route tests

### Modified Files
1. `src/shared/types.ts` - Add new types and DTOs
2. `src/server.ts` - Register service and routes
3. `src/renderer/services/api.ts` - Add API methods
4. `src/renderer/components/Sidebar.tsx` - Add navigation item
5. `src/renderer/components/MainContent.tsx` - Add route for page
6. `src/renderer/styles.css` - Add styles
7. Collection view component(s) - Add discard pile integration

### New Data File (auto-created)
- `data/collections/discard-pile.json`

---

## Testing Requirements (≥90% coverage)

### Service Tests (`tests/backend/services/discardPileService.test.ts`)

```typescript
describe('DiscardPileService', () => {
  describe('addToDiscardPile', () => {
    it('should add item with generated ID from collectionItemId');
    it('should reject duplicate collectionItemId');
    it('should default currency to USD');
    it('should set statusChangedAt equal to addedAt on creation');
  });

  describe('updateDiscardPileItem', () => {
    it('should update statusChangedAt when status changes');
    it('should NOT update statusChangedAt when other fields change');
    it('should return null for non-existent ID');
  });

  describe('duplicate handling', () => {
    it('should allow same releaseId with different collectionItemId');
    it('should track each copy independently');
  });

  describe('stats aggregation', () => {
    it('should calculate totals correctly');
    it('should group by status and reason');
    it('should handle mixed currencies gracefully');
  });

  describe('orphan management', () => {
    it('should mark items as orphaned');
    it('should not delete orphaned items');
  });
});
```

### Route Tests (`tests/backend/routes/discardPile.test.ts`)

```typescript
describe('DiscardPile Routes', () => {
  describe('POST /api/v1/discard-pile', () => {
    it('should reject invalid collectionItemId');
    it('should reject invalid releaseId');
    it('should reject missing required fields');
    it('should return 201 with created item');
  });

  describe('PUT /api/v1/discard-pile/:id', () => {
    it('should reject invalid id format');
    it('should return 404 for non-existent item');
    it('should update and return item');
  });

  describe('DELETE /api/v1/discard-pile/:id', () => {
    it('should reject invalid id format');
    it('should return success for non-existent item (idempotent)');
  });

  describe('bulk operations', () => {
    it('should add multiple items');
    it('should skip duplicates in bulk add');
    it('should remove multiple items');
  });
});
```

---

## Implementation Order

1. **Types** - Define all interfaces and DTOs in `src/shared/types.ts`
2. **Service** - Implement `DiscardPileService` with all methods
3. **Service Tests** - Write tests for service layer
4. **Routes** - Create API routes with validation
5. **Route Tests** - Write tests for routes
6. **Server** - Register service and routes in `src/server.ts`
7. **API Client** - Add methods to `src/renderer/services/api.ts`
8. **Page** - Create `DiscardPilePage.tsx` with basic functionality
9. **Navigation** - Add to sidebar
10. **Styles** - Add CSS classes
11. **Collection Integration** - Add badges and context actions

---

## Future Enhancements (Out of Scope)

- Export discard pile to CSV for Discogs batch removal
- Integration with Discogs marketplace to auto-create listings
- Price history/comparison with Discogs price guide
- Notifications when market value changes significantly
- Archive of sold items with analytics
- Multi-currency conversion for stats totals
