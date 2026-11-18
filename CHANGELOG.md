# Changelog

## Unreleased

## 0.5.0 — 2026-11-18

A new direction: Planner is now a blank, fully custom workspace.

- Removed the game layer: XP, levels, gold, quests, the item shop, rewards, the character page and the game library. Nothing is deleted: old game data is kept inside your data file, and the old Character and Games pages are in the trash.
- New installs start with an empty workspace.
- New look: floating glass panels, gradient backgrounds (sky, peach, lilac, mint, aurora, midnight, or your desktop with Mica) and glass text.
- Values: track any number you care about (money saved, pages read, reps, points). Change it by hand, or add rules so it moves on its own when you finish a task, check a habit, focus, write in your journal, log a tracker, complete a goal or change a database row. Values can reset daily, weekly or monthly and have goals.
- Databases: tables with text, number, select, multi-select, status, date, checkbox, URL and progress properties. Table, board, gallery, list and calendar views, each with its own filters, sort and visible properties. Every row opens as a full page.
- Dashboards: build your own page from widgets (values, charts, progress rings, stats, tasks, habits, database views, calendar, clock, notes, countdowns, focus timer, quick add, goals and page links). Drag to move, drag the corner to resize, pick 8 to 24 columns.
- Desktop widget: pin a dashboard to a second monitor. It covers that screen and stays on the desktop behind your windows (or always on top), see-through or with blurred glass, and clicks on empty space go through to the desktop. Set it up in Settings → Desktop widget.
- With "Start with Windows" on and the desktop widget or "Close to tray" turned on, Planner starts quietly in the tray.

## 0.4.0 — 2026-11-18

- Select several tasks with Ctrl or Shift click, then complete, reschedule, change priority, move or delete them together.
- "Move overdue to today" on to-do lists, the Today page and the weekly review.
- Quick add from anywhere: press Ctrl Shift Space (can be turned off in Settings), or use "Quick add task" in the command palette.
- Optional tray icon: with "Close to tray" on, closing the window keeps Planner running in the tray.
- New Weekly review page: tasks done per day, XP, habit rate, focus time, journal mood, games played, and a reflection note for each week.
- Countdowns on the Today page (trips, birthdays that repeat every year, launches). Wishlist games with a release date show up there too.
- Game library: cover images (choose, drop or paste), your own "time to beat" estimate with progress, last played on cards, and a 12-week play chart per game. The stats show how many hours your backlog still needs.
- Habits: month view with "don't break the chain" strips.
- Daily quests: reroll one quest a day for 15 gold.
- Item shop: XP potion (double XP for an hour).
- Pages can have a gradient cover.
- Pick any accent color with the new custom color option.

## 0.3.0 — 2026-11-18

- Game library: "What should I play?" picks a random game from your backlog.
- Game library insights: hours played per month, games started and finished per year, status, platform and genre breakdowns.
- Wishlist games can have a release date (with a countdown) and price notes. New sorts: last played and release date.
- Daily quests: three small challenges each day with XP and gold, plus a bonus chest for clearing all of them.
- Loot drops: finishing a task sometimes finds extra gold (can be turned off in Settings).
- Item shop with streak freezes that cover a missed habit day.
- Habits can now be "times per week", have a note for each day, and can be reordered by dragging.
- Smarter dates when adding tasks: "next friday", "in 2 weeks", "end of month", "this weekend", "dec 3", and more. Words like "month" no longer get read as Monday.
- Snooze tasks (tomorrow, this weekend, next week, next month) from the task panel or the new right-click menu on tasks.
- Calendar: agenda view, and drag tasks onto a day to reschedule them.
- Sidebar page filter, and a "Move to…" picker for pages.
- Goals can track progress from linked tasks; pick a goal in any task's panel.
- Journal: mood and energy chart for the last 30 days, a daily writing prompt, and an optional word goal.
- Focus: stopwatch mode and ambient noise (white, pink, brown).
- Trackers: 7-day, 30-day and 12-month charts with averages and weekly totals.
- Start with Windows option.
- Fixed: the focus timer display didn't count down while running.

## 0.2.0 — 2026-11-18

- Assistant panel (Ctrl+J) that works with a local model through Ollama or LM Studio, or with an OpenAI, Anthropic or custom API key.
- The assistant sees your tasks, habits, goals and the open page, and suggests tasks, pages, habits, goals and journal entries you can add with one click.
- API keys are stored encrypted on this computer.
- Import from Notion: pick pages straight from the Notion desktop app, or choose a Notion export (.zip, .md or .csv).
- Table block, and blocks nested inside toggles.

## 0.1.0 — 2026-11-18

First release.

- Nested pages in a collapsible, resizable sidebar with drag and drop, favorites, trash and duplicate.
- Block editor for notes with slash menu and Markdown shortcuts.
- To-do lists, boards, Today view and calendar.
- Habits, journal, goals, rewards, focus timer, game library and trackers.
- Character with levels, XP, gold, attributes and achievements.
- Mica window with glass panels, themes, accent colors and text size.
- Local storage with atomic saves, daily backups, import/export and automatic updates.
