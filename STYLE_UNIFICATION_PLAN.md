# Style Unification Plan for Betmate Frontend

## Current State Analysis

### 10 Distinct Styling Systems Identified:

1. **Modern Tailwind CSS + Design System** (Target/Newest)
2. **Legacy DALI Lab Styles** (Main Dashboard/Home)
3. **New Dark Theme Game UI** (Post-Migration)
4. **Raffle System Styles** (Recently Added)
5. **Game UI Side Panels** (Mixed Legacy/Modern)
6. **Post-Game Receipt System** (Distinct Artistic Style)
7. **Authentication System** (Legacy Artistic)
8. **Wager Panel System** (Game-Specific)
9. **Navigation Systems** (Dual Approach)
10. **Player Info Components** (Game-Specific)

## Critical Issues Requiring Unification

### Color System Conflicts
- **5 different green variants**: #00EFB2, #4CAF50, #64FF8F, #2DFD83, #99CCA7
- **6 different background colors**: #050505, #111111, #121212, #1E1E22, #1e1e2e, #242424
- **Inconsistent accent colors**: Multiple blues, pinks, yellows without systematic usage

### Typography Chaos
- Font sizes: 10px → 50px (no clear hierarchy)
- Mixed font weights and families
- Inconsistent line heights and spacing

### Layout System Fragmentation
- Legacy Flexbox vs Modern CSS Grid
- Mixed positioning strategies
- Inconsistent responsive breakpoints
- Multiple shadow/effect systems

## Recommended Unified Design System

### Target: Enhanced Tailwind CSS System
**Rationale**: Already established, utility-first, maintainable, extensible

### Phase 1: Color System Standardization

#### Primary Palette
```scss
// Dark Theme Foundation
$bg-primary: #050505;     // Pure black (main backgrounds)
$bg-secondary: #111111;   // Elevated surfaces (cards, panels)
$bg-tertiary: #1a1a1a;   // Subtle elevation

// Accent Colors
$green-primary: #00EFB2;  // Main brand green
$green-hover: #34F5C5;    // Hover states
$green-muted: #66FACD;    // Disabled/secondary

// Semantic Colors
$success: #00EFB2;        // Wins, positive actions
$warning: #FFC430;        // Warnings, pending states
$error: #FF4757;          // Losses, errors
$info: #3a88fe;           // Information, neutral actions

// Text Colors
$text-primary: #FFFFFF;   // Primary text
$text-secondary: #BDBDBD; // Secondary text
$text-muted: #666666;     // Muted text
```

#### Component-Specific Colors
```scss
// Wager Status Colors
$wager-pending: rgba(255, 231, 94, 0.15);
$wager-won: rgba(0, 239, 178, 0.15);
$wager-lost: rgba(255, 71, 87, 0.15);
$wager-cancelled: rgba(149, 165, 166, 0.15);

// Rank/Leaderboard Colors
$rank-gold: #E5AF27;
$rank-silver: #C0C0C0;
$rank-bronze: #CD7F32;
```

### Phase 2: Typography System

#### Font Hierarchy
```scss
// Font Family
$font-primary: 'Roboto', -apple-system, BlinkMacSystemFont, sans-serif;

// Font Sizes (T-shirt sizing)
$text-xs: 0.75rem;    // 12px
$text-sm: 0.875rem;   // 14px
$text-base: 1rem;     // 16px
$text-lg: 1.125rem;   // 18px
$text-xl: 1.25rem;    // 20px
$text-2xl: 1.5rem;    // 24px
$text-3xl: 1.875rem;  // 30px
$text-4xl: 2.25rem;   // 36px

// Font Weights
$font-light: 300;
$font-normal: 400;
$font-medium: 500;
$font-semibold: 600;
$font-bold: 700;
```

### Phase 3: Spacing System
```scss
// Consistent spacing scale (0.25rem = 4px base)
$space-1: 0.25rem;   // 4px
$space-2: 0.5rem;    // 8px
$space-3: 0.75rem;   // 12px
$space-4: 1rem;      // 16px
$space-5: 1.25rem;   // 20px
$space-6: 1.5rem;    // 24px
$space-8: 2rem;      // 32px
$space-10: 2.5rem;   // 40px
$space-12: 3rem;     // 48px
$space-16: 4rem;     // 64px
```

### Phase 4: Component Design Tokens

#### Border Radius
```scss
$radius-sm: 0.25rem;   // 4px
$radius-base: 0.5rem;  // 8px
$radius-lg: 0.75rem;   // 12px
$radius-xl: 1rem;      // 16px
$radius-full: 9999px;  // Pills/circles
```

#### Shadows
```scss
// Neumorphic shadows (consistent with current design)
$shadow-inset: inset 2px 2px 4px rgba(0, 0, 0, 0.3);
$shadow-raised: 2px 2px 8px rgba(0, 0, 0, 0.3);
$shadow-glow-green: 0 0 20px rgba(0, 239, 178, 0.3);
```

## Migration Strategy

### Phase 1: Foundation Setup (Week 1-2)
1. **Create unified token system** in `src/styles/tokens.scss`
2. **Establish component base classes** for common patterns
3. **Create utility mixins** for consistent effects
4. **Set up design system documentation**

### Phase 2: Core Components (Week 3-4)
1. **Navigation systems** (unify NavBar variations)
2. **Button components** (standardize all button styles)
3. **Card/Panel components** (unify all container styles)
4. **Form inputs** (consistent input styling)

### Phase 3: Game Interface (Week 5-6)
1. **Chess UI components** (board, pieces, highlights)
2. **Betting sidebars** (wager panels, outcome betting)
3. **Chat system** (messages, wager receipts)
4. **Player info panels** (consistent info display)

### Phase 4: Page Layouts (Week 7-8)
1. **Dashboard/Home page** (migrate from DALI lab styles)
2. **Game match pages** (consolidate dark theme variations)
3. **Raffle pages** (align with unified system)
4. **Authentication pages** (simplify artistic elements)

### Phase 5: Polish & Cleanup (Week 9-10)
1. **Post-game modals** (simplify gradient complexity)
2. **Leaderboard components** (consistent ranking display)
3. **Remove unused CSS** (clean up legacy files)
4. **Performance optimization** (consolidate stylesheets)

## Implementation Guidelines

### Naming Conventions
```scss
// BEM methodology for component styles
.component-name {
  &__element { }
  &--modifier { }
}

// Utility classes for common patterns
.bg-primary { background-color: $bg-primary; }
.text-primary { color: $text-primary; }
.shadow-raised { box-shadow: $shadow-raised; }
```

### File Organization
```
src/styles/
├── tokens.scss           // Design tokens/variables
├── mixins.scss           // Reusable mixins
├── base.scss             // Reset, base element styles
├── utilities.scss        // Utility classes
└── components/
    ├── buttons.scss      // Button variations
    ├── cards.scss        // Card/panel styles
    ├── forms.scss        // Form input styles
    └── ...
```

### Component Migration Checklist
For each component being migrated:
- [ ] Audit current styles and identify reusable patterns
- [ ] Map current colors to unified color tokens
- [ ] Replace hardcoded values with design tokens
- [ ] Consolidate similar styles into shared classes
- [ ] Update responsive breakpoints to standard set
- [ ] Test across all screen sizes
- [ ] Document any component-specific variations

## Success Metrics
1. **Reduced CSS bundle size** (target: 30-40% reduction)
2. **Consistent visual hierarchy** across all pages
3. **Improved maintainability** (single source of truth for design decisions)
4. **Better responsive behavior** (consistent breakpoints)
5. **Enhanced developer experience** (clear design tokens and documentation)

## Risk Mitigation
1. **Create visual regression tests** for key user flows
2. **Implement feature flags** for gradual rollout
3. **Maintain parallel styles** during transition period
4. **Regular stakeholder reviews** to ensure design consistency
5. **Performance monitoring** during migration

This unification will create a cohesive, maintainable design system that preserves the best elements of each current approach while establishing consistency across the entire application.