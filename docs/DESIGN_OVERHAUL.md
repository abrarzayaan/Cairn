# Cairn Design Overhaul Plan
*Deep analysis → task breakdown → implementation guide*

> **এই document-এ কী আছে:**  
> বর্তমান design-এর সব সমস্যা চিহ্নিত করা হয়েছে, reference design হিসেবে Linear/Obsidian/Craft পর্যালোচনা করা হয়েছে, এবং Cairn-এর জন্য একটি নতুন মৌলিক design language তৈরি করা হয়েছে। প্রতিটি task file-level, implementable।

---

## Part 1 — বর্তমান Design-এর সমস্যা (Current Pain Points)

### 1.1 ভিজ্যুয়াল সমস্যা

| সমস্যা | কোথায় দেখা যায় | প্রভাব |
|--------|----------------|--------|
| **AI-generated feel** — সব কিছু একই border/bg/text pattern, কোনো hierarchy নেই | পুরো app | "এটা কেউ ডিজাইন করেনি" মনে হয় |
| **রঙ ক্লান্তিকর** — `#FBFAF7` warm white + `#B4492A` burnt orange accent developer-tool feel দেয় না | tokens.css | Notion/Linear দেখার পরে boring লাগে |
| **Border overuse** — প্রায় প্রতিটি element-এ `border border-border` আছে, চোখ বিশ্রাম পায় না | সব component | Information hierarchy নষ্ট |
| **Typography monotony** — weight variation নেই, সব `text-sm` বা `text-xs` | সব page | কোনটা গুরুত্বপূর্ণ বোঝা যায় না |
| **Spacing inconsistency** — `p-3`, `p-5`, `px-3.5 py-2.5` — কোনো system নেই | সব component | Jarring, unfinished feel |
| **Card design flat** — BookCard, ChapterFeedRow সব একই flat bordered box | BookCard.tsx | Obsidian-এর depth নেই |
| **Status badges ugly** — `border-warn/40 bg-bg-subtle text-warn` inline opacity hack | BookCard.tsx | Inconsistent and hard to read |
| **font-mono সব UI-তে** — navigation, labels, buttons সব monospace | Navbar.tsx | Professional দেখায় না |

### 1.2 UX / Layout সমস্যা

| সমস্যা | কোথায় | প্রভাব |
|--------|--------|--------|
| **Home page information overload** — 522 line একটাই page.tsx, user কোথায় তাকাবে বোঝে না | app/page.tsx | First impression খারাপ |
| **Sidebar নেই** — developer tool-এ left sidebar এখন industry standard | পুরো app | User navigation হারিয়ে ফেলে |
| **Editor জটিলতা** — NoteEditor 1154 line, settings panel overwhelming | NoteEditor.tsx | নতুন user হতাশ হয়ে চলে যায় |
| **Layout breakpoints arbitrary** — `max-w-[1240px]`, `max-w-[1280px]`, hardcoded magic numbers | layout.tsx | Responsive behavior predictable না |
| **Empty states দুর্বল** — শুধু border-dashed box, কোনো guidance নেই | page.tsx | Motivation কমে যায় |
| **No right panel on note reader** — TOC, backlinks সব overflow করে | note page | Reader experience poor |
| **Mobile experience চিন্তা করা হয়নি** — সব `hidden sm:flex` | সব component | Mobile user বাদ |

### 1.3 Library/Stack সমস্যা

| বর্তমান অবস্থা | সমস্যা |
|----------------|--------|
| শুধু Tailwind CSS + Lucide | Component primitives নেই — Modal, Dropdown, Tooltip সব হাতে বানানো, accessibility নেই |
| কোনো animation library নেই | Transition জুড়ে CSS দিয়ে, smooth feel নেই |
| কোনো design token semantic structure নেই | Dark mode কাজ করে কিন্তু scaling কঠিন |

---

## Part 2 — Design Reference Analysis

### 2.1 Linear App — শেখার বিষয়
- Dark-first, achromatic shell, **single accent color** (Indigo)
- **Hairline borders**: `rgba(255,255,255,0.08)` — মোটা border নেই
- Surface layering — depth without shadow
- Keyboard-first (command palette everywhere)
- **Collapsible sidebar**, rail mode (icon-only collapse)
- Micro-animations on every interaction
- Font: Inter + Berkeley Mono

### 2.2 Obsidian — শেখার বিষয়
- **Left sidebar as primary navigation** + file tree
- Right panel for context (backlinks, TOC, properties)
- Canvas/editor হলো STAR — sidebar supports, not competes
- Collapsible sections everywhere
- Minimal chrome when focused on content

### 2.3 Craft / Notion — শেখার বিষয়
- Beautiful document typography — large, airy, readable
- Card design with real visual depth
- Smooth inline editing
- **Empty state illustrations** with real guidance
- **Breadcrumb navigation** in document view

---

## Part 3 — Cairn নতুন Design Language

### 3.1 Philosophy (মূলনীতি)

> **"Tool First, Minimal Always"**  
> Cairn হলো developer-এর personal knowledge workspace। Interface যেন transparent হয় — user যেন note পড়তে ও লিখতে এসেছে, UI দেখতে নয়।

**৩টি মূল নীতি:**
1. **Hierarchy over decoration** — প্রতিটি element-এর visual weight তার importance অনুযায়ী
2. **Space is content** — whitespace নষ্ট জায়গা না, এটাই breathing room
3. **One accent, used sparingly** — accent color শুধু action এবং focus-এ

### 3.2 নতুন Color System

#### Light Mode
```css
/* Background Layers (3 levels) */
--surface-0: #FFFFFF;        /* Canvas — note content area */
--surface-1: #F7F7F8;        /* App shell, sidebar */
--surface-2: #EFEFEF;        /* Hover states, subtle inset */

/* Text (4 levels) */
--text-primary:   #0D0D0D;   /* Headings, titles */
--text-secondary: #3D3D3D;   /* Body content */
--text-tertiary:  #6B6B6B;   /* Metadata, timestamps */
--text-disabled:  #A8A8A8;   /* Placeholder, inactive */

/* Border (3 levels) */
--border-subtle:  rgba(0,0,0,0.06);   /* Layout separation */
--border-default: rgba(0,0,0,0.12);   /* Cards, inputs */
--border-strong:  rgba(0,0,0,0.24);   /* Focus, active */

/* Accent — Indigo (developer-trusted color) */
--accent:         #4F46E5;   /* Indigo 600 */
--accent-light:   #EEF2FF;   /* Indigo 50 */
--accent-hover:   #4338CA;   /* Indigo 700 */

/* Semantic (use Tailwind directly for one-off status) */
--status-success: #16A34A;   /* Green 600 */
--status-warning: #D97706;   /* Amber 600 */
--status-danger:  #DC2626;   /* Red 600 */
```

#### Dark Mode
```css
--surface-0: #111111;        /* Canvas */
--surface-1: #1A1A1A;        /* App shell */
--surface-2: #242424;        /* Cards, hover */

--text-primary:   #FAFAFA;
--text-secondary: #D4D4D4;
--text-tertiary:  #737373;
--text-disabled:  #404040;

--border-subtle:  rgba(255,255,255,0.05);
--border-default: rgba(255,255,255,0.10);
--border-strong:  rgba(255,255,255,0.20);

--accent:         #818CF8;   /* Indigo 400 — softer on dark */
--accent-light:   #1E1B4B;   /* Indigo 950 */
```

### 3.3 Typography System

```css
/* Font Stack */
--font-sans: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
--font-mono: 'JetBrains Mono', 'Fira Code', ui-monospace, monospace;
--font-serif: 'Lora', Georgia, serif;   /* শুধু note content-এ */

/* Scale (strict 6 levels) */
--text-xs:   0.75rem;    /* 12px — badges, metadata */
--text-sm:   0.875rem;   /* 14px — UI labels, secondary */
--text-base: 1rem;       /* 16px — body, card titles */
--text-lg:   1.125rem;   /* 18px — section headings */
--text-xl:   1.25rem;    /* 20px — page titles */
--text-2xl:  1.5rem;     /* 24px — hero, h1 */
```

### 3.4 Spacing System (8px grid)

```
4px  — gap within badge/tag
8px  — icon-to-text gap, tight padding
12px — input padding, compact list item
16px — standard padding, card gap
24px — section gap, card padding
32px — page section separator
48px — large section break
```

### 3.5 নতুন Layout Structure

```
┌─────────────────────────────────────────────────────────┐
│  NAVBAR (48px, sticky)                                   │
│  Logo | Search bar (Ctrl+K)        | [+ New] [Avatar ▾] │
├──────────┬──────────────────────────────────────────────┤
│          │                                              │
│ SIDEBAR  │  MAIN CONTENT AREA (fluid)                  │
│ (220px,  │                                              │
│ collapse │  [Page-specific content]                    │
│ → 56px)  │                                              │
│          │                                              │
│ Home     │                                              │
│ Explore  │                                              │
│ Tags     │                                              │
│ ─────    │                                              │
│ DESK     │                                              │
│  Backend │                                              │
│  Frontend│                                              │
│  + New   │                                              │
│ ─────    │                                              │
│ Settings │                                              │
│ @username│                                              │
└──────────┴──────────────────────────────────────────────┘
```

**Note Reader Layout:**
```
┌─────────────────────────────────────────────────────────┐
│  NAVBAR                                                  │
├──────────┬──────────────────────────┬───────────────────┤
│          │                          │                   │
│ BOOK TOC │  DOCUMENT CONTENT        │  RIGHT PANEL      │
│ (220px)  │  (max-w: 680px, center) │  (220px)          │
│          │                          │                   │
│ Ch 1     │  # Note Title            │  On this page     │
│ Ch 2 ◄   │                          │  ─────────────    │
│ Ch 3     │  content...              │  Backlinks (3)    │
│ Ch 4     │                          │  Related notes    │
│          │                          │                   │
├──────────┴──────────────────────────┴───────────────────┤
│  [← Prev Chapter]                    [Next Chapter →]   │
└─────────────────────────────────────────────────────────┘
```

---

## Part 4 — Library Stack

### প্রস্তাবিত Libraries (install করতে হবে)

```bash
# Radix UI primitives (headless, accessible)
npm install @radix-ui/react-dialog
npm install @radix-ui/react-dropdown-menu
npm install @radix-ui/react-tooltip
npm install @radix-ui/react-popover
npm install @radix-ui/react-separator
npm install @radix-ui/react-scroll-area
npm install @radix-ui/react-avatar
npm install @radix-ui/react-slot

# Animation
npm install motion

# Font (next/font/google থেকে নেওয়া যাবে — Inter, JetBrains Mono, Lora)
```

**কেন Radix UI?**
- Zero styling — শুধু behavior/accessibility দেয়
- WAI-ARIA keyboard navigation built-in
- Composable `asChild` pattern
- Tree-shakeable, tiny bundle

**কেন Motion (Framer Motion v11)?**
- Smooth sidebar collapse, modal entrance
- `layout` animation — element size change smooth
- `AnimatePresence` — unmount-এও animation চলে

---

## Part 5 — Implementation Tasks

### Phase A: Foundation (সবার আগে)

#### TD.1 — Design Token System পুনর্নির্মাণ
**File:** `frontend/app/tokens.css`
- নতুন color system implement (Part 3.2)
- 3-layer surface system: `--surface-0/1/2`
- 2-layer border system: `--border-subtle/default/strong`
- Remove: `--bg-inset`, `--accent-bg`, `--ok`, `--warn`, `--danger`
- Add: `--radius-sm: 6px`, `--radius-md: 8px`, `--radius-lg: 12px`
- **Accent: Indigo** (`#4F46E5` light / `#818CF8` dark)

#### TD.2 — Font Stack পরিবর্তন
**File:** `frontend/app/layout.tsx`
- IBM Plex Sans → **Inter**
- Source Serif 4 → **Lora**
- IBM Plex Mono → **JetBrains Mono**
- Noto Bengali রাখুন

#### TD.3 — Tailwind Config আপডেট
**File:** `frontend/tailwind.config.ts`
- নতুন CSS variable গুলো color utility হিসেবে map করুন
- `surface-0`, `surface-1`, `surface-2` color utilities
- `border-subtle`, `border-default`, `border-strong`
- `text-primary`, `text-secondary`, `text-tertiary`

#### TD.4 — Library Install
```bash
npm install @radix-ui/react-dialog @radix-ui/react-dropdown-menu \
  @radix-ui/react-tooltip @radix-ui/react-popover \
  @radix-ui/react-separator @radix-ui/react-scroll-area \
  @radix-ui/react-avatar @radix-ui/react-slot motion
```

---

### Phase B: Layout Restructure

#### TD.5 — নতুন Sidebar Component তৈরি
**New file:** `frontend/components/Sidebar.tsx`
- Navigation sections: Home, Explore, Tags
- Desk section (owner only): categories list, `+ New Category`
- Bottom: Settings link, user avatar
- **Collapsible:** 220px ↔ 56px (icon-only rail), persisted in localStorage
- Mobile: Radix Dialog-based drawer (slide-in overlay)
- Motion animation for collapse/expand

#### TD.6 — Layout Restructure
**File:** `frontend/app/layout.tsx`
- CSS Grid: `grid-cols-[220px_1fr]` desktop
- Sidebar collapse হলে `grid-cols-[56px_1fr]`
- Mobile: sidebar drawer, no sidebar in grid
- Remove `max-w-[1280px]` from `<main>` — page-specific max-width

#### TD.7 — Navbar Simplify
**File:** `frontend/components/Navbar.tsx`
- Remove: individual nav links (sidebar-এ চলে যাবে)
- Keep: Logo, Search bar (prominent, centered), `+ New` button, User avatar
- User avatar: Radix DropdownMenu → Profile / Settings / Sign out
- Font change: remove `font-mono` from nav items

---

### Phase C: Core Pages Redesign

#### TD.8 — Home Page সম্পূর্ণ নতুনভাবে
**File:** `frontend/app/page.tsx`

**Logged-out:**
- Hero (centered, clean): tagline + 2 CTAs
- Published Books grid (3 col)
- Recent Chapters (compact list)

**Logged-in Dashboard:**
- Welcome (small, compact — not hero)
- Recent Activity: last 5 edits
- Your Bookshelf: 3 col grid
- Discover: published from other developers

Remove from home: search bar, category filter tab (sidebar-এ), book stats

#### TD.9 — Note Reader Page নতুন Layout
**File:** `frontend/app/u/[user]/[slug]/page.tsx`
- Left: Book TOC (chapter list, current highlighted, sticky)
- Center: Content, `max-width: 680px`, `font-serif`, `text-lg`, airy spacing
- Right: On This Page TOC + Backlinks (Radix ScrollArea)
- Top: Breadcrumb → `@user / Book Title / Chapter Name`
- Bottom: Prev/Next chapter (large cards)
- Reading progress bar (top, thin, accent color)

#### TD.10 — Note Editor UX সরলীকরণ
**File:** `frontend/components/NoteEditor.tsx`
- 3-panel: Sidebar (outline) | Editor | Preview (toggle-able panels)
- **Settings drawer** (Radix Dialog): Title, Slug, Tags, Visibility — editor-এ ছড়িয়ে ছিটিয়ে নয়
- Floating save status (bottom right, Motion animation)
- Toolbar: minimal, icon-only with Radix Tooltip labels
- Keyboard shortcuts overlay (`?` key)

#### TD.11 — Book TOC Page
**File:** `frontend/components/BookTocClient.tsx`
- Chapter list: numbered rows, cleaner hover states
- Book header: description prominent, author info
- Access state indicator cleaner

#### TD.12 — Profile/Desk Page
**File:** `frontend/components/ProfileViewClient.tsx`
- Two-column: Left (category filter list) | Right (books grid)
- Category switching with Motion layout animation
- Published badge prominent
- Bio section at top with avatar

#### TD.13 — Search Page
**File:** `frontend/app/search/page.tsx`, `SearchPalette.tsx`
- SearchPalette: Radix Dialog-based
- Developer cards: avatar + published count prominent
- Left filter sidebar: type / tag / author

---

### Phase D: UI Component Library

#### TD.14 — Button System
**New file:** `frontend/components/ui/Button.tsx`
- Variants: `primary | secondary | ghost | danger | link`
- Sizes: `sm | md | lg`
- Radix Slot for composability
- Loading state built-in

#### TD.15 — Dialog/Modal System
**New file:** `frontend/components/ui/Dialog.tsx`
- Radix Dialog primitive
- Motion animation: scale + fade entrance
- Replace: CreateBookModal এবং সব manual modal

#### TD.16 — Tooltip System
**New file:** `frontend/components/ui/Tooltip.tsx`
- Radix Tooltip
- Replace: সব `title` attributes

#### TD.17 — Badge Component
**New file:** `frontend/components/ui/Badge.tsx`
```tsx
// Variants: default | success | warning | danger | info | outline
// Sizes: sm | md
// No opacity hacks — solid semantic colors
```

#### TD.18 — Card Component
**New file:** `frontend/components/ui/Card.tsx`
```tsx
// Variants: 
//   flat — border only (default)
//   elevated — subtle shadow, no border (for important content)
//   ghost — background tint only (for subtle sections)
//   interactive — hover lift effect
```

---

### Phase E: Content Typography

#### TD.19 — Prose Typography Upgrade
**File:** `frontend/app/globals.css` (`.prose-cairn`)
- Font: `font-serif` (Lora)
- Font size: `1.0625rem` → `1.125rem` (18px)
- Line height: `1.72` → `1.8`
- Code blocks: left `4px` accent border stripe (VS Code style)
- Blockquote: redesign (subtle left bar, no italic, background tint)
- Link underline: `text-underline-offset: 3px`
- Heading bottom-border on h2: remove (use spacing instead)

---

## Part 6 — Implementation Order

```
Week 1 — Foundation (TD.1 → TD.4)
  Token system rewrite
  Font change
  Tailwind config update
  Library install

Week 2 — Layout (TD.5 → TD.7)
  Sidebar build
  Layout restructure
  Navbar simplify

Week 3 — Core Pages (TD.8 → TD.11)
  Home page
  Note reader
  Editor UX
  Book TOC

Week 4 — Polish (TD.12 → TD.19)
  Profile page
  Search
  UI component library
  Typography final
```

---

## Part 7 — Design Don'ts

```
❌ font-mono সব UI text-এ — শুধু code, slug, keyboard shortcut-এ
❌ প্রতিটি element-এ border — whitespace দিয়ে section আলাদা করুন
❌ একাধিক accent color — শুধু indigo accent, semantic শুধু status badge-এ
❌ Magic numbers — max-w-[1240px], grid-cols-[minmax(0,1fr)_310px]
❌ All-in-one page components — 500+ line page.tsx কখনো না
❌ Inline opacity hacks — border-warn/40, text-ok/70
❌ justify-between সব card-এ — real visual hierarchy দিন
❌ Hover underline লিঙ্কে সব জায়গায় — শুধু prose/inline text-এ
```

---

## Part 8 — Inspiration Reference

| Element | Reference |
|---------|-----------|
| Navbar | Linear app top bar |
| Sidebar | Notion left sidebar (collapsed/expanded states) |
| Note reader | Craft.do document view |
| Editor | Obsidian editor with right panel |
| Cards | Linear issue cards |
| Search | Linear Ctrl+K command palette |
| Badges | GitHub PR/Issue status labels |
| Empty states | Linear "No issues found" illustrated state |
| Typography | Linus.zone / Rauno.me developer personal sites |

---

*শুরু করার আগে TD.1 (tokens) এবং TD.4 (library install) সম্পন্ন করুন — এগুলো বাকি সব task-এর foundation।*
