import type {
  Exercise,
  ExerciseAttempt,
  ExerciseDraft,
  LeaderboardEntry
} from '../../../shared/exercise'

async function listExercises(spaceId: string): Promise<Exercise[]> {
  return window.api.daemon.listExercises(spaceId)
}

async function saveExercise(draft: ExerciseDraft): Promise<Exercise> {
  return window.api.daemon.saveExercise(draft)
}

async function recordAttempt(attempt: ExerciseAttempt): Promise<LeaderboardEntry[]> {
  const response = await window.api.daemon.recordSession(attempt)
  return response.leaderboard
}

export { listExercises, saveExercise, recordAttempt }
