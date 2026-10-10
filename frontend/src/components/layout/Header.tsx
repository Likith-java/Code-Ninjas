'use client'

import { useState } from 'react'
import { MaterialIcon } from '@/components/ui'
import { UserRole, ROLE_PROFILES } from '@/lib/permissions'

interface HeaderProps {
  currentRole: UserRole
  onLogout?: () => void
  onToggleMobileSidebar?: () => void
  onBrandClick?: () => void
}

export function Header({
  currentRole = 'admin',
  onLogout,
  onToggleMobileSidebar,
  onBrandClick,
}: HeaderProps) {
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const safeRole: UserRole = currentRole && ROLE_PROFILES[currentRole] ? currentRole : 'admin'
  const currentProfile = ROLE_PROFILES[safeRole]

  return (
    <header className="flex justify-between items-center w-full px-3 sm:px-5 h-12 z-40 border-b border-stone-200 bg-[#FFFFFF] shrink-0 select-none">
      {/* Left: Brand Identity */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        {/* Mobile Hamburger */}
        <button
          type="button"
          onClick={onToggleMobileSidebar}
          className="lg:hidden w-8 h-8 rounded-lg border border-stone-300 bg-[#FAF7F0] hover:bg-[#E7DFCE] flex items-center justify-center shadow-xs shrink-0 cursor-pointer"
          title="Toggle Navigation Menu"
          aria-label="Toggle Navigation Menu"
        >
          <MaterialIcon name="menu" size="sm" />
        </button>

        {/* Brand */}
        <div
          className="flex items-center gap-2 cursor-pointer shrink-0"
          onClick={onBrandClick}
          title="Everest Textile Mills — Home"
        >
          <span className="w-7 h-7 bg-[#0E4B3E] text-white rounded-lg border border-[#0A382E] shadow-xs flex items-center justify-center font-mono text-[13px] font-bold shrink-0">
            ET
          </span>
          <span className="font-bold text-[14px] text-[#181816] tracking-tight leading-none truncate">
            Everest Textile Mills
          </span>
        </div>
      </div>

      {/* Right: Authenticated Profile Avatar & Menu */}
      <div className="flex items-center gap-2 shrink-0 relative">
        <button
          type="button"
          onClick={() => setProfileMenuOpen((prev) => !prev)}
          className="flex items-center gap-2 p-1 pl-1.5 pr-2.5 rounded-full border border-stone-300 bg-[#FAF7F0] hover:bg-stone-100 shadow-xs transition-colors text-xs font-medium cursor-pointer"
          title="User Profile & Account"
          aria-haspopup="true"
          aria-expanded={profileMenuOpen}
        >
          <span className="w-6 h-6 rounded-full bg-[#0E4B3E] text-white flex items-center justify-center font-bold text-[11px]">
            {currentProfile.initials}
          </span>
          <span className="font-semibold text-[#181816] text-xs hidden sm:inline">
            {currentProfile.name}
          </span>
          <MaterialIcon name={profileMenuOpen ? 'expand_less' : 'expand_more'} size="xs" color="#181816" />
        </button>

        {/* Compact Profile Dropdown with Logout Action */}
        {profileMenuOpen && (
          <div
            className="absolute right-0 top-full mt-2 w-64 bg-white border border-stone-200 rounded-xl shadow-lg z-50 p-2 space-y-1 font-body text-xs"
            onMouseLeave={() => setProfileMenuOpen(false)}
          >
            {/* User role and status */}
            <div className="p-2 border-b border-stone-100">
              <span className="text-[10px] font-semibold text-stone-500 uppercase tracking-wider block">
                Authenticated Account
              </span>
              <div className="font-bold text-sm text-[#181816] flex items-center justify-between mt-0.5">
                <span>{currentProfile.name}</span>
                <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-[#D7F4E5] text-[#0B382F] border border-emerald-200">
                  Active
                </span>
              </div>
              <span className="text-[11px] text-stone-600 block mt-0.5">
                {currentProfile.title}
              </span>
            </div>

            {/* Profile Options */}
            <div className="py-1 space-y-0.5">
              <div className="px-2 py-1.5 rounded-lg text-[11px] text-stone-600 bg-[#FAF7F0] border border-stone-200/80 flex items-center justify-between">
                <span>Scope:</span>
                <strong className="text-[#0E4B3E]">
                  {currentRole === 'customer' ? 'ZARA Sourcing Only' : 'Factory Operational'}
                </strong>
              </div>
            </div>

            {/* Actions: Sign Out */}
            <div className="pt-1.5 border-t border-stone-100">
              <button
                type="button"
                onClick={() => {
                  setProfileMenuOpen(false)
                  onLogout?.()
                }}
                className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-red-50 text-red-700 font-medium text-left transition-colors cursor-pointer"
              >
                <MaterialIcon name="logout" size="xs" color="#B91C1C" />
                <span>Log Out</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  )
}