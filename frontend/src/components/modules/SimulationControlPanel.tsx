'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button, Card, Badge, MaterialIcon, Progress } from '@/components/ui'
import { api, SimulationStatus, SimulationControlRequest } from '@/lib/api'
import { UserRole } from '@/lib/permissions'

interface SimulationControlPanelProps {
  currentRole?: UserRole
  className?: string
}

export function SimulationControlPanel({ currentRole = 'admin', className = '' }: SimulationControlPanelProps) {
  const [status, setStatus] = useState<SimulationStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const fetchStatus = useCallback(async () => {
    try {
      const data = await api.getSimulationStatus()
      setStatus(data)
      setError(null)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch simulation status'
      setError(msg)
    }
  }, [])

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 5000) // Poll every 5 seconds
    return () => clearInterval(interval)
  }, [fetchStatus])

  const handleAction = async (action: 'start' | 'stop' | 'pause' | 'resume' | 'reset', speed?: number) => {
    setActionLoading(action)
    setError(null)
    try {
      switch (action) {
        case 'start':
          await api.startSimulation()
          break
        case 'stop':
          await api.stopSimulation()
          break
        case 'pause':
          await api.pauseSimulation()
          break
        case 'resume':
          await api.resumeSimulation()
          break
        case 'reset':
          await api.resetSimulation()
          break
      }
      if (speed !== undefined) {
        await api.setSimulationSpeed(speed)
      }
      await fetchStatus()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : `Failed to ${action} simulation`
      setError(msg)
    } finally {
      setActionLoading(null)
    }
  }

  const handleSpeedChange = async (speed: number) => {
    setActionLoading('speed')
    setError(null)
    try {
      await api.setSimulationSpeed(speed)
      await fetchStatus()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to set simulation speed'
      setError(msg)
    } finally {
      setActionLoading(null)
    }
  }

  const canControl = currentRole === 'admin' || currentRole === 'production_manager'
  const isAdmin = currentRole === 'admin'

  if (!status) {
    return (
      <Card variant="elevated" padding="md" className={className}>
        <div className="flex items-center justify-center py-8 text-stone-500">
          <div className="size-6 animate-spin rounded-full border-2 border-[#0E4B3E] border-t-transparent" />
          <span className="ml-3 text-sm font-mono">Loading simulation status...</span>
        </div>
      </Card>
    )
  }

  const statusColors = {
    stopped: { bg: 'bg-stone-100', text: 'text-stone-800', border: 'border-stone-300', dot: 'bg-stone-500' },
    running: { bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-300', dot: 'bg-emerald-600' },
    paused: { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-300', dot: 'bg-amber-600' },
  }

  const statusConfig = statusColors[status.status] || statusColors.stopped

  return (
    <Card variant="elevated" padding="md" className={className}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <h2 className="text-sm font-bold text-[#181816] flex items-center gap-1.5">
          <MaterialIcon name="precision_manufacturing" size="sm" color="#0E4B3E" />
          Simulation Clock
        </h2>
        <Badge variant="default" size="xs" className={`${statusConfig.bg} ${statusConfig.text} ${statusConfig.border} gap-1 font-semibold`}>
          <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.dot} animate-pulse`} />
          {status.status.charAt(0).toUpperCase() + status.status.slice(1)}
        </Badge>
      </div>

      {error && (
        <div className="p-2 bg-red-50 border border-red-200 rounded-lg text-red-800 text-xs font-mono mb-4" role="alert">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="bg-white border border-stone-200 rounded-xl p-3 shadow-xs space-y-1">
          <div className="text-stone-500 text-[10px] uppercase font-semibold">Simulation Speed</div>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold font-mono text-[#0E4B3E]">{status.speed.toFixed(1)}x</span>
            <span className="text-[10px] text-stone-500">sim min / real sec</span>
          </div>
        </div>

        <div className="bg-white border border-stone-200 rounded-xl p-3 shadow-xs space-y-1">
          <div className="text-stone-500 text-[10px] uppercase font-semibold">Simulated Time</div>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold font-mono text-[#181816]">{status.simulated_time.toLocaleString()}</span>
            <span className="text-[10px] text-stone-500">minutes elapsed</span>
          </div>
        </div>

        <div className="bg-white border border-stone-200 rounded-xl p-3 shadow-xs space-y-1">
          <div className="text-stone-500 text-[10px] uppercase font-semibold">Active Runs</div>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold font-mono text-[#15803D]">{status.active_runs}</span>
            <span className="text-[10px] text-stone-500">production runs</span>
          </div>
        </div>

        <div className="bg-white border border-stone-200 rounded-xl p-3 shadow-xs space-y-1">
          <div className="text-stone-500 text-[10px] uppercase font-semibold">Blocked Operations</div>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold font-mono text-[#E05326]">{status.blocked_operations}</span>
            <span className="text-[10px] text-stone-500">waiting for resources</span>
          </div>
        </div>
      </div>

      {/* Speed Control */}
      <div className="mb-4 p-3 bg-[#FAF7F0] border border-stone-200 rounded-xl space-y-2">
        <div className="flex items-center justify-between text-stone-500 text-[10px] uppercase font-semibold">
          <span>Simulation Speed Control</span>
          <span className="font-mono text-[#0E4B3E]">{status.speed.toFixed(1)}x</span>
        </div>
        <input
          type="range"
          min="0.1"
          max="10"
          step="0.1"
          value={status.speed}
          onChange={(e) => handleSpeedChange(parseFloat(e.target.value))}
          disabled={actionLoading === 'speed' || !canControl}
          className="w-full h-2 bg-white border border-stone-300 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#0E4B3E] [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:shadow-md"
        />
        <div className="flex justify-between text-[10px] text-stone-500 font-mono">
          <span>0.1x</span>
          <span>1x (default)</span>
          <span>10x</span>
        </div>
      </div>

      {/* Control Buttons */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Simulation controls">
        {canControl && (
          <>
            {status.status === 'stopped' && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleAction('start')}
                disabled={actionLoading !== null}
                icon={<MaterialIcon name="play_arrow" size="xs" />}
              >
                {actionLoading === 'start' ? 'Starting…' : 'Start Simulation'}
              </Button>
            )}

            {status.status === 'running' && (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleAction('pause')}
                  disabled={actionLoading !== null}
                  icon={<MaterialIcon name="pause" size="xs" />}
                >
                  {actionLoading === 'pause' ? 'Pausing…' : 'Pause'}
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => handleAction('stop')}
                  disabled={actionLoading !== null}
                  icon={<MaterialIcon name="stop" size="xs" />}
                >
                  {actionLoading === 'stop' ? 'Stopping…' : 'Stop'}
                </Button>
              </>
            )}

            {status.status === 'paused' && (
              <>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handleAction('resume')}
                  disabled={actionLoading !== null}
                  icon={<MaterialIcon name="play_arrow" size="xs" />}
                >
                  {actionLoading === 'resume' ? 'Resuming…' : 'Resume'}
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => handleAction('stop')}
                  disabled={actionLoading !== null}
                  icon={<MaterialIcon name="stop" size="xs" />}
                >
                  {actionLoading === 'stop' ? 'Stopping…' : 'Stop'}
                </Button>
              </>
            )}

            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleAction('reset')}
                disabled={actionLoading === 'reset' || status.status === 'running'}
                icon={<MaterialIcon name="refresh" size="xs" />}
              >
                {actionLoading === 'reset' ? 'Resetting…' : 'Reset Simulation'}
              </Button>
            )}
          </>
        )}

        {!canControl && (
          <span className="self-center text-xs text-stone-500 font-mono">
            Read-only view (Admin/Prod Mgr required)
          </span>
        )}
      </div>

      {actionLoading && (
        <div className="mt-2 text-center text-xs text-stone-500">
          <div className="flex items-center justify-center gap-1.5">
            <div className="size-4 animate-spin rounded-full border-2 border-[#0E4B3E] border-t-transparent" />
            <span>Processing {actionLoading}…</span>
          </div>
        </div>
      )}
    </Card>
  )
}