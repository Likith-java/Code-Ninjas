import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildCompareRequest,
  buildDisruptionRequest,
  compareOperations,
  getLateOrders,
  getTimelinePosition,
  isDisruptionResponse,
  isScenarioDetail,
  isScenarioList,
  isSchedule,
  isValidationResponse,
  metricChange,
  validationTitle,
} from '../src/lib/scheduler-view-model.mjs'

const metrics = {
  weighted_tardiness: 0,
  on_time_rate: 1,
  utilisation: 0.5,
  makespan: 100,
}

function schedule(status = 'FEASIBLE', overrides = {}) {
  return {
    id: 'schedule-1',
    scenario_id: 'feasible-load',
    solver: 'cpsat',
    status,
    compute_seconds: 0.2,
    metrics,
    validation: { status: 'valid', violations: [] },
    operations: [],
    warnings: [],
    diagnostics: {},
    ...overrides,
  }
}

test('scenario selector accepts supported scenario summaries and rejects malformed entries', () => {
  const scenarioList = [{
    id: 'feasible_load',
    name: 'Feasible Load',
    description: 'Base case',
    orders: 12,
    machines: 10,
    machines_by_stage: { spinning: 3, weaving: 5, dyeing: 2 },
    horizon: 10080,
    now: 0,
    total_metres: 1000,
    downtime_windows: 1,
    frozen_operations: 0,
  }]
  assert.equal(isScenarioList(scenarioList), true)
  assert.equal(isScenarioList([{ ...scenarioList[0], orders: '12' }]), false)
})

test('scenario detail tolerates unavailable readiness fields but rejects malformed downtime', () => {
  const detail = {
    scenario_id: 'feasible-load',
    description: 'Base case',
    synthetic_data: true,
    start: null,
    now: null,
    horizon: null,
    route: ['spinning', 'weaving', 'dyeing'],
    machines: [{ id: 'SPIN-01', stage: 'spinning', downtime: null }],
    orders: [{ id: 'ORD-001', metres: 300, due: 480, yarn_ready: null }],
    frozen: [],
    stats: {},
    consistency_warnings: [],
  }
  assert.equal(isScenarioDetail(detail), true)
  assert.equal(isScenarioDetail({
    ...detail,
    machines: [{ id: 'SPIN-01', stage: 'spinning', downtime: [{ start: 'bad', end: 10 }] }],
  }), false)
})

test('schedule response preserves FEASIBLE and OPTIMAL distinctly and rejects malformed data', () => {
  assert.equal(isSchedule(schedule('FEASIBLE')), true)
  assert.equal(isSchedule(schedule('OPTIMAL')), true)
  assert.equal(isSchedule(schedule('INFEASIBLE')), true)
  assert.equal(isSchedule(schedule('FEASIBLE', { compute_seconds: null, metrics: { on_time_rate: 0.8 } })), true)
  assert.equal(isSchedule(schedule('FEASIBLE', { compute_seconds: 'fast' })), false)
  assert.equal(isSchedule(schedule('FEASIBLE', { operations: [{ order: 'ORD-1' }] })), false)
})

test('independent validation distinguishes valid-zero, invalid, incomplete, and unavailable states', () => {
  const valid = { status: 'valid', violations: [], violation_count: 0 }
  const incompleteViolation = { code: 'R01_MISSING_OPERATION', rule: 1, severity: 'error', message: 'Missing stage' }
  const incomplete = { status: 'invalid', violations: [incompleteViolation], violation_count: 1 }
  const otherViolation = { code: 'R08_MACHINE_OVERLAP', rule: 8, severity: 'error', message: 'Machine overlap' }
  assert.equal(isValidationResponse(valid), true)
  assert.equal(isValidationResponse(incomplete), true)
  assert.equal(isValidationResponse({ ...valid, violation_count: 1 }), false)
  assert.equal(validationTitle(valid, undefined), 'Valid')
  assert.equal(validationTitle({ status: 'invalid', violations: [otherViolation], violation_count: 1 }, undefined), 'Invalid')
  assert.equal(validationTitle(incomplete, undefined), 'Incomplete')
  assert.equal(validationTitle(undefined, undefined), 'Not run')
  assert.equal(validationTitle(undefined, 'network unavailable'), 'Unavailable')
})

test('metric changes report absolute values and avoid dividing by a zero baseline', () => {
  assert.deepEqual(metricChange(0, 0), { absolute: 0, percent: null })
  assert.deepEqual(metricChange(0, 12), { absolute: 12, percent: null })
  assert.deepEqual(metricChange(40, 30), { absolute: -10, percent: -25 })
})

test('Gantt positioning uses absolute minute offsets and rejects invalid intervals for operations or downtime', () => {
  assert.deepEqual(getTimelinePosition(1440, 1728, 2880), { left: 50, width: 10 })
  assert.equal(getTimelinePosition(20, 10, 100), null)
  assert.equal(getTimelinePosition(-1, 10, 100), null)
})

test('late status is based on final-route completion and stays unavailable without that operation', () => {
  const operations = [
    { order: 'ORD-1', stage: 'spinning', machine: 'SPIN-1', start: 0, end: 30 },
    { order: 'ORD-1', stage: 'weaving', machine: 'WEAVE-1', start: 30, end: 70 },
    { order: 'ORD-1', stage: 'dyeing', machine: 'DYE-1', start: 70, end: 90 },
  ]
  const deadlines = [{ id: 'ORD-1', due: 80 }, { id: 'ORD-2', due: 20 }]
  const statuses = getLateOrders(operations, deadlines, ['spinning', 'weaving', 'dyeing'])
  assert.equal(statuses.get('ORD-1'), true)
  assert.equal(statuses.has('ORD-2'), false)
})

test('operation impact compares matching order-stage pairs and identifies reassignment and time shifts', () => {
  const before = schedule('FEASIBLE', {
    operations: [
      { order: 'ORD-1', stage: 'weaving', machine: 'WEAVE-1', start: 10, end: 40 },
      { order: 'ORD-2', stage: 'spinning', machine: 'SPIN-1', start: 0, end: 20 },
    ],
  })
  const after = schedule('FEASIBLE', {
    operations: [
      { order: 'ORD-1', stage: 'weaving', machine: 'WEAVE-2', start: 15, end: 50 },
      { order: 'ORD-2', stage: 'dyeing', machine: 'DYE-1', start: 20, end: 30 },
    ],
  })
  assert.deepEqual(compareOperations(before, after), [{
    key: 'ORD-1:weaving',
    order: 'ORD-1',
    stage: 'weaving',
    machineChanged: true,
    startChange: 5,
    endChange: 10,
  }])
})

test('disruption response rejects partial or malformed diffs instead of rendering a success', () => {
  const valid = {
    ok: true,
    schedule: schedule(),
    error: null,
    diff: {
      frozen_count: 0,
      split_count: 0,
      interrupted: [],
      moved_orders: [],
      now_late: [],
      now_at_risk: [],
      recovered: [],
      unchanged: [],
    },
    previous_metrics: metrics,
    new_metrics: metrics,
  }
  assert.equal(isDisruptionResponse(valid), true)
  assert.equal(isDisruptionResponse({ ...valid, diff: { moved_orders: [] } }), false)
})

test('compare API request mapping matches the backend query/body contract', () => {
  assert.deepEqual(buildCompareRequest({
    scenario_id: 'feasible_load',
    time_limit_seconds: 30,
    seed: 42,
    workers: 8,
  }), {
    url: '/scheduler/compare?scenario_id=feasible_load',
    body: { time_limit_seconds: 30, seed: 42, workers: 8 },
  })
  assert.equal(buildCompareRequest({
    scenario_id: 'demo scenario',
    time_limit_seconds: 30,
    seed: 42,
    workers: 8,
  }).url, '/scheduler/compare?scenario_id=demo%20scenario')
})

test('machine breakdown submission maps minute offsets, machine, reason, and original schedule', () => {
  const baseline = schedule()
  assert.deepEqual(buildDisruptionRequest({
    scenarioId: 'weaving_breakdown',
    schedule: baseline,
    now: 120,
    type: 'machine_down',
    machine: 'WEAVE-03',
    fromMinute: 1440,
    toMinute: 1920,
    reason: 'loom maintenance',
  }), {
    scenario_id: 'weaving_breakdown',
    current_schedule: baseline,
    now: 120,
    solver: 'cpsat',
    time_limit_seconds: 30,
    seed: 42,
    disruption_type: 'machine_down',
    machine: 'WEAVE-03',
    from_minute: 1440,
    to_minute: 1920,
    reason: 'loom maintenance',
  })
})

test('delayed-yarn submission maps the selected duration unit without converting it implicitly', () => {
  const baseline = schedule()
  const shared = {
    scenarioId: 'late_yarn_lot',
    schedule: baseline,
    now: 0,
    type: 'yarn_delay',
    order: 'ORD-007',
    delayAmount: 6,
  }
  assert.equal(buildDisruptionRequest({ ...shared, delayUnit: 'hours' }).hours, 6)
  assert.equal(buildDisruptionRequest({ ...shared, delayUnit: 'minutes' }).delay_minutes, 6)
  assert.equal('hours' in buildDisruptionRequest({ ...shared, delayUnit: 'minutes' }), false)
})
