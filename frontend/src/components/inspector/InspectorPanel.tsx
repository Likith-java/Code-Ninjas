'use client'

import { Button, MaterialIcon, Card, Badge } from '@/components/ui'
import { ReplanView } from './ReplanView'
import { OrderDetailView } from './OrderDetailView'
import type { RightTab, SelectedOrderDetail } from '@/types'

interface InspectorPanelProps {
  isOpen: boolean
  onToggle: () => void
  activeTab: RightTab
  onTabChange: (tab: RightTab) => void
  isResolved: boolean
  onApplyReplan: (action: 'freeze' | 'split' | 'commit') => void
  orderDetail: SelectedOrderDetail | null
}

export function InspectorPanel({
  isOpen,
  onToggle,
  activeTab,
  onTabChange,
  isResolved,
  onApplyReplan,
  orderDetail,
}: InspectorPanelProps) {
  if (!isOpen) return null

  return (
    <aside className="w-[420px] bg-[#FAF7F0] border-l-2 border-[#181816] flex flex-col shrink-0 z-20">
      <div className="p-3 border-b-2 border-[#181816] flex items-center justify-between bg-white">
        <div className="flex items-center gap-1.5 text-[12px]">
          <Button
            variant={activeTab === 'replan' ? 'primary' : 'ghost'}
            size="sm"
            className={activeTab === 'replan' ? 'pop-shadow-xs flex items-center gap-1.5' : ''}
            onClick={() => onTabChange('replan')}
          >
            {activeTab === 'replan' && <span className="w-2 h-2 rounded-full bg-[#E05326] border border-[#181816]" />}
            <span>Disruption Re-Plan</span>
          </Button>
          <Button
            variant={activeTab === 'order' ? 'primary' : 'ghost'}
            size="sm"
            className={activeTab === 'order' ? 'pop-shadow-xs flex items-center gap-1.5' : ''}
            onClick={() => onTabChange('order')}
          >
            <span>Order & Feasibility</span>
          </Button>
        </div>
        <Button
          variant="pop"
          size="xs"
          className="w-7 h-7 rounded-full border-2 border-[#181816] flex items-center justify-center pop-shadow-xs"
          icon={<MaterialIcon name="close" size="md" />}
          onClick={onToggle}
          aria-label="Toggle Panel"
        />
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeTab === 'replan' && (
          <ReplanView isResolved={isResolved} onApplyReplan={onApplyReplan} />
        )}
        {activeTab === 'order' && (
          <OrderDetailView orderDetail={orderDetail} />
        )}
      </div>

      <div className="p-2.5 border-t-2 border-[#181816] bg-white flex items-center justify-between font-mono text-[10px] text-[#181816]">
        <span className="font-bold">Model: OR-Tools CP-SAT</span>
        <Badge variant="success" size="xs" dotColor="#15803D" className="bg-[#D7F4E5] border border-[#181816] px-2 py-0.5 rounded-full text-[#0B382F] font-bold flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#15803D]" />
          <span>Schedule Validated</span>
        </Badge>
      </div>
    </aside>
  )
}