import LineSidebar from '@/components/LineSidebar'
import { MicroLabel } from '@/components/ui/MicroLabel'
import { GlowButton } from '@/components/ui/GlowButton'

export type AppTab =
  | 'home'
  | 'explore'
  | 'notifications'
  | 'messages'
  | 'profile'

export const NAV_ITEMS = [
  'Home',
  'Explore',
  'Notifications',
  'Messages',
  'Profile',
] as const

export const TAB_BY_INDEX: AppTab[] = [
  'home',
  'explore',
  'notifications',
  'messages',
  'profile',
]

type SidebarProps = {
  activeTab: number
  onTabChange: (index: number, label: string) => void
  onPrimaryAction: () => void
  onBrandClick?: () => void
  handle?: string | null
}

export function Sidebar({
  activeTab,
  onTabChange,
  onPrimaryAction,
  onBrandClick,
  handle = null,
}: SidebarProps) {
  return (
    <aside
      className="relative z-20 flex h-full w-full flex-col overflow-visible bg-[#262421] font-mono"
      style={{
        border: '1px solid #4a4744',
        fontFamily: "'Departure Mono', monospace",
        pointerEvents: 'auto',
      }}
    >
      <div
        className="px-4 py-4"
        style={{ borderBottom: '1px solid #4a4744' }}
      >
        <MicroLabel>Channel nav</MicroLabel>
        <button
          type="button"
          onClick={onBrandClick}
          className="mt-2 block w-full text-left text-[22px] uppercase tracking-[0.12em] text-[#eae7e1] transition-colors hover:text-[#ff9142]"
          style={{ borderRadius: 0 }}
          aria-label="7RANSMI7 home"
        >
          <span className="bg-[#ff9142] px-1 text-[#1b1b1a]">X</span>
          <span className="ml-2">7RANSMI7</span>
        </button>
        {handle ? (
          <p className="mt-2 text-[12px] text-[#ff9142]">{handle}</p>
        ) : null}
      </div>

      <div className="relative z-20 flex min-h-0 flex-1 flex-col overflow-visible px-2 py-2">
        <LineSidebar
          items={[...NAV_ITEMS]}
          accentColor="#ff9142"
          textColor="#c4c4c4"
          markerColor="#4a4744"
          showIndex={false}
          showMarker
          proximityRadius={120}
          maxShift={24}
          falloff="smooth"
          markerLength={40}
          markerGap={8}
          tickScale={0.5}
          scaleTick
          itemGap={16}
          fontSize={1}
          smoothing={100}
          defaultActive={0}
          activeIndex={activeTab}
          onItemClick={onTabChange}
          className="w-full"
        />
      </div>

      <div className="relative z-10 p-3" style={{ borderTop: '1px solid #4a4744' }}>
        <MicroLabel>Uplink</MicroLabel>
        <div className="mt-2">
          <GlowButton
            fullWidth
            type="button"
            onClick={onPrimaryAction}
            style={{ borderRadius: 0 }}
          >
            Post
          </GlowButton>
        </div>
      </div>
    </aside>
  )
}
