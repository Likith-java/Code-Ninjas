'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, Button, Badge, MaterialIcon } from '@/components/ui'
import { api, BackendEmailNotification, ApiClientError } from '@/lib/api'
import { UserRole } from '@/lib/permissions'

interface NotificationAuditModalProps {
  isOpen: boolean
  onClose: () => void
  currentRole?: UserRole
}

export function NotificationAuditModal({
  isOpen,
  onClose,
  currentRole = 'admin',
}: NotificationAuditModalProps) {
  const [notifications, setNotifications] = useState<BackendEmailNotification[]>([])
  const [loading, setLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'all' | 'sent' | 'failed' | 'skipped'>('all')
  const [retryingId, setRetryingId] = useState<number | null>(null)
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  const isAdmin = currentRole === 'admin'

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    setFeedbackMsg(null)
    try {
      const data = await api.getNotifications(
        undefined,
        statusFilter === 'all' ? undefined : statusFilter
      )
      setNotifications(data)
    } catch (err: unknown) {
      const msg = err instanceof ApiClientError ? err.message : (err as Error).message
      setFeedbackMsg({ text: `Failed to load logs: ${msg}`, type: 'error' })
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => {
    if (isOpen) {
      fetchLogs()
    }
  }, [isOpen, fetchLogs])

  const handleRetry = async (id: number) => {
    if (!isAdmin) return
    setRetryingId(id)
    setFeedbackMsg(null)
    try {
      const updated = await api.retryNotification(id)
      setFeedbackMsg({
        text: `Successfully re-sent notification #${id} (${updated.status})`,
        type: 'success',
      })
      // Update list state
      setNotifications((prev) => prev.map((n) => (n.id === id ? updated : n)))
    } catch (err: unknown) {
      const msg = err instanceof ApiClientError ? err.message : (err as Error).message
      setFeedbackMsg({ text: `Retry failed: ${msg}`, type: 'error' })
    } finally {
      setRetryingId(null)
    }
  }

  if (!isOpen) return null

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'sent':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">SENT</span>
      case 'failed':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-800 border border-red-300">FAILED</span>
      case 'skipped':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">SKIPPED</span>
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-stone-100 text-stone-700 border border-stone-300">{status.toUpperCase()}</span>
    }
  }

  const formatEventType = (type: string) => {
    switch (type) {
      case 'customer_order_placed':
        return 'Customer Order Placed'
      case 'pm_order_registered':
        return 'Production Manager Notice'
      case 'dispatcher_ready_for_dispatch':
        return 'Ready for Dispatch Notice'
      default:
        return type.replace(/_/g, ' ')
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#181816]/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5">
      <Card
        variant="elevated"
        padding="lg"
        className="max-w-4xl w-full bg-white space-y-4 border-2 border-[#181816] pop-shadow-lg max-h-[88vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b-2 border-stone-200 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#0E4B3E] text-white flex items-center justify-center border border-[#0B382F] shadow-xs">
              <MaterialIcon name="mail" size="sm" color="#FFFFFF" />
            </div>
            <div>
              <h2 className="font-black text-base text-[#181816]">Email Notification Delivery Audit</h2>
              <p className="text-[11px] text-stone-500 font-mono">
                Automated SMTP lifecycle records &amp; delivery verification
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-black font-bold text-lg p-1 transition-colors"
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        {/* Filter Bar & Controls */}
        <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1.5 text-xs">
            <span className="font-bold text-stone-600 mr-1">Status:</span>
            {(['all', 'sent', 'failed', 'skipped'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold capitalize transition-colors ${
                  statusFilter === st
                    ? 'bg-[#0E4B3E] text-white'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          <button
            onClick={fetchLogs}
            disabled={loading}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#FAF7F0] border border-stone-300 text-stone-700 hover:text-black text-xs font-semibold cursor-pointer"
          >
            <MaterialIcon name="refresh" size="xs" />
            <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>

        {/* User feedback alert */}
        {feedbackMsg && (
          <div
            className={`p-2.5 rounded-lg text-xs font-semibold shrink-0 ${
              feedbackMsg.type === 'success'
                ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                : 'bg-red-50 text-red-900 border border-red-200'
            }`}
          >
            {feedbackMsg.text}
          </div>
        )}

        {/* Audit Table */}
        <div className="flex-1 overflow-y-auto border border-stone-200 rounded-xl">
          {loading && notifications.length === 0 ? (
            <div className="p-8 text-center text-xs text-stone-500 font-mono">Loading notification records...</div>
          ) : notifications.length === 0 ? (
            <div className="p-8 text-center text-xs text-stone-500 font-mono">
              No email notification records found matching status filter.
            </div>
          ) : (
            <table className="w-full text-left font-mono text-[11px] border-collapse">
              <thead className="sticky top-0 bg-[#FAF7F0] border-b border-stone-300 text-stone-700 z-10">
                <tr>
                  <th className="py-2.5 px-3 font-bold">Order ID</th>
                  <th className="py-2.5 px-3 font-bold">Event Type</th>
                  <th className="py-2.5 px-3 font-bold">Recipient</th>
                  <th className="py-2.5 px-3 font-bold">Status</th>
                  <th className="py-2.5 px-3 font-bold">Timestamp</th>
                  <th className="py-2.5 px-3 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {notifications.map((n) => (
                  <tr key={n.id} className="hover:bg-[#FAF7F0]/60 transition-colors">
                    <td className="py-2.5 px-3 align-top font-bold text-[#0E4B3E]">
                      #{n.order_id}
                    </td>
                    <td className="py-2.5 px-3 align-top">
                      <div className="font-semibold text-stone-800">{formatEventType(n.notification_type)}</div>
                      <div className="text-[10px] text-stone-400 truncate max-w-[200px]" title={n.subject}>
                        {n.subject}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 align-top">
                      <div className="font-bold text-stone-800 truncate max-w-[180px]">{n.recipient_email}</div>
                      <div className="text-[10px] text-stone-500">
                        {n.recipient_name || 'System User'} {n.recipient_role ? `(${n.recipient_role})` : ''}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 align-top">
                      {getStatusBadge(n.status)}
                      {n.last_error && (
                        <div
                          className="text-[9.5px] text-red-600 mt-1 max-w-[180px] truncate"
                          title={n.last_error}
                        >
                          {n.last_error}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 align-top text-stone-600 text-[10px]">
                      <div>{n.sent_at ? new Date(n.sent_at).toLocaleString() : new Date(n.created_at).toLocaleString()}</div>
                      <div className="text-stone-400">Attempts: {n.attempt_count}</div>
                    </td>
                    <td className="py-2.5 px-3 align-top text-right">
                      {isAdmin && (n.status === 'failed' || n.status === 'skipped') && (
                        <button
                          onClick={() => handleRetry(n.id)}
                          disabled={retryingId === n.id}
                          className="px-2 py-1 rounded bg-[#0E4B3E] text-white hover:bg-[#0B382F] text-[10px] font-bold transition-colors cursor-pointer shadow-2xs"
                        >
                          {retryingId === n.id ? 'Retrying...' : 'Retry Email'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer info */}
        <div className="pt-2 border-t border-stone-200 flex items-center justify-between text-[11px] text-stone-500 font-mono shrink-0">
          <span>Delivery records are persistent and enforced by PostgreSQL unique constraints.</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg border border-stone-300 hover:bg-stone-100 font-bold text-stone-700"
          >
            Close
          </button>
        </div>
      </Card>
    </div>
  )
}
