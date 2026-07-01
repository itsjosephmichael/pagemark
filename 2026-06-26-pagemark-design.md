# PageMark — Design Document

**Date:** 2026-06-26
**Status:** Draft
**Project:** Chrome extension for annotating localhost webpages with structured prompts for AI coding agents (OpenCode)

---

## 1. Overview

PageMark is a Chrome extension that lets developers annotate specific parts of a localhost webpage and generate structured markdown reports for AI agents like OpenCode. It captures the element's location (CSS selector, source file path), the user's annotation (with action type and severity labels), and groups everything into a file-anchored markdown format optimized for AI comprehension.

No AI is used in the extension itself. It is purely a data collector + prompt formatter.

### Why This Exists

Current workflow for AI-assisted web development:
- User copies XPaths manually → feeds to AI
- Slow, error-prone, loses context
- No way to group related changes

PageMark replaces this with: click element → add note → generate structured prompt.

---

## 2. Core Principles

- **No AI in extension** — pure keyword matching for label suggestions
- **Localhost only** — only activates on `localhost`, `127.0.0.1`, `file://`
- **No auto-connection to OpenCode** — manual markdown export/paste
- **Vanilla JS** — no frameworks, minimal dependencies
- **Persistent state** — annotations survive page navigation (session storage)
- **Privacy-first** — zero data leaves the browser

---

## 3. User Flow

```
1. User opens localhost dev site
2. Activates PageMark (toolbar icon or popup toggle)
3. Floating toolbar appears (center-right, draggable)
4. User selects selection mode: Element / Rectangle / Matching / Selector
5. User clicks/drags on elements → comment popup appears
6. User chooses: Action type (add/modify/remove/replace/fix/consider)
7. User chooses: Severity (must/should/nit)
8. User types freeform note
9. (Optional) Keyword matching auto-suggests labels
10. Repeat for all annotations
11. User clicks "Generate" → markdown preview
12. Download .md file OR copy to clipboard
13. Feed markdown to OpenCode
```

---

## 4. Localhost Detection & File Mapping

### 4.1 URL Restriction

PageMark only activates on:
- `http://localhost:*/*`
- `http://127.0.0.1:*/*`
- `file:///*`

All other URLs are blocked. Attempting to activate shows a message: "PageMark only works on localhost pages."

### 4.2 Source File Detection (Three-Tier Fallback)

**Tier 1: Framework DevTools Hook (Best, no setup)**

If the page uses React or Vue:
- React: Detect `__REACT_DEVTOOLS_GLOBAL_HOOK__` → read `_debugSource.file` from component fiber
- Vue: Detect `__VUE_DEVTOOLS_GLOBAL_HOOK__` → read `__file` from component instance
- Gives exact file path, line, and column

**Tier 2: Sourcemap Parsing (Works for any framework)**

For scripts loaded from the dev server:
- Fetch each JavaScript bundle
- Extract `//# sourceMappingURL=...`
- Parse sourcemap JSON
- Map generated code positions to original source files
- Works with Vite, webpack, Next.js, CRA, Angular CLI, Parcel

**Tier 3: User-Configured Root Fallback**

- User sets project root in extension options (e.g., `C:\projects\my-app\src`)
- Extension stores in `chrome.storage.local`
- If no auto-detection: display "unknown file", user can manually assign
- Suggestion: Show file browser dropdown for common paths

### 4.3 File Path Display

In the annotation UI, each annotation shows:
- Detected file path (with green checkmark if auto-detected)
- "Unknown file" (gray, if not detected)
- Dropdown to manually select/reassign file (populated from project root)

### 4.4 Session Persistence

- Annotations persist per page via `chrome.storage.session`
- On page refresh: all annotations remain
- On page navigation (SPA route change): annotations reset (new session)
- User can save session manually (export JSON)

---

## 5. Floating Toolbar

### 5.1 Layout

- Appears center-right of viewport by default
- Draggable (user can reposition)
- Vertical orientation, compact
- Collapsible (toggle visibility)

### 5.2 Components

```
┌─────────────┐
│ [V] [R] [M] │  ← Selection mode buttons
│ [S] [≡]     │  ← Selector mode + Menu
├─────────────┤
│   3 notes   │  ← Annotation count badge
├─────────────┤
│  [Generate] │  ← Generate markdown button
│  [Settings] │  ← Open extension settings
└─────────────┘
```

### 5.3 Mode Buttons

| Button | Mode | Description |
|--------|------|-------------|
| `V` | Element Select (default) | Click single element. Outer-first. Shift+click for multi-select |
| `R` | Rectangle Select | Drag to draw selection box. Ctrl/Cmd held = intersect mode |
| `M` | Matching Select | Hover → auto-highlights matching elements. Click to select all |
| `S` | By Selector | Text field for CSS selector/XPath input |
| `≡` | Menu | Settings, help, clear all, export/import |

### 5.4 Mode Details

**Element Select (V)**
- Hover: blue outline preview on element
- Click: green persistent highlight
- If child element clicked: select the child, not parent
- Double-click: drill into children (select next inner element)
- Shift+click: add to existing selection (multi-select with one comment)
- Comment popup appears after element is selected

**Rectangle Select (R)**
- Drag on empty space to draw rectangle
- Enclose mode (default): selects elements fully inside rect
- Intersect mode (Ctrl held): selects elements partially inside rect
- Rectangle gets a single comment, stored with viewport coordinates
- Visual: dashed blue rect while dragging, green after selection

**Matching Select (M)**
- Hover an element → all elements with same tag + meaningful classes highlighted
- Click to select all matching elements with one comment
- Useful for repeated errors ("all buttons have wrong color")
- Matching ignores utility classes (`flex`, `mt-2`, `p-4` etc.)

**By Selector (S)**
- Text input accepts CSS selector or XPath
- Press Enter to select matching elements
- Shows match count before confirming
- Useful for elements hidden behind interactions

---

## 6. Comment System

### 6.1 Comment Popup

Appears after element selection:

```
┌─────────────────────────────────┐
│ PageMark Annotation             │
├─────────────────────────────────┤
│ File: src/components/Header.tsx │
│ Element: h1.hero-title          │
│ "Welcome to our platform"       │
├─────────────────────────────────┤
│ Action: [add] [modify] [remove] │
│         [replace] [fix] [consid]│
│ Severity: [must] [should] [nit] │
├─────────────────────────────────┤
│ Your note:                      │
│ ┌─────────────────────────┐     │
│ │ I need you to change    │     │
│ │ this heading to...      │     │
│ └─────────────────────────┘     │
│                                 │
│ [Save] [Cancel] [Delete]        │
└─────────────────────────────────┘
```

### 6.2 Action Types

| Action | Meaning | Prompt Verb |
|--------|---------|-------------|
| `add` | Create new element/component | Add {note} |
| `modify` | Change existing | Modify {note} |
| `remove` | Delete or hide | Remove {note} |
| `replace` | Swap for something else | Replace {note} |
| `fix` | Bug/correctness | Fix {note} |
| `consider` | Question/suggestion, no firm ask | Consider {note} |

### 6.3 Severity Levels

| Severity | Color | Meaning |
|----------|-------|---------|
| `must` | Red | Blocks merge/launch |
| `should` | Amber | Address before next pass |
| `nit` | Gray | Polish/optional |

### 6.4 Keyword Auto-Suggest (No AI)

When user types in the note field, keyword matching suggests labels:

| Keywords | Suggested Action | Suggested Severity |
|----------|-----------------|-------------------|
| "delete", "remove" | `remove` | — |
| "fix", "broken", "error" | `fix` | `must` |
| "add", "need", "missing" | `add` | `should` |
| "change", "update", "modify" | `modify` | — |
| "replace", "swap" | `replace` | — |
| "maybe", "consider", "should we" | `consider` | `nit` |
| "critical", "blocking" | — | `must` |
| "polish", "minor", "nit" | — | `nit` |

- Highlighted suggestion pills appear above note field
- User can accept or override
- No AI calls — simple string matching

---

## 7. Data Model

```typescript
interface Annotation {
  id: string;
  mode: 'element' | 'rectangle' | 'matching' | 'selector';

  // Target
  selectors: string[];              // CSS selectors (one per element)
  xpaths: string[];                 // XPath fallbacks
  rect?: {                          // For rectangle mode
    x: number, y: number,
    width: number, height: number
  };

  // Source file (auto-detected or user-assigned)
  file: string | null;              // e.g., "src/components/Header.tsx"
  fileAutoDetected: boolean;

  // Context
  textContent: string;              // First 200 chars
  tagName: string;
  classes: string[];
  domContext: string;               // e.g., "<section.hero> → <div> → <h1>"

  // Labels
  action: 'add' | 'modify' | 'remove' | 'replace' | 'fix' | 'consider';
  severity: 'must' | 'should' | 'nit';

  // Comment
  note: string;                     // User's freeform instruction

  // Grouping
  groupId?: string;                 // For related annotations (Matching mode)

  // Metadata
  pageUrl: string;
  pageTitle: string;
  createdAt: number;
  status: 'open' | 'resolved';
}
```

---

## 8. Markdown Output Format

### 8.1 File-Anchored Structure

```markdown
# PageMark: [Page Title / URL]

Generated: 2026-06-26 16:30
Project root: C:\projects\my-app\src
Page: http://localhost:5173/

---

## @src/components/Header.tsx

### Fix: Hero title spelling
- **Action:** fix · **Severity:** must
- **Location:** Main heading, top of page
- **Element:** `<h1 class="hero-title">`
- **Current:** "Welcom to our platform"
- **Note:** Fix the typo in the main heading

### Modify: Navigation link styling
- **Action:** modify · **Severity:** should
- **Location:** Top nav bar, "About" link
- **Element:** `<a class="nav-link">About</a>`
- **Note:** Make the active nav link bold when selected

---

## @src/components/PricingCards.tsx

### Redesign: Pricing cards section
- **Action:** replace · **Severity:** must
- **Location:** Pricing section container
- **Elements:** 3 x `.pricing-card` (Matching mode)
- **Note:** Redesign this entire section with better visual hierarchy. Current layout looks generic.

---

## Unknown file

### Remove: Footer copyright line
- **Action:** remove · **Severity:** nit
- **Location:** Page footer, last line
- **Element:** `<p class="copyright">`

### Notes
- Annotations without file paths could not be auto-detected. Search by element description in your codebase.
```

### 8.2 Why This Format Works for OpenCode

- `@file` references inject file content when pasted into OpenCode
- Semantic descriptions ("Main heading") help locate elements without selectors
- Grouped by file = OpenCode processes one file at a time
- Action verbs map directly to dev tasks
- Severity ordering: process `must` first, then `should`, skip `nit` if tight

---

## 9. Extension Architecture

### 9.1 File Structure

```
pagemark/
├── manifest.json
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   ├── icon128.png
│   └── icon_active.png         # Badge when selector mode active
├── content/
│   ├── content.js              # Core selection logic + overlay manager
│   ├── toolbar.js              # Floating toolbar
│   ├── comment-popup.js        # Comment input UI
│   ├── overlay.css             # Highlight, toolbar, popup styles
│   └── selector.js             # CSS/XPath generator (@medv/finder)
├── popup/
│   ├── popup.html              # Extension popup (toggle active, quick status)
│   ├── popup.js
│   └── popup.css
├── background/
│   └── background.js           # Tab state, session storage, messaging
├── lib/
│   ├── file-detector.js        # Sourcemap parsing + framework hook detection
│   ├── keyword-suggester.js    # Label auto-suggest (no AI)
│   ├── prompt-generator.js     # Markdown formatter
│   └── utils.js                # UUID, debounce, throttle
├── options/
│   ├── options.html            # Settings page (project root, filters)
│   └── options.js
└── README.md
```

### 9.2 Component Responsibilities

**Content Script (`content.js`)**
- Injected on localhost pages when user activates extension
- Handles hover/click events for element selection
- Manages overlay elements (highlights, guidelines)
- Communicates with background script via `chrome.runtime.sendMessage`
- Implements mode switching (element/rectangle/matching/selector)
- Uses `@medv/finder` for CSS selector generation

**Toolbar (`toolbar.js`)**
- Creates draggable floating toolbar
- Mode selection buttons
- Annotation count badge
- Generate/Settings buttons

**Comment Popup (`comment-popup.js`)**
- Inline popup after element selection
- Action/severity picker
- Freeform note input
- Keyword auto-suggest logic
- File path display + reassignment

**File Detector (`lib/file-detector.js`)**
- Tier 1: Detect React/Vue hook → read file path
- Tier 2: Parse sourcemaps → map to source files
- Tier 3: User-configured root → relative path mapping

**Background (`background.js`)**
- Tab state management (which tabs have active selector)
- Session storage for annotations
- Messaging hub between content scripts and popup

### 9.3 Data Flow

```
User clicks element
    → content.js captures element data
    → selector.js generates CSS selector + XPath
    → file-detector.js attempts source file detection
    → comment-popup.js shows annotation form
    → User saves annotation
    → background.js stores in chrome.storage.session
    → toolbar.js updates annotation count

User clicks Generate
    → prompt-generator.js reads all annotations
    → Groups by file path
    → Formats markdown
    → Shows preview in popup
    → User clicks Download or Copy to Clipboard
```

---

## 10. UI States & Visual Design

### 10.1 Activation States

| State | Toolbar | Page Elements | Badge |
|-------|---------|---------------|-------|
| Inactive | Hidden | No change | No badge |
| Active | Visible (center-right) | Hover: blue outline | Count of annotations |
| Generating | Visible | Highlights persisted | Spinning icon |

### 10.2 Colors

- `must`: #EF4444 (red)
- `should`: #F59E0B (amber)
- `nit`: #9CA3AF (gray)
- Select (hover): #3B82F6 (blue, 2px outline)
- Select (active): #10B981 (green, 2px outline, semi-transparent fill)
- Rectangle (drag): #3B82F6 (blue, dashed 1px, 10% opacity fill)
- Toolbar bg: #1F2937 (dark gray)
- Popup bg: #FFFFFF (white)

### 10.3 Interaction Details

- Hovering: `pointer-events: none` on overlay to allow interaction
- Click deadzone: 5px threshold before treating mousedown as drag start
- R-throttle hover highlights to `requestAnimationFrame` (60fps)
- Esc key: deselect current element / close popup
- Enter key (in popup): save annotation

---

## 11. Performance

- Throttle hover to rAF (16ms minimum between highlight updates)
- Generate CSS selector on `click` only (not on hover)
- Debounce keyword suggestion to 300ms
- Limit textContent capture to 200 characters
- Use `will-change: transform` on overlay elements
- MutationObserver on body to bust highlight cache on DOM changes
- For rectangle mode on pages >500 elements: use R-tree spatial index (`rbush`)

---

## 12. Chrome Permissions

```json
{
  "manifest_version": 3,
  "name": "PageMark",
  "description": "Annotate localhost webpages and generate structured prompts for AI coding agents.",
  "permissions": [
    "storage",
    "scripting",
    "activeTab"
  ],
  "host_permissions": [
    "http://localhost/*",
    "http://127.0.0.1/*",
    "file:///*"
  ],
  "action": {
    "default_popup": "popup/popup.html",
    "default_icon": "icons/icon128.png"
  },
  "content_scripts": [{
    "matches": [
      "http://localhost/*",
      "http://127.0.0.1/*",
      "file:///*"
    ],
    "js": ["content/content.js", "content/toolbar.js", "content/comment-popup.js", "lib/selector.js", "lib/file-detector.js", "lib/keyword-suggester.js", "lib/utils.js"],
    "css": ["content/overlay.css"]
  }],
  "background": {
    "service_worker": "background/background.js"
  },
  "options_page": "options/options.html"
}
```

---

## 13. Edge Cases

### Shadow DOM
- Pierce open shadow roots via `Element.shadowRoot`
- Closed shadow roots: skip (cannot query from script)

### Iframes
- Selection limited to top-level document
- Future: option to descend into same-origin iframes

### SPA Route Changes
- MutationObserver detects DOM changes (new route loaded)
- Clear annotations from previous route
- Show toast: "Page changed — annotations reset"

### Dynamic Content (Infinite Scroll)
- Selection highlights persist via MutationObserver
- Re-attach highlight overlay if element is re-rendered

### Overlapping Elements
- `elementsFromPoint(x, y)` returns z-order stack
- Select topmost interactive element (skip extension's own UI)

### Large Pages (10K+ nodes)
- Skip rectangle mode R-tree optimization
- Throttle hover to 30fps instead of 60fps
- Show performance warning if annotations exceed 50

---

## 14. Future Considerations (Out of Scope for v1)

- OpenCode plugin: local WebSocket connection for direct injection
- Multi-page aggregation: collect annotations across a session
- PageMark Babel plugin: inject data-file attributes for guaranteed detection
- Collaboration: share annotation sessions via URL
- Integration with VSCode: click annotation → open file at line

---

## 15. Dependencies

- `@medv/finder` (1.5kb, MIT) — CSS selector generation (vendored into `lib/selector.js`)
- `rbush` (3kb gz, optional) — R-tree spatial index for rectangle mode (vendored into `lib/rbush.js`)

Both libraries vendored directly into the extension (no npm, no build step). Zero other dependencies. Vanilla JS throughout.

**Note on content script loading:** The manifest loads multiple JS files as a single content script. They share the same global scope, so load order matters (utilities first, UI components last). For v1 this is acceptable; for production, consider dynamic injection on activation to reduce memory on non-annotated pages.

---

## 16. Testing

- Manual testing approach for v1:
  1. Open localhost Vite/React dev server
  2. Verify activation on localhost only
  3. Test all 4 selection modes
  4. Verify file detection (React DevTools hook)
  5. Verify keyword auto-suggest
  6. Generate markdown → feed to OpenCode
  7. Test session persistence on refresh
  8. Test on non-React/Vite page (sourcemap fallback)
  9. Test file download and clipboard copy
