/// <reference types="vite/client" />

import type { ElectronAPI } from '@electron-toolkit/preload'
import type {
  Exercise,
  ExerciseAttempt,
  ExerciseDraft,
  LeaderboardEntry
} from '../../shared/exercise'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      daemon: {
        listExercises: (spaceId: string) => Promise<Exercise[]>
        saveExercise: (draft: ExerciseDraft) => Promise<Exercise>
        recordSession: (attempt: ExerciseAttempt) => Promise<{
          ok: true
          leaderboard: LeaderboardEntry[]
        }>
      }
      agent: {
        generateExercise: (input: {
          spaceId: string
          topic?: string
          difficulty?: ExerciseDraft['meta']['difficulty']
        }) => Promise<ExerciseDraft>
      }
    }
  }
}
