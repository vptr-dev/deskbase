# Changelog

## Unreleased

## 0.27.0 - 2026-11-28

- Added study planning, diagram masks, missed-card practice, confidence tracking, printable sheets, and timed past papers.
- Added project labs for component inventory, missing parts, pin assignments, annotated photos, sensor readings, comparisons and design-review exports.

## 0.26.0 - 2026-11-28

- Named wishlist categories and filters, purchase and variant details, price history, shared savings allocation and printable gift shortlists.
- Collections support configurable fields, runs, CSV mapping, borrowing notes, series, and bulk moves with undo.
- Restore individual removed items, preview exports and inspect local storage usage.

## 0.25.0 - 2026-11-28

- Recurring tasks support date exceptions, household rotation, completion-based intervals and one-off moves.
- Tasks support energy filters, timed subtasks and project deferral.
- Combined calendars label overlaps, estimate capacity, show travel buffers and find shared free time. Cancelled events can become reminders.

## 0.24.0 - 2026-11-28

- Workspace stepper with direct selection, landing pages, navigation history, quiet hours and archived workspaces.
- Save and compare panel arrangements, preview a destination, and show one panel in selected workspaces.
- Custom theme preview and editable presets. Launchers support bundles, folder browsing, shortcut import, search scopes and recent files.

## 0.23.0 - 2026-11-28

- Create editable documents with embedded tools. Insert blocks from their context menu, reuse snippets, compare paragraph revisions, move by keyboard and paste table ranges.
- Added creative projects for visual references, draft and sketch comparisons, production lists, unfinished experiments and short local voice notes.
- Compact widget action menus support type-ahead, scrolling and right-click dismissal.

## 0.22.0 - 2026-11-27

- Added workspace switcher panels and categorized folder and search launchers. Preserved compact window bounds.
- Added named collections, reusable schedules and views, calendar overlays, task entry controls, custom themes, database forms and connection authorization options.

## 0.21.1 - 2026-11-26

- Recovery checks older backups when a newer snapshot is damaged. Unreadable workspaces and files saved by a newer version are preserved on disk.
- Restart tests verify that compact desktop panels reopen at the exact saved size and position.

## 0.21.0 - 2026-11-26

- Added named list and study pages with live widgets, quantity targets, flashcards and scheduled reviews.
- Added category galleries, picture and product-link fields, priority and a purchased board to wishlists.
- Added named sources for list-based widgets and stable table selection. Desktop action menus survive transient focus changes.

- Added reading and workout logs, spreadsheet flashcard import, task dependencies, keyboard navigation, calendar countdowns, a sidebar calendar, and weekly comparisons and Markdown export.
- Added workspace scheduling, shared panels, page tabs in panels, page accents, print, Markdown import, tag editing, and configurable shortcuts.
- Added optional password protection for workspace data, history, images and backups. Large pictures are stored separately from the live document.

### Panel menu changes included from the previous release candidate

- Replaced the native panel menu with a scrollable, themed action menu for desktop panels, dashboard cards and live widget embeds.
- Locked panels keep item actions, task entry and timer controls. The task form can create the first planner when needed.
- Added connection refresh, item-to-task capture, saved bookmarks and linked widget blocks in documents.

## 0.20.0 - 2026-11-22

- Added named task planners, saved views with panel support, linked or fresh layout templates, and multi-step buttons with grouped undo.
- Unified the sidebar with the window and added sidebar icon, section label and to-do color controls.
- Desktop and dashboard panels adapt to their available space. Locked desktop panels keep content controls and task menus available.
- Blur panels retain a decoded wallpaper across capture failures and brief black frames.
- Added a repeat schedule picker and row-level schedule editing to task panels.
- Added tracker panels, a calories preset, and wishlist pages and widgets with shared budgets and purchase history.
- Custom buttons on pages and panels can create tasks, show or hide sections, and change values.

## 0.19.0 - 2026-11-21

- Added an erase confirmation dialog with cancel and backup checks. Restored the floating sidebar and added workspace icon colors and removal.
- Fixed cover hover controls. Removed task-entry examples, suggestion chips and empty list decorations.
- Added a visible block picker, draggable in-page tabs, up to 12 columns, cross-section block movement, multi-selection and linked tool insertion from existing pages.
- Added 34 configurable connection panels spanning work accounts, coding sessions, developer services and research catalogs.

## 0.18.0 - 2026-11-21

- Added inline planner calendars and workspace tools to document blocks, plus linked views of existing tools.
- Updated the workspace layout and added a keyboard-accessible application menu in the top-left corner.

- Added Project pages with local task lists and a Trello board connection. Create cards, move them between lists, and refresh the board from the project.

- Tasks and habits support custom intervals, selected weekdays, start dates and optional end dates. Quick add understands phrases such as “every 3 weeks on Mon and Thu”.
- Added reminders relative to the due time, custom snooze intervals, and per-calendar weekday, agenda, density and visibility controls.

- Settings opens as a workspace page with section navigation, tab history, and a single scrollbar for all preferences.
- Appearance and desktop panel controls adapt to the available workspace. The panel picker can scroll through its setup controls in compact windows.

## 0.17.1 — 2026-11-21

- Fixed: with notifications on, a page with a reminder date could make the app stop responding.

## 0.17.0 — 2026-11-20

- Formatting bar over selected text in pages: bold, italic, strike-through, code, link, six text colors and highlight. Ctrl B, Ctrl I, Ctrl Shift X, Ctrl E, Ctrl K and Ctrl Shift H work too.
- Reminders: a date with a time in a page (type @ and a time such as 14:30, or pick Remind in an hour) shows a notification at that time, and a dated to-do reminds you at 9:00 that day until it is checked.
- Month panel looks: the grid with calendar events and today's events listed, a strip of the next days, and a big date with the month beside it.
- Countdown looks: a clock with days, hours, minutes and seconds (with a time of day), a ring and a bar that fills up from a start date.
- The System panel can show network speed.
- Long pages type and scroll much faster: only the line you are writing in is redrawn.

## 0.16.0 — 2026-11-20

- Mail: connect Gmail, iCloud, Yahoo, Fastmail or any IMAP inbox with an app password. An Inbox panel shows the unread count and the latest messages; click one to open it in the browser (Gmail opens the message itself).
- Todoist: connect with your API token. A Todoist panel shows what is due today, this week or everything, and checks tasks off in Todoist.
- Now playing: a panel with what Spotify, your browser or any player is playing, with the cover, progress and play, pause, next and previous. No setup.
- The assistant can look at your connections: unread mail, GitHub issues and pull requests, news feeds, Todoist tasks and what is playing.

## 0.15.0 — 2026-11-20

- Connections page: add, check, pause and remove connections to calendars, news feeds, GitHub and Notion. Each shows when it was last checked and what came in.
- Calendars from Google, Outlook or Apple through their ICS link: events (repeating ones included) show on the Calendar page, in the Agenda panel and in a new Events panel, each calendar in its own color. The assistant sees them too.
- News feeds: any RSS or Atom feed in a News feed panel, with summaries.
- GitHub: open issues and pull requests of chosen repositories, or everything assigned to you with a token, in a GitHub panel.
- Notion through an integration token: add pages and databases shared with it and they stay in sync every 15 minutes (or Refresh now). Checking a to-do or a checkbox property here checks it in Notion too.
- Tokens are encrypted on this computer and never go into exports.

## 0.14.0 — 2026-11-20

- Assistant page with every chat on the side: search them, rename, pin and delete. The side panel (Ctrl J) shows the same chats over any page and can open as a page.
- Each chat picks its own provider and model at the top: Ollama and LM Studio on this computer, Anthropic, OpenAI, Google Gemini, OpenRouter or any OpenAI-compatible server. Keys are kept per provider, encrypted on this computer.
- The assistant looks things up on its own: it searches your pages, reads a page or database, lists your tasks and checks the calendar before it answers, and shows what it read.
- Access: Nothing, Read, Ask first (changes wait for Do it) or Do it (changes happen right away, with undo). It can add, finish and change tasks, add database rows, write into pages, rename pages and add habits, goals and journal entries.
- Roles for a chat (Planner, Writer, Study coach, Brainstorm, or your own), About you instructions sent with every chat, answer length, creativity for models that take it, and how hard Claude models think.
- Stop an answer while it is being written, and answer again.

## 0.13.0 — 2026-11-20

- Blur and Frosted panels have rounded corners: they blur what is behind them inside their own shape instead of Windows blurring a square around them. How much they blur is a setting of its own (Background → Blur amount).
- Settings is one page with an index on the side; click a heading to go there. Appearance is no longer in Settings.
- Appearance has two places, App and Desktop panels, each with its own index on the side. Everything about how desktop panels look (looks, background, edges, text and titles, spacing, snapping) is under Desktop panels.
- Desktop page: a panel's settings open right under it in the list, and every panel has settings, hide, duplicate and remove buttons on its row. Delete removes the selected panel (with undo). The style every panel shares now lives only in Appearance.
- Adding a panel: search, categories and a live preview. Set up what it shows, its look, its size and the screen before it goes on the desktop; Add another keeps the picker open, and a double click adds one straight away.
- Right-click a panel for Look (any ready-made look, or back to the shared style) and Add panel.
- Databases: Relation properties link rows to rows of any database, Rollups show a count, sum, average, smallest, largest, percent checked, earliest or latest of the linked rows, and Formulas work things out from the other properties (prop("Price") * 2, if(), dateBetween(), round() and more), with the result shown as you type.
- Timeline view: rows as bars from a start date to an end date; drag a bar to move it and its end to make it longer. Weeks, months or quarters.
- Chart view: rows as bars, sideways bars, a line or a donut, split by any property, counting rows or adding up a number.
- Templates: mark any page as a template and start new pages from it; databases have row templates under the arrow next to New.
- Page history: every page keeps its earlier versions; open Page history from the page menu to look at one and restore it.
- Notion import brings relations over as real links and timeline views as timelines.
- New panels: Database chart, Activity (a heatmap of the days you got things done, with your streak) and Coming up (deadlines, due tasks and dated rows with the days left).

## 0.12.0 — 2026-11-20

- Desktop panels are now part of the desktop, like Rainmeter skins: no taskbar buttons, not in Alt+Tab, left alone by window tools such as Snowhush, and still there after Show desktop. If Explorer restarts they come back on their own. Panels that had been hidden by closing them from the taskbar are shown again.
- The app is called Deskbase everywhere in Windows.
- Panels that lost their page after a Notion page was imported again find it again, and importing a page that is already here updates it in place instead of adding a copy (extra copies from earlier imports go to the trash).
- Tabs block, like Notion's: each tab holds its own blocks. Add, rename (double click), reorder and delete tabs; unwrap them into headings.
- Inline databases: a database right inside a page, with its views, filters and New button.
- Callouts have their own icon. Columns keep their widths. Columns and tabs can sit inside each other.
- *Italic*, ~~strike-through~~ and [named links](https://example.com) show formatted, as well as **bold** and `code`.
- Covers can be a picture from a link or from your computer.
- Notion import keeps far more: tabs, columns with their widths, toggle headings, callout icons, text and background colors, bold, italic, strike-through, code and links, page mentions and dates as links, equations, tables of contents, bookmarks, embeds and videos, web images, links to pages, covers and full width. Notion databases come in as real databases with their properties, options and colors, views (table, board, gallery, list, calendar) with their filters, sorting, grouping, hidden properties and column widths, and every row with its own content.
- Database rows with a date show up in the Tasks and Agenda panels; tick them off from there when the database has a checkbox or a Done status.
- Panels see inside columns and tabs: a Page, Checklist, Progress by section or Table panel can use a tab's name or a heading inside columns.
- New panels: Network (download and upload speed with a live graph), Calculator and Recent pages.
- Select options are easier to read on glass.

## 0.11.1 — 2026-11-20

- Page icons are optional: a page without one shows only its title, with Add icon and Add cover appearing while you point at the top of the page.
- Softer text: the default text color is a soft charcoal instead of black, with a choice of tones (default, soft, ink, warm, cool or your own color for light and dark mode) and a Soft edges setting that softens the edges of letters, in Appearance → Text.
- Lines can have a text color and a background color. Backgrounds fade out at the edges instead of ending in a hard box.
- Each line has a + and a handle in the margin to its left, so they never cover text or checkboxes. + adds a line below with the block menu open (Alt adds it above); the handle moves the line or opens its menu with Turn into, text color and background.
- Selection box: hold the mouse on an empty part of a page and drag to select lines. Delete, Ctrl C, Ctrl X, Ctrl D, Tab and the arrow keys work on the selection; dragging or a menu on one selected line acts on all of them. Ctrl A selects every line when no line is being edited.

## 0.11.0 — 2026-11-20

- Tabs: open pages in tabs with Ctrl T, close with Ctrl W, switch with Ctrl Tab, bring back a closed tab with Ctrl Shift T. Ctrl click or middle click opens a page in a new tab from the sidebar, breadcrumbs, search, links and subpages. Tabs can be dragged to reorder and come back when the app starts. Each tab keeps its own back and forward.
- An empty tab shows recent pages, favorites and top pages to jump to.
- New blocks: 2 and 3 columns, toggle headings, table of contents, link to page, bookmark (with the page's title, description and icon), image (upload, paste or link, with caption and width), embed (YouTube, Vimeo, Spotify, Figma, Loom, CodePen, Google Docs and Maps or any page), equation, button (open a link or page, or add to-dos) and synced blocks (copy one, paste it on another page, and edits show in both).
- Divider styles: line, dashed, dotted, thick, fade or space only.
- Links between pages: type [[ to link a page by name, @ for dates (today, tomorrow or any date). Links show as chips; a link to a page that does not exist yet creates it. Renaming a page updates the links to it.
- Web links, **bold** and `code` show formatted while you are not editing a line.
- Backlinks: every page lists the pages that link to it.
- Pasting an image into a page adds it as an image block.
- Page text now lines up with the page title.

## 0.10.1 — 2026-11-20

- The window can be dragged from the empty top of the sidebar, the section headings, the empty space below the pages, the whole top bar between buttons and the window edges. A hidden canvas used for the task celebration no longer blocks dragging.
- The app checks for updates every few hours while it stays open, not only at start.

## 0.10.0 — 2026-11-20

- Clock styles: ring, digital, stacked, minimal, analog (classic, minimal, numbers or dots), flip, bars, words and a 24-hour sun dial. Any clock can show another time zone, with 12 or 24 hours, seconds, date and date format to choose.
- New panels: world clock (list, cards or analog), stopwatch with laps, time left in the day, week, month and year, moon phase, launcher for websites, apps, files and folders, web search, a line of words to keep in mind, and battery.
- Daylight styles: curve, arc, day bar or just the times, with day length and the change since yesterday.
- Weather styles: days, hourly, detailed (feels like, humidity, wind, rain) or compact.
- System styles: rings, bars, big numbers or a live graph, with uptime.
- Timer looks: dial, bar or text.
- Panels show toggles for each part they can show or hide, and every panel can pick one of the ready-made looks.

## 0.9.0 — 2026-11-20

- New window buttons drawn by the app: they match light and dark mode and every surface, and no longer leave filled corners with blur or frosted.
- Back and forward are instant, and big pages open many times faster (a large Notion page went from about 2 seconds to under a tenth of a second).
- The desktop panels have their own look, apart from the app: nine ready-made looks (clear glass, blur, frosted, outline, solid, midnight, paper, minimal or matching the app) and settings for background, tint, borders, border width, border color, corners, text color and title style, in Appearance and on the Desktop page.
- Each panel can also set its own border width, border color and title style.
- The scrollbar shows only while the pointer is over the page.

## 0.8.1 — 2026-11-20

- New installer: a welcome page, choose the install folder, and start Deskbase when it finishes. It always installs for your account only.

## 0.8.0 — 2026-11-20

- Desktop panels behave like desktop skins: they sit under every window, clicking one never brings it forward, and they no longer stay on top. Typing in a panel and its right-click menu still work. They remain normal windows, so desktop effects like falling snow still land on them.
- Every card is its own panel. A full-screen dashboard from earlier versions is split into separate panels you can move one by one.
- New panels: ring clock, sunrise and sunset, weather (no account or key, set your place in Settings), system use (CPU, memory, disk), one-click timers, study progress by section, and table totals with the next charge date.
- Month panel with a Today list beside the calendar.
- Desk set: one click adds a column with clock, daylight, month, weather, system and 1, 5, 15 and 30 minute timers, each a separate panel.
- Combine panels: right-click to join touching panels into a group that moves together, or separate them again.
- Drag a panel from anywhere, buttons included; a click still works as a click.
- Page panels can show only today's part of a page, for example today's plan or today's workout.
- Borders follow the style: a Borders strength slider and border width (none, thin, medium, thick) in Appearance, for the app and the panels.
- Deskbase starts with Windows by default (turn it off in Settings), and opening the app brings its window to the front.
- Time format follows your system clock for new setups.
- Fixed panel layouts at small sizes: quick add, week numbers, system rings and more now scale with the panel.

## 0.7.0 — 2026-11-19

- One look everywhere: windows, cards and desktop panels share the same surface. The new default is clear glass with a light edge (the 0.5 desktop look), in light and dark.
- Surface setting in Appearance (and Settings): Glass, Blur, Frosted or Solid for the whole app, with an option to give the desktop panels their own surface, for example blur only on the panels.
- Panels follow the app's surface unless you pick one for a panel ("Match app" is the new default). Glass is also available per panel.
- Right-click a desktop panel for its options: lock or unlock movement, edit, refresh from Notion, where it stays, click-through, arrange, lock all panels, duplicate, hide, remove. Cut, copy and paste when you right-click text. Locked panels hide their resize handle.
- Removed the refresh button in the top-right corner of Notion panels; it is in the right-click menu now.

## 0.6.0 — 2026-11-19

The app is now **Deskbase**: your pages, tasks and notes as glass panels on the Windows desktop.

- Desktop panels: put tasks, checklists, any page (Notion imports included), a scratchpad, quick add, focus timer, agenda, week, month, goals, habits, numbers, charts, deadlines, a clock, a heading or a picture right on your desktop. Each panel is its own window: drag it, resize it, snap it to screen edges and other panels (hold Alt to place freely), lock it, let clicks pass through, keep it on the desktop, like a window, or always on top. Right-click a panel for its options.
- Real glass on the desktop: blurred or frosted backgrounds that stay blurred when you click elsewhere, a solid tint, or fully see-through, with rounded corners, tint color and strength, border, padding, size, text color, accent, font, light or dark per panel.
- Workspaces: each workspace keeps its own set of panels on the screen. Switch from the top of the sidebar, the Desktop page or the tray menu; start a new one empty or from the current layout.
- Desktop page: a map of your screens to place panels, a live preview, and settings for content, style and placement. Arrange mode lets you move and resize panels right on the desktop.
- Pages imported from the Notion app keep their link and refresh on start and every 30 minutes; checks you made here are kept. Panels showing a Notion page have a refresh button.
- Appearance page: 12 themes, accent color, 14 backgrounds including your own gradient or a picture (with blur and dim), glass strength, blur, color, edge shine, shadow depth, corner roundness, floating or attached sidebar, icon weight, any installed font for text and headings, heading weight, line height, letter spacing, motion level, page transitions and custom CSS. Themes can be exported and imported.
- Line icons everywhere instead of emoji, with a searchable icon picker and icon colors. Existing emoji icons are converted automatically.
- Smoother everything: page transitions, springy menus, dialogs and toasts, animated checkmarks and toggles.
- Text on accent-colored buttons switches between white and dark so it stays readable with light accents.
- The workspace name and avatar in the sidebar are replaced by the workspace switcher.
- New app icon.
- Your data moves over by itself: the data folder becomes %APPDATA%\Deskbase and is upgraded in place after a backup.

## 0.5.0 — 2026-11-18

A new direction: the app is now a blank, fully custom workspace.

- Removed the game layer: XP, levels, gold, quests, the item shop, rewards, the character page and the game library. Nothing is deleted: old game data is kept inside your data file, and the old Character and Games pages are in the trash.
- New installs start with an empty workspace.
- New look: floating glass panels, gradient backgrounds (sky, peach, lilac, mint, aurora, midnight, or your desktop with Mica) and glass text.
- Values: track any number you care about (money saved, pages read, reps, points). Change it by hand, or add rules so it moves on its own when you finish a task, check a habit, focus, write in your journal, log a tracker, complete a goal or change a database row. Values can reset daily, weekly or monthly and have goals.
- Databases: tables with text, number, select, multi-select, status, date, checkbox, URL and progress properties. Table, board, gallery, list and calendar views, each with its own filters, sort and visible properties. Every row opens as a full page.
- Dashboards: build your own page from widgets (values, charts, progress rings, stats, tasks, habits, database views, calendar, clock, notes, countdowns, focus timer, quick add, goals and page links). Drag to move, drag the corner to resize, pick 8 to 24 columns.
- Desktop widget: pin a dashboard to a second monitor. It covers that screen and stays on the desktop behind your windows (or always on top), see-through or with blurred glass, and clicks on empty space go through to the desktop. Set it up in Settings → Desktop widget.
- With "Start with Windows" on and the desktop widget or "Close to tray" turned on, the app starts quietly in the tray.

## 0.4.0 — 2026-11-18

- Select several tasks with Ctrl or Shift click, then complete, reschedule, change priority, move or delete them together.
- "Move overdue to today" on to-do lists, the Today page and the weekly review.
- Quick add from anywhere: press Ctrl Shift Space (can be turned off in Settings), or use "Quick add task" in the command palette.
- Optional tray icon: with "Close to tray" on, closing the window keeps the app running in the tray.
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
