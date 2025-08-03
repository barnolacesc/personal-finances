# Dark Mode Development Guidelines

## Core Principles

Dark mode should be a **first-class citizen** in this application. Every new feature and component must be developed with dark mode compatibility from the start.

## Development Rules

### ✅ DO Use These Classes
- `bg-body` - Adapts to theme automatically
- `bg-body-secondary` - Secondary background that adapts
- `bg-body-tertiary` - Tertiary background that adapts
- `text-body` - Body text that adapts
- `text-body-secondary` - Secondary text that adapts
- `text-primary`, `text-success`, etc. - Semantic colors

### ❌ DON'T Use These Classes
- `bg-light` - Fixed light background (use `bg-body-secondary` instead)
- `bg-white` - Fixed white background (use `bg-body` instead)
- `text-dark` - Fixed dark text (use `text-body` instead)
- `text-black` - Fixed black text (use default or `text-body` instead)

## Testing Checklist

Before committing any UI changes, test in BOTH modes:

1. Toggle to dark mode
2. Check all text is readable (proper contrast)
3. Verify all backgrounds adapt correctly
4. Ensure interactive elements (buttons, forms) work properly
5. Check that colors maintain semantic meaning

## Component-Specific Patterns

### Cards
```html
<!-- Good -->
<div class="card">
  <div class="card-body bg-body-secondary">
    <strong>Amount:</strong> €10.00
  </div>
</div>

<!-- Bad -->
<div class="card bg-light">
  <div class="card-body">
    <span class="text-dark">Amount:</span> €10.00
  </div>
</div>
```

### Tables
- Use `table-light` class - it's handled by CSS overrides
- Ensure `fw-bold` and `strong` text is visible

### Forms
- All form controls automatically adapt via CSS
- Use semantic validation states (`is-valid`, `is-invalid`)

### Badges and Status
- Category badges use fixed colors (good for consistency)
- Status badges should use semantic classes

## CSS Implementation

The `theme.css` file contains comprehensive dark mode overrides for:
- Bootstrap utility classes
- Form controls
- Tables and lists
- Modals and dropdowns
- Navigation components
- Custom app components

## Future Development

When adding new features:
1. Start with semantic Bootstrap classes
2. Test immediately in dark mode
3. Add custom CSS only if needed
4. Follow the established patterns in `theme.css`
5. Update this guide if new patterns emerge

## Common Issues Fixed

- ✅ Expense creation success card
- ✅ Category total visibility
- ✅ Table headers and footers
- ✅ Form controls and inputs
- ✅ Modal components
- ✅ Latest expense badge
- ✅ All Bootstrap utility class overrides
