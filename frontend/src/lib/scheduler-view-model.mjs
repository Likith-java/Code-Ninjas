const stages = ['spinning', 'weaving', 'dyeing']

export function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

export function isScenarioList(value) {
  return Array.isArray(value) && value.every((item) =>
    isRecord(item)
      && typeof item.id === 'string'
      && typeof item.name === 'string'
      && typeof item.description === 'string'
      && isFiniteNumber(item.orders)
      && isFiniteNumber(item.machines)
      && isFiniteNumber(item.horizon)
      && isFiniteNumber(item.now)
  )
}

export function isScenarioDetail(value) {
  return isRecord(value)
    && typeof value.scenario_id === 'string'
    && typeof value.description === 'string'
    && (value.start === undefined || value.start === null || typeof value.start === 'string')
    && Array.isArray(value.machines)
    && value.machines.every((machine) =>
      isRecord(machine)
        && typeof machine.id === 'string'
        && stages.includes(machine.stage)
        && (machine.downtime === undefined || machine.downtime === null || Array.isArray(machine.downtime))
        && (machine.downtime === undefined || machine.downtime === null || machine.downtime.every((window) =>
          isRecord(window)
            && isFiniteNumber(window.start)
            && isFiniteNumber(window.end)
            && (window.reason === undefined || window.reason === null || typeof window.reason === 'string')
        ))
    )
    && Array.isArray(value.orders)
    && value.orders.every((order) =>
      isRecord(order)
        && typeof order.id === 'string'
        && isFiniteNumber(order.metres)
        && isFiniteNumber(order.due)
        && (order.yarn_ready === undefined || order.yarn_ready === null || isFiniteNumber(order.yarn_ready))
    )
    && Array.isArray(value.route)
    && value.route.every((stage) => stages.includes(stage))
    && Array.isArray(value.frozen)
    && value.frozen.every((operation) =>
      isRecord(operation)
        && typeof operation.order === 'string'
        && typeof operation.machine === 'string'
        && stages.includes(operation.stage)
    )
    && Array.isArray(value.consistency_warnings)
    && value.consistency_warnings.every((warning) => typeof warning === 'string')
    && (value.now === undefined || value.now === null || isFiniteNumber(value.now))
    && (value.horizon === undefined || value.horizon === null || isFiniteNumber(value.horizon))
}

export function isSchedule(value) {
  if (!isRecord(value) || !isRecord(value.metrics) || !isRecord(value.validation)) return false
  const statuses = ['OPTIMAL', 'FEASIBLE', 'INFEASIBLE', 'UNKNOWN', 'MODEL_INVALID']
  return typeof value.id === 'string'
    && typeof value.scenario_id === 'string'
    && (value.solver === 'edf' || value.solver === 'cpsat')
    && statuses.includes(value.status)
    && (value.compute_seconds === undefined || value.compute_seconds === null || isFiniteNumber(value.compute_seconds))
    && Array.isArray(value.operations)
    && value.operations.every((operation) =>
      isRecord(operation)
        && typeof operation.order === 'string'
        && typeof operation.machine === 'string'
        && stages.includes(operation.stage)
        && isFiniteNumber(operation.start)
        && isFiniteNumber(operation.end)
        && (operation.quantity_metres === undefined || operation.quantity_metres === null || isFiniteNumber(operation.quantity_metres))
    )
    && ['weighted_tardiness', 'on_time_rate', 'utilisation', 'makespan']
      .every((key) => value.metrics[key] === undefined || value.metrics[key] === null || isFiniteNumber(value.metrics[key]))
    && (value.validation.status === 'valid' || value.validation.status === 'invalid')
    && Array.isArray(value.validation.violations)
}

export function isValidationResponse(value) {
  return isRecord(value)
    && (value.status === 'valid' || value.status === 'invalid')
    && Array.isArray(value.violations)
    && isFiniteNumber(value.violation_count)
    && value.violation_count === value.violations.length
    && value.violations.every((item) =>
      isRecord(item)
        && typeof item.code === 'string'
        && typeof item.message === 'string'
        && (item.severity === undefined || item.severity === null || item.severity === 'error' || item.severity === 'warning')
    )
}

function isScheduleMetrics(value) {
  return isRecord(value)
    && ['weighted_tardiness', 'on_time_rate', 'utilisation', 'makespan']
      .every((key) => value[key] === undefined || value[key] === null || isFiniteNumber(value[key]))
}

export function isDisruptionResponse(value) {
  if (!isRecord(value) || typeof value.ok !== 'boolean') return false
  if (value.schedule !== null && value.schedule !== undefined && !isSchedule(value.schedule)) return false
  if (value.error !== null && value.error !== undefined && typeof value.error !== 'string') return false
  if (value.previous_metrics !== null && value.previous_metrics !== undefined && !isScheduleMetrics(value.previous_metrics)) return false
  if (value.new_metrics !== null && value.new_metrics !== undefined && !isScheduleMetrics(value.new_metrics)) return false
  if (value.diff === null || value.diff === undefined) return true
  return isRecord(value.diff)
    && isFiniteNumber(value.diff.frozen_count)
    && isFiniteNumber(value.diff.split_count)
    && Array.isArray(value.diff.interrupted)
    && Array.isArray(value.diff.moved_orders)
    && value.diff.moved_orders.every((item) => typeof item === 'string')
    && Array.isArray(value.diff.now_late)
    && value.diff.now_late.every((item) => typeof item === 'string')
    && Array.isArray(value.diff.now_at_risk)
    && value.diff.now_at_risk.every((item) => typeof item === 'string')
    && Array.isArray(value.diff.recovered)
    && value.diff.recovered.every((item) => typeof item === 'string')
    && Array.isArray(value.diff.unchanged)
    && value.diff.unchanged.every((item) => typeof item === 'string')
}

export function buildCompareRequest(request) {
  return {
    url: `/scheduler/compare?scenario_id=${encodeURIComponent(request.scenario_id)}`,
    body: {
      time_limit_seconds: request.time_limit_seconds,
      seed: request.seed,
      workers: request.workers,
    },
  }
}

export function buildDisruptionRequest(input) {
  const common = {
    scenario_id: input.scenarioId,
    current_schedule: input.schedule,
    now: input.now,
    solver: input.solver || 'cpsat',
    time_limit_seconds: input.timeLimitSeconds || 30,
    seed: input.seed || 42,
  }
  if (input.type === 'machine_down') {
    return {
      ...common,
      disruption_type: 'machine_down',
      machine: input.machine,
      from_minute: input.fromMinute,
      to_minute: input.toMinute,
      reason: input.reason || null,
    }
  }
  return {
    ...common,
    disruption_type: 'yarn_delay',
    order: input.order,
    ...(input.delayUnit === 'hours' ? { hours: input.delayAmount } : { delay_minutes: input.delayAmount }),
  }
}

export function metricChange(before, after) {
  return {
    absolute: after - before,
    percent: before === 0 ? null : ((after - before) / Math.abs(before)) * 100,
  }
}

export function validationTitle(result, issue) {
  if (issue) return 'Unavailable'
  if (!result) return 'Not run'
  if (result.status === 'valid' && result.violation_count === 0) return 'Valid'
  if (result.violations?.some((violation) =>
    violation.code === 'R01_MISSING_OPERATION' || violation.code === 'R14_UNRESOLVED_MANDATORY'
  )) return 'Incomplete'
  return 'Invalid'
}

export function getLateOrders(operations, orders, route) {
  const lastStage = route[route.length - 1]
  if (!lastStage) return new Map()
  const result = new Map()
  for (const order of orders) {
    if (!isFiniteNumber(order.due)) continue
    const finalOperations = operations.filter((operation) => operation.order === order.id && operation.stage === lastStage)
    if (finalOperations.length === 0 || !finalOperations.every((operation) => isFiniteNumber(operation.end))) continue
    result.set(order.id, Math.max(...finalOperations.map((operation) => operation.end)) > order.due)
  }
  return result
}

export function getTimelinePosition(start, end, axisEnd) {
  if (!isFiniteNumber(start) || !isFiniteNumber(end) || !isFiniteNumber(axisEnd)
    || start < 0 || end <= start || axisEnd <= 0) return null
  return {
    left: (start / axisEnd) * 100,
    width: Math.max(((end - start) / axisEnd) * 100, 0.15),
  }
}

export function compareOperations(before, after) {
  const previous = new Map()
  for (const operation of before.operations) previous.set(`${operation.order}:${operation.stage}`, operation)
  const changes = []
  for (const operation of after.operations) {
    const oldOperation = previous.get(`${operation.order}:${operation.stage}`)
    if (!oldOperation) continue
    const startChange = operation.start - oldOperation.start
    const endChange = operation.end - oldOperation.end
    const machineChanged = operation.machine !== oldOperation.machine
    if (startChange !== 0 || endChange !== 0 || machineChanged) {
      changes.push({
        key: `${operation.order}:${operation.stage}`,
        order: operation.order,
        stage: operation.stage,
        machineChanged,
        startChange,
        endChange,
      })
    }
  }
  return changes
}

export function groupValidationViolations(violations) {
  const groups = new Map()
  for (const violation of violations) {
    const group = violation.severity || 'Uncategorized'
    groups.set(group, [...(groups.get(group) ?? []), violation])
  }
  return Array.from(groups.entries())
}
