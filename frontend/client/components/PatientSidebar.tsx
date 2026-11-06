/**
 * @file PatientSidebar.tsx
 * @brief Patient directory with facets and sorting.
 *
 * @updates 2025-07-30
 * - Fix: PAR filters/sorting now use the score from the latest visit only.
 * - Added: `lastParScore()` helper; removed earlier aggregate helpers.
 * - Layout, styling, and behavior remain backward compatible.
 */

import { useState, useMemo, useRef, useEffect } from "react";
import {
  Search,
  User,
  X,
  SlidersHorizontal,
  ArrowUpAZ,
  ArrowDownAZ,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Visit } from "@/hooks/types";
import "./PatientSidebar.css";

/** Canonical patient shape used by the directory. */
interface Patient {
  id: string;
  name: string;
  age: number;
  condition?: string;
  visits?: Visit[];
  /** Optional scalar PAR if already computed upstream. */
  currentPARScore?: number;
  /** Legacy alias preserved for compatibility. */
  parScore?: number;
  /** Clinician-triaged urgency bucket. */
  treatmentUrgency?: "low" | "medium" | "high" | "emergency";
}

/** Props for the patient directory sidebar. */
interface PatientSidebarProps {
  expanded: boolean;
  onToggle: () => void;
  availablePatients: Patient[];
  onPatientClick: (id: string, name: string) => void;
  onAddPatient?: () => void;
  selectedPatientId?: string;
}

/** Facet constants. */
const URGENCY = ["low", "medium", "high", "emergency"] as const;
const PAR_COMPONENTS = [
  "Upper Crowding",
  "Lower Crowding",
  "Upper Spacing",
  "Lower Spacing",
  "Overjet",
  "Overbite",
  "Crossbite",
  "Centerline",
] as const;

const SORT_FIELDS = [
  { key: "name", label: "Name" },
  { key: "age", label: "Age" },
  { key: "par", label: "PAR score" },
  { key: "urg", label: "Urgency" },
] as const;

type SortDir = "asc" | "desc";

/**
 * Sidebar list of patients with full-text search, facet filters, and sorting.
 */
export function PatientSidebar({
  expanded,
  onToggle,
  availablePatients,
  onPatientClick,
  onAddPatient,
  selectedPatientId,
}: PatientSidebarProps) {
  const [query, setQuery] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [urgSel, setUrgSel] = useState(recordFromArray(URGENCY));
  const [compSel, setCompSel] = useState(recordFromArray(PAR_COMPONENTS));

  const [parMin, setParMin] = useState(0);
  const [parMax, setParMax] = useState(60);

  const [sortField, setSortField] = useState<string>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  /** Close the filter drawer with Escape for keyboard users. */
  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && drawerOpen) setDrawerOpen(false);
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [drawerOpen]);

  /**
   * Derived patient list: text search → facets → range filter → sort.
   * Latest-visit PAR score is used for numeric filtering and ordering.
   */
  const filtered = useMemo(() => {
    let list = [...availablePatients];

    // Full-text search across name, condition, id, and age string.
    if (query.trim()) {
      const tokens = deburr(query).toLowerCase().split(/\s+/);
      list = list.filter(
        (p) =>
          matchAll(`${p.name} ${p.condition ?? ""}`, tokens) ||
          matchAll(p.id, tokens) ||
          tokens.every((t) => p.age.toString().includes(t)),
      );
    }

    // Urgency facet.
    const urgActive = activeKeys(urgSel);
    if (urgActive.length) {
      list = list.filter((p) => urgActive.includes(p.treatmentUrgency ?? ""));
    }

    // PAR score range (latest visit only).
    if (parMin !== 0 || parMax !== 60) {
      list = list.filter((p) => {
        const s = lastParScore(p);
        return s != null && s >= parMin && s <= parMax;
      });
    }

    // PAR component facet (presence across any visit).
    const compActive = activeKeys(compSel).map(lc);
    if (compActive.length) {
      list = list.filter((p) =>
        p.visits?.some((v) =>
          v.boxes?.some((box) => compActive.includes(lc(box.component))),
        ),
      );
    }

    // Sorting.
    const sign = sortDir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      switch (sortField) {
        case "name":
          return sign * a.name.localeCompare(b.name);
        case "age":
          return sign * (a.age - b.age);
        case "par":
          return sign * ((lastParScore(a) ?? 0) - (lastParScore(b) ?? 0));
        case "urg":
          return sign * (urgRank(a.treatmentUrgency) - urgRank(b.treatmentUrgency));
        default:
          return 0;
      }
    });

    return list;
  }, [availablePatients, query, urgSel, compSel, parMin, parMax, sortField, sortDir]);

  /** Active filter “chips” for quick visual feedback and removal. */
  const chips = [
    ...URGENCY.filter((k) => urgSel[k]).map(cap),
    ...PAR_COMPONENTS.filter((c) => compSel[c]),
    ...(parMin !== 0 || parMax !== 60 ? [`${parMin}-${parMax}`] : []),
  ];
  const untickChip = (lbl: string) => {
    if (URGENCY.map(cap).includes(lbl)) setUrgSel((s) => ({ ...s, [lbl.toLowerCase()]: false }));
    else if (PAR_COMPONENTS.includes(lbl as any)) setCompSel((s) => ({ ...s, [lbl]: false }));
    else {
      setParMin(0);
      setParMax(60);
    }
  };

  const openDrawer = () => setDrawerOpen(true);
  const toggleDrawer = () => setDrawerOpen((o) => !o);
  const clearFilters = () => {
    setUrgSel(recordFromArray(URGENCY));
    setCompSel(recordFromArray(PAR_COMPONENTS));
    setParMin(0);
    setParMax(60);
  };

  return (
    <>
      {/* Small hover handle to reopen when collapsed */}
      {!expanded && (
        <div
          onClick={onToggle}
          className="fixed left-20 top-0 h-full w-2 bg-transparent hover:bg-primary/20 cursor-pointer z-35"
        />
      )}

      <aside
        className={cn(
          "fixed left-20 top-0 h-full bg-white transition-all duration-300 z-40 flex flex-col shadow-lg border-r-2 border-gray-100",
          expanded ? "w-[360px]" : "w-0 overflow-hidden",
        )}
      >
        <div className="p-4 space-y-4 flex-1 overflow-y-auto">
          <HeaderRow
            query={query}
            setQuery={setQuery}
            chips={chips}
            onChipClear={untickChip}
            filteredLen={filtered.length}
            onAddPatient={onAddPatient}
            openDrawer={openDrawer}
            toggleDrawer={toggleDrawer}
          />

          <PatientList
            patients={filtered}
            selectedId={selectedPatientId}
            onSelect={onPatientClick}
            highlight={(txt) =>
              query
                ? txt
                    .split(new RegExp(`(${escapeRx(query)})`, "gi"))
                    .map((part, i) =>
                      part.toLowerCase() === query.toLowerCase() ? (
                        <span key={i} className="hl">
                          {part}
                        </span>
                      ) : (
                        part
                      ),
                    )
                : txt
            }
          />
        </div>
      </aside>

      <ResizableDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <DrawerContent
          urgSel={urgSel}
          setUrgSel={setUrgSel}
          compSel={compSel}
          setCompSel={setCompSel}
          parMin={parMin}
          parMax={parMax}
          setParMin={setParMin}
          setParMax={setParMax}
          sortField={sortField}
          setSortField={setSortField}
          sortDir={sortDir}
          setSortDir={setSortDir}
          clearFilters={clearFilters}
        />
      </ResizableDrawer>
    </>
  );
}

/** Drawer content with facets, range control, and sort settings. */
function DrawerContent(props: {
  urgSel: FacetState;
  setUrgSel: React.Dispatch<React.SetStateAction<FacetState>>;
  compSel: FacetState;
  setCompSel: React.Dispatch<React.SetStateAction<FacetState>>;
  parMin: number;
  parMax: number;
  setParMin: (n: number) => void;
  setParMax: (n: number) => void;
  sortField: string;
  setSortField: (k: string) => void;
  sortDir: SortDir;
  setSortDir: (d: SortDir) => void;
  clearFilters: () => void;
}) {
  const {
    urgSel,
    setUrgSel,
    compSel,
    setCompSel,
    parMin,
    parMax,
    setParMin,
    setParMax,
    sortField,
    setSortField,
    sortDir,
    setSortDir,
    clearFilters,
  } = props;

  return (
    <div className="filter-drawer-inner">
      <h3 className="drawer-title mb-4">Filters&nbsp;&amp;&nbsp;sort</h3>

      <Facet title="Treatment urgency" values={URGENCY} state={urgSel} setState={setUrgSel} />

      <section className="facet-section par-range">
        <p className="facet-title">PAR score&nbsp;range</p>
        <div className="range-values">
          {parMin} – {parMax}
        </div>
        <div className="range-wrapper">
          <input
            type="range"
            min={0}
            max={60}
            step={1}
            value={parMin}
            onChange={(e) => setParMin(Math.min(+e.target.value, parMax - 1))}
            aria-label="Minimum PAR"
          />
          <input
            type="range"
            min={0}
            max={60}
            step={1}
            value={parMax}
            onChange={(e) => setParMax(Math.max(+e.target.value, parMin + 1))}
            aria-label="Maximum PAR"
          />
        </div>
      </section>

      <Facet
        title="PAR component"
        values={PAR_COMPONENTS}
        state={compSel}
        setState={setCompSel}
        scroll
      />

      <section className="mt-6">
        <p className="facet-title">Sort by</p>
        <div className="radio-inputs">
          {SORT_FIELDS.map((f) => (
            <label key={f.key}>
              <input
                type="radio"
                className="radio-input"
                checked={sortField === f.key}
                onChange={() => setSortField(f.key)}
              />
              <span className="radio-tile small">
                <span className="radio-label">{f.label}</span>
              </span>
            </label>
          ))}
        </div>

        <button
          className="sort-dir-btn"
          onClick={() => setSortDir((prev: SortDir) => (prev === "asc" ? "desc" : "asc"))}
          title={sortDir === "asc" ? "ascending" : "descending"}
        >
          {sortDir === "asc" ? <ArrowUpAZ className="w-4 h-4" /> : <ArrowDownAZ className="w-4 h-4" />}
        </button>
      </section>

      <button className="link mt-6" onClick={clearFilters}>
        Clear all filters
      </button>
    </div>
  );
}

/** Search header with floating label, chips, and filter toggle. */
function HeaderRow(props: {
  query: string;
  setQuery: (s: string) => void;
  chips: string[];
  onChipClear: (txt: string) => void;
  filteredLen: number;
  onAddPatient?: () => void;
  openDrawer: () => void;
  toggleDrawer: () => void;
}) {
  const {
    query,
    setQuery,
    chips,
    onChipClear,
    filteredLen,
    onAddPatient,
    openDrawer,
    toggleDrawer,
  } = props;

  return (
    <>
      <div className="flex items-center gap-4 top-controls">
        <form onSubmit={(e) => e.preventDefault()} className="relative w-60">
          <input
            id="patient-search"
            type="text"
            required
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={openDrawer}
            onKeyDown={(e) => e.key === "Escape" && setQuery("")}
            className="peer w-full h-12 bg-white border border-[#fffff] rounded-xl px-4 pr-10 text-base outline-none focus:shadow-md"
            placeholder=" "
          />
          <label htmlFor="patient-search" className="floating-label">
            Search patients
          </label>
          {query ? <X className="clear-ico" onClick={() => setQuery("")} /> : <Search className="search-ico" />}
        </form>

        {onAddPatient && (
          <button
            title="Add patient"
            onClick={onAddPatient}
            className="group cursor-pointer outline-none hover:rotate-90 duration-300 ml-2"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="50"
              height="50"
              viewBox="0 0 24 24"
              className="stroke-blue-400 fill-none group-hover:fill-white group-active:stroke-blue-200 duration-300"
              aria-label="Add patient"
            >
              <path d="M12 22c5.5 0 10-4.5 10-10S17.5 2 12 2 2 6.5 2 12s4.5 10 10 10Z" strokeWidth="1.5" />
              <path d="M8 12h8M12 16V8" strokeWidth="1.5" />
            </svg>
          </button>
        )}

        <button
          onClick={toggleDrawer}
          className="ml-auto p-2 rounded-full hover:bg-primary/10 transition"
          title="Filters"
          aria-label="Open filters"
        >
          <SlidersHorizontal className="w-5 h-5 text-primary" />
        </button>
      </div>

      {(query || chips.length) && (
        <div className="chips-row">
          {query && <Chip text={`“${query}”`} onClear={() => setQuery("")} />}
          {chips.map((c) => (
            <Chip key={c} text={c} onClear={() => onChipClear(c)} />
          ))}
          {filteredLen > 0 && <span className="result-count">{filteredLen} match</span>}
        </div>
      )}
    </>
  );
}

/** Small pill with clear icon used for active filters. */
const Chip = ({ text, onClear }: { text: string; onClear: () => void }) => (
  <span className="chip">
    {text}
    <X className="w-3 h-3 ml-1 cursor-pointer" onClick={onClear} />
  </span>
);

/** Generic facet section with checkbox options. */
type FacetState = Record<string, boolean>;
function Facet({
  title,
  values,
  state,
  setState,
  scroll = false,
}: {
  title: string;
  values: readonly string[] | readonly { key: string; label: string }[];
  state: FacetState;
  setState: React.Dispatch<React.SetStateAction<FacetState>>;
  scroll?: boolean;
}) {
  const opts = (values as any[]).map((v) => (typeof v === "string" ? { key: v, label: v } : v));
  const toggle = (k: string) => setState((s) => ({ ...s, [k]: !s[k] }));

  return (
    <section className="facet-section">
      <p className="facet-title">{title}</p>
      <div className={cn("facet-values", scroll && "scrollable")}>
        {opts.map((o) => (
          <label key={o.key} className="facet-value">
            <input
              type="checkbox"
              className="facet-checkbox"
              checked={!!state[o.key]}
              onChange={() => toggle(o.key)}
            />
            <span className="facet-label">{o.label}</span>
          </label>
        ))}
      </div>
    </section>
  );
}

/** Patient list view; uses latest-visit PAR score for the badge. */
function PatientList({
  patients,
  selectedId,
  onSelect,
  highlight,
}: {
  patients: Patient[];
  selectedId?: string;
  onSelect: (id: string, name: string) => void;
  highlight: (s: string) => React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-[40px] shadow-md border border-gray-100">
      <div className="p-2">
        {patients.length ? (
          patients.map((p) => (
            <div
              key={p.id}
              onClick={() => onSelect(p.id, p.name)}
              className={cn(
                "flex items-center h-14 px-3 rounded-lg cursor-pointer transition-colors group",
                selectedId === p.id ? "bg-primary/10 border-l-4 border-primary" : "hover:bg-gray-50",
              )}
            >
              <User
                className={cn(
                  "w-4 h-4 mr-3",
                  selectedId === p.id ? "text-primary" : "text-gray-400 group-hover:text-gray-600",
                )}
              />
              <div className="flex-1 min-w-0">
                <div
                  className={cn("text-sm font-medium truncate", selectedId === p.id ? "text-primary" : "text-on-surface")}
                >
                  {highlight(p.name)}
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-gray-500 text-xs truncate">
                    ID:{p.id.split("-")[1]?.substring(0, 6) || p.id} • {p.age}y
                  </div>
                  <div className="flex items-center gap-1">
                    {!!p.visits?.length && <span className="badge blue">{p.visits.length}v</span>}
                    {lastParScore(p) != null && <span className="badge green">PAR:{lastParScore(p)}</span>}
                    {p.treatmentUrgency && (
                      <span className={cn("badge", urgColor(p.treatmentUrgency))}>{p.treatmentUrgency}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="empty">No patients match</div>
        )}
      </div>
    </div>
  );
}

/** Right-anchored drawer with a draggable left resize bar. */
function ResizableDrawer({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const start = useRef<number>(0);
  const width = useRef<number>(320);

  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!start.current || !ref.current) return;
      const dx = start.current - e.clientX;
      width.current = Math.min(500, Math.max(240, width.current + dx));
      ref.current!.style.width = `${width.current}px`;
      start.current = e.clientX;
    };
    const up = () => {
      start.current = 0;
      document.body.style.cursor = "";
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, []);

  return (
    <div
      ref={ref}
      className={cn("filter-drawer", open ? "translate-x-0" : "translate-x-full")}
      style={{ width: `${width.current}px` }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="resize-bar"
        onMouseDown={(e) => {
          start.current = e.clientX;
          document.body.style.cursor = "ew-resize";
        }}
        onDoubleClick={onClose}
        aria-label="Resize filters drawer"
      />
      {children}
    </div>
  );
}

/* ----------------- helpers (misc) -------------------------------- */

function recordFromArray(arr: readonly string[]) {
  return Object.fromEntries(arr.map((k) => [k, false])) as FacetState;
}
const activeKeys = (rec: FacetState) => Object.entries(rec).filter(([, v]) => v).map(([k]) => k);
const lc = (s: string) => s.toLowerCase();
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const escapeRx = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const urgRank = (u?: string) => (u ? URGENCY.indexOf(u as any) : -1);
const urgColor = (u: string) => (u === "high" || u === "emergency" ? "red" : u === "medium" ? "yellow" : "gray");
const deburr = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
function matchAll(haystack: string, needles: string[]) {
  const h = deburr(haystack.toLowerCase());
  return needles.every((n) => h.includes(n));
}

/**
 * Returns the PAR score from the latest visit, falling back to supplied scalars.
 *
 * @hierarchy
 * 1) `visit.parScoreAtVisit` (explicit snapshot at time of visit)
 * 2) `visit.parScore`
 * 3) Sum of `boxes[].score` for the latest visit
 * 4) `patient.currentPARScore` → `patient.parScore`
 */
function lastParScore(p: Patient): number | undefined {
  if (!p.visits || !p.visits.length) {
    return p.currentPARScore ?? p.parScore;
  }

  const visits = p.visits.filter((v): v is Visit => !!v && typeof v.date === "string");
  if (!visits.length) return p.currentPARScore ?? p.parScore;

  const latest = visits.sort((a, b) => Date.parse(b.date) - Date.parse(a.date))[0];

  if (typeof (latest as any).parScoreAtVisit === "number") return (latest as any).parScoreAtVisit;
  if (typeof latest.parScore === "number") return latest.parScore;

  if (latest && Array.isArray(latest.boxes) && latest.boxes.length) {
    return latest.boxes.reduce((s, b) => s + (b.score ?? 0), 0);
  }

  return p.currentPARScore ?? p.parScore;
}
