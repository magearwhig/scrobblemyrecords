# Button System Consolidation Plan -- COMPLETE

**Completed:** February 2026

## Summary

Migrated all ~290 `.btn` CSS class instances across 54 files to the unified `Button.tsx` component system and removed the legacy `.btn` CSS rules entirely.

## What Was Done

### Phase A: Align Button.tsx with `.btn` sizing
- Aligned `Button.tsx` `--small` sizing (padding: `0.25rem 0.75rem`, font-size: `0.75rem`) to match `.btn-small` compact sizing
- Added `warning` variant to `ButtonVariant` type
- Added `.button--filter` CSS effects (transform, box-shadow) with dark mode, high contrast, and reduced motion support

### Phase B: Incremental page-by-page migration
Migrated all 54 files from `<button className="btn ...">` to `<Button variant="..." size="...">` and `<IconButton>`:

| Variant Mapping | |
|---|---|
| `.btn` | `variant="primary"` |
| `.btn-secondary` | `variant="secondary"` |
| `.btn-danger` | `variant="danger"` |
| `.btn-success` | `variant="success"` |
| `.btn-outline` | `variant="outline"` |
| `.btn-outline-warning` | `variant="warning"` |
| `.btn-link` | `variant="ghost"` |
| `.btn-small` | `size="small"` |
| `.btn-filter` | `className="button--filter"` |

Non-React elements (`<a>`, `<label>`) use CSS classes directly: `className="button button--primary button--medium"`.

### Phase C: Absorb `.btn-icon`
All `.btn-icon` usage absorbed by `<IconButton>` with required `aria-label`.

### Phase D: Remove `.btn` CSS
- Removed all `.btn*` CSS rules from `styles.css` (~120 lines)
- Removed `.btn-icon` rules from `NewReleasesPage.css`
- Updated `.wishlist-card-actions .btn` and `.discard-item-card .item-actions .btn` selectors to target `.button`
- Removed `.btn:focus-visible` from combined selector

### Test Updates
Updated 5 test files to use `getByRole('button', ...)` instead of `getByText(...)` for disabled state checks, and updated class name assertions from `btn-primary`/`btn-outline` to `button--primary`/`button--outline`.

## Result

Zero `.btn` CSS classes remain in TSX files. Zero `.btn*` CSS rules remain in stylesheets. Single unified button system via `Button.tsx` with typed variants, loading states, icon support, and accessibility built in.

## Key Files

`Button.tsx`, `Button.css`, `styles.css`, `NewReleasesPage.css`, 54 migrated TSX files, 6 test files.
