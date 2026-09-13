import { create } from 'zustand'

interface SettingsStore {
  simulationMode: boolean
  loaded: boolean
  load: () => Promise<void>
  setSimulationMode: (value: boolean) => Promise<void>
}

export const useSettings = create<SettingsStore>((set) => ({
  simulationMode: true,
  loaded: false,

  load: async () => {
    const value = await window.electronAPI.settings.get('simulationMode')
    set({ simulationMode: value !== false, loaded: true })
  },

  setSimulationMode: async (value: boolean) => {
    await window.electronAPI.settings.set('simulationMode', value)
    set({ simulationMode: value })
  },
}))
