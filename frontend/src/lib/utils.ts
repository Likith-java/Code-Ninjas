import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (hours === 0) return `${mins}m`
  if (mins === 0) return `${hours}h`
  return `${hours}h ${mins}m`
}

export function getPriorityColor(priority: string): string {
  switch (priority) {
    case 'P0': return 'bg-[#FEE2E2] text-[#991B1B] border-[#181816]'
    case 'P1': return 'bg-[#FAF7F0] text-[#181816] border-[#181816]'
    case 'P2': return 'bg-[#FEF3C7] text-[#92400E] border-[#181816]'
    case 'P3': return 'bg-[#FAF7F0] text-[#4E4B47] border-[#181816]'
    default: return 'bg-[#FAF7F0] text-[#181816] border-[#181816]'
  }
}

export function getStageColor(stage: string): string {
  switch (stage) {
    case 'spinning': return 'bg-[#0E4B3E]'
    case 'weaving': return 'bg-[#E05326]'
    case 'dyeing': return 'bg-[#15803D]'
    case 'inspection': return 'bg-[#78716C]'
    default: return 'bg-[#4E4B47]'
  }
}

export function getMachineStatusColor(status: string): string {
  switch (status) {
    case 'running': return 'bg-[#15803D]'
    case 'down': return 'bg-[#E05326]'
    case 'maintenance': return 'bg-[#D97706]'
    default: return 'bg-[#78716C]'
  }
}