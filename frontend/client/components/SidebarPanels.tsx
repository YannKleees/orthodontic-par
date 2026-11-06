/**
 * @file SidebarPanels.tsx
 * @brief Right-side contextual panels for Visits, Reports, and Similarity.
 *
 * @description
 * Router-like wrapper that renders one of three sidebars (Visits, Reports,
 * Similar Patients) based on the active `section`. Each child sidebar is a
 * controlled component that receives patient context and callback handlers.
 */

import { useState } from "react";
import {
  Search,
  X,
  Download,
  FileText,
  Clock,
  Calendar,
  User,
  TrendingUp,
  CheckCircle,
  Plus,
  Eye,
  ChevronRight,
} from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { cn } from "../lib/utils";
import { useVisits, useReports } from "../hooks/useApi";
import FullScreenModal from "./FullScreenModal";
import AddVisitForm from "./AddVisitForm";
import type { Visit } from "@/hooks/types";
import { SimilarPatientList } from "./SimilarPatientList";

/** Props for the top-level sidebar switcher. */
interface SidebarPanelsProps {
  /** Which sidebar is active. */
  section: "visits" | "reports" | "similarity" | "other";
  /** Whether the sidebar is expanded (width > 0). */
  expanded: boolean;
  /** Collapses/expands the sidebar from the parent. */
  onToggle: () => void;
  /** Patient display name for headers. */
  patientName: string;
  /** Patient identifier for data fetching. */
  patientId: string;
  /** Row/item click callback used by caller to open a subview. */
  onItemClick: (itemId: string, itemName: string) => void;
  /** Optional hook for notifying parent that a visit was created. */
  onVisitCreated?: (visitId: string) => void;
  /** Handler to open a specific visit detail UI from an item click. */
  onVisitClick(visitId: string, patientId: string, patientName: string): void;
}

/**
 * SidebarPanels
 *
 * @remarks Dispatches to section-specific sidebars. Returns `null` for
 * unknown sections to avoid rendering empty chrome.
 */
export function SidebarPanels({
  section,
  expanded,
  onToggle,
  patientName,
  patientId,
  onItemClick,
  onVisitCreated,
  onVisitClick,
}: SidebarPanelsProps) {
  if (section === "visits") {
    return (
      <VisitsSidebar
        expanded={expanded}
        onToggle={onToggle}
        patientName={patientName}
        patientId={patientId}
        onItemClick={onItemClick}
        onVisitCreated={onVisitCreated}
        onVisitClick={onVisitClick}
      />
    );
  } else if (section === "reports") {
    return (
      <ReportsSidebar
        expanded={expanded}
        onToggle={onToggle}
        patientName={patientName}
        patientId={patientId}
        onItemClick={onItemClick}
      />
    );
  } else if (section === "similarity") {
    return (
      <SimilaritySidebar
        expanded={expanded}
        onToggle={onToggle}
        patientName={patientName}
        patientId={patientId}
        onItemClick={onItemClick}
      />
    );
  }
  return null;
}

/**
 * Visits sidebar: lists patient visits and routes selections upward.
 */
function VisitsSidebar({
  expanded,
  onToggle,
  patientName,
  onItemClick,
  patientId,
  onVisitCreated,
  onVisitClick,
}: {
  expanded: boolean;
  onToggle: () => void;
  patientName: string;
  onItemClick: (itemId: string, itemName: string) => void;
  patientId: string;
  onVisitCreated?: (vid: string) => void;
  onVisitClick(visitId: string, patientId: string, patientName: string): void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [showWizard, setShowWizard] = useState(false);

  /** Live visits sourced from API for the current patient. */
  const { data: visitsData, loading: visitsLoading } = useVisits(patientId);
  if (visitsLoading) {
    return (
      <div className="px-6 py-8 text-center text-sm text-gray-500">
        Loading visits…
      </div>
    );
  }

  const visits = ((visitsData as Visit[]) ?? []).map((v) => ({
    id: v.id,
    date: v.date,
    type: v.type ?? "Visit",
    status: v.status,
    time: v.time ?? "",
    doctor: v.doctor ?? "",
    description: v.description ?? "",
    mosaicUrl: v.mosaicUrl ?? undefined,
  }));

  /** Local text filter over visit type and doctor fields. */
  const filteredVisits = searchQuery.trim()
    ? visits.filter(
        (visit) =>
          visit.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
          visit.doctor.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : visits;

  const handleSearchToggle = () => {
    setIsSearching((v) => !v);
    if (isSearching) setSearchQuery("");
  };
  const clearSearch = () => {
    setSearchQuery("");
    setIsSearching(false);
  };

  return (
    <>
      {/* Expand handle when collapsed */}
      {!expanded && (
        <div
          onClick={onToggle}
          className="fixed left-20 top-0 h-full w-2 bg-transparent hover:bg-primary/20 transition-colors cursor-pointer z-35"
          title="Click to open visits sidebar"
        />
      )}

      <div
        className={cn(
          "fixed left-20 top-0 h-full bg-white transition-all duration-300 z-40 flex flex-col shadow-lg border-r-2 border-gray-100",
          expanded ? "w-[340px]" : "w-0 overflow-hidden",
        )}
      >
        <div className="p-4 space-y-4 flex-1 overflow-y-auto">
          <div className="bg-white rounded-[40px] shadow-md border border-gray-100">
            <div className="p-2">
              <div className="px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wide flex items-center justify-between">
                <span>Visits - {patientName}</span>
                {searchQuery && (
                  <span className="text-primary">
                    {filteredVisits.length} found
                  </span>
                )}
              </div>

              {filteredVisits.length > 0 ? (
                filteredVisits.map((visit) => (
                  <div
                    key={visit.id}
                    onClick={() => {
                      // Prefer structured visit navigation if provided
                      if (onVisitClick) {
                        onVisitClick(visit.id, patientId, patientName);
                      } else {
                        onItemClick(
                          visit.id,
                          `${visit.type} - ${new Date(visit.date).toLocaleDateString()}`,
                        );
                      }
                    }}
                    className="flex items-start h-100 px-2 py-2 rounded-lg cursor-pointer transition-colors group hover:bg-gray-50"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-on-surface flex items-start justify-between mb-1">
                        <span className="truncate pr-2">{visit.type}</span>
                        <Badge
                          variant={
                            visit.status === "completed" ? "default" : "secondary"
                          }
                          className="text-xs flex-shrink-0"
                        >
                          {visit.status}
                        </Badge>
                      </div>
                      <div className="text-xs text-gray-500 mb-1">
                        {new Date(visit.date).toLocaleDateString()} • {visit.time}
                      </div>
                      <div className="text-xs text-gray-400 truncate">
                        {visit.description}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                ))
              ) : searchQuery ? (
                <div className="flex items-center justify-center h-14 px-3 text-gray-500 text-sm">
                  No visits found for "{searchQuery}"
                </div>
              ) : (
                <div className="flex items-center justify-center h-14 px-3 text-gray-500 text-sm">
                  No visits available
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * Reports sidebar: lists documents and quick metadata.
 */
function ReportsSidebar({
  expanded,
  onToggle,
  patientName,
  onItemClick,
  patientId,
}: {
  expanded: boolean;
  onToggle: () => void;
  patientName: string;
  onItemClick: (itemId: string, itemName: string) => void;
  patientId: string;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  /** Live reports from API for the current patient. */
  const { data: reportsData, loading: reportsLoading } = useReports(patientId);
  const reports = (reportsData || []).map((report) => ({
    id: report.id,
    name: report.name,
    date: report.date,
    type: report.type,
    status: report.status as "ready" | "draft" | "pending",
    description: report.description,
  }));

  /** Local filter by name/type. */
  const filteredReports = searchQuery.trim()
    ? reports.filter(
        (report) =>
          report.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          report.type.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : reports;

  const handleSearchToggle = () => {
    setIsSearching((v) => !v);
    if (isSearching) setSearchQuery("");
  };
  const clearSearch = () => {
    setSearchQuery("");
    setIsSearching(false);
  };

  return (
    <>
      {!expanded && (
        <div
          onClick={onToggle}
          className="fixed left-20 top-0 h-full w-2 bg-transparent hover:bg-primary/20 transition-colors cursor-pointer z-35"
          title="Click to open reports sidebar"
        />
      )}

      <div
        className={cn(
          "fixed left-20 top-0 h-full bg-white transition-all duration-300 z-40 flex flex-col shadow-lg border-r-2 border-gray-100",
          expanded ? "w-[340px]" : "w-0 overflow-hidden",
        )}
      >
        <div className="p-4 space-y-4 flex-1 overflow-y-auto">
          {/* Search bar with toggleable input */}
          <div className="relative">
            <div className="flex items-center bg-surface-container-high rounded-[40px] h-12 px-4">
              {isSearching ? (
                <>
                  <Search className="w-5 h-5 text-gray-400 mr-3" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search reports..."
                    className="flex-1 py-2 bg-transparent text-on-surface-variant text-base border-none outline-none placeholder-gray-400"
                    autoFocus
                  />
                  <button
                    onClick={clearSearch}
                    className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-black/5 transition-colors ml-2"
                  >
                    <X className="w-5 h-5 text-on-surface-variant" />
                  </button>
                </>
              ) : (
                <>
                  <div
                    className="flex-1 px-3 cursor-pointer"
                    onClick={handleSearchToggle}
                  >
                    <span className="text-on-surface-variant text-base font-normal">
                      Search Reports
                    </span>
                  </div>
                  <button
                    onClick={handleSearchToggle}
                    className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-black/5 transition-colors"
                  >
                    <Search className="w-5 h-5 text-on-surface-variant" />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Generate report CTA (wire when backend is ready) */}
          <Button className="bg-patient-tab text-black hover:bg-patient-tab/80 rounded-[40px] h-7 px-3 text-sm font-medium w-[140px]">
            GENERATE Report
          </Button>

          {/* Report list */}
          <div className="bg-white rounded-[40px] shadow-md border border-gray-100">
            <div className="p-2">
              <div className="px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wide flex items-center justify-between">
                <span>Reports - {patientName}</span>
                {searchQuery && (
                  <span className="text-primary">
                    {filteredReports.length} found
                  </span>
                )}
              </div>

              {filteredReports.length > 0 ? (
                filteredReports.map((report) => (
                  <div
                    key={report.id}
                    onClick={() => onItemClick(report.id, report.name)}
                    className="flex items-center h-16 px-3 rounded-lg cursor-pointer transition-colors group hover:bg-gray-50"
                  >
                    <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center mr-3">
                      <FileText className="w-4 h-4 text-green-600" />
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-on-surface flex items-center justify-between">
                        <span className="truncate">{report.name}</span>
                        <Badge
                          variant={report.status === "ready" ? "default" : "secondary"}
                          className="text-xs ml-2"
                        >
                          {report.status}
                        </Badge>
                      </div>
                      <div className="text-xs text-gray-500">
                        {new Date(report.date).toLocaleDateString()} • {report.type}
                      </div>
                      <div className="text-xs text-gray-400 truncate">
                        {report.description}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                ))
              ) : searchQuery ? (
                <div className="flex items-center justify-center h-14 px-3 text-gray-500 text-sm">
                  No reports found for "{searchQuery}"
                </div>
              ) : (
                <div className="flex items-center justify-center h-14 px-3 text-gray-500 text-sm">
                  No reports available
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * Similarity sidebar: shows nearest-neighbor patients based on model outputs.
 *
 * @remarks
 * Delegates retrieval and rendering to <SimilarPatientList/> to ensure a
 * single source of truth for loading, empty, and error states.
 */
function SimilaritySidebar({
  expanded,
  onToggle,
  patientName,
  onItemClick,
  patientId,
}: {
  expanded: boolean;
  onToggle: () => void;
  patientName: string;
  onItemClick: (itemId: string, itemName: string) => void;
  patientId: string;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  const outcomeColors = {
    excellent: "bg-green-100 text-green-700",
    good: "bg-blue-100 text-blue-700",
    fair: "bg-yellow-100 text-yellow-700",
  };

  const handleSearchToggle = () => {
    setIsSearching((v) => !v);
    if (isSearching) setSearchQuery("");
  };
  const clearSearch = () => {
    setSearchQuery("");
    setIsSearching(false);
  };

  return (
    <>
      {!expanded && (
        <div
          onClick={onToggle}
          className="fixed left-20 top-0 h-full w-2 bg-transparent hover:bg-primary/20 transition-colors cursor-pointer z-35"
          title="Click to open similarity sidebar"
        />
      )}

      <div
        className={cn(
          "fixed left-20 top-0 h-full bg-white transition-all duration-300 z-40 flex flex-col shadow-lg border-r-2 border-gray-100",
          expanded ? "w-[340px]" : "w-0 overflow-hidden",
        )}
      >
        <div className="p-4 space-y-4 flex-1 overflow-y-auto">
          <div className="bg-white rounded-[40px] shadow-md border border-gray-100">
            <div className="p-2">
              <div className="px-3 py-2 text-xs font-medium text-gray-500 uppercase">
                Similar Patients
              </div>

              <SimilarPatientList
                patientId={patientId}
                k={10}
                onSelect={(id, name) => {
                  onItemClick(id, name);
                  onToggle(); // optionally collapse after selection
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
