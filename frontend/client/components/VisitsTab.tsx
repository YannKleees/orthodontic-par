/* =============================================================================
   VisitsTab
   -----------------------------------------------------------------------------
   Tab view for listing, searching, and adding visits for a given patient.
   Functionality:
     • Displays historical and scheduled visits.
     • Allows client-side search/filter by multiple fields (type, doctor, notes).
     • Color-coded status badges for clinical workflow stage.
     • Integrates "Add Visit" full-screen form wizard.
============================================================================= */
import { Calendar, Clock, User, FileText, Search, X } from "lucide-react";
import { useState } from "react";
import FullScreenModal from "./FullScreenModal";
import AddVisitForm    from "./AddVisitForm";
import { cn } from "../lib/utils";
import "./PatientSidebar.css";

interface VisitsTabProps {
  patientName: string;
  patientId: string;
}
interface Visit {
  id: string;
  date: string;
  time: string;
  type: string;
  doctor: string;
  status: "completed" | "upcoming" | "cancelled";
  notes?: string;
}

export function VisitsTab({ patientName, patientId }: VisitsTabProps) {
  /* Placeholder dataset; replace with API query in production */
  const visits: Visit[] = [
    { id: "1", date: "2024-01-15", time: "10:30 AM", type: "Restorative Treatment", doctor: "Dr. Sarah Johnson, DDS", status: "completed",
      notes: "Composite fillings placed on teeth 36 and 11. Patient tolerated procedure well. Post-op instructions given." },
    { id: "2", date: "2024-01-08", time: "2:15 PM", type: "Comprehensive Exam", doctor: "Dr. Michael Chen, DDS", status: "completed",
      notes: "Full mouth examination completed. Intra-oral photos taken. Caries detected requiring treatment." },
    { id: "3", date: "2024-01-22", time: "11:00 AM", type: "Periodontal Therapy", doctor: "Dr. Sarah Johnson, DDS", status: "upcoming",
      notes: "Scheduled for scaling and root planing in lower right quadrant." },
    { id: "4", date: "2024-01-05", time: "3:30 PM", type: "Emergency Visit", doctor: "Dr. Emergency Team", status: "completed",
      notes: "Acute pulpitis tooth 37. Endodontic access performed. Pain relief achieved." },
  ];

  const [showWizard, setShowWizard] = useState(false);
  const [query,      setQuery]      = useState("");

  /* String match filter: case-insensitive search across type, doctor, notes, date, time */
  const filtered = query.trim()
    ? visits.filter(
        v =>
          v.type.toLowerCase().includes(query.toLowerCase())   ||
          v.doctor.toLowerCase().includes(query.toLowerCase()) ||
          v.notes?.toLowerCase().includes(query.toLowerCase()) ||
          v.date.includes(query) ||
          v.time.toLowerCase().includes(query.toLowerCase()))
    : visits;

  const keyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") setQuery("");
  };

  /* Fixed mapping for status→color token */
  const statusColors: Record<Visit["status"], string> = {
    completed: "bg-green-100 text-green-800",
    upcoming:   "bg-blue-100  text-blue-800",
    cancelled:  "bg-red-100   text-red-800",
  };

  return (
    <>
      {/* Conditional mount of visit creation modal */}
      {showWizard && (
        <FullScreenModal
          title={`Add new visit – ${patientName}`}
          onClose={() => setShowWizard(false)}
        >
          <AddVisitForm
            patientId={patientId}
            patientName={patientName}
            onSave={() => setShowWizard(false)}
            onCancel={() => setShowWizard(false)}
          />
        </FullScreenModal>
      )}

      {/* Header: patient context + search + add control */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-on-surface">
            Visits – {patientName}
          </h2>
          <p className="text-on-surface-variant">
            Complete visit history and upcoming appointments
          </p>
        </div>

        <div className="flex items-center gap-4 top-controls">
          {/* Floating-label search form */}
          <form onSubmit={e => e.preventDefault()} className="relative w-60">
            <input
              id="visit-search"
              type="text"
              required
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={keyDown}
              className="peer w-full h-12 bg-white border border-[#ffffff] rounded-xl
                         px-4 pr-10 text-base outline-none focus:shadow-md"
              placeholder=" "
            />
            <label
              htmlFor="visit-search"
              className="absolute left-4 top-1/2 -translate-y-1/2 px-2 bg-white font-light text-base
                         peer-focus:top-0 peer-focus:left-3 peer-focus:text-sm peer-focus:text-[#4070f4]
                         peer-valid:-top-0 peer-valid:left-3 peer-valid:text-sm peer-valid:text-[#4070f4]
                         duration-150"
            >
              Search visits
            </label>

            {query ? (
              <X
                onClick={() => setQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 cursor-pointer"
              />
            ) : (
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4070f4]" />
            )}
          </form>

          {/* Animated "add visit" control */}
          <button
            title="Schedule visit"
            onClick={() => setShowWizard(true)}
            className="group cursor-pointer outline-none hover:rotate-90 duration-300 ml-2"
          >
            <svg /* plus-in-circle icon */ ... />
          </button>
        </div>
      </div>

      {/* Visit listing: structured summary cards */}
      <div className="space-y-4">
        {filtered.map((visit) => (
          <div
            key={visit.id}
            className="hover:shadow-md transition-shadow bg-white rounded-lg border border-gray-100"
          >
            <div className="px-6 pt-4 pb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold">{visit.type}</h3>
              <span
                className={cn(
                  "text-xs font-medium px-2 py-1 rounded-full",
                  statusColors[visit.status],
                )}
              >
                {visit.status.charAt(0).toUpperCase() + visit.status.slice(1)}
              </span>
            </div>

            <div className="px-6 pb-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                {/* Date field */}
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="w-4 h-4 text-on-surface-variant" />
                  <span className="font-medium">Date:</span>
                  <span>{new Date(visit.date).toLocaleDateString()}</span>
                </div>
                {/* Time field */}
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="w-4 h-4 text-on-surface-variant" />
                  <span className="font-medium">Time:</span>
                  <span>{visit.time}</span>
                </div>
                {/* Doctor field */}
                <div className="flex items-center gap-2 text-sm">
                  <User className="w-4 h-4 text-on-surface-variant" />
                  <span className="font-medium">Doctor:</span>
                  <span>{visit.doctor}</span>
                </div>
              </div>

              {visit.notes && (
                <div className="bg-gray-50 p-3 rounded-lg">
                  <div className="flex items-start gap-2">
                    <FileText className="w-4 h-4 text-on-surface-variant mt-0.5" />
                    <div>
                      <span className="font-medium text-sm">Notes:</span>
                      <p className="text-sm text-on-surface-variant mt-1">
                        {visit.notes}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        {!filtered.length && (
          <div className="text-center text-gray-500 py-8">
            No visits found for “{query}”.
          </div>
        )}
      </div>
    </>
  );
}
