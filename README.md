<p align="center"><img src="build/icon.png" width="96" alt=""></p>

<h1 align="center">Planner</h1>

<p align="center">A clean, local-first planner and life tracker for Windows.<br>Pages in a sidebar, to-dos, habits, journal, goals, a game library, and an RPG layer that turns your day into XP.</p>

## Install

Download `Planner-Setup-x.y.z.exe` from the [latest release](https://github.com/vptr-dev/planner/releases/latest) and run it. Planner updates itself: new versions download in the background and install the next time you restart the app.

> Windows may show a SmartScreen notice the first time because the installer is not code-signed. Choose **More info → Run anyway**.

## What's inside

- **Pages** in a collapsible, nested sidebar. Drag to reorder or nest, favorites, trash with restore, duplicate, Markdown export.
- **Notes** with a block editor: headings, to-dos, bullets, numbers, toggles, quotes, callouts, code, dividers, `/` menu and Markdown shortcuts.
- **To-do lists and boards** with natural-language quick add (`Pay rent tomorrow 5pm !high #home every month`), due dates, repeats, priorities, subtasks, tags, reminders, filters, sorting and grouping.
- **Today** view that pulls together what's due, your habits, focus timer and journal.
- **Calendar** with month and week views.
- **Habits** with a weekly grid, streaks, success rate and a 6-month heatmap. Build good habits or track days clean from bad ones.
- **Journal** with mood, energy, gratitude, search and "on this day".
- **Goals** with milestones or manual progress and deadlines.
- **Character**: levels, XP, gold, six attributes, 30+ achievements and an activity heatmap. Spend gold in your own **Rewards** shop.
- **Focus** timer (Pomodoro) that keeps running while you switch pages.
- **Game library**: status, platform, hours, completion, rating, play sessions and per-game goals.
- **Trackers** for anything: water, sleep, weight, steps, spending.
- Mica window, glass panels, light and dark themes, accent colors, text size, compact mode.
- Undo/redo everywhere, command palette (`Ctrl K`), keyboard shortcuts (`Ctrl /`).

## Your data

Everything stays on your computer in `%APPDATA%\Planner\data`. Nothing is sent anywhere.

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
