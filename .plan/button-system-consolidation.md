# Button System Consolidation Plan

## Current State

Three independent button systems exist in the codebase:

### 1. `.btn` (styles.css:471) — PRIMARY SYSTEM
- **Usage**: ~272 instances across 47 files
- **Variants**: `.btn-secondary`, `.btn-danger`, `.btn-small`, `.btn-outline`
- **Strengths**: Simple, consistent, well-established, compact `.btn-small` sizing
- **Weaknesses**: No loading state, no icon support, no `inline-flex` alignment, no `:focus-visible` (added globally via Task #7)

### 2. `.button` (Button.css + Button.tsx) — COMPONENT SYSTEM
- **Usage**: ~32 instances across 10 files
- **Variants**: primary, secondary, danger, success, outline, ghost
- **Sizes**: small, medium, large
- **Strengths**: TypeScript props, loading spinner, icon support, `inline-flex`, `:focus-visible`, `fullWidth`
- **Weaknesses**: Low adoption (10 files), uses `.button` class (conflicts with semantic naming)

### 3. `.btn-icon` (NewReleasesPage.css:479) — NICHE
- **Usage**: ~5 instances in NewReleasesPage
- **Purpose**: Icon-only action buttons (hide, exclude)
- **Can be**: Absorbed into Button.tsx as `iconOnly` variant or kept as page-specific CSS

## Recommendation

**Target**: Migrate everything to `Button.tsx` component (System 2) over time.

**Rationale**:
- Button.tsx already has the richest feature set (loading, icons, sizes, TypeScript types)
- React component provides compile-time safety
- Built-in accessibility (`:focus-visible`, proper disabled handling)
- `.btn` is just CSS classes — any component migration would need a React wrapper anyway

## Migration Strategy

### Phase A: Align Button.tsx with `.btn` sizing (1 task)
Ensure `Button.tsx --small` matches `.btn-small` compact sizing:
- `.btn-small`: `padding: 0.25rem 0.75rem; font-size: 0.75rem`
- `.button--small`: `padding: 0.4rem 0.75rem; font-size: 0.8rem`
- Reduce Button.tsx small padding/font to match `.btn-small` so visual regression is minimal

### Phase B: Incremental page-by-page migration (many tasks)
Migrate one page at a time, lowest-usage pages first:

| Priority | Page/Component | `.btn` count | Notes |
|----------|----------------|-------------|-------|
| 1 | StatsPage.tsx | 1 | Trivial |
| 2 | EmptyState.tsx | 1 | Trivial |
| 3 | CollectionFilterControls.tsx | 1 | Trivial |
| 4 | HomePage.tsx | 3 | Small |
| 5 | DiscoveryPage.tsx | 3 | Small |
| 6 | SellerMatchesPage.tsx | 3 | Small |
| 7 | SuggestionsPage.tsx | 5 | Small |
| 8 | ScrobblePage.tsx | 8 | Medium |
| 9 | WishlistPage.tsx | 8 | Medium |
| 10 | SellersPage.tsx | 10 | Medium |
| 11 | CollectionPage.tsx | 13 | Large |
| 12 | DiscardPilePage.tsx | 14 | Large |
| 13 | ReleaseDetailsPage.tsx | 23 | Largest page |
| 14 | LastFmHistoryTab.tsx | 23 | Largest component |
| 15 | Settings components | ~54 | Multiple files |

### Phase C: Absorb `.btn-icon` (1 task)
- Add `iconOnly` styling to Button.tsx or keep as page-specific CSS
- Only 5 instances, low priority

### Phase D: Remove `.btn` CSS (1 task)
- Once all instances migrated, remove `.btn*` rules from styles.css
- Final cleanup of any orphaned CSS

## Key Constraints

- **Preserve `.btn-small` compact sizing**: Dashboard, inline actions, and table buttons rely on tight spacing
- **No visual regression**: Each migrated page must look identical before/after
- **Incremental**: Each page migration is an independent, reviewable PR
- **Test**: Each migration should be visually verified in both light and dark modes

## Scope

This is a dedicated future PR (or series of PRs). Do NOT begin migration in the current visual-tech-debt PR.

**Estimated effort**: ~15 focused tasks, each touching 1-3 files. Can be parallelized across developers since pages are independent.
