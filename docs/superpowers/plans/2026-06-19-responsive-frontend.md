# Responsive Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing React/Vite frontend responsive on phone, tablet, and desktop widths without creating separate mobile pages.

**Architecture:** Keep the current component tree and state flow. Use Tailwind responsive classes to change the app shell, navigation, page grids, dense lists, and panel sizing at mobile and desktop breakpoints.

**Tech Stack:** React 19, Vite, TypeScript, Tailwind CSS v4, lucide-react, local shadcn-style UI components.

---

### Task 1: App Shell And Navigation

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/layout/Sidebar.tsx`
- Modify: `frontend/src/components/layout/StrategySidebar.tsx`
- Modify: `frontend/src/components/layout/PageHeader.tsx`

- [ ] Update `App.tsx` so mobile uses vertical flow with bottom navigation padding, while `lg` and above keep the current horizontal full-height app shell.
- [ ] Update `Sidebar.tsx` so it renders as a fixed bottom nav below `lg` and a left rail at `lg` and above.
- [ ] Update `StrategySidebar.tsx` so it renders as a sticky top horizontal selector below `lg` and the existing rail at `lg` and above.
- [ ] Update `PageHeader.tsx` spacing so it fits mobile widths.
- [ ] Run `npm run build` in `frontend` and fix TypeScript/build errors before moving on.

### Task 2: Home Page Responsiveness

**Files:**
- Modify: `frontend/src/pages/HomePage.tsx`
- Modify: `frontend/src/components/home/TaskList.tsx`

- [ ] Reduce mobile page padding in `HomePage.tsx` and keep the wider desktop spacing at `sm` and above.
- [ ] Let the home header stack on mobile and align horizontally when enough width is available.
- [ ] Change `TaskList.tsx` so task rows are stacked card-like rows below `md`, while preserving the existing five-column desktop grid at `md` and above.
- [ ] Run `npm run build` in `frontend` and fix TypeScript/build errors before moving on.

### Task 3: Screen Page And Panels

**Files:**
- Modify: `frontend/src/pages/ScreenPage.tsx`
- Modify: `frontend/src/components/technical/TechnicalScreenView.tsx`
- Modify: `frontend/src/components/detail/StockDetailPanel.tsx`
- Modify: `frontend/src/components/ui/filter-drawer.tsx`

- [ ] Change fundamental and technical content grids to single-column mobile flow and restore two-column desktop grids at `2xl`.
- [ ] Remove mobile clipping caused by full-height/overflow-hidden layouts while preserving desktop overflow behavior.
- [ ] Let `StockDetailPanel` headers wrap on mobile and keep actions reachable.
- [ ] Make `FilterDrawer` use `w-[min(90vw,320px)]` on mobile and the compact width on larger screens.
- [ ] Run `npm run build` in `frontend` and fix TypeScript/build errors before moving on.

### Task 4: List Controls And Dense Tables

**Files:**
- Modify: `frontend/src/components/screener/StockListCard.tsx`
- Modify: `frontend/src/components/screener/FundamentalCandidateListCard.tsx`

- [ ] Make card headers and controls wrap on mobile.
- [ ] Make search/select controls full-width on mobile and compact on larger screens.
- [ ] Add safe table minimum widths inside existing horizontal scroll containers so table overflow stays inside cards instead of widening the page.
- [ ] Tighten mobile table spacing without changing data flow or selection behavior.
- [ ] Run `npm run build` in `frontend` and fix TypeScript/build errors before moving on.

### Task 5: Browser Verification

**Files:**
- Verify only.

- [ ] Start the Vite dev server.
- [ ] Verify at 375px width: home page, screen page, bottom nav, strategy selector, filter drawer, lists, charts, and details are reachable without page-level horizontal overflow.
- [ ] Verify at 768px width: layout remains readable and controls do not overlap.
- [ ] Verify at desktop width: existing desktop rail/sidebar and wide layouts remain available.
- [ ] Stop or leave the dev server status clearly reported.
