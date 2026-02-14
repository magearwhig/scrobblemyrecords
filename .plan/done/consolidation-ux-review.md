# UX Review: Feature Consolidation Plans

## Executive Summary

Both consolidations group features with strong conceptual affinity. The "Marketplace" hub unites the acquisition pipeline (what do I want, where can I find it, what's new). The "What to Play" hub unites the listening decision workflow (what should I play next). These are sound groupings. The primary risks are tab overload in Marketplace and discoverability loss for Forgotten Favorites/Dusty Corners.

---

## Consolidation 1: "Marketplace" Hub

### 1. Tab Organization

**Recommended tabs (in order):**

| Tab Name | Source | Purpose |
|---|---|---|
| **Wishlist** | WishlistPage (All/Vinyl/CD Only/Affordable sub-filters) | Core want list from Discogs |
| **Monitoring** | WishlistPage "Monitoring" tab | Locally tracked albums awaiting vinyl |
| **New Releases** | NewReleasesPage | MusicBrainz-sourced artist releases |
| **Missing Albums** | DiscoveryPage "Missing Albums" tab | Last.fm-listened but not owned |
| **Sellers** | SellersPage | Manage monitored Discogs sellers |
| **Matches** | SellerMatchesPage | Wishlist items found at sellers |

**Rationale:** The order follows the acquisition funnel: "What do I want?" (Wishlist, Monitoring) -> "What's new from artists I like?" (New Releases) -> "What am I missing?" (Missing Albums) -> "Where can I buy it?" (Sellers, Matches).

**Critical issue -- tabs within tabs:** The current Wishlist page already has 6 sub-tabs (All, Has Vinyl, CD Only, Affordable, Monitoring, New Releases). If Wishlist becomes one tab among six in the Marketplace hub, users face a two-level tab hierarchy. This must be resolved.

**Recommendation:** Flatten the Wishlist sub-tabs into filter controls rather than tabs. Specifically:
- Remove the sub-tab bar within Wishlist
- Add a filter dropdown or pill group ("Format: All / Vinyl / CD Only") and a price checkbox ("Under $X only") above the item grid
- This transforms 6 sub-tabs into 2-3 filter controls, eliminating the nested tab problem
- The "Monitoring" sub-tab becomes its own top-level tab in the Marketplace hub (it already has distinct enough content with its own action buttons and different data source)
- The "New Releases" sub-tab within Wishlist was already duplicating the standalone New Releases page -- remove it from Wishlist entirely since it gets its own top-level tab

### 2. Navigation Flow

**Sidebar label:** "Marketplace" (icon suggestion below)

**Current sidebar entries being replaced:**
- Library > Wishlist
- Explore > New Releases
- Explore > Local Sellers
- (Seller Matches is not in sidebar -- accessed via button on SellersPage)
- (Missing Albums is nested inside Discovery page)

**Cross-tab navigation flows to preserve:**
- SellersPage has a "View All Matches" button that navigates to SellerMatchesPage via `window.location.hash = 'seller-matches'` -- this should switch to the Matches tab within Marketplace
- SellerMatchesPage has a "Back to Sellers" button -- this should switch to the Sellers tab
- WishlistPage's Monitoring tab empty state says "Use Discovery to find albums to monitor" -- this should link to the Missing Albums tab within the same hub
- NewReleasesPage has "Add to Wishlist" actions on release cards -- this should remain functional and possibly show a toast confirming the item was added

### 3. Information Architecture

**What belongs together (strong affinity):**
- Wishlist + Monitoring: Both represent "things I want" -- different sources but same intent
- Sellers + Matches: Seller management and its output are tightly coupled
- New Releases: Directly feeds into wishlist decisions

**What might confuse users:**
- **Missing Albums** is the one that feels most different. It's discovery-focused (analyzing Last.fm history) rather than acquisition-focused. A user looking for "albums I listen to digitally but don't own on vinyl" may not look in "Marketplace." Consider: should this remain in Discovery instead?
  - **Recommendation:** Include it in Marketplace but with a clear label like "Missing Albums" and a subtitle/description: "Albums you listen to but don't own on vinyl." The action on these items (adding to want list) feeds directly into the Marketplace pipeline, so it logically belongs here despite its discovery-oriented data source.
- **Sellers vs. Matches tab distinction** may confuse users who think "sellers" means "items for sale." Consider labeling the Sellers tab "My Sellers" to emphasize it's a management view.

### 4. State Preservation

**Tab state should persist** when switching away and back to the Marketplace page. Use `useState` with the default tab being "Wishlist."

**Selected tab should be reflected in the URL hash**, e.g., `#marketplace?tab=new-releases`. This enables:
- Deep linking from notifications (seller match notifications currently link to `seller-matches` route)
- Browser back/forward navigation between tabs
- Cross-tab navigation from other pages (e.g., Discovery linking to Missing Albums)

**Filter state within tabs** (sort order, vinyl/CD filter in Wishlist, seller filter in Matches) should reset when switching tabs. Users don't expect filter state to persist across contexts.

### 5. Existing Tab Conflicts

As discussed in Section 1:

- **Wishlist's 6 sub-tabs:** Convert to filter controls (format dropdown + price checkbox + include monitored toggle). The monitoring and new releases sub-tabs become top-level tabs.
- **New Releases' 4 tabs (All, Upcoming, Recent, Vinyl Available):** These are genuine filters within a single data set. Keep them as sub-filters (pill group or segmented control) within the New Releases tab. This is acceptable because they filter one list rather than switching to entirely different content.
- **Discovery page's 3 tabs:** Only "Missing Albums" moves to Marketplace. "Missing Artists" stays in Discovery. "Forgotten Favorites" moves to "What to Play."

### 6. Empty States

| Tab | Empty State Message | Action |
|---|---|---|
| **Wishlist** | "Your wishlist is empty. Sync your Discogs wishlist to get started." | Button: "Sync Wishlist" |
| **Monitoring** | "No albums being monitored. Find albums to track in the Missing Albums tab." | Button: "Go to Missing Albums" (switches tab) |
| **New Releases** | "No releases tracked yet. Click Sync to scan your collection artists for new releases." | Button: "Sync Releases" |
| **Missing Albums** | "Sync your scrobble history first to find albums you listen to but don't own." | Button: "Go to Stats" (to trigger history sync) |
| **Sellers** | "Add local record shops by their Discogs username to monitor their inventory." | Button: "Add Seller" (opens modal) |
| **Matches** | "No wishlist items found at your sellers. Try scanning seller inventories." | Button: "Go to Sellers" (switches tab) |

**Key principle:** Each empty state should have a single clear action that progresses the user toward filling the tab. Cross-tab references should use tab switches, not page navigation.

### 7. Cross-Tab Actions

| Action | Source Tab | Effect on Other Tab |
|---|---|---|
| "Add to Want List" button on Missing Albums | Missing Albums | Item appears in Monitoring tab; badge count updates |
| "Add to Wishlist" on a New Release | New Releases | Item appears in Wishlist tab on next sync |
| "Scan Sellers" button | Sellers | New matches appear in Matches tab |
| "Mark as Seen" on a match | Matches | Updates count badge on Matches tab |
| "Remove" monitored item | Monitoring | Item no longer appears in seller scans |

**Implementation consideration:** Use a shared state context or event bus so that actions in one tab trigger re-fetches or optimistic updates in sibling tabs. Currently each page manages its own state independently.

### 8. Collapsed Sidebar Behavior

**Current behavior:** When collapsed, sidebar shows only icons. Category headers are hidden.

**Recommendation for Marketplace:**
- Single sidebar entry with a shopping/store icon
- When collapsed, show the icon only
- When expanded, show "Marketplace" with the icon
- No need to show individual tab names in the sidebar -- the tabs are visible within the page content area

**This simplifies navigation** from the current 3 sidebar entries (Wishlist, New Releases, Local Sellers) down to 1.

### 9. Discoverability

**Risk:** Users currently find Wishlist under "Library" and New Releases/Local Sellers under "Explore." Moving all three to a single "Marketplace" entry changes the mental model.

**Mitigations:**
- The sidebar category currently called "Library" keeps "Browse Collection" and "Discard Pile" -- familiar items remain
- "Explore" category previously had Discovery, New Releases, and Local Sellers. After consolidation it only has Discovery. Consider renaming it or removing the category if only one item remains (move Discovery elsewhere or keep as a standalone)
- On first load after the change, consider a subtle tooltip or one-time notice: "We've combined your Wishlist, New Releases, and Seller tools into Marketplace"
- The Marketplace label is intuitive for vinyl collectors -- it evokes Discogs Marketplace which users already know

### 10. Recommended Tab Names and Icons

**Sidebar entry:**
- Label: **Marketplace**
- Icon: `🏪` (already used for Local Sellers, most fitting for a shopping/browsing hub)
- Alternative icons: `🛒` or `💰`

**Tab names within Marketplace:**

| Tab | Icon | Name |
|---|---|---|
| 1 | ❤️ | Wishlist |
| 2 | 👁️ | Monitoring |
| 3 | 📢 | New Releases |
| 4 | 🔍 | Missing Albums |
| 5 | 🏪 | My Sellers |
| 6 | ✅ | Matches |

---

## Consolidation 2: "What to Play" Hub

### 1. Tab Organization

**Recommended tabs (in order):**

| Tab Name | Source | Purpose |
|---|---|---|
| **Suggestions** | SuggestionsPage (algorithm + AI) | What to spin next from your collection |
| **Forgotten Favorites** | DiscoveryPage "Forgotten Favorites" tab | Tracks you loved but haven't played recently |
| **Dusty Corners** | StatsPage DustyCornersSection | Collection albums gathering dust |

**Rationale:** Order goes from most actionable ("here's what to play right now") to more browsable ("revisit these forgotten things"). Suggestions is the primary use case and should be the default tab.

### 2. Navigation Flow

**Sidebar label:** "What to Play" (under the "Listening" category)

**Current sidebar entries being replaced/affected:**
- Listening > Play Suggestions (becomes this hub)
- Explore > Discovery (loses "Forgotten Favorites" tab, keeps "Missing Albums" and "Missing Artists")
- Listening > Stats Dashboard (loses Dusty Corners section)

**Replaces:** The current "Play Suggestions" sidebar entry. Same position, new label.

**Key flows to preserve:**
- SuggestionsPage has a SyncStatusBar component for triggering history sync -- keep this at the hub level, visible across all tabs
- Forgotten Favorites has a "Go to Album" button for items in the collection -- this should navigate to the release-details page as it currently does
- Dusty Corners cards click to navigate to release-details -- preserve this
- Dusty Corners has a "Play on Spotify" button -- preserve this

### 3. Information Architecture

**What belongs together (strong affinity):**
- All three answer the question "What should I listen to from my collection?"
- Suggestions = algorithmic/AI recommendation
- Forgotten Favorites = tracks you personally loved but dropped
- Dusty Corners = albums in your collection you're neglecting

**What might confuse users:**
- **Forgotten Favorites vs. Dusty Corners overlap:** Both surface "things you haven't played recently." The distinction is:
  - Forgotten Favorites = **tracks** with high historical play counts that went dormant (based on Last.fm scrobble data)
  - Dusty Corners = **albums** in your vinyl collection not played recently (based on collection ownership)
  - A track in Forgotten Favorites might not be on vinyl you own; a Dusty Corner album might be one you've never played much
- **Recommendation:** Make the distinction clear with subtitles:
  - Forgotten Favorites: "Tracks you used to love but haven't played in a while"
  - Dusty Corners: "Albums in your collection that need some turntable time"

### 4. State Preservation

**Tab state should persist** within a session. Default to "Suggestions" tab.

**URL hash:** `#what-to-play?tab=forgotten-favorites`

**Suggestions tab state** (weight controls visibility, AI suggestion) should persist when switching between tabs. Users who customize weights don't want to lose that state.

**Forgotten Favorites filter state** (dormant days, min plays, sort) should persist within session but reset on page remount. These are exploratory filters users adjust frequently.

### 5. Existing Tab Conflicts

**No nested tab conflicts.** None of the three source features use sub-tabs within their current implementations:
- Suggestions uses a toggle for weight controls (not tabs)
- Forgotten Favorites uses dropdowns for filters (not tabs)
- Dusty Corners is a simple grid with no filtering

This consolidation is cleaner than Marketplace from a tab-nesting perspective.

### 6. Empty States

| Tab | Empty State Message | Action |
|---|---|---|
| **Suggestions** | "We need more data to generate suggestions. Make sure your collection is loaded and scrobble history is synced." | Buttons: "Try Again", "Sync History" |
| **Forgotten Favorites** | "No forgotten favorites found. Try lowering the minimum play count or shortening the dormant period." | Adjust filter controls inline |
| **Dusty Corners** | "No dusty corners! You've been listening to your whole collection." | (Celebrate -- no action needed) |

### 7. Cross-Tab Actions

| Action | Source Tab | Effect on Other Tab |
|---|---|---|
| Playing a Suggestions pick | Suggestions | May remove it from Dusty Corners (since it's now recently played) |
| Playing a Forgotten Favorite on Spotify | Forgotten Favorites | If scrobbled, it won't appear next time |
| Clicking a Dusty Corners album | Dusty Corners | Navigates away from hub to release-details |

Cross-tab effects here are mostly indirect (play activity affects what appears in other tabs on reload). No real-time updates needed between tabs.

### 8. Collapsed Sidebar Behavior

Same pattern as Marketplace:
- Single sidebar entry with a dice/play icon
- When collapsed: icon only
- When expanded: "What to Play" with icon
- Replaces the current "Play Suggestions" entry (same position in sidebar)

### 9. Discoverability

**Risk assessment: LOW.** Play Suggestions already exists in the "Listening" sidebar category. Users looking for "what should I play" already navigate there. Adding two more tabs increases value without changing the discovery path.

**For Forgotten Favorites:** Currently buried as the third tab inside "Discovery" page under "Explore" category. Moving it to "What to Play" under "Listening" is actually **better** discoverability -- users looking for listening suggestions are more likely to check "Listening" than "Explore."

**For Dusty Corners:** Currently a small section at the bottom of the Stats Dashboard that shows only 8 albums. Elevating it to its own tab gives it proper prominence. Users who love this feature will find it more easily; users who never scrolled to the bottom of Stats will discover it for the first time.

**Impact on Discovery page:** After removing Forgotten Favorites, the Discovery page will have only 2 tabs: Missing Albums and Missing Artists. If Missing Albums also moves to Marketplace, Discovery becomes a single-purpose "Missing Artists" page. Consider:
- If Missing Albums moves to Marketplace: rename "Discovery" to "Missing Artists" and remove the tab bar entirely
- If Missing Albums stays: Discovery keeps 2 tabs ("Missing Albums" and "Missing Artists"), which is clean

**Impact on Stats page:** Removing Dusty Corners section from Stats is low-risk. Stats has many sections already and Dusty Corners was at the very bottom. The Stats page remains focused on numerical/chart analytics.

### 10. Recommended Tab Names and Icons

**Sidebar entry:**
- Label: **What to Play**
- Icon: `🎲` (currently used for Play Suggestions -- keep it for continuity)
- Alternative: `🎵` or `🎧`

**Tab names within What to Play:**

| Tab | Icon | Name |
|---|---|---|
| 1 | 🎲 | Suggestions |
| 2 | 💤 | Forgotten Favorites |
| 3 | 🕸️ | Dusty Corners |

---

## Cross-Cutting Recommendations

### Sidebar Structure After Consolidation

```
Dashboard
  Home                🏠

Library
  Browse Collection   💿
  Discard Pile        📦

Listening
  What to Play        🎲    (was: Play Suggestions)
  Scrobble History    📝
  Stats Dashboard     📊
  Wrapped             🎁

Explore
  Discovery           🔍    (now only Missing Albums + Missing Artists)
  Marketplace         🏪    (new consolidated hub)

System
  Settings            ⚙️
```

**Note:** "Explore" category now has 2 items instead of 3. This is fine -- categories with 2+ items are common in sidebar navigation. If Missing Albums moves to Marketplace, Discovery has only 2 tabs (Missing Albums, Missing Artists) or 1 tab (Missing Artists only), both are acceptable.

### Tab Component Pattern

Both hubs should use the same tab component for visual consistency. The app already has a `.tabs` / `.tab` CSS pattern used by WishlistPage and NewReleasesPage. Use this same pattern for both hubs.

Each tab should show a count badge where meaningful:
- Wishlist: item count
- Monitoring: monitored count
- New Releases: count (with notification dot for unseen)
- Missing Albums: count
- Matches: active match count
- Forgotten Favorites: track count
- Dusty Corners: album count

### Auth Requirements

Both hubs require authentication to be useful:
- Marketplace: Requires Discogs (except Missing Albums which requires Last.fm + Discogs)
- What to Play: Requires both Discogs + Last.fm

Show auth gates at the hub level, not per-tab. If a user isn't authenticated for a specific tab, show a disabled tab with a tooltip explaining why (matches the current disabled nav item pattern in the sidebar).

### Performance Considerations

- Each tab should lazy-load its data only when first selected (not all at once on hub mount)
- Consider React.lazy() for tab content components to reduce initial bundle
- Cache tab data during the session so switching back doesn't trigger a reload
- The current WishlistPage loads 4 API calls on mount -- in the hub, this should only happen when the Wishlist tab is active
