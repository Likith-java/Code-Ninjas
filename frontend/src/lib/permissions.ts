/**
 * Everest Textile Mills - Role-Based Access Control (RBAC) Registry
 *
 * Defines the 4 platform user roles and centralized permission matrix:
 * 1. Admin — Full factory & administrative access
 * 2. Production Manager — Floor scheduling, machines, runs, and roll quality
 * 3. Dispatch Manager — Finished goods warehouse, inspection pass, and shipping
 * 4. Customer User — Read-only tracking restricted to own orders
 */

export type UserRole = 'admin' | 'production_manager' | 'dispatch_manager' | 'customer'

export interface RoleProfile {
  id: UserRole
  name: string
  title: string
  initials: string
  badgeVariant: 'default' | 'success' | 'warning' | 'scenario' | 'metric'
  customerBuyerId?: number // Associated buyer for customer role
  customerBuyerName?: string
  allowedModules: string[]
  defaultModule: string
}

export const ROLE_PROFILES: Record<UserRole, RoleProfile> = {
  admin: {
    id: 'admin',
    name: 'Administrator',
    title: 'Executive & System Admin',
    initials: 'AD',
    badgeVariant: 'scenario',
    allowedModules: ['dashboard', 'floor', 'workforce', 'yarn', 'validator', 'rolls', 'dispatch'],
    defaultModule: 'dashboard',
  },
  production_manager: {
    id: 'production_manager',
    name: 'Production Manager',
    title: 'Unit 1 Plant Supervisor',
    initials: 'PM',
    badgeVariant: 'success',
    allowedModules: ['dashboard', 'floor', 'workforce', 'yarn', 'validator', 'rolls'],
    defaultModule: 'floor',
  },
  dispatch_manager: {
    id: 'dispatch_manager',
    name: 'Dispatch Manager',
    title: 'Logistics & Warehouse Lead',
    initials: 'DM',
    badgeVariant: 'metric',
    allowedModules: ['dashboard', 'rolls', 'dispatch'],
    defaultModule: 'dispatch',
  },
  customer: {
    id: 'customer',
    name: 'Customer Portal',
    title: 'ZARA Sourcing Buyer',
    initials: 'ZR',
    badgeVariant: 'warning',
    customerBuyerId: 1,
    customerBuyerName: 'ZARA Sourcing',
    allowedModules: ['dashboard'],
    defaultModule: 'dashboard',
  },
}

export interface Permissions {
  canManageUsers: boolean
  canCreateOrder: boolean
  canSimulateDisruption: boolean
  canTriggerReplan: boolean
  canResolveOrder: boolean
  canManageMachines: boolean
  canViewWorkforceWages: boolean
  canCreateDispatch: boolean
  canConfirmDispatch: boolean
  canViewAllBuyers: boolean
  isReadOnlyCustomer: boolean
}

export function getRolePermissions(role: UserRole): Permissions {
  switch (role) {
    case 'admin':
      return {
        canManageUsers: true,
        canCreateOrder: true,
        canSimulateDisruption: true,
        canTriggerReplan: true,
        canResolveOrder: true,
        canManageMachines: true,
        canViewWorkforceWages: true,
        canCreateDispatch: true,
        canConfirmDispatch: true,
        canViewAllBuyers: true,
        isReadOnlyCustomer: false,
      }
    case 'production_manager':
      return {
        canManageUsers: false,
        canCreateOrder: true,
        canSimulateDisruption: true,
        canTriggerReplan: true,
        canResolveOrder: true,
        canManageMachines: true,
        canViewWorkforceWages: true,
        canCreateDispatch: false,
        canConfirmDispatch: false,
        canViewAllBuyers: true,
        isReadOnlyCustomer: false,
      }
    case 'dispatch_manager':
      return {
        canManageUsers: false,
        canCreateOrder: false,
        canSimulateDisruption: false,
        canTriggerReplan: false,
        canResolveOrder: false,
        canManageMachines: false,
        canViewWorkforceWages: false,
        canCreateDispatch: true,
        canConfirmDispatch: true,
        canViewAllBuyers: true,
        isReadOnlyCustomer: false,
      }
    case 'customer':
      return {
        canManageUsers: false,
        canCreateOrder: false,
        canSimulateDisruption: false,
        canTriggerReplan: false,
        canResolveOrder: false,
        canManageMachines: false,
        canViewWorkforceWages: false,
        canCreateDispatch: false,
        canConfirmDispatch: false,
        canViewAllBuyers: false,
        isReadOnlyCustomer: true,
      }
  }
}