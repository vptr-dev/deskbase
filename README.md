<p align="center"><img src="build/icon.png" width="96" alt=""></p>

<h1 align="center">Deskbase</h1>

<p align="center">Your pages, tasks and notes as panels on the Windows desktop.</p>

## Install

Download `Deskbase-Setup-x.y.z.exe` from the [latest release](https://github.com/vptr-dev/deskbase/releases/latest), run it and follow the steps. If SmartScreen appears, choose **More info → Run anyway**. Deskbase updates itself.

## What's inside

- **Desktop panels** that sit under your windows: tasks, pages (or just today's part), clocks in many styles, world clock, timers, stopwatch, sunrise and sunset, weather, moon, system use, battery, launcher, web search, study progress, table totals, month and more. Each has its own styles and parts to show or hide. Move, resize, lock and group them.
- **Workspaces**, each with its own panel layout.
- **Appearance**: glass, blur, frosted or solid, light and dark, borders, fonts and colors, with a separate look for the desktop panels.
- **Pages** in tabs, with columns, toggle headings, links between pages, backlinks, bookmarks, images, embeds, equations, buttons and synced blocks.
- **To-dos, databases, habits, journal and goals**, with **Notion import**.

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
