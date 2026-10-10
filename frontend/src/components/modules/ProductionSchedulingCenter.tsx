'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  api,
  ApiClientError,
  DisruptionResponse,
  FrozenOperation,
  ScenarioDetail,
  ScenarioListItem,
  ScenarioMachine,
  ScenarioOrder,
  Schedule,
  SchedulerType,
  Stage,
  ValidationResponse,
  ValidationViolation,
} from '@/lib/api'
import { Badge, Button, MaterialIcon } from '@/components/ui'
import {
  buildDisruptionRequest,
  compareOperations,
  getLateOrders,
  getTimelinePosition,
  groupValidationViolations,
  isDisruptionResponse,
  isFiniteNumber,
  isRecord,
  isScenarioDetail,
  isScenarioList,
  isSchedule,
  isValidationResponse,
  metricChange,
  validationTitle,
} from '@/lib/scheduler-view-model.mjs'

const stages: Array<{ title: string; target: string }> = [
  { title: 'Scenario', target: 'scenario-panel' },
  { title: 'Generate schedules', target: 'execution-panel' },
  { title: 'Compare results', target: 'comparison-panel' },
  { title: 'Inspect Gantt', target: 'gantt-panel' },
  { title: 'Validate', target: 'validation-panel' },
  { title: 'Simulate disruption', target: 'disruption-panel' },
  { title: 'Review impact', target: 'impact-panel' },
]

const stagesList: Stage[] = ['spinning', 'weaving', 'dyeing']
const solverLabels: Record<SchedulerType, string> = { edf: 'EDF baseline', cpsat: 'CP-SAT optimisation' }
const orderPalette = ['#146C5A', '#2563EB', '#B45309', '#7C3AED', '#BE123C', '#0E7490', '#4D7C0F', '#C2410C']
const requestTimeoutMs = 120_000

type MachineBar = {
  kind: 'operation' | 'downtime'
  start: number
  end: number
  order_id?: string
  stage?: Stage
  machine_id?: string
  quantity_metres?: number | null
  late?: boolean
  frozen?: boolean
  reason?: string | null
}

type MachineRow = {
  machine_id: string
  stage: Stage | null
  bars: MachineBar[]
}

async function withTimeout<T>(run: (signal: AbortSignal) => Promise<T>, timeoutMs = requestTimeoutMs): Promise<T> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await run(controller.signal)
  } catch (error) {
    if (controller.signal.aborted) throw new Error('The request timed out. Check the connection and retry.')
    throw error
  } finally {
    window.clearTimeout(timer)
  }
}

function isSolverError(value: unknown): value is { error: string } {
  return isRecord(value) && typeof value.error === 'string'
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError) return error.message
  if (error instanceof Error) return error.message
  return 'The request could not be completed.'
}

function displayValue(value: unknown, suffix = ''): string {
  return isFiniteNumber(value) ? `${value.toLocaleString()}${suffix}` : 'Unavailable'
}

function formatMinutes(value: number): string {
  if (!Number.isFinite(value) || value < 0) return 'Unavailable'
  const days = Math.floor(value / 1440)
  const hours = Math.floor((value % 1440) / 60)
  const minutes = Math.floor(value % 60)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function formatAbsoluteTime(start: string | null, minute: number): string {
  if (!start) return `Minute ${minute.toLocaleString()} from scenario origin`
  const timestamp = new Date(new Date(start).getTime() + minute * 60_000)
  if (Number.isNaN(timestamp.getTime())) return `Minute ${minute.toLocaleString()} from scenario origin`
  return timestamp.toLocaleString()
}

function orderColour(orderId: string): string {
  let hash = 0
  for (let index = 0; index < orderId.length; index += 1) {
    hash = (hash * 31 + orderId.charCodeAt(index)) | 0
  }
  return orderPalette[Math.abs(hash) % orderPalette.length]
}

function isSolverSuccess(schedule: Schedule): boolean {
  return schedule.status === 'OPTIMAL' || schedule.status === 'FEASIBLE'
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    OPTIMAL: 'bg-emerald-100 text-emerald-900 border-emerald-300',
    FEASIBLE: 'bg-sky-100 text-sky-900 border-sky-300',
    INFEASIBLE: 'bg-rose-100 text-rose-900 border-rose-300',
    UNKNOWN: 'bg-amber-100 text-amber-900 border-amber-300',
    MODEL_INVALID: 'bg-rose-100 text-rose-900 border-rose-300',
    Valid: 'bg-emerald-100 text-emerald-900 border-emerald-300',
    Invalid: 'bg-rose-100 text-rose-900 border-rose-300',
    Incomplete: 'bg-amber-100 text-amber-900 border-amber-300',
    Unavailable: 'bg-stone-100 text-stone-700 border-stone-300',
    'Not run': 'bg-stone-100 text-stone-700 border-stone-300',
  }
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${styles[status] ?? styles.Unavailable}`}>
      {status}
    </span>
  )
}

export function ProductionSchedulingCenter() {
  const [scenarios, setScenarios] = useState<ScenarioListItem[]>([])
  const [scenarioId, setScenarioId] = useState('')
  const [scenario, setScenario] = useState<ScenarioDetail | null>(null)
  const [scenarioLoading, setScenarioLoading] = useState(true)
  const [scenarioError, setScenarioError] = useState<string | null>(null)
  const scenarioRequestId = useRef(0)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const busyRef = useRef(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [furthestStep, setFurthestStep] = useState(0)
  const [schedules, setSchedules] = useState<Partial<Record<SchedulerType, Schedule>>>({})
  const [solverErrors, setSolverErrors] = useState<Partial<Record<SchedulerType, string>>>({})
  const [solverWarnings, setSolverWarnings] = useState<Partial<Record<SchedulerType, string>>>({})
  const [validations, setValidations] = useState<Partial<Record<SchedulerType, ValidationResponse>>>({})
  const [validationErrors, setValidationErrors] = useState<Partial<Record<SchedulerType, string>>>({})
  const [selectedSolver, setSelectedSolver] = useState<SchedulerType>('cpsat')
  const [comparisonError, setComparisonError] = useState<string | null>(null)
  const [stageFilter, setStageFilter] = useState<Stage | 'all'>('all')
  const [selectedBar, setSelectedBar] = useState<MachineBar | null>(null)
  const [disruptionType, setDisruptionType] = useState<'machine_down' | 'yarn_delay'>('machine_down')
  const [disruptionMachine, setDisruptionMachine] = useState('')
  const [breakdownStart, setBreakdownStart] = useState('')
  const [breakdownEnd, setBreakdownEnd] = useState('')
  const [breakdownReason, setBreakdownReason] = useState('')
  const [delayOrder, setDelayOrder] = useState('')
  const [delayAmount, setDelayAmount] = useState('')
  const [delayUnit, setDelayUnit] = useState<'minutes' | 'hours'>('hours')
  const [disruptionResult, setDisruptionResult] = useState<DisruptionResponse | null>(null)
  const [disruptionBaseline, setDisruptionBaseline] = useState<Schedule | null>(null)
  const [disruptionValidation, setDisruptionValidation] = useState<ValidationResponse | null>(null)
  const [disruptionError, setDisruptionError] = useState<string | null>(null)

  const advanceTo = (step: number) => {
    setCurrentStep(step)
    setFurthestStep((previous) => Math.max(previous, step))
  }

  const runScenarioLoad = useCallback(async (id: string) => {
    const requestId = ++scenarioRequestId.current
    setScenarioLoading(true)
    setScenarioError(null)
    setScenario(null)
    try {
      const result: unknown = await withTimeout((signal) => api.getScenario(id, { signal }), 30_000)
      if (requestId !== scenarioRequestId.current) return
      if (!isScenarioDetail(result)) throw new Error('The scenario response is incomplete or malformed.')
      setScenario(result)
      setFurthestStep(0)
      setCurrentStep(0)
    } catch (error) {
      if (requestId === scenarioRequestId.current) setScenarioError(errorMessage(error))
    } finally {
      if (requestId === scenarioRequestId.current) setScenarioLoading(false)
    }
  }, [])

  const loadScenarioList = useCallback(async () => {
    setScenarioLoading(true)
    setScenarioError(null)
    try {
      const result: unknown = await withTimeout((signal) => api.listScenarios({ signal }), 30_000)
      if (!isScenarioList(result)) throw new Error('The scenario list response is incomplete or malformed.')
      setScenarios(result)
      if (result.length === 0) {
        setScenarioError('The scheduler API returned no supported scenarios.')
        setScenarioLoading(false)
        return
      }
      setScenarioId(result[0].id)
      await runScenarioLoad(result[0].id)
    } catch (error) {
      setScenarioError(errorMessage(error))
      setScenarioLoading(false)
    }
  }, [runScenarioLoad])

  useEffect(() => {
    void loadScenarioList()
  }, [loadScenarioList])

  const takeAction = async (action: string, callback: () => Promise<void>) => {
    if (busyRef.current) return
    busyRef.current = true
    setBusyAction(action)
    try {
      await callback()
    } finally {
      busyRef.current = false
      setBusyAction(null)
    }
  }

  const clearScenarioResults = () => {
    setSchedules({})
    setSolverErrors({})
    setSolverWarnings({})
    setValidations({})
    setValidationErrors({})
    setComparisonError(null)
    setDisruptionResult(null)
    setDisruptionBaseline(null)
    setDisruptionValidation(null)
    setDisruptionError(null)
    setSelectedSolver('cpsat')
    setSelectedBar(null)
    setStageFilter('all')
    setDisruptionMachine('')
    setBreakdownStart('')
    setBreakdownEnd('')
    setBreakdownReason('')
    setDelayOrder('')
    setDelayAmount('')
    setDelayUnit('hours')
  }

  const changeScenario = (id: string) => {
    if (!id || id === scenarioId || busyRef.current) return
    setScenarioId(id)
    clearScenarioResults()
    void runScenarioLoad(id)
  }

  const validateOne = async (schedule: Schedule): Promise<ValidationResponse> => {
    const result: unknown = await withTimeout((signal) => api.validateSchedule({
      scenario_id: scenarioId,
      schedule,
    }, { signal }))
    if (!isValidationResponse(result)) throw new Error('The validation response is incomplete or malformed.')
    return result
  }

  const runSolver = async (solver: SchedulerType) => {
    if (!scenario || !scenarioId) return
    if (solver === 'cpsat' && !window.confirm('Run CP-SAT optimisation? The solver can take longer on large scenarios.')) return
    await takeAction(solver, async () => {
      setSolverErrors((current) => ({ ...current, [solver]: undefined }))
      setValidationErrors((current) => ({ ...current, [solver]: undefined }))
      setSolverWarnings((current) => ({ ...current, [solver]: undefined }))
      setValidations((current) => ({ ...current, [solver]: undefined }))
      setSchedules((current) => ({ ...current, [solver]: undefined }))
      setComparisonError(null)
      setDisruptionResult(null)
      setDisruptionBaseline(null)
      setDisruptionValidation(null)
      setDisruptionError(null)
      try {
        const result: unknown = await withTimeout((signal) => api.runScheduler({
          scenario_id: scenarioId,
          solver,
          time_limit_seconds: 30,
          seed: 42,
          workers: 8,
          warm_start: solver === 'cpsat',
        }, { signal }))
        if (!isRecord(result) || !isSchedule(result.schedule) || result.schedule.solver !== solver) {
          throw new Error('The scheduler returned an incomplete or mismatched schedule response.')
        }
        const schedule = result.schedule
        setSchedules((current) => ({ ...current, [solver]: schedule }))
        setSelectedSolver(solver)
        const warning = result.warning
        if (typeof warning === 'string' && warning) {
          setSolverWarnings((current) => ({ ...current, [solver]: warning }))
        }
        advanceTo(1)
        try {
          const validation = await validateOne(schedule)
          setValidations((current) => ({ ...current, [solver]: validation }))
        } catch (error) {
          setValidationErrors((current) => ({ ...current, [solver]: errorMessage(error) }))
        }
      } catch (error) {
        setSolverErrors((current) => ({ ...current, [solver]: errorMessage(error) }))
      }
    })
  }

  const resetDisruption = () => {
    setDisruptionMachine('')
    setBreakdownStart('')
    setBreakdownEnd('')
    setBreakdownReason('')
    setDelayOrder('')
    setDelayAmount('')
    setDelayUnit('hours')
    setDisruptionResult(null)
    setDisruptionBaseline(null)
    setDisruptionValidation(null)
    setDisruptionError(null)
    setCurrentStep(4)
    setFurthestStep((previous) => Math.min(previous, 4))
  }

  const compareSchedules = async () => {
    if (!scenario || !scenarioId) return
    if (!window.confirm('Run both solvers for a side-by-side benchmark?')) return
    await takeAction('compare', async () => {
      setComparisonError(null)
      setSolverErrors({})
      setValidationErrors({})
      setValidations({})
      setDisruptionResult(null)
      setDisruptionBaseline(null)
      setDisruptionValidation(null)
      setDisruptionError(null)
      try {
        const result: unknown = await withTimeout((signal) => api.compareSchedulers({
          scenario_id: scenarioId,
          time_limit_seconds: 30,
          seed: 42,
          workers: 8,
        }, { signal }))
        if (!isRecord(result) || result.scenario_id !== scenarioId || !isRecord(result.results)) {
          throw new Error('The comparison response is incomplete or malformed.')
        }
        const nextSchedules: Partial<Record<SchedulerType, Schedule>> = {}
        const nextErrors: Partial<Record<SchedulerType, string>> = {}
        for (const solver of ['edf', 'cpsat'] as SchedulerType[]) {
          const value = result.results[solver]
          if (isSchedule(value) && value.solver === solver) nextSchedules[solver] = value
          else if (isSolverError(value)) nextErrors[solver] = value.error
          else nextErrors[solver] = 'The comparison response did not include a valid solver result.'
        }
        if (!nextSchedules.edf && !nextSchedules.cpsat) {
          setSolverErrors(nextErrors)
          setComparisonError('Neither solver returned a schedule. Review the solver failures and retry.')
          return
        }
        setSchedules(nextSchedules)
        setSelectedSolver(nextSchedules.cpsat ? 'cpsat' : 'edf')
        setSolverErrors(nextErrors)
        advanceTo(2)
        const entries = (Object.entries(nextSchedules) as Array<[SchedulerType, Schedule]>)
        const checks = await Promise.allSettled(entries.map(async ([solver, schedule]) => ({
          solver,
          validation: await validateOne(schedule),
        })))
        const nextValidation: Partial<Record<SchedulerType, ValidationResponse>> = {}
        const nextValidationErrors: Partial<Record<SchedulerType, string>> = {}
        checks.forEach((check, index) => {
          const [solver] = entries[index]
          if (check.status === 'fulfilled') nextValidation[check.value.solver] = check.value.validation
          else nextValidationErrors[solver] = errorMessage(check.reason)
        })
        setValidations(nextValidation)
        setValidationErrors(nextValidationErrors)
      } catch (error) {
        setComparisonError(errorMessage(error))
      }
    })
  }

  const handleValidate = async () => {
    const schedule = schedules[selectedSolver]
    if (!schedule) {
      setValidationErrors((current) => ({ ...current, [selectedSolver]: 'Run this solver before validating its schedule.' }))
      return
    }
    await takeAction('validate', async () => {
      setValidationErrors((current) => ({ ...current, [selectedSolver]: undefined }))
      try {
        const result = await validateOne(schedule)
        setValidations((current) => ({ ...current, [selectedSolver]: result }))
        if (result.status === 'valid' && result.violation_count === 0) advanceTo(4)
        else setCurrentStep(4)
      } catch (error) {
        setValidationErrors((current) => ({ ...current, [selectedSolver]: errorMessage(error) }))
      }
    })
  }

  const selectedSchedule = schedules[selectedSolver]
  const selectedValidation = validations[selectedSolver]
  const selectedValidationError = validationErrors[selectedSolver]

  const submitDisruption = async () => {
    if (!scenario || !scenarioId) return
    if (!isFiniteNumber(scenario.now)) {
      setDisruptionError('The scenario simulation time is unavailable; the disruption request cannot be formed.')
      return
    }
    const schedule = selectedSchedule
    if (!schedule) {
      setDisruptionError('Run a schedule before simulating a disruption.')
      return
    }
    if (!isSolverSuccess(schedule)) {
      setDisruptionError(`A ${schedule.status} schedule cannot be used as a complete replan baseline.`)
      return
    }
    if (selectedValidation?.status !== 'valid' || selectedValidation.violation_count !== 0) {
      setDisruptionError('Run independent validation and resolve all violations before re-planning.')
      return
    }

    let request: Parameters<typeof api.simulateDisruption>[0]
    if (disruptionType === 'machine_down') {
      const fromMinute = Number(breakdownStart)
      const toMinute = Number(breakdownEnd)
      if (!disruptionMachine || breakdownStart === '' || breakdownEnd === '' || !Number.isInteger(fromMinute)
        || !Number.isInteger(toMinute) || fromMinute < 0 || toMinute <= fromMinute) {
        setDisruptionError('Choose a machine and enter valid breakdown start/end minutes (end must be later).')
        return
      }
      request = buildDisruptionRequest({
        scenarioId,
        schedule,
        type: 'machine_down',
        now: scenario.now,
        machine: disruptionMachine,
        fromMinute,
        toMinute,
        reason: breakdownReason,
        solver: selectedSolver,
      })
    } else {
      const delay = Number(delayAmount)
      if (!delayOrder || delayAmount === '' || !Number.isInteger(delay) || delay <= 0
        || (delayUnit === 'hours' && !Number.isInteger(delay))) {
        setDisruptionError('Choose an order and enter a positive delay in the selected units.')
        return
      }
      request = buildDisruptionRequest({
        scenarioId,
        schedule,
        type: 'yarn_delay',
        now: scenario.now,
        order: delayOrder,
        delayAmount: delay,
        delayUnit,
        solver: selectedSolver,
      })
    }

    if (!window.confirm('Submit this disruption and solve a new schedule? The original schedule will remain available for comparison.')) return
    await takeAction('disruption', async () => {
      setDisruptionError(null)
      setDisruptionResult(null)
      setDisruptionBaseline(schedule)
      setDisruptionValidation(null)
      try {
        const result: unknown = await withTimeout((signal) => api.simulateDisruption(request, { signal }))
        if (!isDisruptionResponse(result)) {
          throw new Error('The disruption response is incomplete or malformed.')
        }
        const response = result
        setDisruptionResult(response)
        if (!response.ok || !response.schedule) {
          setDisruptionError(response.error || 'No complete re-plan was returned.')
          advanceTo(5)
          return
        }
        if (!isSchedule(response.schedule) || response.schedule.solver !== selectedSolver) {
          setDisruptionError(`The re-plan response contains an invalid or mismatched solver (expected ${selectedSolver}).`)
          advanceTo(5)
          return
        }
        try {
          const validation = await validateOne(response.schedule)
          setDisruptionValidation(validation)
          if (isSolverSuccess(response.schedule) && validation.status === 'valid' && validation.violation_count === 0) {
            advanceTo(6)
          } else {
            setCurrentStep(6)
            setDisruptionError('The re-plan was returned, but it did not pass independent validation as a complete schedule.')
          }
        } catch (error) {
          setDisruptionError(`Re-plan returned, but independent validation is unavailable: ${errorMessage(error)}`)
        }
      } catch (error) {
        setDisruptionError(errorMessage(error))
      }
    })
  }

  const lateOrders = useMemo(() => {
    if (!scenario || !selectedSchedule) return new Map<string, boolean>()
    return getLateOrders(selectedSchedule.operations, scenario.orders, scenario.route)
  }, [scenario, selectedSchedule])

  const machineRows = useMemo((): MachineRow[] => {
    if (!scenario || !selectedSchedule) return []
    const rowMap = new Map<string, MachineRow>()
    for (const machine of scenario.machines) {
      rowMap.set(machine.id, {
        machine_id: machine.id,
        stage: machine.stage,
        bars: (machine.downtime ?? []).map((downtime) => ({
          kind: 'downtime',
          start: downtime.start,
          end: downtime.end,
          reason: downtime.reason,
        })),
      })
    }
    for (const operation of selectedSchedule.operations) {
      let row = rowMap.get(operation.machine)
      if (!row) {
        row = { machine_id: operation.machine, stage: operation.stage, bars: [] }
        rowMap.set(operation.machine, row)
      }
      const late = lateOrders.get(operation.order)
      const frozen = scenario.frozen.some((item: FrozenOperation) =>
        item.order === operation.order && item.stage === operation.stage && item.machine === operation.machine
      )
      row.bars.push({
        kind: 'operation',
        order_id: operation.order,
        stage: operation.stage,
        machine_id: operation.machine,
        start: operation.start,
        end: operation.end,
        quantity_metres: operation.quantity_metres,
        late,
        frozen,
      })
    }
    return Array.from(rowMap.values())
      .filter((row) => stageFilter === 'all' || row.stage === stageFilter)
      .sort((first, second) =>
        (first.stage ?? '').localeCompare(second.stage ?? '') || first.machine_id.localeCompare(second.machine_id)
      )
  }, [scenario, selectedSchedule, stageFilter, lateOrders])

  const axisEnd = Math.max(
    scenario?.horizon ?? 0,
    ...machineRows.flatMap((row) => row.bars.map((bar) => Number.isFinite(bar.end) && bar.end > 0 ? bar.end : 0)),
    1
  )
  const invalidBarCount = machineRows.reduce((total, row) =>
    total + row.bars.filter((bar) => !getTimelinePosition(bar.start, bar.end, axisEnd)).length
  , 0)
  const axisWidth = Math.max(1100, Math.ceil(axisEnd / 60) * 11)
  const axisTicks = Array.from({ length: Math.floor(axisEnd / 1440) + 1 }, (_, index) => index * 1440)
  if (axisTicks[axisTicks.length - 1] < axisEnd) axisTicks.push(axisEnd)

  const machineCountByStage = scenario
    ? stagesList.map((stage) => ({ stage, count: scenario.machines.filter((machine) => machine.stage === stage).length }))
    : []
  const downtimeDetailsAvailable = scenario?.machines.every((machine: ScenarioMachine) => Array.isArray(machine.downtime)) ?? false
  const allDowntime = scenario?.machines.flatMap((machine: ScenarioMachine) =>
    (machine.downtime ?? []).map((downtime) => ({ machine: machine.id, ...downtime }))
  ) ?? []
  const activeSolverResults = (['edf', 'cpsat'] as SchedulerType[])
    .map((solver) => ({ solver, schedule: schedules[solver], error: solverErrors[solver] }))
  const operationChanges = disruptionResult?.schedule && disruptionBaseline
    ? compareOperations(disruptionBaseline, disruptionResult.schedule)
    : []

  const canVisitWorkflowStep = (index: number) => index <= furthestStep
    || (index === 2 && Boolean(schedules.edf && schedules.cpsat))
    || (index === 3 && Boolean(schedules.edf || schedules.cpsat))
    || (index === 4 && Boolean(selectedSchedule))
    || (index === 5 && Boolean(selectedSchedule && selectedValidation?.status === 'valid' && selectedValidation.violation_count === 0))
    || (index === 6 && Boolean(disruptionResult || disruptionError))

  const selectWorkflowStep = (index: number) => {
    if (!canVisitWorkflowStep(index)) return
    setCurrentStep(index)
    document.getElementById(stages[index].target)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const loading = scenarioLoading || busyAction !== null
  const selectedOrder = scenario?.orders.find((order) => order.id === delayOrder)

  return (
    <main className="flex-1 h-full overflow-y-auto bg-[#F5F0E3] p-3 sm:p-5 lg:p-6">
      <div className="mx-auto max-w-[1600px] space-y-5 pb-8">
        <header className="rounded-2xl border border-stone-300 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#D7F4E5] text-[#0E4B3E]">
                <MaterialIcon name="precision_manufacturing" size="md" color="#0E4B3E" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#0E4B3E]">Everest · Production intelligence</p>
                <h1 className="mt-1 text-xl font-bold tracking-tight text-[#181816] sm:text-2xl">Production Scheduling &amp; Validation</h1>
                <p className="mt-1 max-w-3xl text-sm text-stone-600">
                  Optimise production, validate constraints, and recover from disruptions.
                </p>
              </div>
            </div>
            {scenario?.synthetic_data && (
              <span className="self-start rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-900">
                Deterministic scheduler scenario · synthetic data
              </span>
            )}
          </div>
          <nav aria-label="Scheduling workflow" className="mt-5 overflow-x-auto">
            <ol className="flex min-w-[760px] items-center">
              {stages.map((stage, index) => {
                const completed = index < furthestStep
                const active = index === currentStep
                return (
                  <li key={stage.title} className="flex flex-1 items-center last:flex-none">
                    <button
                      type="button"
                      onClick={() => selectWorkflowStep(index)}
                      aria-current={active ? 'step' : undefined}
                      aria-label={`Step ${index + 1}: ${stage.title}${completed ? ', completed' : active ? ', current' : ''}`}
                      disabled={!canVisitWorkflowStep(index)}
                      className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0E4B3E] disabled:cursor-not-allowed disabled:opacity-45 ${
                        active ? 'bg-[#0E4B3E] text-white' : completed ? 'text-[#0E4B3E] hover:bg-emerald-50' : 'text-stone-500'
                      }`}
                    >
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] ${active ? 'border-white/70' : 'border-current'}`}>
                        {completed ? '✓' : index + 1}
                      </span>
                      <span className="whitespace-nowrap">{stage.title}</span>
                    </button>
                    {index < stages.length - 1 && <span className="mx-1 h-px min-w-3 flex-1 bg-stone-200" aria-hidden="true" />}
                  </li>
                )
              })}
            </ol>
          </nav>
          <p className="sr-only" aria-live="polite">Current workflow stage: {stages[currentStep].title}</p>
        </header>

        <section id="scenario-panel" aria-labelledby="scenario-heading" className="scroll-mt-4 rounded-2xl border border-stone-300 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#0E4B3E]">01 · Scenario</p>
              <h2 id="scenario-heading" className="mt-1 text-base font-bold text-[#181816]">Select a production scenario</h2>
              <p className="mt-1 text-xs text-stone-600">Scenarios and their operating facts are loaded from the scheduling API.</p>
            </div>
            <label className="w-full text-xs font-semibold text-stone-700 sm:max-w-sm">
              Supported scenario
              <select
                value={scenarioId}
                onChange={(event) => changeScenario(event.target.value)}
                disabled={loading || scenarios.length === 0}
                className="mt-1 block h-10 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm text-[#181816] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0E4B3E] disabled:bg-stone-100"
              >
                {scenarios.length === 0 && <option value="">No scenario available</option>}
                {scenarios.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.id}</option>)}
              </select>
            </label>
          </div>

          {scenarioError && (
            <div role="alert" className="mt-4 flex flex-col gap-3 rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900 sm:flex-row sm:items-center sm:justify-between">
              <p>{scenarioError}</p>
              <Button size="sm" variant="outline" onClick={() => void loadScenarioList()} disabled={loading}>Retry scenario load</Button>
            </div>
          )}
          {scenarioLoading && (
            <div className="mt-4 animate-pulse space-y-3" role="status" aria-label="Loading scenario">
              <div className="h-5 w-1/3 rounded bg-stone-200" />
              <div className="h-4 w-2/3 rounded bg-stone-100" />
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[0, 1, 2, 3].map((item) => <div key={item} className="h-16 rounded-lg bg-stone-100" />)}
              </div>
              <span className="sr-only">Loading scenario details…</span>
            </div>
          )}
          {scenario && !scenarioLoading && (
            <>
              <div className="mt-4 flex flex-col gap-1 border-b border-stone-200 pb-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-mono text-xs font-bold text-[#0E4B3E]">{scenario.scenario_id}</p>
                  <p className="mt-1 text-sm text-stone-700">{scenario.description || 'Description unavailable.'}</p>
                </div>
                {scenario.start && !Number.isNaN(new Date(scenario.start).getTime())
                  ? <p className="text-xs text-stone-500">Planning origin: <time dateTime={scenario.start}>{new Date(scenario.start).toLocaleString()}</time></p>
                  : <p className="text-xs text-stone-500">Planning origin: unavailable; minute 0 is the scenario origin.</p>}
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { label: 'Orders', value: displayValue(scenario.orders.length) },
                  { label: 'Machines', value: displayValue(scenario.machines.length) },
                  { label: 'Planning horizon', value: isFiniteNumber(scenario.horizon) ? `${formatMinutes(scenario.horizon)} (${scenario.horizon.toLocaleString()} min)` : 'Unavailable' },
                  { label: 'Simulation time', value: isFiniteNumber(scenario.now) ? `${formatMinutes(scenario.now)} (${scenario.now.toLocaleString()} min)` : 'Unavailable' },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg border border-stone-200 bg-[#FAF7F0] px-3 py-2">
                    <dt className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">{item.label}</dt>
                    <dd className="mt-1 text-sm font-bold text-[#181816]">{item.value}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div>
                  <h3 className="text-xs font-bold text-stone-700">Machines by stage</h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {machineCountByStage.map(({ stage, count }) => (
                      <span key={stage} className="rounded-lg border border-stone-200 px-2.5 py-1.5 text-xs text-stone-700">
                        <span className="capitalize">{stage}</span> <strong className="ml-1 text-[#181816]">{count}</strong>
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="text-xs font-bold text-stone-700">Readiness &amp; planned downtime</h3>
                  <p className="mt-1 text-[11px] text-stone-500">Values are offsets in minutes from scenario start.</p>
                  <div className="mt-2 grid gap-1 text-xs text-stone-700 sm:grid-cols-2">
                    <div className="rounded-lg bg-stone-50 p-2">
                      <p className="font-semibold">Yarn readiness by order</p>
                      {scenario.orders.length === 0
                        ? <p className="mt-1 text-stone-500">Order readiness unavailable.</p>
                        : scenario.orders.map((order: ScenarioOrder) => (
                          <p key={order.id} className="mt-1 flex justify-between gap-2">
                            <span>{order.id}</span>
                            <span>{isFiniteNumber(order.yarn_ready) ? `${order.yarn_ready.toLocaleString()} min` : 'Unavailable'}</span>
                          </p>
                        ))}
                    </div>
                    <div className="rounded-lg bg-stone-50 p-2">
                      <p className="font-semibold">Known downtime windows</p>
                      {!downtimeDetailsAvailable
                        ? <p className="mt-1 text-stone-500">Downtime information unavailable.</p>
                        : allDowntime.length === 0
                        ? <p className="mt-1 text-stone-500">None reported by this scenario.</p>
                        : allDowntime.map((downtime, index) => (
                          <p key={`${downtime.machine}-${downtime.start}-${index}`} className="mt-1">
                            <strong>{downtime.machine}</strong> · {downtime.start}–{downtime.end} min
                            {downtime.reason ? ` · ${downtime.reason}` : ''}
                          </p>
                        ))}
                    </div>
                  </div>
                  {scenario.consistency_warnings.length > 0 && (
                    <ul className="mt-2 list-disc pl-5 text-xs text-amber-800">
                      {scenario.consistency_warnings.map((warning, index) => <li key={`${warning}-${index}`}>{warning}</li>)}
                    </ul>
                  )}
                </div>
              </div>
            </>
          )}
        </section>

        <section id="execution-panel" aria-labelledby="execution-heading" className="scroll-mt-4 rounded-2xl border border-stone-300 bg-white p-4 shadow-sm sm:p-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#0E4B3E]">02 · Generate schedules</p>
            <h2 id="execution-heading" className="mt-1 text-base font-bold text-[#181816]">Execute the production scheduler</h2>
            <p className="mt-1 text-xs text-stone-600">Solver status is reported as returned. FEASIBLE is not the same as OPTIMAL.</p>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => void runSolver('edf')} disabled={!scenario || loading} icon={<MaterialIcon name="play_arrow" size="xs" />}>
              {busyAction === 'edf' ? 'Running EDF…' : 'Run EDF baseline'}
            </Button>
            <Button onClick={() => void runSolver('cpsat')} disabled={!scenario || loading} variant="secondary" icon={<MaterialIcon name="precision_manufacturing" size="xs" />}>
              {busyAction === 'cpsat' ? 'Optimising…' : 'Run CP-SAT optimisation'}
            </Button>
            <Button onClick={() => void compareSchedules()} disabled={!scenario || loading} variant="outline">
              {busyAction === 'compare' ? 'Benchmarking…' : 'Compare both schedules'}
            </Button>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {(['edf', 'cpsat'] as SchedulerType[]).map((solver) => {
              const schedule = schedules[solver]
              const error = solverErrors[solver]
              const isRunning = busyAction === solver
              return (
                <article key={solver} className="rounded-xl border border-stone-200 bg-[#FAF7F0] p-3" aria-label={`${solverLabels[solver]} result`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-[#181816]">{solverLabels[solver]}</h3>
                    {schedule ? <StatusBadge status={schedule.status} /> : <StatusBadge status={error ? 'Unavailable' : 'Not run'} />}
                  </div>
                  {error && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <p role="alert" className="text-xs text-rose-800 flex-1">{error}</p>
                      <Button size="xs" variant="outline" onClick={() => void runSolver(solver)} disabled={isRunning || loading}>
                        {isRunning ? 'Retrying…' : 'Retry'}
                      </Button>
                    </div>
                  )}
                  {solverWarnings[solver] && <p className="mt-2 text-xs text-amber-900">{solverWarnings[solver]}</p>}
                  {schedule && (
                    <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                      <div><dt className="text-stone-500">Measured compute time</dt><dd className="font-semibold">{displayValue(schedule.compute_seconds, ' s')}</dd></div>
                      <div><dt className="text-stone-500">Independent validation</dt><dd className="mt-0.5"><StatusBadge status={validationTitle(validations[solver], validationErrors[solver])} /></dd></div>
                      <div><dt className="text-stone-500">Operations returned</dt><dd className="font-semibold">{schedule.operations.length}</dd></div>
                      <div><dt className="text-stone-500">Violations</dt><dd className="font-semibold">{validations[solver] ? validations[solver]?.violation_count : 'Unavailable'}</dd></div>
                    </dl>
                  )}
                  {!schedule && !error && <p className="mt-2 text-xs text-stone-500">No run result yet.</p>}
                </article>
              )
            })}
          </div>
          {busyAction && <p role="status" aria-live="polite" className="mt-3 text-xs text-[#0E4B3E]">Request in progress. Duplicate submissions are disabled.</p>}
        </section>

        <section id="comparison-panel" aria-labelledby="comparison-heading" className="scroll-mt-4 rounded-2xl border border-stone-300 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#0E4B3E]">03 · Compare results</p>
              <h2 id="comparison-heading" className="mt-1 text-base font-bold text-[#181816]">Measured EDF vs CP-SAT benchmark</h2>
              <p className="mt-1 text-xs text-stone-600">Changes are CP-SAT minus EDF. Rates show percentage points and relative change separately.</p>
            </div>
            <p className="text-[11px] text-stone-500">Utilisation is reported as a trade-off, not automatically treated as an improvement.</p>
          </div>
          {comparisonError && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <p role="alert" className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-xs text-rose-900 flex-1">{comparisonError}</p>
              <Button size="sm" variant="outline" onClick={() => void compareSchedules()} disabled={busyAction === 'compare' || loading}>
                {busyAction === 'compare' ? 'Retrying…' : 'Retry comparison'}
              </Button>
            </div>
          )}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[700px] border-collapse text-left text-xs">
              <caption className="sr-only">Metrics returned by EDF baseline and CP-SAT optimisation</caption>
              <thead>
                <tr className="border-b border-stone-200 text-[10px] uppercase tracking-wide text-stone-500">
                  <th scope="col" className="py-2 pr-3">Metric · definition</th>
                  <th scope="col" className="px-3 py-2">EDF</th>
                  <th scope="col" className="px-3 py-2">CP-SAT</th>
                  <th scope="col" className="px-3 py-2">Absolute change</th>
                  <th scope="col" className="px-3 py-2">Relative change</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {[
                  {
                    key: 'weighted_tardiness',
                    label: 'Weighted tardiness',
                    definition: 'Priority-weighted late minutes · lower is better',
                    unit: 'weighted min',
                    preferred: 'lower',
                    get: (schedule: Schedule) => schedule.metrics.weighted_tardiness,
                  },
                  {
                    key: 'on_time_rate',
                    label: 'On-time order rate',
                    definition: 'Orders completed by due time · higher is better',
                    unit: 'pp',
                    preferred: 'higher',
                    get: (schedule: Schedule) => schedule.metrics.on_time_rate,
                    rate: true,
                  },
                  {
                    key: 'makespan',
                    label: 'Makespan',
                    definition: 'Minutes from scenario now to final completion · lower is better',
                    unit: 'min',
                    preferred: 'lower',
                    get: (schedule: Schedule) => schedule.metrics.makespan,
                  },
                  {
                    key: 'utilisation',
                    label: 'Machine utilisation',
                    definition: 'Productive time over available time, downtime excluded',
                    unit: 'pp',
                    preferred: 'neutral',
                    get: (schedule: Schedule) => schedule.metrics.utilisation,
                    rate: true,
                  },
                  {
                    key: 'compute_seconds',
                    label: 'Compute time',
                    definition: 'Measured solver wall-clock duration',
                    unit: 's',
                    preferred: 'lower',
                    get: (schedule: Schedule) => schedule.compute_seconds,
                  },
                  {
                    key: 'violations',
                    label: 'Validation violations',
                    definition: 'Independent validator findings · lower is better',
                    unit: 'violations',
                    preferred: 'lower',
                    get: (schedule: Schedule, solver: SchedulerType) =>
                      validations[solver] ? validations[solver]?.violation_count : undefined,
                  },
                ].map((metric) => {
                  const edf = schedules.edf ? metric.get(schedules.edf, 'edf') : undefined
                  const cpsat = schedules.cpsat ? metric.get(schedules.cpsat, 'cpsat') : undefined
                  const hasValues = isFiniteNumber(edf) && isFiniteNumber(cpsat)
                  const change = hasValues ? metricChange(edf, cpsat) : null
                  const better = change && metric.preferred !== 'neutral'
                    ? metric.preferred === 'lower' ? change.absolute < 0 : change.absolute > 0
                    : false
                  const displayMetric = (value: number | null | undefined) => {
                    if (!isFiniteNumber(value)) return 'Unavailable'
                    return metric.rate ? `${(value * 100).toFixed(1)}%` : `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${metric.unit}`
                  }
                  return (
                    <tr key={metric.key} className="align-top">
                      <th scope="row" className="py-3 pr-3 font-semibold text-[#181816]">
                        {metric.label}<span className="mt-0.5 block max-w-xs text-[10px] font-normal text-stone-500">{metric.definition}</span>
                      </th>
                      <td className="px-3 py-3">{displayMetric(edf)}</td>
                      <td className="px-3 py-3">{displayMetric(cpsat)}</td>
                      <td className={`px-3 py-3 font-semibold ${better ? 'text-emerald-800' : ''}`}>
                        {change
                          ? `${change.absolute > 0 ? '+' : ''}${metric.rate ? `${(change.absolute * 100).toFixed(1)} pp` : `${change.absolute.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${metric.unit}`}${better ? ' · measured improvement' : ''}`
                          : 'Unavailable'}
                      </td>
                      <td className="px-3 py-3">
                        {change?.percent !== null && change
                          ? `${change.percent > 0 ? '+' : ''}${change.percent.toFixed(1)}%`
                          : 'Unavailable (zero baseline or missing value)'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {activeSolverResults.map(({ solver, schedule, error }) => (
              <div key={solver} className="rounded-lg border border-stone-200 p-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{solverLabels[solver]}</span>
                  <StatusBadge status={schedule?.status ?? (error ? 'Unavailable' : 'Not run')} />
                </div>
                <p className="mt-2 text-stone-600">Validation: <StatusBadge status={validationTitle(validations[solver], validationErrors[solver])} /></p>
                {error && <p className="mt-2 text-rose-800">{error}</p>}
              </div>
            ))}
          </div>
        </section>

        <section id="gantt-panel" aria-labelledby="gantt-heading" className="scroll-mt-4 rounded-2xl border border-stone-300 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#0E4B3E]">04 · Inspect Gantt</p>
              <h2 id="gantt-heading" className="mt-1 text-base font-bold text-[#181816]">Machine-wise production timeline</h2>
              <p className="mt-1 text-xs text-stone-600">Operation bars use scheduler start/end minutes from the scenario origin. Downtime is separate.</p>
            </div>
            <label className="text-xs font-semibold text-stone-700">
              Schedule
              <select
                value={selectedSolver}
                onChange={(event) => setSelectedSolver(event.target.value as SchedulerType)}
                className="ml-2 h-9 rounded-lg border border-stone-300 bg-white px-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0E4B3E]"
                aria-label="Schedule displayed in the Gantt chart"
              >
                {(['edf', 'cpsat'] as SchedulerType[]).map((solver) => (
                  <option key={solver} value={solver} disabled={!schedules[solver]}>{solverLabels[solver]}{schedules[solver] ? '' : ' · no result'}</option>
                ))}
              </select>
            </label>
          </div>
          {selectedSchedule && validationTitle(selectedValidation, selectedValidationError) !== 'Valid' && (
            <p role="alert" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
              This timeline is for inspection only: the selected schedule is not confirmed valid by the independent validator.
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Filter Gantt rows by production stage">
            {(['all', ...stagesList] as Array<Stage | 'all'>).map((stage) => (
              <button
                key={stage}
                type="button"
                aria-pressed={stageFilter === stage}
                onClick={() => setStageFilter(stage)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold capitalize focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0E4B3E] ${
                  stageFilter === stage ? 'border-[#0E4B3E] bg-[#0E4B3E] text-white' : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50'
                }`}
              >
                {stage === 'all' ? 'All stages' : stage}
              </button>
            ))}
          </div>
          {!selectedSchedule ? (
            <div className="mt-4 rounded-lg border border-dashed border-stone-300 bg-stone-50 p-8 text-center text-sm text-stone-600">
              Run a solver to inspect its real operation schedule. No sample bars are shown.
            </div>
          ) : !isSolverSuccess(selectedSchedule) ? (
            <div role="alert" className="mt-4 rounded-lg border border-rose-300 bg-rose-50 p-4 text-sm text-rose-900">
              {selectedSchedule.status} — no valid complete schedule is presented in the timeline.
            </div>
          ) : machineRows.length === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed border-stone-300 bg-stone-50 p-8 text-center text-sm text-stone-600">
              No machine rows are available for this stage filter.
            </div>
          ) : (
            <>
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-stone-600" aria-label="Gantt chart legend">
                <span className="inline-flex items-center gap-1.5"><i className="h-3 w-3 rounded bg-[#146C5A]" aria-hidden="true" />Order operation · consistent order colour</span>
                <span className="inline-flex items-center gap-1.5"><i className="h-3 w-3 rounded border border-rose-700 bg-rose-100" aria-hidden="true" />Downtime</span>
                <span className="inline-flex items-center gap-1.5"><i className="h-3 w-3 rounded border-2 border-dashed border-white bg-[#146C5A]" aria-hidden="true" />Frozen</span>
                <span className="inline-flex items-center gap-1.5"><i className="h-3 w-3 rounded bg-amber-500" aria-hidden="true" />Order completes late</span>
              </div>
              {!downtimeDetailsAvailable && <p className="mt-2 text-xs text-stone-600">Downtime overlays are unavailable for one or more machines in this scenario response.</p>}
              {invalidBarCount > 0 && <p role="alert" className="mt-2 text-xs text-amber-900">{invalidBarCount} malformed interval(s) were omitted from the chart; review validation findings.</p>}
              <div className="mt-3 overflow-x-auto rounded-lg border border-stone-200" role="region" aria-label="Scrollable machine schedule timeline" tabIndex={0}>
                <div style={{ minWidth: axisWidth + 190 }} className="relative">
                  <div className="sticky top-0 z-10 flex border-b border-stone-200 bg-stone-50">
                    <div className="sticky left-0 z-20 w-[190px] shrink-0 border-r border-stone-200 bg-stone-50 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-stone-500">Machine / stage</div>
                    <div className="relative h-9 flex-1" style={{ width: axisWidth }}>
                      {axisTicks.map((minute) => (
                        <span key={minute} className="absolute top-2 -translate-x-1/2 whitespace-nowrap text-[10px] text-stone-500" style={{ left: `${(minute / axisEnd) * 100}%` }}>
                          {formatMinutes(minute)}
                        </span>
                      ))}
                    </div>
                  </div>
                  {machineRows.map((row) => {
                    const validBars = row.bars.filter((bar) => getTimelinePosition(bar.start, bar.end, axisEnd) !== null)
                    return (
                      <div key={row.machine_id} className="flex border-b border-stone-100 last:border-0">
                        <div className="sticky left-0 z-[1] flex w-[190px] shrink-0 flex-col justify-center border-r border-stone-200 bg-white px-3 py-2">
                          <span className="font-mono text-xs font-bold text-[#181816]">{row.machine_id}</span>
                          <span className="mt-0.5 text-[10px] capitalize text-stone-500">{row.stage ?? 'Unmapped machine'}</span>
                        </div>
                        <div className="relative h-12 flex-1 bg-[linear-gradient(to_right,#e7e5e4_1px,transparent_1px)]" style={{ width: axisWidth, backgroundSize: `${(1440 / axisEnd) * 100}% 100%` }}>
                          {scenario && isFiniteNumber(scenario.now) && scenario.now > 0 && (
                            <div className="absolute bottom-0 top-0 z-[1] border-l border-dashed border-rose-500" style={{ left: `${(scenario.now / axisEnd) * 100}%` }} aria-label={`Current simulation time ${scenario.now} minutes`} />
                          )}
                          {validBars.map((bar, index) => {
                            const position = getTimelinePosition(bar.start, bar.end, axisEnd)
                            if (!position) return null
                            const label = bar.kind === 'operation'
                              ? `${bar.order_id ?? 'Unknown order'}, ${bar.stage ?? 'unknown stage'}, ${bar.machine_id ?? row.machine_id}, start ${bar.start} min, end ${bar.end} min, duration ${bar.end - bar.start} min, quantity ${isFiniteNumber(bar.quantity_metres) ? `${bar.quantity_metres} metres` : 'unavailable'}, deadline ${bar.late === undefined ? 'unavailable' : bar.late ? 'late' : 'not late'}${bar.frozen ? ', frozen operation' : ''}`
                              : `${row.machine_id} downtime, start ${bar.start} min, end ${bar.end} min, duration ${bar.end - bar.start} min${bar.reason ? `, reason ${bar.reason}` : ''}`
                            return (
                              <button
                                key={`${bar.kind}-${bar.order_id ?? row.machine_id}-${bar.start}-${index}`}
                                type="button"
                                title={label}
                                aria-label={label}
                                onClick={() => setSelectedBar(bar)}
                                className={`absolute top-2 h-8 overflow-hidden rounded px-1 text-left text-[9px] font-semibold text-white shadow-sm focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#181816] ${
                                  bar.kind === 'downtime' ? 'z-[2] border border-rose-700 bg-rose-100 text-rose-950' : ''
                                } ${bar.kind === 'operation' && bar.frozen ? 'border-2 border-dashed border-white' : ''} ${bar.kind === 'operation' && bar.late ? 'ring-2 ring-amber-500 ring-offset-1' : ''}`}
                                style={bar.kind === 'operation'
                                  ? { left: `${position.left}%`, width: `${position.width}%`, backgroundColor: orderColour(bar.order_id ?? '') }
                                  : { left: `${position.left}%`, width: `${position.width}%` }}
                              >
                                {bar.kind === 'operation' ? bar.order_id : 'DOWN'}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
              {selectedBar && (
                <div className="mt-3 rounded-lg border border-stone-200 bg-[#FAF7F0] p-3" aria-live="polite">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-xs font-bold text-[#181816]">{selectedBar.kind === 'operation' ? `${selectedBar.order_id ?? 'Operation'} details` : 'Downtime details'}</h3>
                    <button type="button" onClick={() => setSelectedBar(null)} className="rounded px-2 py-1 text-xs text-stone-600 hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0E4B3E]">Close</button>
                  </div>
                  {selectedBar.kind === 'operation' ? (
                    <dl className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                      <div><dt className="text-stone-500">Order</dt><dd className="font-semibold">{selectedBar.order_id ?? 'Unavailable'}</dd></div>
                      <div><dt className="text-stone-500">Stage / machine</dt><dd className="font-semibold capitalize">{selectedBar.stage ?? 'Unavailable'} / {selectedBar.machine_id ?? 'Unavailable'}</dd></div>
                      <div><dt className="text-stone-500">Start / end</dt><dd className="font-semibold">{selectedBar.start} / {selectedBar.end} min</dd></div>
                      <div><dt className="text-stone-500">Duration / quantity</dt><dd className="font-semibold">{selectedBar.end - selectedBar.start} min / {displayValue(selectedBar.quantity_metres, ' m')}</dd></div>
                      <div><dt className="text-stone-500">Deadline</dt><dd className="font-semibold">{selectedBar.late === undefined ? 'Unavailable' : selectedBar.late ? 'Order completes late' : 'Order not late'}</dd></div>
                      <div><dt className="text-stone-500">Frozen operation</dt><dd className="font-semibold">{selectedBar.frozen ? 'Yes' : 'No'}</dd></div>
                      {scenario?.start && <div className="col-span-2"><dt className="text-stone-500">Absolute start</dt><dd className="font-semibold">{formatAbsoluteTime(scenario.start, selectedBar.start)}</dd></div>}
                    </dl>
                  ) : (
                    <p className="mt-2 text-xs text-stone-700">{selectedBar.machine_id ?? 'Machine'} · {selectedBar.start}–{selectedBar.end} min · {selectedBar.reason || 'Reason unavailable'}</p>
                  )}
                </div>
              )}
            </>
          )}
        </section>

        <section id="validation-panel" aria-labelledby="validation-heading" className="scroll-mt-4 rounded-2xl border border-stone-300 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#0E4B3E]">05 · Validate</p>
              <h2 id="validation-heading" className="mt-1 text-base font-bold text-[#181816]">Independent constraint validation</h2>
              <p className="mt-1 text-xs text-stone-600">This panel reports the validator API result; a schedule’s solver status alone is not validation.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="validation-solver" className="sr-only">Schedule to validate</label>
              <select id="validation-solver" value={selectedSolver} onChange={(event) => setSelectedSolver(event.target.value as SchedulerType)} className="h-9 rounded-lg border border-stone-300 bg-white px-2 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0E4B3E]">
                {(['edf', 'cpsat'] as SchedulerType[]).map((solver) => <option key={solver} value={solver}>{solverLabels[solver]}</option>)}
              </select>
              <Button size="sm" onClick={() => void handleValidate()} disabled={!selectedSchedule || loading}>
                {busyAction === 'validate' ? 'Validating…' : 'Run independent validation'}
              </Button>
            </div>
          </div>
          <div className="mt-4 rounded-xl border border-stone-200 bg-[#FAF7F0] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-[#181816]">{solverLabels[selectedSolver]}</span>
                <StatusBadge status={validationTitle(selectedValidation, selectedValidationError)} />
              </div>
              <p className="text-xs text-stone-600">Violations: <strong>{selectedValidation ? selectedValidation.violation_count : 'Unavailable'}</strong></p>
            </div>
            {!selectedSchedule && <p className="mt-2 text-xs text-stone-600">Run the selected solver before validation.</p>}
            {selectedValidationError && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <p role="alert" className="text-xs text-rose-800 flex-1">{selectedValidationError}</p>
                <Button size="xs" variant="outline" onClick={() => void handleValidate()} disabled={busyAction === 'validate' || loading || !selectedSchedule}>
                  {busyAction === 'validate' ? 'Retrying…' : 'Retry validation'}
                </Button>
              </div>
            )}
            {selectedValidation?.status === 'valid' && selectedValidation.violation_count === 0 && (
              <p role="status" className="mt-2 text-sm font-semibold text-emerald-900">Independent validator confirmed a valid schedule with zero violations.</p>
            )}
            {selectedValidation?.status === 'invalid' && (
              <p role="alert" className="mt-2 text-sm font-semibold text-rose-900">Invalid schedule — do not present this plan as valid.</p>
            )}
          </div>
          {selectedValidation && selectedValidation.violations.length > 0 && (
            <ViolationList violations={selectedValidation.violations} />
          )}
          {selectedValidation && selectedValidation.violations.length === 0 && selectedValidation.status === 'invalid' && (
            <p role="alert" className="mt-3 text-xs text-rose-800">The validator returned an invalid status with no listed violations. Treat the result as invalid and investigate the API response.</p>
          )}
          {!selectedValidation && !selectedValidationError && <p className="mt-3 text-xs text-stone-500">Validation is unavailable until the independent endpoint has returned a result.</p>}
        </section>

        <section id="disruption-panel" aria-labelledby="disruption-heading" className="scroll-mt-4 rounded-2xl border border-amber-300 bg-white p-4 shadow-sm sm:p-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-800">06 · Simulate disruption</p>
            <h2 id="disruption-heading" className="mt-1 text-base font-bold text-[#181816]">What-if recovery plan</h2>
            <p className="mt-1 text-xs text-stone-600">Re-planning requires an independently validated feasible baseline. The original result is retained.</p>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(250px,0.8fr)]">
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2" role="group" aria-label="Disruption type">
                {([
                  { id: 'machine_down', label: 'Machine breakdown' },
                  { id: 'yarn_delay', label: 'Delayed yarn' },
                ] as const).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={disruptionType === item.id}
                    onClick={() => { setDisruptionType(item.id); setDisruptionError(null) }}
                    className={`rounded-lg border px-3 py-2 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0E4B3E] ${disruptionType === item.id ? 'border-[#0E4B3E] bg-emerald-50 text-[#0E4B3E]' : 'border-stone-300 text-stone-700'}`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              {disruptionType === 'machine_down' ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-semibold text-stone-700 sm:col-span-2">
                    Machine
                    <select value={disruptionMachine} onChange={(event) => setDisruptionMachine(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0E4B3E]">
                      <option value="">Select a scenario machine</option>
                      {scenario?.machines.map((machine: ScenarioMachine) => <option key={machine.id} value={machine.id}>{machine.id} · {machine.stage}</option>)}
                    </select>
                  </label>
                  <label className="text-xs font-semibold text-stone-700">Breakdown start (minutes from scenario start)
                    <input type="number" min="0" step="1" value={breakdownStart} onChange={(event) => setBreakdownStart(event.target.value)} placeholder="e.g. 1200" className="mt-1 h-10 w-full rounded-lg border border-stone-300 px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0E4B3E]" />
                  </label>
                  <label className="text-xs font-semibold text-stone-700">Breakdown end (minutes from scenario start)
                    <input type="number" min="1" step="1" value={breakdownEnd} onChange={(event) => setBreakdownEnd(event.target.value)} placeholder="e.g. 1440" className="mt-1 h-10 w-full rounded-lg border border-stone-300 px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0E4B3E]" />
                  </label>
                  <label className="text-xs font-semibold text-stone-700 sm:col-span-2">Reason (optional)
                    <input type="text" maxLength={200} value={breakdownReason} onChange={(event) => setBreakdownReason(event.target.value)} placeholder="Reason supported by the disruption contract" className="mt-1 h-10 w-full rounded-lg border border-stone-300 px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0E4B3E]" />
                  </label>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                  <label className="text-xs font-semibold text-stone-700 sm:col-span-3">Order / yarn lot
                    <select value={delayOrder} onChange={(event) => setDelayOrder(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0E4B3E]">
                      <option value="">Select a scenario order</option>
                      {scenario?.orders.map((order: ScenarioOrder) => <option key={order.id} value={order.id}>{order.id}{order.fabric ? ` · ${order.fabric}` : ''}</option>)}
                    </select>
                  </label>
                  <label className="text-xs font-semibold text-stone-700">Delay duration
                    <input type="number" min="0.01" step={delayUnit === 'hours' ? '1' : '1'} value={delayAmount} onChange={(event) => setDelayAmount(event.target.value)} placeholder={delayUnit === 'hours' ? 'Hours' : 'Minutes'} className="mt-1 h-10 w-full rounded-lg border border-stone-300 px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0E4B3E]" />
                  </label>
                  <label className="text-xs font-semibold text-stone-700">Units
                    <select value={delayUnit} onChange={(event) => setDelayUnit(event.target.value as 'minutes' | 'hours')} className="mt-1 h-10 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0E4B3E]">
                      <option value="hours">Hours</option>
                      <option value="minutes">Minutes</option>
                    </select>
                  </label>
                  <div className="self-end pb-2 text-[10px] text-stone-500">The selected unit is sent explicitly to the API.</div>
                </div>
              )}
              {disruptionError && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <p role="alert" className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-xs text-rose-900 flex-1">{disruptionError}</p>
                  <Button size="xs" variant="outline" onClick={() => void submitDisruption()} disabled={busyAction === 'disruption' || loading || !scenario || !selectedSchedule}>
                    {busyAction === 'disruption' ? 'Retrying…' : 'Retry disruption'}
                  </Button>
                </div>
              )}
              <Button onClick={() => void submitDisruption()} disabled={!scenario || loading || !selectedSchedule} variant="danger">
                {busyAction === 'disruption' ? 'Re-planning…' : 'Simulate and re-plan'}
              </Button>
              <Button onClick={resetDisruption} disabled={loading} variant="outline" className="ml-2">
                Reset disruption
              </Button>
            </div>
            <aside className="rounded-xl border border-stone-200 bg-[#FAF7F0] p-3 text-xs text-stone-700" aria-label="Selected baseline schedule readiness">
              <h3 className="font-bold text-[#181816]">Re-plan baseline</h3>
              <p className="mt-2">Solver: <strong>{solverLabels[selectedSolver]}</strong></p>
              <p className="mt-1">Solver status: <strong>{selectedSchedule?.status ?? 'Unavailable'}</strong></p>
              <p className="mt-1">Independent validation: <strong>{validationTitle(selectedValidation, selectedValidationError)}</strong></p>
              {disruptionType === 'yarn_delay' && selectedOrder && (
                <p className="mt-2 border-t border-stone-200 pt-2">Selected order: {selectedOrder.id}; current yarn-ready time {displayValue(selectedOrder.yarn_ready, ' min')}.</p>
              )}
              <p className="mt-2 border-t border-stone-200 pt-2 text-stone-500">Request limit: 30 seconds solver time. A request timeout or failed re-plan will be shown explicitly.</p>
            </aside>
          </div>
        </section>

        <section id="impact-panel" aria-labelledby="impact-heading" className="scroll-mt-4 rounded-2xl border border-stone-300 bg-white p-4 shadow-sm sm:p-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#0E4B3E]">07 · Review impact</p>
            <h2 id="impact-heading" className="mt-1 text-base font-bold text-[#181816]">Before-and-after recovery impact</h2>
            <p className="mt-1 text-xs text-stone-600">Order classifications below are backend-generated. Operation shifts compare matching order-stage operations only.</p>
          </div>
          {!disruptionResult && !disruptionError ? (
            <div className="mt-4 rounded-lg border border-dashed border-stone-300 bg-stone-50 p-6 text-center text-sm text-stone-600">
              Submit a disruption to review its backend diff and returned metrics.
            </div>
          ) : (
            <>
              {disruptionError && <p role="alert" className="mt-4 rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-900">{disruptionError}</p>}
              {disruptionResult && (
                <>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">Re-plan result</span>
                    <StatusBadge status={disruptionResult.schedule?.status ?? (disruptionResult.ok ? 'Unavailable' : 'INFEASIBLE')} />
                    <span className="text-xs text-stone-600">Independent validation: <StatusBadge status={validationTitle(disruptionValidation ?? undefined, disruptionError ?? undefined)} /></span>
                  </div>
                  {disruptionResult.schedule && (!isSolverSuccess(disruptionResult.schedule) || disruptionValidation?.status !== 'valid' || disruptionValidation.violation_count !== 0) && (
                    <p role="alert" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
                      The returned re-plan is not confirmed as a valid complete schedule. Do not use it as an approved production plan.
                    </p>
                  )}
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full min-w-[640px] border-collapse text-left text-xs">
                      <caption className="sr-only">Disruption impact metrics returned by the backend</caption>
                      <thead><tr className="border-b border-stone-200 text-[10px] uppercase text-stone-500"><th scope="col" className="py-2">Metric</th><th scope="col" className="px-3 py-2">Before</th><th scope="col" className="px-3 py-2">After</th><th scope="col" className="px-3 py-2">Change</th></tr></thead>
                      <tbody className="divide-y divide-stone-100">
                        {([
                          ['Weighted tardiness', 'weighted_tardiness', 'weighted min'],
                          ['On-time rate', 'on_time_rate', 'rate'],
                          ['Makespan', 'makespan', 'min'],
                          ['Utilisation', 'utilisation', 'rate'],
                        ] as const).map(([label, key, unit]) => {
                          const before = disruptionResult.previous_metrics?.[key]
                          const after = disruptionResult.new_metrics?.[key]
                          const change = isFiniteNumber(before) && isFiniteNumber(after) ? metricChange(before, after) : null
                          const format = (value: number | null | undefined) => !isFiniteNumber(value)
                            ? 'Unavailable'
                            : unit === 'rate' ? `${(value * 100).toFixed(1)}%` : `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${unit}`
                          return (
                            <tr key={key}>
                              <th scope="row" className="py-2 font-semibold">{label}</th>
                              <td className="px-3 py-2">{format(before)}</td>
                              <td className="px-3 py-2">{format(after)}</td>
                              <td className="px-3 py-2">{change ? `${change.absolute > 0 ? '+' : ''}${unit === 'rate' ? `${(change.absolute * 100).toFixed(1)} pp` : `${change.absolute.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${unit}`}` : 'Unavailable'}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  {disruptionResult.diff ? (
                    <>
                      <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {[
                          ['Operations moved', disruptionResult.diff.moved_orders?.length],
                          ['Frozen operations', disruptionResult.diff.frozen_count],
                          ['Interrupted operations', disruptionResult.diff.interrupted?.length],
                          ['Split operations', disruptionResult.diff.split_count],
                        ].map(([label, value]) => (
                          <div key={String(label)} className="rounded-lg border border-stone-200 bg-[#FAF7F0] p-2">
                            <dt className="text-[10px] text-stone-500">{label}</dt><dd className="mt-1 text-sm font-bold">{isFiniteNumber(value) ? value : 'Unavailable'}</dd>
                          </div>
                        ))}
                      </dl>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                        <ImpactList title="Moved orders" values={disruptionResult.diff.moved_orders} />
                        <ImpactList title="Newly late" values={disruptionResult.diff.now_late} />
                        <ImpactList title="Newly at risk" values={disruptionResult.diff.now_at_risk} />
                        <ImpactList title="Recovered" values={disruptionResult.diff.recovered} />
                        <ImpactList title="Unchanged" values={disruptionResult.diff.unchanged} />
                      </div>
                      {operationChanges.length > 0 && (
                        <div className="mt-4">
                          <h3 className="text-xs font-bold text-[#181816]">Changed matched operations</h3>
                          <p className="mt-1 text-[10px] text-stone-500">Only matching order-stage pairs are compared; missing operations are not classified as impact.</p>
                          <div className="mt-2 overflow-x-auto">
                            <table className="w-full min-w-[560px] border-collapse text-left text-xs">
                              <thead><tr className="border-b border-stone-200 text-[10px] uppercase text-stone-500"><th scope="col" className="py-2">Operation</th><th scope="col" className="px-3 py-2">Machine reassigned</th><th scope="col" className="px-3 py-2">Start shift</th><th scope="col" className="px-3 py-2">End / delay shift</th></tr></thead>
                              <tbody className="divide-y divide-stone-100">
                                {operationChanges.map((change) => (
                                  <tr key={change.key}>
                                    <th scope="row" className="py-2 font-semibold">{change.order} · {change.stage}</th>
                                    <td className="px-3 py-2">{change.machineChanged ? 'Yes' : 'No'}</td>
                                    <td className="px-3 py-2">{change.startChange > 0 ? '+' : ''}{change.startChange} min</td>
                                    <td className="px-3 py-2">{change.endChange > 0 ? '+' : ''}{change.endChange} min</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="mt-3 text-xs text-stone-600">Backend-generated impact diff unavailable.</p>
                  )}
                </>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  )
}

function ViolationList({ violations }: { violations: ValidationViolation[] }) {
  return (
    <div className="mt-3 space-y-3">
      {groupValidationViolations(violations).map(([severity, items]) => (
        <div key={severity}>
          <h3 className="text-xs font-bold capitalize text-stone-700">{severity} · {items.length}</h3>
          <ul className="mt-2 space-y-2">
            {items.map((violation, index) => (
              <li key={`${violation.code}-${violation.rule ?? index}-${index}`} className={`rounded-lg border p-3 text-xs ${severity === 'error' ? 'border-rose-200 bg-rose-50 text-rose-950' : 'border-amber-200 bg-amber-50 text-amber-950'}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <code className="font-bold">{violation.code}</code>
                  {isFiniteNumber(violation.rule) && <span className="text-[10px]">Rule {violation.rule}</span>}
                  {violation.order && <span>Order: {violation.order}</span>}
                  {violation.stage && <span>Stage: {violation.stage}</span>}
                  {violation.machine && <span>Machine: {violation.machine}</span>}
                </div>
                <p className="mt-1">{violation.message}</p>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

function ImpactList({ title, values }: { title: string; values: unknown }) {
  if (!Array.isArray(values)) {
    return <div className="rounded-lg border border-stone-200 p-2"><h3 className="text-[10px] font-semibold">{title}</h3><p className="mt-1 text-xs text-stone-500">Unavailable</p></div>
  }
  return (
    <div className="rounded-lg border border-stone-200 p-2">
      <h3 className="text-[10px] font-semibold">{title} · {values.length}</h3>
      {values.length > 0
        ? <ul className="mt-1 space-y-1 text-xs text-stone-700">{values.map((value, index) => <li key={`${String(value)}-${index}`}>{typeof value === 'string' ? value : isRecord(value) ? JSON.stringify(value) : 'Unavailable item'}</li>)}</ul>
        : <p className="mt-1 text-xs text-stone-500">None reported</p>}
    </div>
  )
}
