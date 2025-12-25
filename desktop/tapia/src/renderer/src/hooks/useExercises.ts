import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Exercise, ExerciseAttempt, ExerciseDraft, LeaderboardEntry } from '../../../shared/exercise'
import { generateExercise } from '../services/agent'
import { listExercises, recordAttempt, saveExercise } from '../services/daemon'

type ExercisesState = {
  exercises: Exercise[]
  leaderboard: LeaderboardEntry[]
  status: 'idle' | 'loading' | 'ready' | 'error'
  error?: string
}

function useExercises(spaceId?: string) {
  const [state, setState] = useState<ExercisesState>({
    exercises: [],
    leaderboard: [],
    status: 'idle'
  })

  const refresh = useCallback(async () => {
    if (!spaceId) return
    setState((prev) => ({ ...prev, status: 'loading' }))
    try {
      const exercises = await listExercises(spaceId)
      setState((prev) => ({ ...prev, exercises, status: 'ready', error: undefined }))
    } catch (error) {
      setState((prev) => ({
        ...prev,
        status: 'error',
        error: error instanceof Error ? error.message : 'unknown error'
      }))
    }
  }, [spaceId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const createFromAgent = useCallback(
    async (input?: { topic?: string; difficulty?: ExerciseDraft['meta']['difficulty'] }) => {
      if (!spaceId) throw new Error('spaceId is required to create an exercise')
      const draft = await generateExercise({ spaceId, topic: input?.topic, difficulty: input?.difficulty })
      const saved = await saveExercise(draft)
      setState((prev) => ({
        ...prev,
        exercises: [saved, ...prev.exercises],
        status: 'ready'
      }))
      return saved
    },
    [spaceId]
  )

  const recordSession = useCallback(
    async (attempt: ExerciseAttempt) => {
      if (!spaceId) return []
      const leaderboard = await recordAttempt(attempt)
      setState((prev) => ({ ...prev, leaderboard }))
      return leaderboard
    },
    [spaceId]
  )

  const targetExercise = useCallback(
    (exerciseId?: string) => state.exercises.find((exercise) => exercise.meta.id === exerciseId),
    [state.exercises]
  )

  return useMemo(
    () => ({
      ...state,
      refresh,
      createFromAgent,
      recordSession,
      findExercise: targetExercise
    }),
    [state, refresh, createFromAgent, recordSession, targetExercise]
  )
}

export { useExercises }
