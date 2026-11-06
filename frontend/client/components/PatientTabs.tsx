/**
 * @file PatientTabs.tsx
 * @brief Tab strip for switching among patient-centric workspaces.
 *
 * @description
 * Renders a horizontally scrollable, pill-styled tab bar where each tab
 * represents an open patient view. The active tab is visually emphasized.
 * Close buttons appear on hover. Interaction is controlled by the parent via
 * `onTabChange` and `onTabClose` to keep state single-sourced.
 */

import { X } from "lucide-react";
import { cn } from "../lib/utils";
import { Tab } from "../pages/Index";

/**
 * Props for PatientTabs.
 */
interface PatientTabsProps {
  /** Collection of open tabs provided by the parent. */
  tabs: Tab[];
  /** Identifier of the currently active tab; `null` if none is active. */
  activeTabId: string | null;
  /** Callback invoked when a tab is selected. */
  onTabChange: (tabId: string) => void;
  /** Callback invoked when a tab is closed. */
  onTabClose: (tabId: string) => void;
}

/**
 * PatientTabs
 *
 * @param tabs        Open tabs to render.
 * @param activeTabId Currently active tab id.
 * @param onTabChange Selection handler provided by the parent.
 * @param onTabClose  Close handler provided by the parent.
 *
 * @remarks
 * - Accessibility: each tab is a button for keyboard and screen-reader support.
 * - Layout: wrapper uses overflow-x for resilience with many tabs.
 * - State: this component is controlled; it does not own tab state.
 */
export function PatientTabs({
  tabs,
  activeTabId,
  onTabChange,
  onTabClose,
}: PatientTabsProps) {
  return (
    <div className="flex items-center justify-center">
      <div className="flex items-center bg-background border border-gray-200 rounded-[30px] min-h-[32px] overflow-x-auto shadow-sm">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              className={cn(
                "flex items-center px-3 py-1.5 text-sm font-normal transition-all duration-200 rounded-t-[4px] border-b-2 whitespace-nowrap min-w-fit relative group",
                isActive
                  ? "text-gray-900 border-b-primary bg-white shadow-sm"
                  : "text-gray-500 border-b-transparent hover:text-gray-700 hover:bg-gray-50",
              )}
            >
              <button
                onClick={() => onTabChange(tab.id)}
                className="flex items-center pr-2 text-left"
                aria-current={isActive ? "page" : undefined}
                aria-label={`Switch to ${tab.name}`}
              >
                {tab.name}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onTabClose(tab.id);
                }}
                className="flex items-center justify-center w-4 h-4 rounded hover:bg-gray-200 transition-colors opacity-0 group-hover:opacity-100"
                aria-label={`Close ${tab.name}`}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
