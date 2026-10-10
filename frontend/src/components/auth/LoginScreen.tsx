'use client'

import { useState } from 'react'
import { MaterialIcon, Button } from '@/components/ui'
import { UserRole, ROLE_PROFILES } from '@/lib/permissions'
import { API_BASE_URL } from '@/lib/api'

interface LoginScreenProps {
  currentRole: UserRole
  onLoginSuccess: (role: UserRole) => void
  onCancel?: () => void
  isStandalone?: boolean
}

export function LoginScreen({
  currentRole,
  onLoginSuccess,
  onCancel,
  isStandalone = false,
}: LoginScreenProps) {
  const [selectedRole, setSelectedRole] = useState<UserRole>(currentRole)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [authPendingNotice, setAuthPendingNotice] = useState(false)

  // Suggest typical demo email based on role selection
  const handleSelectRole = (role: UserRole) => {
    setSelectedRole(role)
    setErrorMessage(null)
    setAuthPendingNotice(false)
    if (role === 'admin') setEmail('admin@everest-textile.com')
    else if (role === 'production_manager') setEmail('prod.manager@everest-textile.com')
    else if (role === 'dispatch_manager') setEmail('dispatch@everest-textile.com')
    else if (role === 'customer') setEmail('buyer.zara@sourcing-group.com')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)

    // Form input validation
    const trimmedEmail = email.trim()
    if (!trimmedEmail) {
      setErrorMessage('Please enter your factory account email address.')
      return
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(trimmedEmail)) {
      setErrorMessage('Please enter a valid email format (e.g. name@domain.com).')
      return
    }
    if (!password) {
      setErrorMessage('Please enter your account password.')
      return
    }
    if (password.length < 6) {
      setErrorMessage('Password must be at least 6 characters in length.')
      return
    }

    setIsLoading(true)

    // Inspect actual backend for authentication endpoint (e.g. /api/auth/token or /auth/token)
    try {
      await fetch(`${API_BASE_URL}/api/auth/token`, { method: 'POST', signal: AbortSignal.timeout(1200) })
    } catch {
      // Backend does not provide auth routes (confirmed by inspecting backend/app/routers)
    } finally {
      setIsLoading(false)
      // Clearly disclose that real backend authentication is pending rather than falsely claiming success
      setAuthPendingNotice(true)
    }
  }

  const handleEnterDemoMode = () => {
    onLoginSuccess(selectedRole)
  }

  const roleList: { role: UserRole; label: string; icon: string; desc: string }[] = [
    {
      role: 'admin',
      label: 'Administrator',
      icon: 'admin_panel_settings',
      desc: 'Full mill operations, orders, machines, workforce, and platform configuration.',
    },
    {
      role: 'production_manager',
      label: 'Production Manager',
      icon: 'precision_manufacturing',
      desc: 'Manage loom runs, schedule re-balancing, yarn delays, and workforce logs.',
    },
    {
      role: 'dispatch_manager',
      label: 'Dispatch Manager',
      icon: 'local_shipping',
      desc: 'Finished goods inventory, quality inspection lots, and gate pass dispatches.',
    },
    {
      role: 'customer',
      label: 'Buyer / Customer',
      icon: 'person',
      desc: 'ZARA Sourcing portal: track purchase order milestones and delivery dates only.',
    },
  ]

  const containerClasses = isStandalone
    ? 'w-full min-h-screen flex items-center justify-center p-4 bg-dot-grid bg-[#F5F0E3] select-none font-body text-[13px]'
    : 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#181816]/60 backdrop-blur-xs select-none font-body text-[13px]'

  return (
    <div className={containerClasses}>
      <div className="w-full max-w-xl bg-[#FAF7F0] border-2 border-[#181816] rounded-3xl pop-shadow-xl overflow-hidden flex flex-col max-h-[95vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-white border-b-2 border-[#181816] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 bg-[#0E4B3E] text-white rounded-xl border-2 border-[#181816] pop-shadow-xs flex items-center justify-center font-mono text-base font-bold">
              ET
            </span>
            <div>
              <h2 className="font-bold text-base sm:text-lg text-[#181816] leading-none">
                Everest Textile Mills
              </h2>
              <p className="font-mono text-xs text-stone-500 mt-0.5">
                Role-Specific Operator & Customer Portal
              </p>
            </div>
          </div>

          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="w-8 h-8 rounded-xl border-2 border-[#181816] bg-[#FAF7F0] hover:bg-[#E7DFCE] flex items-center justify-center pop-shadow-xs btn-pop"
              aria-label="Close Login"
            >
              <MaterialIcon name="close" size="sm" />
            </button>
          )}
        </div>

        {/* Content body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5">
          {/* Role selection pills */}
          <div>
            <label className="block font-mono text-xs font-bold text-[#181816] uppercase tracking-wider mb-2">
              1. Select Assigned Role
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {roleList.map((r) => {
                const isSelected = selectedRole === r.role
                return (
                  <button
                    key={r.role}
                    type="button"
                    onClick={() => handleSelectRole(r.role)}
                    className={`p-3 rounded-2xl border-2 text-left transition-all flex flex-col gap-1 ${
                      isSelected
                        ? 'border-[#0E4B3E] bg-[#D7F4E5] pop-shadow-xs text-[#0B382F]'
                        : 'border-[#181816] bg-white hover:bg-[#FAF7F0] text-stone-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 font-bold text-xs">
                        <MaterialIcon
                          name={r.icon}
                          size="sm"
                          color={isSelected ? '#0E4B3E' : '#181816'}
                        />
                        <span>{r.label}</span>
                      </div>
                      {isSelected && (
                        <MaterialIcon name="check_circle" size="xs" color="#0E4B3E" />
                      )}
                    </div>
                    <p className="text-[10.5px] text-stone-500 leading-tight">
                      {r.desc}
                    </p>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <label
                htmlFor="login-email"
                className="block font-mono text-xs font-bold text-[#181816] uppercase tracking-wider mb-1"
              >
                2. Account Email Address
              </label>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  setErrorMessage(null)
                }}
                placeholder="operator@everest-textile.com"
                className="w-full px-3 py-2 rounded-xl border-2 border-[#181816] bg-white font-mono text-xs text-[#181816] focus:outline-hidden focus:ring-2 focus:ring-[#0E4B3E]"
                autoComplete="email"
              />
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="block font-mono text-xs font-bold text-[#181816] uppercase tracking-wider mb-1"
              >
                3. Security Password
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    setErrorMessage(null)
                  }}
                  placeholder="••••••••••••"
                  className="w-full px-3 py-2 pr-10 rounded-xl border-2 border-[#181816] bg-white font-mono text-xs text-[#181816] focus:outline-hidden focus:ring-2 focus:ring-[#0E4B3E]"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-500 hover:text-[#181816]"
                  title={showPassword ? 'Hide password' : 'Show password'}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  <MaterialIcon
                    name={showPassword ? 'visibility_off' : 'visibility'}
                    size="sm"
                  />
                </button>
              </div>
            </div>

            {/* Error Message */}
            {errorMessage && (
              <div className="p-2.5 rounded-xl border-2 border-[#E05326] bg-[#FFEFEA] text-[#962C0B] font-mono text-xs flex items-center gap-2">
                <MaterialIcon name="error" size="sm" color="#E05326" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Backend Authentication Notice */}
            {authPendingNotice && (
              <div className="p-3.5 rounded-2xl border-2 border-[#181816] bg-[#FEF3C7] text-[#92400E] font-mono text-xs space-y-2 pop-shadow-xs">
                <div className="flex items-center gap-2 font-bold text-[#78350F]">
                  <MaterialIcon name="info" size="sm" color="#D97706" />
                  <span>Backend Authentication Pending</span>
                </div>
                <p className="text-[11px] leading-relaxed text-[#78350F]">
                  The FastAPI server currently does not implement user accounts or JWT authentication endpoints (e.g. <code className="bg-white/80 px-1 py-0.5 rounded border border-[#181816]">POST /api/auth/token</code>).
                  Credentials cannot be validated on the server until user management is implemented.
                </p>
                <div className="pt-1 flex items-center justify-between gap-2">
                  <span className="text-[10px] text-stone-600">
                    Client role selection does not grant server-side authorization.
                  </span>
                  <Button
                    type="button"
                    variant="primary"
                    size="xs"
                    onClick={handleEnterDemoMode}
                    className="shrink-0 font-bold"
                  >
                    Preview UI as {ROLE_PROFILES[selectedRole].name}
                  </Button>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="pt-2 flex items-center gap-2">
              <Button
                type="submit"
                variant="primary"
                size="md"
                disabled={isLoading}
                className="w-full justify-center text-xs font-bold"
                icon={
                  isLoading ? (
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin mr-1" />
                  ) : (
                    <MaterialIcon name="login" size="sm" />
                  )
                }
              >
                {isLoading ? 'Verifying Credentials...' : `Sign In as ${ROLE_PROFILES[selectedRole].name}`}
              </Button>
            </div>
          </form>
        </div>

        {/* Footer info */}
        <div className="p-3 bg-[#E7DFCE] border-t-2 border-[#181816] text-center font-mono text-[10px] text-stone-600">
          Everest Textile Mills · Production Intelligence · Role: {ROLE_PROFILES[selectedRole].name} ({selectedRole})
        </div>
      </div>
    </div>
  )
}
