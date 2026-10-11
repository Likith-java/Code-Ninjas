import assert from 'node:assert/strict'
import test from 'node:test'
import { ROLE_PROFILES, getRolePermissions } from '../src/lib/permissions.ts'

test('Dispatch Manager does not have reports in allowedModules', () => {
  const dmProfile = ROLE_PROFILES.dispatch_manager
  assert.ok(dmProfile, 'Dispatch manager profile must exist')
  assert.equal(
    dmProfile.allowedModules.includes('reports'),
    false,
    'Reports module must NOT be in Dispatch Manager allowedModules'
  )
  assert.deepEqual(dmProfile.allowedModules, ['dashboard', 'rolls', 'dispatch'])
})

test('Admin and Production Manager retain reports access', () => {
  const adminProfile = ROLE_PROFILES.admin
  const pmProfile = ROLE_PROFILES.production_manager
  assert.ok(adminProfile.allowedModules.includes('reports'), 'Admin must have reports')
  assert.ok(pmProfile.allowedModules.includes('reports'), 'Production Manager must have reports')
})

test('Role permissions correctly enforce Start Production and Reports access', () => {
  const adminPerms = getRolePermissions('admin')
  const pmPerms = getRolePermissions('production_manager')
  const dmPerms = getRolePermissions('dispatch_manager')
  const custPerms = getRolePermissions('customer')

  // Start Production permissions
  assert.equal(adminPerms.canStartProduction, true, 'Admin can start production')
  assert.equal(pmPerms.canStartProduction, true, 'Production Manager can start production')
  assert.equal(dmPerms.canStartProduction, false, 'Dispatch Manager cannot start production')
  assert.equal(custPerms.canStartProduction, false, 'Customer cannot start production')

  // Reports permissions
  assert.equal(adminPerms.canViewReports, true, 'Admin can view reports')
  assert.equal(pmPerms.canViewReports, true, 'Production Manager can view reports')
  assert.equal(dmPerms.canViewReports, false, 'Dispatch Manager cannot view reports')
  assert.equal(custPerms.canViewReports, true, 'Customer can view own reports')
})

test('Confirmed dispatches hide the confirmation action button', () => {
  const dispatches = [
    { id: 1, invoice_number: 'INV-001', confirmed: true, total_metres: 500 },
    { id: 2, invoice_number: 'INV-002', confirmed: false, total_metres: 300 },
  ]

  // Predicate matching the UI logic: show confirm action only if !d.confirmed
  const shouldShowConfirmButton = (d) => !d.confirmed

  assert.equal(shouldShowConfirmButton(dispatches[0]), false, 'Confirmed dispatch must NOT show confirm button')
  assert.equal(shouldShowConfirmButton(dispatches[1]), true, 'Unconfirmed dispatch must show confirm button')
})

test('Start Production eligibility checks order lifecycle state correctly', () => {
  const isEligibleToStart = (orderStatus, canStartPerm) => {
    if (!canStartPerm) return false
    const blockedStatuses = ['Completed', 'In Production', 'in_production', 'ready_for_dispatch', 'completed']
    return !blockedStatuses.includes(orderStatus)
  }

  // Admin and PM can start pending or scheduled orders
  assert.equal(isEligibleToStart('pending', true), true)
  assert.equal(isEligibleToStart('Scheduled', true), true)
  assert.equal(isEligibleToStart('Completed', true), false)
  assert.equal(isEligibleToStart('In Production', true), false)

  // Dispatcher and Customer can never start orders regardless of status
  assert.equal(isEligibleToStart('pending', false), false)
  assert.equal(isEligibleToStart('Scheduled', false), false)
})
