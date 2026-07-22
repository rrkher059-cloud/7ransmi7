import React from 'react';
import LineSidebar from './LineSidebar';
import { GlowButton } from './GlowButton';

interface SidebarProps {
  activeTab?: number;
  onTabChange?: (index: number, label: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab = 0, onTabChange }) => {
  const menuItems = ['Home', 'Explore', 'Notifications', 'Messages', 'Profile'];

  return (
    <aside className="w-64 h-full min-h-screen bg-[#1b1b1a] border-r border-[#4a4744] p-6 flex flex-col justify-between relative z-10">
      <div>
        <div className="mb-8 px-2">
          <h1 className="text-xl font-bold text-[#ff9142] tracking-wider uppercase">
            // Chirp_
          </h1>
        </div>

        <LineSidebar
          items={menuItems}
          accentColor="#ff9142"
          textColor="#c4c4c4"
          markerColor="#4a4744"
          defaultActive={activeTab}
          proximityRadius={120}
          maxShift={24}
          onItemClick={(index, label) => {
            if (onTabChange) onTabChange(index, label);
          }}
        />
      </div>

      <div className="mt-8">
        <GlowButton onClick={() => console.log('New Post clicked')}>
          POST
        </GlowButton>
      </div>
    </aside>
  );
};

export default Sidebar;
