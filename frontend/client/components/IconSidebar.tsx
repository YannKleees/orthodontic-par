/**
 * @file IconSidebar.tsx
 * @purpose
 *   Vertical icon-based navigation sidebar for patient management context.
 *   Displays dynamic sections (Patients, Visits, Similarity) and a decorative icon.
 *
 * @interaction
 *   - Highlights active section.
 *   - Shows tooltip on hover.
 *   - Badge counter for patients.
 *
 * @accessibility
 *   - Each icon+tooltip combo should have aria-label for non-visual users.
 *   - Ensure sufficient contrast for active/inactive states.
 */

import { useState } from "react";
import { Users, Clock, BarChart3, Cat } from "lucide-react";
import { cn } from "../lib/utils";

interface IconSidebarProps {
  activeSection?: string;
  onSectionChange?: (section: string) => void;
  onPatientsClick?: () => void;
  onSearchClick: () => void;
  hasSelectedPatient?: boolean;
  patientCount?: number;
}

interface SidebarItem {
  id: string;
  icon: React.ComponentType<any>;
  label: string;
  badge?: number;
  onClick?: () => void;
}

export function IconSidebar({
  activeSection = "patients",
  onSectionChange,
  onPatientsClick,
  hasSelectedPatient = false,
  patientCount = 0,
}: IconSidebarProps) {
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);

  /** Construct base sidebar items based on context state. */
  const baseItems: SidebarItem[] = [
    {
      id: "patients",
      icon: Users,
      label: "Patient",
      badge: patientCount,
      onClick: onPatientsClick,
    },
    ...(hasSelectedPatient
      ? [
          { id: "visits", icon: Clock, label: "Visits" },
          { id: "similarity", icon: BarChart3, label: "Similar Patients" },
        ]
      : []),
  ];

  const handleItemClick = (item: SidebarItem) => {
    if (item.onClick) item.onClick();
    else onSectionChange?.(item.id);
  };

  const renderItem = (item: SidebarItem) => {
    const isActive = activeSection === item.id;
    const isHovered = hoveredItem === item.id;
    const Icon = item.icon;

    return (
      <div
        key={item.id}
        onClick={() => handleItemClick(item)}
        onMouseEnter={() => setHoveredItem(item.id)}
        onMouseLeave={() => setHoveredItem(null)}
        className={cn(
          "relative flex items-center justify-center w-12 h-12 rounded-xl cursor-pointer transition-all duration-200 group",
          isActive
            ? "bg-primary text-white shadow-lg scale-110"
            : "text-gray-600 hover:bg-gray-100 hover:text-primary hover:scale-105",
        )}
      >
        <Icon className="w-6 h-6" />

        {item.badge !== undefined && (
          <div className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-medium">
            {item.badge > 99 ? "99+" : item.badge}
          </div>
        )}

        {isHovered && (
          <div className="absolute left-16 bg-gray-900 text-white text-sm px-3 py-1.5 rounded-lg shadow-lg z-50 whitespace-nowrap">
            {item.label}
            <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1 border-4 border-transparent border-r-gray-900" />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="fixed left-0 top-0 h-full w-20 bg-white border-r-2 border-gray-100 shadow-lg flex flex-col items-center py-6 z-30">
      <div className="flex flex-col gap-4">{baseItems.map(renderItem)}</div>

      <div className="mt-auto mb-4">
        <div
          className="relative flex items-center justify-center w-12 h-12 rounded-xl cursor-pointer transition-all duration-200 group text-gray-400 hover:text-primary hover:scale-105"
          onMouseEnter={() => setHoveredItem("cat")}
          onMouseLeave={() => setHoveredItem(null)}
        >
          <Cat className="w-6 h-6" />
          {hoveredItem === "cat" && (
            <div className="absolute left-16 bg-gray-900 text-white text-sm px-3 py-1.5 rounded-lg shadow-lg z-50 whitespace-nowrap">
              Made&nbsp;with&nbsp;❤️
              <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1 border-4 border-transparent border-r-gray-900" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
