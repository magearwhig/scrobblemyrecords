# Claude Code Instructions

## Task Master AI Instructions
**Import Task Master's development workflow commands and guidelines, treat as if import is in the main CLAUDE.md file.**
@./.taskmaster/CLAUDE.md

## React Styling Best Practices

### Guidelines
- **AVOID inline styles** - They make components harder to maintain, test, and reuse
- **USE CSS modules or styled-components** for component-specific styles
- **USE global CSS classes** for shared styles (buttons, cards, layout)
- **ENSURE text readability** - Always specify both color and background-color
- **TEST in different themes** - Avoid assumptions about default colors

### Technical Reasoning
- Inline styles have highest CSS specificity, making them hard to override
- They don't support pseudo-classes, media queries, or advanced CSS features
- Performance impact: inline styles prevent CSS caching and reuse
- Maintenance burden: style changes require component updates

### Example Issues Found
- `src/renderer/pages/SettingsPage.tsx` - Extensive inline styling causing white-on-white text
- Text readability problems due to missing color specifications
- Difficulty maintaining consistent design across components

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
