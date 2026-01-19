# UI Reorganization Backlog

Future consolidation opportunities identified during the January 2026 UI reorganization.

## Completed (January 2026)

- [x] Grouped sidebar with 5 category headers (Dashboard, Library, Listening, Explore, System)
- [x] Removed "Scrobble Tracks" from nav, added floating action bar to Collection page
- [x] Merged "Setup & Authentication" into Settings as "Connections" tab
- [x] URL deep-linking support (`#settings?tab=connections`)

---

## 1. Consolidate Marketplace Features

**Current State:**
- **Wishlist** - Discogs wantlist with vinyl availability checking
- **New Releases** - Track new releases from artists in collection
- **Local Sellers** - Monitor local record shop inventories
- **Discovery "Missing Albums/Artists"** - Albums/artists you listen to but don't own

**Proposed:**
Create unified "Marketplace" or "Want List" hub with tabs/filters:
- Tab 1: **Wishlist** (Discogs wantlist)
- Tab 2: **Missing** (Discovery's albums you listen to but don't own)
- Tab 3: **New Releases** (upcoming from collection artists)
- Tab 4: **Local Shops** (sellers + matches integrated)

**Benefits:**
- Unified filters: "vinyl available", "affordable", "at local seller"
- Single destination for all "acquisition" workflows
- Reduces cognitive load - all buying-related features in one place

**Files Involved:**
- `src/renderer/pages/WishlistPage.tsx`
- `src/renderer/pages/NewReleasesPage.tsx`
- `src/renderer/pages/SellersPage.tsx`
- `src/renderer/pages/SellerMatchesPage.tsx`
- `src/renderer/pages/DiscoveryPage.tsx` (missing albums/artists tabs)

---

## 2. Consolidate "What to Play" Features

**Current State:**
- **Play Suggestions** - Algorithm and AI-based album recommendations
- **Discovery > Forgotten Favorites** - Dormant tracks you used to love
- **Stats > Dusty Corners** - Albums you haven't played in a while

**Proposed:**
Merge into single "What to Play" page with modes/tabs:
- **Algorithm Suggestions** (current weighted suggestions)
- **AI Suggestions** (Ollama-powered if enabled)
- **Forgotten Favorites** (from Discovery)
- **Dusty Corners** (from Stats)
- **Random Pick** (new: just shuffle from collection)

**Benefits:**
- Single answer to "what should I play?"
- Users can switch between suggestion modes easily
- Eliminates feature fragmentation across pages

**Files Involved:**
- `src/renderer/pages/SuggestionsPage.tsx`
- `src/renderer/pages/DiscoveryPage.tsx` (forgotten favorites tab)
- `src/renderer/pages/StatsPage.tsx` (dusty corners section)

---

## Implementation Notes

These consolidations are higher effort and require careful UX design. They should be tackled after the initial UI reorganization (grouped sidebar, floating action bar, Setup→Settings merge) is stable.

Consider user testing to validate the consolidated workflows make sense.
