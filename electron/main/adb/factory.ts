import { getSettings } from '../settings'
import { RealAdbClient } from './realClient'
import { MockAdbClient } from './mockClient'
import type { AdbClient } from './types'

let cachedReal: RealAdbClient | null = null
let cachedMock: MockAdbClient | null = null
let cachedCustomAdbPath: string | null = null

export function getAdbClient(): AdbClient {
  const { simulationMode, customAdbPath } = getSettings()
  if (simulationMode) {
    if (!cachedMock) cachedMock = new MockAdbClient()
    return cachedMock
  }
  if (!cachedReal || cachedCustomAdbPath !== customAdbPath) {
    cachedCustomAdbPath = customAdbPath
    cachedReal = new RealAdbClient(customAdbPath || undefined)
  }
  return cachedReal
}
