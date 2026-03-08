# Claude Code Instructions

## Task Master AI Instructions
**Import Task Master's development workflow commands and guidelines, treat as if import is in the main CLAUDE.md file.**
@./.taskmaster/CLAUDE.md

## React Styling Best Practices

### Guidelines
- **AVOID inline styles** - They make components harder to maintain, test, and reuse
- **USE co-located CSS module files** for page-specific styles (e.g., `HomePage.module.css` next to `HomePage.tsx`)
- **USE global CSS classes** in `styles.css` for shared styles (buttons, cards, layout)
- **ENSURE text readability** - Always specify both color and background-color
- **TEST in different themes** - Avoid assumptions about default colors
- **USE design tokens** - Never hardcode `font-size`, `border-radius`, or color values

### Icon Conventions
- **NEVER use emoji as icons** - Use `lucide-react` for all icons
- Size: 16px for inline/badges, 18px for nav items, 20px for headers
- Add `aria-hidden="true"` to decorative icons; `aria-label` to icon-only buttons

### Technical Reasoning
- Inline styles have highest CSS specificity, making them hard to override
- They don't support pseudo-classes, media queries, or advanced CSS features
- Performance impact: inline styles prevent CSS caching and reuse
- Maintenance burden: style changes require component updates

## Workflow Instructions

### Before Starting Work
1. **Check Graphiti Memory**: Search for relevant patterns, best practices, and previous decisions
2. **Review Task Master**: Check for related tasks and dependencies
3. **Search codebase** for similar implementations to maintain consistency

### During Development
1. **Follow established patterns** found in codebase
2. **Document decisions** in Graphiti memory for future reference
3. **Update Task Master** with progress and learnings

### Code Review Checklist
- [ ] No new inline styles added
- [ ] Text color and background specified for readability
- [ ] Consistent with existing component patterns
- [ ] Follows established CSS methodology
