import type {
  CompareSchedulersRequest,
  DisruptionRequest,
  DisruptionType,
  DisruptionResponse,
  Schedule,
  ScenarioDetail,
  ScenarioListItem,
  ScheduledOperation,
  ValidationResponse,
  ValidationViolation,
} from './api'

export function isRecord(value: unknown): value is Record<string, unknown>
export function isFiniteNumber(value: unknown): value is number
export function isScenarioList(value: unknown): value is ScenarioListItem[]
export function isScenarioDetail(value: unknown): value is ScenarioDetail
export function isSchedule(value: unknown): value is Schedule
export function isValidationResponse(value: unknown): value is ValidationResponse
export function isDisruptionResponse(value: unknown): value is DisruptionResponse
export function buildCompareRequest(request: CompareSchedulersRequest): {
  url: string
  body: Omit<CompareSchedulersRequest, 'scenario_id'>
}
export function buildDisruptionRequest(input: {
  scenarioId: string
  schedule: Schedule
  now: number
  type: DisruptionType
  solver?: 'edf' | 'cpsat'
  machine?: string
  fromMinute?: number
  toMinute?: number
  reason?: string
  order?: string
  delayAmount?: number
  delayUnit?: 'minutes' | 'hours'
}): DisruptionRequest
export function metricChange(before: number, after: number): { absolute: number; percent: number | null }
export function validationTitle(result: ValidationResponse | undefined, issue: string | undefined): 'Unavailable' | 'Not run' | 'Valid' | 'Invalid' | 'Incomplete'
export function getLateOrders(operations: ScheduledOperation[], orders: ScenarioDetail['orders'], route: ScenarioDetail['route']): Map<string, boolean>
export function getTimelinePosition(start: number, end: number, axisEnd: number): { left: number; width: number } | null
export function compareOperations(before: Schedule, after: Schedule): Array<{
  key: string
  order: string
  stage: ScheduledOperation['stage']
  machineChanged: boolean
  startChange: number
  endChange: number
}>
export function groupValidationViolations(violations: ValidationViolation[]): Array<[string, ValidationViolation[]]>
