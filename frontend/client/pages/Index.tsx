/** ============================================================================
 * pages/Index.tsx — Application shell (patient-centric workflow)
 * =============================================================================
 * PURPOSE
 *  - Orchestrates the primary UI: sidebars, tabbed workspaces, and content panes
 *    for patient dashboards, visits, reports, similarity, image upload, and
 *    PAR annotation workspaces.
 *
 * SCIENTIFIC/CLINICAL CONTEXT
 *  - Supports a longitudinal orthodontic workflow where the Peer Assessment
 *    Rating (PAR) and per-component metrics are computed, reviewed, and tracked
 *    across visits. This shell coordinates state transitions (e.g., upload →
 *    analysis → dashboard) and ensures derived metrics (e.g., currentPARScore)
 *    are reflected consistently via React Query invalidations and event-based
 *    updates (e.g., "par-score-updated").
 *
 * DESIGN NOTES
 *  - Tabs are the core navigation primitive. A patient dashboard tab is keyed
 *    by patientId; other tabs (upload, mosaic, workspace) are keyed to visitId
 *    where relevant to maintain referential integrity and avoid UI collisions.
 *  - The sidebar is role-sensitive: patients/visits/similarity panels reuse the
 *    same layout with different data sources, improving cognitive continuity.
 *  - React Query is used to centralize data fetching, caching, and invalidation.
 *    Local state drives only ephemeral UI (active tab, drawer, etc.).
 * ============================================================================ */

import { apiClient, apiUtils } from "@/lib/api";
import { useState } from "react";
import { IconSidebar } from "../components/IconSidebar";
import { PatientSidebar } from "../components/PatientSidebar";
import { PatientTabs } from "../components/PatientTabs";
import PatientCards from "../components/PatientCards";
import AddVisitForm from "@/components/AddVisitForm";
import { AddPatientForm } from "../components/AddPatientForm";
import { MosaicFullscreen } from "../components/MosaicFullscreen";
import { VisitsTab } from "../components/VisitsTab";
import { ReportsTab } from "../components/ReportsTab";
import { DentalImageUpload } from "../components/DentalImageUpload";
import { DentalMosaicWorkspace } from "../components/DentalMosaicWorkspace";
import { BulkProcessing } from "../components/BulkProcessing";
import { SidebarPanels } from "../components/SidebarPanels";
import { Button } from "../components/ui/button";
import { cn } from "../lib/utils";
import { usePatients } from "../hooks/useApi";
import { PARComponentsProvider } from "../hooks/usePARComponentsContext";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

/** Tab model for the top navigation bar.
 *  type=patient is canonical; other types represent task-specific views.
 *  `visitId` is optional on patient tabs and indicates which visit to show. */
export interface Tab {
  id: string;
  name: string;
  type:
    | "patient"
    | "visit"
    | "add-patient"
    | "mosaic"
    | "visits"
    | "reports"
    | "similarity"
    | "upload"
    | "workspace"
    | "bulk-processing";
  patientId?: string;
  patientName?: string;
  visitId?:    string;   // current visit context for dashboards/workspaces
  compareTo?: string;    // optional comparison target (e.g., previous visit)
}

export default function Index() {
  /** Active tab identifier; null means no selection yet. */
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  /** Sidebar expansion state for patients/visits/similarity panels. */
  const [sidebarExpanded, setSidebarExpanded] = useState(false);

  /** High-level UI section (controls which sidebar is visible). */
  const [activeSection, setActiveSection] = useState("patients");

  /** React Query client for targeted cache invalidation. */
  const queryClient = useQueryClient();

  /** Array of open tabs; order determines rendering and close behavior. */
  const [openTabs, setOpenTabs] = useState<Tab[]>([]);

  /** Handles switching UI sections; guarantees sidebar is open so the user
   *  can immediately interact (e.g., select a patient, filter visits). */
  const handleSectionChange = (section: string) => {
    setActiveSection(section);
    setSidebarExpanded(true);
  };

  /** Pulls patient list for sidebar/dashboards. Auto-refetch is triggered by
   *  a custom event whenever PAR totals are re-computed elsewhere. */
  const { data: patientsData, loading: patientsLoading, refetch: refetchPatients} = usePatients();

  useEffect(() => {
    const handleScoreUpdate = () => {
      refetchPatients();
    };
    window.addEventListener("par-score-updated", handleScoreUpdate);
    return () => {
      window.removeEventListener("par-score-updated", handleScoreUpdate);
    };
  }, [refetchPatients]);

  /** Normalize/defensively map API patients to sidebar-ready items.
   *  Handles empty/null cases to preserve referential safety. */
  const availablePatients = patientsData && Array.isArray(patientsData) && patientsData.length > 0
    ? patientsData.map((p) =>  ({
        id: p.id,
        name: p.name,
        age: p.age,
        condition: p.condition,
        visits: p.visits ?? [],
        parScore: p.currentPARScore ?? p.parScore ?? 0,
        currentPARScore: p.currentPARScore ?? p.parScore ?? 0,
        treatmentUrgency: p.treatmentUrgency ?? "low",
      }))
    : [];

  /** Open (or focus) a patient dashboard tab keyed by patientId.
   *  Ensures single-instance semantics per patient. */
  const handleOpenPatientTab = (patientId: string, patientName: string) => {
    const existingTab = openTabs.find((tab) => tab.id === patientId);
    if (existingTab) {
      setActiveTabId(patientId);
      return;
    }
    const newTab: Tab = {
      id: patientId,
      name: patientName,
      type: "patient",
      patientId: patientId,
      patientName: patientName,
    };
    setOpenTabs((prev) => [...prev, newTab]);
    setActiveTabId(patientId);
  };

  /** Close a tab by id. If the active tab is closed, focus the rightmost tab
   *  to preserve user continuity. */
  const handleCloseTab = (tabId: string) => {
    setOpenTabs((prev) => prev.filter((tab) => tab.id !== tabId));
    if (activeTabId === tabId) {
      const remainingTabs = openTabs.filter((tab) => tab.id !== tabId);
      if (remainingTabs.length > 0) {
        setActiveTabId(remainingTabs[remainingTabs.length - 1].id);
      } else {
        setActiveTabId(null);
      }
    }
  };

  /** Focus a tab by id without mutating tab order. */
  const handleTabChange = (tabId: string) => {
    setActiveTabId(tabId);
  };

  /** Begin creating a visit in a dedicated "visit" tab (wizard).
   *  Patient context is propagated so subsequent actions can route
   *  to the correct dashboard and upload workflows. */
  const handleAddVisit = (patientId: string) => {
    const patInfo = availablePatients.find(p => p.id === patientId);
    if (!patInfo) return;

    const visitId = `visit-${Date.now()}`;
    const visitTab: Tab = {
      id: visitId,
      name: `Add Visit - ${patInfo.name}`,
      type: "visit",
      patientId: patientId,
    };

    setOpenTabs((prev) => [...prev, visitTab]);
    setActiveTabId(visitId);
  };

  /** After a visit is saved via wizard:
   *  (1) close the transient visit tab;
   *  (2) focus an existing patient dashboard or create one. */
  const handleVisitSave = (visitId: string) => {
    if (activeTab?.type === "visit") handleCloseTab(activeTab.id);

    const pid   = activeTab?.patientId ?? activeTab?.id!;
    const pname = activeTab?.patientName ?? activeTab?.name ?? "Patient";

    const existing = openTabs.find(t => t.type==="patient" && t.id===pid);
    if (existing) {
      setActiveTabId(existing.id);
    } else {
      setOpenTabs(prev => [
        ...prev,
        { id:pid, name:pname, type:"patient", patientId:pid, patientName:pname }
      ]);
      setActiveTabId(pid);
    }
  };

  /** Open an "Add Patient" form as a new tab; single-instance per timepoint. */
  const handleAddPatient = () => {
    const addPatientTab: Tab = {
      id: `add-patient-${Date.now()}`,
      name: "Add New Patient",
      type: "add-patient",
    };
    setOpenTabs((prev) => [...prev, addPatientTab]);
    setActiveTabId(addPatientTab.id);
  };

  /** Persist a newly created patient; then transition directly into the
   *  upload pipeline (primary workflow entrypoint). */
  const handlePatientSave = async (formData: { name: string; dateOfBirth: string }) => {
    try {
      const { success, data } = await apiClient.createPatient({
        name:        formData.name,
        dateOfBirth: formData.dateOfBirth,
        age:         0,
        visits:      [],
        createdAt:   new Date().toISOString(),
        status:      "Active",
      });
      if (!success) throw new Error("API failed");

      await refetchPatients();
      const pid = data.id;
      const pname = data.name;

      if (activeTab?.type === "add-patient") handleCloseTab(activeTab.id);

      // Promote the upload step to maximize adherence to imaging protocol
      const uploadTabId = `upload-${pid}`;
      setOpenTabs(prev => {
        const filtered = prev.filter(t => !(t.type === "upload" && t.patientId === pid));
        return [...filtered, {
          id: uploadTabId,
          name: `Upload Images - ${pname}`,
          type: "upload",
          patientId: pid,
          patientName: pname,
        }];
      });
      setActiveTabId(uploadTabId);
    } catch (err) {
      console.error(err);
      alert("Failed to add patient");
    }
  };

  /** Open a full-screen mosaic for a given visit (or latest) in a dedicated tab.
   *  This view is optimized for image review and PAR component overlays. */
  const handleOpenMosaicFullscreen = (
    patientId: string,
    patientName: string,
    visitId?: string
  ) => {
    const targetVisit = visitId || "latest";
    const existingTab = openTabs.find(
      (tab) =>
        tab.type === "mosaic" &&
        tab.patientId === patientId &&
        tab.visitId   === targetVisit
    );

    if (!existingTab) {
      const newTab: Tab = {
        id: `mosaic-${patientId}-${visitId || "latest"}`,
        name: `Mosaic - ${patientName}`,
        type: "mosaic",
        patientId: patientId,
        patientName: patientName,
        visitId : targetVisit,
      };
      setOpenTabs((prev) => [...prev, newTab]);
      setActiveTabId(newTab.id);
    } else {
      setActiveTabId(existingTab.id);
    }
  };

  /** ----------------------------------------------------------------
   *  Called by SidebarPanels when a visit row is clicked.
   *  Behavior:
   *   - If a patient dashboard is already open, retarget it to the
   *     selected visit and focus it (to minimize tab sprawl).
   *   - Otherwise create a patient dashboard already pointing at that visit.
   *  ---------------------------------------------------------------- */
  const handleOpenVisit = (
    visitId: string,
    patientId: string,
    patientName: string
  ) => {
    const existing = openTabs.find(t => t.type === "patient" && t.id === patientId);
    if (existing) {
      // Mutate visit context on the existing tab (then force re-render)
      existing.compareTo = existing.visitId;
      existing.visitId   = visitId;
      setActiveTabId(existing.id);
      setOpenTabs([...openTabs]);
      return;
    }
    const newTab: Tab = {
      id: patientId,
      name: patientName,
      type: "patient",
      patientId,
      patientName,
      visitId,
    };
    setOpenTabs(prev => [...prev, newTab]);
    setActiveTabId(newTab.id);
  };

  /** Compose a workspace tab for interactive PAR editing for a visit. */
  const makeWorkspaceTab = (
    visitId: string,
    patientId: string,
    patientName: string
  ): Tab => ({
    id: `workspace-${visitId}`,
    name: `Dental Analysis – ${patientName}`,
    type: "workspace",
    patientId,
    patientName,
  });

  /** Focus an existing workspace or create one. Single-instance per visit
   *  ensures transactional editing and consistency of overlay state. */
  const focusOrCreateWorkspace = (
    visitId: string,
    patientId: string,
    patientName: string
  ) => {
    const tabId = `workspace-${visitId}`;
    const existing = openTabs.find(t => t.id === tabId);
    if (existing) {
      setActiveTabId(existing.id);
      return;
    }
    const newTab = makeWorkspaceTab(visitId, patientId, patientName);
    setOpenTabs(prev => [...prev, newTab]);
    setActiveTabId(newTab.id);
  };

  /** Open (or focus) the image upload tab for a given patient.
   *  This is the typical entrypoint to a new visit’s imaging pipeline. */
  const handleOpenImageUpload = (patientId: string, patientName: string) => {
    const existingTab = openTabs.find(
      (tab) => tab.type === "upload" && tab.patientId === patientId,
    );

    if (!existingTab) {
      const newTab: Tab = {
        id: `upload-${patientId}`,
        name: `Upload Images - ${patientName}`,
        type: "upload",
        patientId: patientId,
        patientName: patientName,
      };

      setOpenTabs((prev) => [...prev, newTab]);
      setActiveTabId(newTab.id);
    } else {
      setActiveTabId(existingTab.id);
    }
  };

  /** After the imaging pipeline completes:
   *   - Refetch patients to refresh sidebar metadata.
   *   - Invalidate visit & patient caches to propagate scores/mosaics.
   *   - Focus the patient dashboard pointed at the new visit.
   *   - Close the upload tab to reduce cognitive load. */
  const handleUploadCompleted = async (visitId: string) => {
    if (!activeTab || activeTab.type !== "upload") return;

    await refetchPatients?.();

    const pid = activeTab.patientId!;
    queryClient.invalidateQueries({ queryKey: ["visits", pid] });
    queryClient.invalidateQueries({ queryKey: ["patient", pid] });
    const pname = activeTab.patientName!;

    setOpenTabs(prev => {
      const existing = prev.find(t => t.type === "patient" && t.id === pid);
      if (existing) {
        const updated = { ...existing, visitId };
        return prev.map(t => (t.id === existing.id ? updated : t));
      }
      return [
        ...prev,
        {
          id: pid,
          name: pname,
          type: "patient",
          patientId: pid,
          patientName: pname,
          visitId,
        } as Tab,
      ];
    });

    setActiveTabId(pid);
    setOpenTabs(prev => prev.filter(t => t.id !== activeTab.id));
  };

  /** Toggle patient sidebar, preserving user intent for quick access. */
  const handlePatientsClick = () => {
    if (activeSection === "patients") {
      setSidebarExpanded(!sidebarExpanded);
    } else {
      setActiveSection("patients");
      setSidebarExpanded(true);
    }
  };

  /** Open patients section and programmatically trigger search focus to reduce
   *  friction when the user is explicitly seeking a patient. */
  const handleSearchClick = () => {
    setActiveSection("patients");
    setSidebarExpanded(true);
    setTimeout(() => {
      const searchButton = document.querySelector("[data-search-toggle]");
      if (searchButton) {
        (searchButton as HTMLElement).click();
      }
    }, 100);
  };

  /** Reset to patients panel when a sidebar sub-panel is closed. */
  const handleCloseSidebarPanel = () => {
    setActiveSection("patients");
  };

  /** Lookup once for convenience in render logic. */
  const activeTab = openTabs.find(t => t.id === activeTabId);

  return (
    <div className="min-h-screen bg-background">
      <IconSidebar
        activeSection={activeSection}
        onSectionChange={handleSectionChange}
        onPatientsClick={handlePatientsClick}
        onSearchClick={handleSearchClick}
        hasSelectedPatient={!!activeTab}
        patientCount={patientsLoading ? 0 : availablePatients.length}
      />

      {activeSection === "patients" && (
        <PatientSidebar
          expanded={sidebarExpanded}
          onToggle={() => setSidebarExpanded(!sidebarExpanded)}
          availablePatients={availablePatients}
          onPatientClick={handleOpenPatientTab}
          onAddPatient={handleAddPatient}
          selectedPatientId={
            activeTab?.type === "patient" ? activeTab.id : undefined
          }
        />
      )}

      {activeSection === "visits" && activeTab && (
        <SidebarPanels
          section="visits"
          expanded={sidebarExpanded}
          onToggle={() => setSidebarExpanded(!sidebarExpanded)}
          patientName={activeTab.patientName || activeTab.name}
          patientId={activeTab.patientId || activeTab.id}
          onVisitClick={handleOpenVisit}
          onItemClick={handleOpenPatientTab}
          onVisitCreated={(_vid)=>{
            const pid   = activeTab.patientId || activeTab.id;
            const pname = activeTab.patientName || activeTab.name;
            const existing = openTabs.find(t => t.type==="patient" && t.id===pid);
            if (existing) setActiveTabId(existing.id);
            else {
              setOpenTabs(prev=>[
                ...prev,
                { id:pid, name:pname, type:"patient", patientId:pid, patientName:pname }
              ]);
              setActiveTabId(pid);
            }
          }}
        />
      )}

      {activeSection === "similarity" && activeTab && (
        <SidebarPanels
          section="similarity"
          expanded={sidebarExpanded}
          onToggle={() => setSidebarExpanded(!sidebarExpanded)}
          patientName={activeTab.patientName || activeTab.name}
          patientId={activeTab.patientId || activeTab.id}
          onItemClick={handleOpenPatientTab}
          onVisitClick={handleOpenVisit}
        />
      )}

      <div className="flex">
        {/* Main Content region. Patient cards are the default center panel. */}
        <div
          className={cn(
            "flex-1 transition-all duration-300",
            sidebarExpanded &&
              (activeSection === "patients" ||
                activeSection === "visits" ||
                activeSection === "similarity")
              ? "ml-[440px]"
              : "ml-20",
          )}
        >
          {/* Global Tabs Bar (sticky) – presents open work contexts */}
          {openTabs.length > 0 && (
            <div className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
              <div className="flex items-center justify-between px-6 py-3">
                <div className="flex items-center gap-2 overflow-x-auto">
                  <PatientTabs
                    tabs={openTabs}
                    activeTabId={activeTabId}
                    onTabChange={handleTabChange}
                    onTabClose={handleCloseTab}
                  />
                </div>
                {activeTab?.type === "patient" && (
                  <div>
                    <Button
                      onClick={() =>
                        handleOpenImageUpload(activeTab.id, activeTab.name)
                      }
                      className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-full px-4 py-2 text-sm font-medium"
                    >
                      Add Visit
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="p-6 max-w-full overflow-hidden">
            {/* Content Switchboard based on activeTab.type */}
            <div className="flex justify-center">
              {activeTab ? (
                activeTab.type === "patient" ? (
                  <PARComponentsProvider patientId={activeTab.id} visitId={activeTab.visitId}>
                    <PatientCards
                      patientId={activeTab.patientId || activeTab.id}
                      patientName={activeTab.patientName || activeTab.name}
                      visitId={activeTab.visitId}
                      onOpenFull={(pid, pname, vid) => handleOpenMosaicFullscreen(pid, pname, vid)}
                    />
                  </PARComponentsProvider>
                ) : activeTab.type === "visit" ? (
                  <AddVisitForm
                    patientId={activeTab.patientId!}
                    patientName={
                      availablePatients.find(
                        (p) => p.id === activeTab.patientId,
                      )?.name || ""
                    }
                    onSave={handleVisitSave}
                    onCancel={() => handleCloseTab(activeTab.id)}
                  />
                ) : activeTab.type === "add-patient" ? (
                  <AddPatientForm
                    onSave={handlePatientSave}
                    onCancel={() => handleCloseTab(activeTab.id)}
                  />
                ) : activeTab.type === "mosaic" ? (
                 (
                   <PARComponentsProvider
                       patientId={activeTab.patientId!}
                       visitId={activeTab.visitId}
                   >
                     <MosaicFullscreen
                       patientName={activeTab.patientName!}
                       patientId={activeTab.patientId!}
                       visitId={activeTab.visitId! /* we always have it when user clicks */ }
                     />
                   </PARComponentsProvider>
                 )
                ) : activeTab.type === "upload" ? (
                  <DentalImageUpload
                    patientId={activeTab.patientId!}
                    patientName={activeTab.patientName!}
                    onAllCompleted={handleUploadCompleted}
                  />
                ) : activeTab.type === "workspace" ? (
                  <PARComponentsProvider patientId={activeTab.patientId!} visitId={activeTab.visitId}>
                    <DentalMosaicWorkspace
                      patientId   ={activeTab.patientId!}
                      patientName ={activeTab.patientName!}
                      hasPrevisousVisit={!!activeTab.visitId}
                    />
                  </PARComponentsProvider>
                ) : activeTab.type === "bulk-processing" ? (
                  <BulkProcessing
                    onClose={() => handleCloseTab(activeTab.id)}
                  />
                ) : (
                  /* Fallback: patient-centric cards for visits/reports/similarity */
                  <PatientCards
                    patientId={activeTab.patientId || activeTab.id}
                    patientName={activeTab.patientName || activeTab.name}
                    visitId={activeTab.visitId}
                    onOpenFull={(pid, pname, vid) =>
                       handleOpenMosaicFullscreen(pid, pname, vid)
                     }
                  />
                )
              ) : (
                <div className="flex items-center justify-center h-96 text-gray-500">
                  <div className="text-center">
                    <h3 className="text-lg font-medium mb-2">
                      No Patient Selected
                    </h3>
                    <p className="text-sm">
                      Select a patient from the sidebar to get started
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
