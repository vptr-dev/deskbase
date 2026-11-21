import type { Page } from '../types'
import { BoardPage, TasksPage } from './TasksPage'
import { HabitsPage } from './HabitsPage'
import { JournalPage } from './JournalPage'
import { GoalsPage } from './GoalsPage'
import { CalendarPage } from './CalendarPage'
import { FocusPage } from './FocusPage'
import { TrackerPage } from './TrackerPage'
import { TodayPage } from './TodayPage'
import { ReviewPage } from './ReviewPage'
import { DatabasePage, DatabaseView } from './DatabasePage'
import { DashboardPage } from './DashboardPage'
import { ProjectPage } from './ProjectPage'

export function ToolBody({ page, embedded = false }: { page: Page; embedded?: boolean }): JSX.Element | null {
  switch (page.type) {
    case 'today': return <TodayPage pageId={page.id} />
    case 'tasks': return <TasksPage pageId={page.id} />
    case 'project': return <ProjectPage page={page} />
    case 'board': return <BoardPage pageId={page.id} />
    case 'calendar': return <CalendarPage pageId={page.id} />
    case 'habits': return <HabitsPage pageId={page.id} />
    case 'journal': return <JournalPage pageId={page.id} />
    case 'goals': return <GoalsPage pageId={page.id} />
    case 'focus': return <FocusPage />
    case 'tracker': return <TrackerPage pageId={page.id} />
    case 'review': return <ReviewPage pageId={page.id} />
    case 'database': return embedded ? <DatabaseView dbId={page.id} embedded /> : <DatabasePage pageId={page.id} />
    case 'dashboard': return <DashboardPage pageId={page.id} />
    default: return null
  }
}
