import { getSettings } from '../settings'
import { RealAdbClient } from './realClient'
import { MockAdbClient } from './mockClient'
import type { AdbClient } from './types'

let cachedReal: RealAdbClient | null = null
let cachedMock: MockAdbClient | null = null

export function getAdbClient(): AdbClient {
  const { simulationMode } = getSettings()
  if (simulationMode) {
    if (!cachedMock) cachedMock = new MockAdbClient()
    return cachedMock
  }
  if (!cachedReal) cachedReal = new RealAdbClient()
  return cachedReal
}
