import { createContext } from 'react'
import type { MouseEvent } from 'react'
import type { MenuItem } from './ui'

export const WidgetItemMenu = createContext<((event: MouseEvent, title: string, actions: MenuItem[]) => void) | null>(null)
