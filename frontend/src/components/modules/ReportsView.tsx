'use client'

import React, { useState, useEffect } from 'react'
import { Card, Button, MaterialIcon } from '@/components/ui'
import { UserRole, ROLE_PROFILES } from '@/lib/permissions'
import { api, ReportTypeItem } from '@/lib/api'
import { getUser } from '@/lib/auth-storage'

interface ReportsViewProps {
  currentRole?: UserRole
}

export function ReportsView({ currentRole = 'admin' }: ReportsViewProps) {
  const [reportTypes, setReportTypes] = useState<ReportTypeItem[]>([])
  const [selectedReportId, setSelectedReportId] = useState<string>('')
  const [format, setFormat] = useState<'pdf' | 'xlsx'>('pdf')
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')
  const [orderId, setOrderId] = useState<string>('')
  const [machineId, setMachineId] = useState<string>('')

  const [isLoadingTypes, setIsLoadingTypes] = useState<boolean>(true)
  const [isGenerating, setIsGenerating] = useState<boolean>(false)
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const user = typeof window !== 'undefined' ? getUser() : null
  const roleProfile = ROLE_PROFILES[currentRole] || ROLE_PROFILES.admin

  // Fetch role-authorized report types on mount
  useEffect(() => {
    let isMounted = true
    setIsLoadingTypes(true)
    setStatusMessage(null)

    api.getReportTypes()
      .then((types) => {
        if (!isMounted) return
        setReportTypes(types)
        if (types.length > 0) {
          setSelectedReportId(types[0].id)
        }
      })
      .catch((err) => {
        if (!isMounted) return
        setStatusMessage({
          type: 'error',
          text: err instanceof Error ? err.message : 'Failed to fetch authorized report types.',
        })
      })
      .finally(() => {
        if (isMounted) setIsLoadingTypes(false)
      })

    return () => {
      isMounted = false
    }
  }, [currentRole])

  const selectedReport = reportTypes.find((r) => r.id === selectedReportId)

  // Quick Date Range Presets
  const handleApplyPreset = (preset: 'today' | '7days' | '30days' | 'all') => {
    const now = new Date()
    const formatDateInput = (d: Date) => d.toISOString().split('T')[0]

    if (preset === 'all') {
      setStartDate('')
      setEndDate('')
    } else if (preset === 'today') {
      const todayStr = formatDateInput(now)
      setStartDate(todayStr)
      setEndDate(todayStr)
    } else if (preset === '7days') {
      const past = new Date()
      past.setDate(past.getDate() - 7)
      setStartDate(formatDateInput(past))
      setEndDate(formatDateInput(now))
    } else if (preset === '30days') {
      const past = new Date()
      past.setDate(past.getDate() - 30)
      setStartDate(formatDateInput(past))
      setEndDate(formatDateInput(now))
    }
  }

  // Trigger report generation and file download
  const handleGenerateAndDownload = async () => {
    if (!selectedReportId) return

    // Date range validation
    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
      setStatusMessage({
        type: 'error',
        text: 'Validation Error: Start Date cannot be after End Date.',
      })
      return
    }

    setIsGenerating(true)
    setStatusMessage(null)

    try {
      const payload = {
        report_type: selectedReportId,
        format,
        start_date: startDate ? new Date(`${startDate}T00:00:00Z`).toISOString() : null,
        end_date: endDate ? new Date(`${endDate}T23:59:59Z`).toISOString() : null,
        order_id: orderId.trim() ? parseInt(orderId.trim(), 10) : null,
        machine_id: machineId.trim() ? parseInt(machineId.trim(), 10) : null,
      }

      const { blob, filename } = await api.downloadReport(payload)

      // Create download trigger
      const blobUrl = window.URL.createObjectURL(blob)
      const downloadLink = document.createElement('a')
      downloadLink.href = blobUrl
      downloadLink.download = filename
      document.body.appendChild(downloadLink)
      downloadLink.click()
      document.body.removeChild(downloadLink)

      // Revoke temporary blob URL
      window.setTimeout(() => {
        window.URL.revokeObjectURL(blobUrl)
      }, 1000)

      setStatusMessage({
        type: 'success',
        text: `Successfully generated and downloaded: ${filename} (${(blob.size / 1024).toFixed(1)} KB)`,
      })
    } catch (err: unknown) {
      setStatusMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'An error occurred during report generation.',
      })
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-[#F5F0E3] font-body text-[#181816] space-y-6">
      {/* 1. Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b-2 border-[#181816]">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-md bg-[#0E4B3E] text-white flex items-center justify-center font-bold text-xs">
              <MaterialIcon name="description" size="xs" />
            </span>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#181816]">
              Role-Based Reports & Data Export
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-stone-600 mt-1">
            Generate and export authenticated PDF documents and structured Excel workbooks from live PostgreSQL records.
          </p>
        </div>

        {/* Identity & Role Badge */}
        <div className="flex items-center gap-3 bg-white border-2 border-[#181816] rounded-xl px-3 py-2 pop-shadow-xs">
          <div className="w-8 h-8 rounded-full bg-[#0E4B3E] text-white font-bold flex items-center justify-center text-xs">
            {roleProfile.initials}
          </div>
          <div className="text-left">
            <div className="text-xs font-bold leading-tight truncate">
              {user?.name || roleProfile.name}
            </div>
            <div className="text-[10px] font-mono text-[#0E4B3E] font-semibold uppercase">
              {currentRole.replace('_', ' ')} • Server Authorized
            </div>
          </div>
        </div>
      </div>

      {/* Status Notifications */}
      {statusMessage && (
        <div
          className={`p-3.5 rounded-xl border-2 font-mono text-xs flex items-center justify-between ${
            statusMessage.type === 'success'
              ? 'bg-[#D7F4E5] border-[#0B382F] text-[#0B382F]'
              : 'bg-[#FFEFEA] border-[#962C0B] text-[#962C0B]'
          }`}
        >
          <div className="flex items-center gap-2">
            <MaterialIcon
              name={statusMessage.type === 'success' ? 'check_circle' : 'error'}
              size="sm"
            />
            <span>{statusMessage.text}</span>
          </div>
          <button
            onClick={() => setStatusMessage(null)}
            className="text-stone-500 hover:text-stone-900 font-bold ml-4"
          >
            ✕
          </button>
        </div>
      )}

      {/* 2. Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Authorized Report Catalog (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-stone-600 font-mono">
              Available Reports ({reportTypes.length})
            </h2>
            <span className="text-[11px] font-mono text-[#0E4B3E] bg-[#D7F4E5] px-2 py-0.5 rounded border border-[#181816]">
              RBAC Verified
            </span>
          </div>

          {isLoadingTypes ? (
            <div className="p-8 text-center bg-white border-2 border-[#181816] rounded-2xl">
              <div className="size-6 animate-spin rounded-full border-2 border-[#0E4B3E] border-t-transparent mx-auto mb-2" />
              <p className="text-xs text-stone-500 font-mono">Loading authorized reports...</p>
            </div>
          ) : reportTypes.length === 0 ? (
            <Card className="p-6 text-center bg-white border-2 border-[#181816]">
              <MaterialIcon name="lock" size="lg" color="#962C0B" />
              <p className="text-xs text-stone-600 mt-2">
                No reports are currently authorized for role: <strong>{currentRole}</strong>.
              </p>
            </Card>
          ) : (
            <div className="space-y-3">
              {reportTypes.map((r) => {
                const isSelected = r.id === selectedReportId
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelectedReportId(r.id)}
                    className={`w-full text-left p-3.5 rounded-2xl border-2 transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#FAF7F0] border-[#0E4B3E] pop-shadow-sm ring-1 ring-[#0E4B3E]'
                        : 'bg-white border-[#181816] hover:bg-[#FAF7F0] pop-shadow-xs'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-bold text-xs sm:text-sm text-[#181816]">
                        {r.title}
                      </div>
                      <span className="shrink-0 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-stone-100 text-stone-700 border border-stone-300">
                        {r.supported_formats.join(' / ').toUpperCase()}
                      </span>
                    </div>
                    <p className="text-[11.5px] text-stone-600 mt-1 line-clamp-2">
                      {r.description}
                    </p>
                    <div className="mt-2.5 flex items-center gap-2 text-[10px] font-mono text-stone-500">
                      <MaterialIcon name="groups" size="xs" />
                      <span className="truncate">{r.audience}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {/* Security Notice Box */}
          <div className="p-3.5 rounded-2xl bg-white border-2 border-[#181816] text-[11px] text-stone-600 space-y-1.5">
            <div className="font-bold text-xs flex items-center gap-1.5 text-[#0E4B3E]">
              <MaterialIcon name="verified_user" size="xs" />
              <span>Server-Side Permission Guarantee</span>
            </div>
            <p>
              • <strong>Customer:</strong> Strictly isolated to own orders, dispatches and quality records. Cross-buyer access attempts are blocked.
            </p>
            <p>
              • <strong>Production Manager:</strong> Operational floor runs, machines, downtime, and quality slips. Confidential customer pricing is excluded.
            </p>
            <p>
              • <strong>Admin:</strong> Factory-wide oversight, financial invoiced summaries, and full machine fleets.
            </p>
          </div>
        </div>

        {/* Right Column: Parameters, Format & Download Action (7 cols) */}
        <div className="lg:col-span-7">
          <Card className="p-5 sm:p-6 bg-white border-2 border-[#181816] rounded-2xl pop-shadow-md space-y-6">
            <div>
              <div className="text-xs font-mono font-bold uppercase tracking-wider text-stone-500">
                Configure Report Parameters
              </div>
              <h3 className="text-lg font-bold text-[#181816] mt-0.5">
                {selectedReport ? selectedReport.title : 'Select a Report'}
              </h3>
              {selectedReport && (
                <p className="text-xs text-stone-600 mt-1">
                  {selectedReport.description}
                </p>
              )}
            </div>

            {/* Format Selection */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-600 font-mono mb-2">
                Export Format
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setFormat('pdf')}
                  className={`p-3 rounded-xl border-2 flex items-center justify-center gap-2 font-bold text-xs sm:text-sm transition-all cursor-pointer ${
                    format === 'pdf'
                      ? 'bg-[#0E4B3E] text-white border-[#0E4B3E] pop-shadow-xs'
                      : 'bg-[#FAF7F0] text-[#181816] border-[#181816] hover:bg-[#E7DFCE]'
                  }`}
                >
                  <MaterialIcon name="picture_as_pdf" size="sm" />
                  <span>PDF Document</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFormat('xlsx')}
                  className={`p-3 rounded-xl border-2 flex items-center justify-center gap-2 font-bold text-xs sm:text-sm transition-all cursor-pointer ${
                    format === 'xlsx'
                      ? 'bg-[#0E4B3E] text-white border-[#0E4B3E] pop-shadow-xs'
                      : 'bg-[#FAF7F0] text-[#181816] border-[#181816] hover:bg-[#E7DFCE]'
                  }`}
                >
                  <MaterialIcon name="table_chart" size="sm" />
                  <span>Excel Workbook (.xlsx)</span>
                </button>
              </div>
            </div>

            {/* Date Range Scope */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold uppercase tracking-wider text-stone-600 font-mono">
                  Date Range Filter (Optional)
                </label>
                <div className="flex items-center gap-1.5 text-[10.5px] font-mono">
                  <button
                    type="button"
                    onClick={() => handleApplyPreset('today')}
                    className="hover:underline text-[#0E4B3E] font-bold"
                  >
                    Today
                  </button>
                  <span>•</span>
                  <button
                    type="button"
                    onClick={() => handleApplyPreset('7days')}
                    className="hover:underline text-[#0E4B3E] font-bold"
                  >
                    7 Days
                  </button>
                  <span>•</span>
                  <button
                    type="button"
                    onClick={() => handleApplyPreset('30days')}
                    className="hover:underline text-[#0E4B3E] font-bold"
                  >
                    30 Days
                  </button>
                  <span>•</span>
                  <button
                    type="button"
                    onClick={() => handleApplyPreset('all')}
                    className="hover:underline text-stone-600"
                  >
                    All Records
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-stone-500 font-mono mb-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border-2 border-[#181816] bg-[#FAF7F0] font-mono text-xs focus:outline-none focus:border-[#0E4B3E]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-stone-500 font-mono mb-1">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border-2 border-[#181816] bg-[#FAF7F0] font-mono text-xs focus:outline-none focus:border-[#0E4B3E]"
                  />
                </div>
              </div>
            </div>

            {/* Optional Specific Filters */}
            {selectedReport?.supported_filters.includes('order_id') && (
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-stone-600 font-mono mb-1">
                  Filter by Specific Order ID (Optional)
                </label>
                <input
                  type="number"
                  placeholder="e.g. 1"
                  value={orderId}
                  onChange={(e) => setOrderId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border-2 border-[#181816] bg-[#FAF7F0] font-mono text-xs focus:outline-none focus:border-[#0E4B3E]"
                />
                <span className="text-[10px] text-stone-500 font-mono block mt-1">
                  Customer roles may only inspect orders belonging to their buyer account.
                </span>
              </div>
            )}

            {selectedReport?.supported_filters.includes('machine_id') && (
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-stone-600 font-mono mb-1">
                  Filter by Specific Machine ID (Optional)
                </label>
                <input
                  type="number"
                  placeholder="e.g. 1"
                  value={machineId}
                  onChange={(e) => setMachineId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border-2 border-[#181816] bg-[#FAF7F0] font-mono text-xs focus:outline-none focus:border-[#0E4B3E]"
                />
              </div>
            )}

            {/* Download CTA Button */}
            <div className="pt-4 border-t-2 border-stone-200">
              <Button
                variant="primary"
                onClick={handleGenerateAndDownload}
                disabled={isGenerating || !selectedReportId}
                className="w-full py-3.5 text-sm font-bold flex items-center justify-center gap-2"
              >
                {isGenerating ? (
                  <>
                    <div className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    <span>Extracting Database Records & Generating {format.toUpperCase()}...</span>
                  </>
                ) : (
                  <>
                    <MaterialIcon name="download" size="sm" />
                    <span>Generate & Download {format.toUpperCase()} Report</span>
                  </>
                )}
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
