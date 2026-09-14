import { create } from 'zustand'

interface SettingsStore {
  simulationMode: boolean
  aynAbxyLayout: 'Xbox' | 'Nintendo'
  aynTriggerMode: 'Analog' | 'Digital'
  firmwareUpdateWaitSeconds: number
  importFolder: string
  romsParallelism: number
  loaded: boolean
  load: () => Promise<void>
  setSimulationMode: (value: boolean) => Promise<void>
  setAynAbxyLayout: (value: 'Xbox' | 'Nintendo') => Promise<void>
  setAynTriggerMode: (value: 'Analog' | 'Digital') => Promise<void>
  setFirmwareUpdateWaitSeconds: (value: number) => Promise<void>
  setImportFolder: (value: string) => Promise<void>
  setRomsParallelism: (value: number) => Promise<void>
}

async function persist(key: string, value: unknown) {
  await window.electronAPI.settings.set(key, value)
}

export const useSettings = create<SettingsStore>((set) => ({
  simulationMode: true,
  aynAbxyLayout: 'Xbox',
  aynTriggerMode: 'Analog',
  firmwareUpdateWaitSeconds: 30,
  importFolder: '',
  romsParallelism: 2,
  loaded: false,

  load: async () => {
    const [simMode, abxy, trigger, fwWait, importFolder, parallelism] = await Promise.all([
      window.electronAPI.settings.get('simulationMode'),
      window.electronAPI.settings.get('aynAbxyLayout'),
      window.electronAPI.settings.get('aynTriggerMode'),
      window.electronAPI.settings.get('firmwareUpdateWaitSeconds'),
      window.electronAPI.settings.get('importFolder'),
      window.electronAPI.settings.get('romsParallelism'),
    ])
    set({
      simulationMode: simMode !== false,
      aynAbxyLayout: (abxy as 'Xbox' | 'Nintendo') ?? 'Xbox',
      aynTriggerMode: (trigger as 'Analog' | 'Digital') ?? 'Analog',
      firmwareUpdateWaitSeconds: (fwWait as number) ?? 30,
      importFolder: (importFolder as string) ?? '',
      romsParallelism: (parallelism as number) ?? 2,
      loaded: true,
    })
  },

  setSimulationMode: async (value) => {
    await persist('simulationMode', value)
    set({ simulationMode: value })
  },

  setAynAbxyLayout: async (value) => {
    await persist('aynAbxyLayout', value)
    set({ aynAbxyLayout: value })
  },

  setAynTriggerMode: async (value) => {
    await persist('aynTriggerMode', value)
    set({ aynTriggerMode: value })
  },

  setFirmwareUpdateWaitSeconds: async (value) => {
    await persist('firmwareUpdateWaitSeconds', value)
    set({ firmwareUpdateWaitSeconds: value })
  },

  setImportFolder: async (value) => {
    await persist('importFolder', value)
    set({ importFolder: value })
  },

  setRomsParallelism: async (value) => {
    await persist('romsParallelism', value)
    set({ romsParallelism: value })
  },
}))
