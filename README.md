# PageMark

Annotate elements on localhost webpages and generate structured markdown prompts for AI coding agents. Instead of manually copying CSS selectors and typing instructions, you click what you want to change, type a note, and PageMark compiles everything into a clean report grouped by source file. Drop the output into OpenCode (or any AI coding tool) and get changes that match the actual selectors and files in your project.

## Features

- **4 selection modes** — Element (single click), Multi (click several, then commit), Text (drag to select phrases), Area (drag a box). Pick the right tool for the job.
- **Auto file detection** — PageMark hooks into React/Vue DevTools or sourcemaps to figure out which source file an element belongs to. No manual path mapping.
- **Action & severity types** — `add`, `modify`, `remove`, `replace`, `fix`, `consider`, `reference` paired with `must` (red), `should` (amber), or `nit` (gray). Keyword auto-suggest as you type — no AI, just string matching.
- **One-click export** — Copy the markdown to your clipboard or download a `.md` file. Nothing leaves your machine.
- **Session persistence** — Annotations survive page refreshes so you can iterate without losing work.
- **Tailwind-aware** — Filters out utility classes from generated selectors where possible, keeping reports readable.
- **Zero framework dependencies** — Vanilla JS. No build step. No npm install.

## Installation

1. Clone or download this repo.
2. Open `chrome://extensions` (or `brave://extensions` / `edge://extensions`).
3. Enable **Developer mode** (top right), click **Load unpacked**, and select the `pagemark` folder.

Requires Chrome, Edge, or Brave. Firefox not yet supported.

## Usage

Navigate to a localhost page and click the PageMark icon in the browser toolbar. A popup opens next to the icon.

Click an element to select it — PageMark highlights the element and shows a form. Pick an action (`modify`, `add`, etc.), set a severity, and type your note. Repeat for each change you want to describe.

When you're done, click **Generate**. The markdown report appears. Hit **Copy** and paste it into your AI coding tool. Or click **Download** to save the `.md` file.

To clear everything and start over, use the **Clear All** button.

## Selection Modes

- **Element** — Click a single element. Best for most edits.
- **Multi** — Click several elements, then commit the batch. All get the same annotation.
- **Text** — Drag across a phrase or sentence. Captures the full text content, not just an element boundary.
- **Area** — Drag a bounding box. Useful when you want to call out a region rather than a specific node.

## Configuration

Click the PageMark icon in the browser toolbar and expand the settings panel. Two options are available:

- **Source Map Cache TTL (Seconds)** — How long PageMark caches source map data before refetching. Lower values pick up file changes faster; higher values reduce network requests.
- **Ignored CSS Classes** — A comma-separated list of CSS class prefixes to filter out of generated selectors (e.g. `flex, mt-, p-`). Helps keep selector output clean and readable.

## Security & Privacy

Zero data leaves the browser. PageMark only activates on `localhost` pages. No tracking, no telemetry, no external requests. Everything stays on your machine.

## Contributing

PRs are welcome — please open an issue first to discuss what you're changing. MIT license, maintained by Joseph Michael.
