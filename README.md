<p align="center"><img src="build/icon.png" width="96" alt=""></p>

<h1 align="center">Deskbase</h1>

<p align="center">Your pages, tasks and notes as glass panels on the Windows desktop.<br>Local-first, fully styleable, with Notion import.</p>

## Install

Download `Deskbase-Setup-x.y.z.exe` from the [latest release](https://github.com/vptr-dev/deskbase/releases/latest) and run it. The app updates itself: new versions download in the background and install the next time you restart it.

> Windows may show a SmartScreen notice the first time because the installer is not code-signed. Choose **More info → Run anyway**.

## What's inside

- **Desktop panels**: tasks, checklists, any page, a scratchpad, quick add, focus timer, agenda, week and month views, goals, habits, numbers, charts, deadlines, clock, headings and pictures, each in its own window on the desktop. Drag, resize, snap, lock, click-through, and keep them on the desktop, like a window or always on top.
- **Workspaces**: each one keeps its own panel layout. Switch from the sidebar, the Desktop page or the tray.
- **One surface everywhere**: clear glass, blur, frosted or solid for the whole app, or only for the desktop panels, in light and dark. Each panel can also have its own corners, tint, border, padding, size, font, text color and accent. Right-click a panel to lock it in place.
- **Appearance**: themes, accent, gradient or picture backgrounds, glass strength, blur, shadows, corner roundness, fonts, spacing, motion, page transitions and custom CSS. Export and share themes.
- **Pages** in a nested sidebar with a block editor: headings, to-dos, lists, toggles, quotes, callouts, code, tables and `/` commands.
- **Notion import** from the Notion app on your computer or an export, with pages that keep refreshing.
- **To-dos** with natural-language quick add, due dates, repeats, priorities, subtasks, tags and reminders.
- **Databases** with table, board, gallery, list and calendar views; **dashboards** you lay out yourself.
- **Habits, journal, goals, calendar, focus timer, trackers and values** that change on their own from rules.
- An optional **assistant** that runs locally (Ollama) or with your own API key.
- Undo/redo everywhere, command palette (`Ctrl K`), keyboard shortcuts (`Ctrl /`).

## Your data

Everything stays on your computer in `%APPDATA%\Deskbase\data`. Nothing is sent anywhere.

- Saved automatically and written atomically, so a crash can't leave a half-written file.
- A backup is made every day (the last 20 are kept), plus one before every import, restore or data upgrade.
- Updates never touch your data. When a new version changes the data format, it upgrades your file in place after backing it up.
- Export everything to JSON (and import it again), export tasks to CSV, or any page to Markdown.

## Development

```bash
npm install
npm run dev        # run the app with hot reload
npm run dev:web    # UI only, in a browser (data in localStorage)
npm run typecheck
npm run dist       # build an installer into dist/
```

Releasing: `npm run release -- patch` (or `minor` / `major`) bumps the version, tags it and pushes. GitHub Actions builds the installer and publishes the release; installed apps pick it up automatically.

## License

MIT
