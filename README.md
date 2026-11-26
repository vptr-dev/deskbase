<p align="center"><img src="build/icon.png" width="96" alt=""></p>

<h1 align="center">Deskbase</h1>

<p align="center">Your pages, tasks and notes as panels on the Windows desktop.</p>

## Install

Download `Deskbase-Setup-0.21.1.exe` from the [latest release](https://github.com/vptr-dev/deskbase/releases/latest), run it and follow the steps. If SmartScreen appears, choose **More info → Run anyway**. Deskbase updates itself.

## Study and tracking

Create a Study deck for each subject. Paste two columns of questions and answers, then review cards as they come due. List trackers support quantity targets, reading lists remember your page, and workout logs can repeat a previous session. Panels can share a named source or point to separate ones. Wishlist and Purchased use the same items, with category, priority, pictures, links and spending totals.

Under Settings → Data & backups you can import Markdown files, rename tags and enable a workspace password. Keep the password somewhere safe. JSON exports remain readable outside Deskbase.

## What's inside

- **Desktop panels** that live on the desktop like Rainmeter skins (no taskbar buttons, not in Alt+Tab): tasks, pages (or just today's part), clocks in many styles, world clock, timers, stopwatch, sunrise and sunset, weather, moon, system use, network speed, battery, calculator, recent pages, database charts, activity heatmap, deadlines, launcher, web search, study progress, table totals, month and more. Each has its own styles and parts to show or hide; set one up with a live preview before adding it. Move, resize, lock and group them.
- **Named lists and study decks**. Create a List tracker for quantities or reading progress, or a Study deck for question-and-answer cards. Review due cards by subject, reveal an answer and schedule another review. Pages, inline tools and widgets share the same records.
- **Wishlist galleries and purchases**. Filter wish cards by category, attach a picture or product link, and set priority and price. Purchased items share the same records and appear on a board with category totals.
- **Named planners and saved views**. Open To-do and choose **New planner** for a separate Work or Home list. Choose **Add view** to keep filters, sorting, grouping and visible fields in a named tab. Task panels can follow a saved view.
- **Reusable layouts**. Mark a page with **Use as a template**, then pick it in **New page**. For desktop panels, use **Desktop > Layout templates**. Choose linked lists to share updates or fresh lists to start independently.
- **Multi-step buttons**. Choose **Add step** in a button's settings. A purchase button can mark an item bought, deduct its price from a value and write a dated expense to a page. Undo reverses the data changes together.
- **Recurring tasks on panels**. Use the repeat icon next to **Add a task** to choose an interval, weekdays and an optional end date. Right-click a task to edit its schedule.
- **Wishlist and purchases**. Add a Wishlist page, insert one into a document or select it in a desktop or dashboard widget. Enter prices, track a budget and move items between Wishlist and Purchased.
- **Tracker panels**. Pick a tracker such as water or calories and log directly to the same history as the tracker page.
- **Custom buttons**. Insert a button on a page, add a button panel or enable **Custom button** in another widget. Buttons can reveal a toggle, change or set a value, add to-dos, create a task, or open a page or link.
- **Widget actions**. Right-click a panel for actions on the selected item, followed by widget actions and desktop controls. Locked panels still support task entry, timer controls and connection actions. Save a feed item to a page, turn it into a task or embed a live widget with **Embed widget in page**. Type `/linked widget` in a document to choose an existing widget.
- **Panel locking**. Lock a panel from its right-click menu. Its content stays interactive. Open **Desktop** to unlock panels.
- **Workspaces**, each with its own panel layout.
- **Appearance**: glass, blur, frosted or solid, light and dark, borders, fonts, text tone and colors, with its own section for the desktop panels.
- **Application menu** in the upper-left corner for files, editing, views, history, windows and keyboard shortcuts.
- **Inline tools** on normal pages. Use **Insert block** for a tool, tabs or up to 12 columns. Drag blocks between sections or use **Add to a normal page** on an existing tool. Type `/planner` for a calendar, `/tasks` for a to-do list, or `/existing tool` to work with a tool you already use. Place notes, headings and tools together inside pages, columns or tabs.
- **Projects** with local tasks and linked Trello boards. Create cards and move them between lists. Tasks and habits support custom repeat intervals and weekdays.
- **Pages** in tabs, with a formatting bar (colors and highlight), reminders from dates in the text, columns, tabs blocks, inline databases, toggle headings, links between pages, backlinks, bookmarks, images, embeds, equations, buttons and synced blocks.
- **Page history and templates** for pages and database rows.
- **Assistant** in a side panel (Ctrl J) or a page of its own: chats with history, a provider and model per chat (Ollama, LM Studio, Anthropic, OpenAI, Gemini, OpenRouter), roles, and access from read-only to making changes with undo.
- **Connection panels** for 34 additional services including Trello, Asana, Linear, ClickUp, Slack, Dropbox, Figma and research catalogs. Set the source, row count, summaries and text filter per panel. Codex CLI and Claude Code panels read recent local session indexes and copy resume commands. Account connections require credentials from the provider.
- **Connections**: Google, Outlook and Apple calendars, mail (IMAP), Todoist, RSS feeds, GitHub issues and pull requests, and Notion pages and databases kept in sync, with panels for each, plus a Now playing panel.
- **To-dos, databases** (relations, rollups, formulas; table, board, gallery, list, calendar, timeline and chart views), **habits, journal and goals**, with **Notion import** that keeps tabs, columns, colors, formatting and real databases with their views.

## Your data

Everything stays on your computer in `%APPDATA%\Deskbase\data`, saved automatically with daily backups. Weather panels look up only the place you set; bookmarks and embeds load only the addresses you add. The assistant sends a chat only to the provider that chat uses; local models keep it on this computer. Connections talk only to the services you add.

## Development

```bash
npm install
npm run dev        # app with hot reload
npm run dev:web    # UI only, in a browser
npm run typecheck
npm run release -- patch   # or minor / major
```

## License

MIT
