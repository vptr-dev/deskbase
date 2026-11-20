<p align="center"><img src="build/icon.png" width="96" alt=""></p>

<h1 align="center">Deskbase</h1>

<p align="center">Your pages, tasks and notes as panels on the Windows desktop.</p>

## Install

Download `Deskbase-Setup-x.y.z.exe` from the [latest release](https://github.com/vptr-dev/deskbase/releases/latest), run it and follow the steps. If SmartScreen appears, choose **More info → Run anyway**. Deskbase updates itself.

## What's inside

- **Desktop panels** that live on the desktop like Rainmeter skins (no taskbar buttons, not in Alt+Tab): tasks, pages (or just today's part), clocks in many styles, world clock, timers, stopwatch, sunrise and sunset, weather, moon, system use, network speed, battery, calculator, recent pages, database charts, activity heatmap, deadlines, launcher, web search, study progress, table totals, month and more. Each has its own styles and parts to show or hide; set one up with a live preview before adding it. Move, resize, lock and group them.
- **Workspaces**, each with its own panel layout.
- **Appearance**: glass, blur, frosted or solid, light and dark, borders, fonts, text tone and colors, with its own section for the desktop panels.
- **Pages** in tabs, with columns, tabs blocks, inline databases, toggle headings, links between pages, backlinks, bookmarks, images, embeds, equations, buttons and synced blocks.
- **Page history and templates** for pages and database rows.
- **To-dos, databases** (relations, rollups, formulas; table, board, gallery, list, calendar, timeline and chart views), **habits, journal and goals**, with **Notion import** that keeps tabs, columns, colors, formatting and real databases with their views.

## Your data

Everything stays on your computer in `%APPDATA%\Deskbase\data`, saved automatically with daily backups. Weather panels look up only the place you set; bookmarks and embeds load only the addresses you add.

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
