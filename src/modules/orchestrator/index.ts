export type {
  ModuleStatus,
  ModulePhase,
  ModuleResult,
  RunContext,
  ThorModule,
} from './types'
export { deriveModuleStatus, makeInfoStep } from './types'

export {
  runOrchestrator,
  mergeResults,
  type Guard,
  type GuardStatus,
  type OrchestratorHandlers,
  type OrchestratorResult,
  type RunOrchestratorOptions,
  type PreCheckOutcome,
} from './orchestrator'

export {
  buildReport,
  failedModuleIds,
  reportToJson,
  reportToMarkdown,
  tally,
  type ReportSummary,
  type ModuleReport,
  type ReportMeta,
  type Tally,
} from './report'

export {
  runPreChecks,
  makeDefaultPreCheckIpc,
  parseDfAvailableBytes,
  type PreCheckIpc,
  type PreCheckOptions,
  type PreCheckResult,
} from './preChecks'

export { EMULATOR_GUIDES, guideFor, type EmulatorGuide, type GuideSetting } from './emulatorGuide'

export { buildThorModules, type BuildModulesOptions } from './thorModules'
