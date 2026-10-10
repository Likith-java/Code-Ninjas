'use client'

import { Card, Badge, MaterialIcon } from '@/components/ui'
import { orderDetails } from '@/lib/mockData'
import type { SelectedOrderDetail } from '@/types'

interface OrderDetailViewProps {
  orderDetail: SelectedOrderDetail | null
}

export function OrderDetailView({ orderDetail }: OrderDetailViewProps) {
  if (!orderDetail) return null

  return (
    <div className="hidden space-y-3.5" id="viewOrder">
      <Card variant="elevated" padding="md" className="pop-shadow-md">
        <div className="flex items-center gap-2 mb-2">
          <Badge variant="default" size="sm" className="bg-[#FAF7F0] border-2 border-[#181816] text-[#0E4B3E] font-bold px-2 py-0.5">
            {orderDetail.id}
          </Badge>
          <Badge variant="priority" size="sm" className="bg-[#FEE2E2] text-[#991B1B] border-2 border-[#181816] font-bold">
            {orderDetail.priority} Critical
          </Badge>
        </div>
        <h2 className="font-bold text-[15px] text-[#181816] leading-tight">{orderDetail.title}</h2>
        <div className="font-mono text-[11.5px] text-[#4E4B47] mt-1">Buyer: {orderDetail.buyer}</div>
      </Card>

      <Card variant="elevated" padding="md" className="pop-shadow-md space-y-2.5">
        <span className="font-mono text-[10px] text-[#181816] uppercase tracking-wider block font-bold">Yarn Feasibility Check</span>
        <Card variant="default" padding="md" className="space-y-1.5 bg-[#FAF7F0] border-2 border-[#181816]">
          <div className="flex justify-between"><span className="text-[#4E4B47]">Required Yarn:</span> <span className="font-bold text-[#181816]">{orderDetail.yarnFeasibility.required}</span></div>
          <div className="flex justify-between"><span className="text-[#4E4B47]">Lot Available:</span> <span className="font-bold text-[#15803D]">{orderDetail.yarnFeasibility.available}</span></div>
          <div className="flex justify-between"><span className="text-[#4E4B47]">Feasibility:</span> <span className="font-bold text-[#15803D]">{orderDetail.yarnFeasibility.status} • NO SHORTFALL</span></div>
          <div className="flex justify-between"><span className="text-[#4E4B47]">Earliest Start:</span> <span className="font-bold text-[#181816]">{orderDetail.yarnFeasibility.earliestStart}</span></div>
        </Card>
      </Card>

      <Card variant="elevated" padding="md" className="pop-shadow-md space-y-2">
        <span className="font-mono text-[10px] text-[#181816] uppercase tracking-wider block font-bold">Route Machine Eligibility</span>
        <div className="font-mono text-[11px] space-y-1">
          {orderDetail.routeEligibility.map((stage, index) => (
            <div key={stage.stage} className="flex justify-between p-1.5 bg-[#FAF7F0] rounded border border-[#181816]">
              <span className="text-[#4E4B47]">{index + 1}. {stage.stage.charAt(0).toUpperCase() + stage.stage.slice(1)}:</span>
              <span className="font-bold text-[#181816]">{stage.machines.join(', ')}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}