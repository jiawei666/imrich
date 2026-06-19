# Responsive Frontend Design

## Goal

Make the existing React/Vite frontend usable on mobile without creating a separate mobile application. The implementation will keep the current desktop experience and use Tailwind responsive breakpoints to reshape navigation, page layout, lists, and detail panels for smaller screens.

## Scope

Covered:

- App shell navigation and page scrolling behavior.
- Home page update dashboard.
- Screen page for both fundamental and technical strategies.
- Stock/candidate lists, detail panel headers, and filter drawer sizing.
- Verification on mobile, tablet, and desktop viewport widths.

Not covered:

- New product flows, new routes, or a separate mobile-only codebase.
- Backend API changes.
- Visual redesign beyond the layout changes required for responsive behavior.

## Approach

Use a mobile-first responsive layout in the existing components.

- Desktop keeps the current app-like layout: left main sidebar, optional strategy sidebar, and desktop content grids.
- Mobile converts the main sidebar into a fixed bottom navigation.
- Mobile converts the strategy sidebar into a horizontal strategy bar near the top of the screen.
- Content areas use single-column vertical layouts on mobile and restore desktop grids at larger breakpoints.
- Dense tables avoid viewport overflow by using smaller mobile column sets, wrapping controls, and horizontal scroll only where preserving table structure is still the clearest interaction.

## Component Design

### App Shell

`App.tsx` becomes responsive at the root:

- Mobile: vertical flow with bottom navigation padding.
- Desktop: existing `h-screen overflow-hidden` application shell.
- `Sidebar` renders as bottom navigation on mobile and left rail on desktop.
- `StrategySidebar` renders as a top horizontal strategy selector on mobile and as the current left strategy rail on desktop.

### Home Page

`HomePage` keeps the same data model and actions.

- Mobile reduces page padding.
- Header stacks title, status, and refresh button when width is constrained.
- Stat cards remain one column on mobile and three columns from `sm`.
- `TaskList` becomes a card-like stacked row layout below `md`; desktop keeps the existing five-column grid.

### Screen Page

Fundamental and technical screen pages keep the same state and data flow.

- Mobile uses one vertical column.
- Desktop restores the current two-column layout at wide breakpoints.
- Fundamental view shows candidate list first and stock detail below.
- Technical view shows stock list first and price chart below.
- Detail panels can grow naturally on mobile instead of being forced into a clipped full-height panel.

### Lists

`StockListCard`:

- Header controls wrap on mobile.
- Search and history selector become full-width controls on mobile.
- The table is given a mobile-friendly minimum width and horizontal scroll as a fallback.
- Desktop behavior remains unchanged.

`FundamentalCandidateListCard`:

- Header controls wrap on mobile.
- Search and index selector become full-width controls on mobile.
- Candidate table gets safe horizontal scroll and tighter spacing on mobile.
- Core columns remain visible first; lower-priority fields should not force the page viewport wider.

### Detail Panel

`StockDetailPanel`:

- Header wraps on mobile.
- Action buttons stay reachable without forcing text overflow.
- Inner chart/report grids remain single column on mobile and split on larger screens.

### Filter Drawer

`FilterDrawer`:

- Mobile width becomes `min(90vw, 320px)`.
- Desktop can keep the compact 220px drawer.
- Existing close behavior remains unchanged.

## Testing And Verification

Run:

- `npm run build` in `frontend`.

Manual browser verification:

- 375px wide phone viewport.
- 768px tablet viewport.
- Desktop viewport.

Check:

- No page-level horizontal overflow.
- Bottom/mobile navigation is reachable and does not hide content.
- Strategy selector and filter button are reachable on mobile.
- Home task rows are readable and refresh buttons are usable.
- Stock lists, candidate lists, charts, and details can all be reached by scrolling.

## Risks

- Existing uncommitted frontend changes touch some of the same components. The implementation must preserve those changes and avoid reverting unrelated work.
- ECharts may need explicit container sizing to render well after responsive layout changes.
- Tables may still require horizontal scroll for dense financial data; this is acceptable when the page itself does not overflow.
