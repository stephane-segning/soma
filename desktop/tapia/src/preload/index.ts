import { contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type {
  Exercise,
  ExerciseAttempt,
  ExerciseDraft,
  LeaderboardEntry
} from '../shared/exercise'

// Custom APIs for renderer
const api = {
  daemon: {
    listExercises: (spaceId: string): Promise<Exercise[]> =>
      electronAPI.ipcRenderer.invoke('daemon:list-exercises', spaceId) as Promise<Exercise[]>,
    saveExercise: (draft: ExerciseDraft): Promise<Exercise> =>
      electronAPI.ipcRenderer.invoke('daemon:save-exercise', draft) as Promise<Exercise>,
    recordSession: (
      attempt: ExerciseAttempt
    ): Promise<{ ok: true; leaderboard: LeaderboardEntry[] }> =>
      electronAPI.ipcRenderer.invoke('daemon:record-session', attempt) as Promise<{
        ok: true
        leaderboard: LeaderboardEntry[]
      }>
  },
  agent: {
    generateExercise: (input: {
      spaceId: string
      topic?: string
      difficulty?: ExerciseDraft['meta']['difficulty']
    }): Promise<ExerciseDraft> =>
      electronAPI.ipcRenderer.invoke('agent:generate-exercise', input) as Promise<ExerciseDraft>
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
