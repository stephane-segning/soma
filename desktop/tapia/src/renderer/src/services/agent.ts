import type { ExerciseDraft } from '../../../shared/exercise'

type GenerateInput = {
  spaceId: string
  topic?: string
  difficulty?: ExerciseDraft['meta']['difficulty']
}

async function generateExercise(input: GenerateInput): Promise<ExerciseDraft> {
  return window.api.agent.generateExercise(input)
}

export { generateExercise }
