import { create } from 'zustand'
import type { StepResult } from '../verification'

interface AuditLogStore {
  steps: StepResult[]
  addStep: (step: StepResult) => void
  clearSteps: () => void
  exportAsJson: () => string
}

export const useAuditLog = create<AuditLogStore>((set, get) => ({
  steps: [],
  addStep: (step) => set((state) => ({ steps: [...state.steps, step] })),
  clearSteps: () => set({ steps: [] }),
  exportAsJson: () => JSON.stringify(get().steps, null, 2),
}))
