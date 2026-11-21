<p align="center"><img src="build/icon.png" width="96" alt=""></p>

<h1 align="center">Deskbase</h1>

<p align="center">Your pages, tasks and notes as panels on the Windows desktop.</p>

## Install

Download `Deskbase-Setup-0.19.0.exe` from the [latest release](https://github.com/vptr-dev/deskbase/releases/latest), run it and follow the steps. If SmartScreen appears, choose **More info → Run anyway**. Deskbase updates itself.

## What's inside

- **Desktop panels** that live on the desktop like Rainmeter skins (no taskbar buttons, not in Alt+Tab): tasks, pages (or just today's part), clocks in many styles, world clock, timers, stopwatch, sunrise and sunset, weather, moon, system use, network speed, battery, calculator, recent pages, database charts, activity heatmap, deadlines, launcher, web search, study progress, table totals, month and more. Each has its own styles and parts to show or hide; set one up with a live preview before adding it. Move, resize, lock and group them.
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
