/* ------------------------------------------------------------------
   hooks/usePARComponentsContext.tsx
   ------------------------------------------------------------------
   Objective:
   - Provide a scoped state container for PAR components within a visit,
     including CRUD operations, debounced persistence, and derived totals.
   - Emits a window-level custom event when the weighted PAR total changes
     to inform external listeners (dashboards/sidebars) without tight coupling.
------------------------------------------------------------------- */
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useCallback,
  useState,
  ReactNode,
} from "react";
import { apiClient } from "@/lib/api";
import type { PARComponent } from "@/hooks/types";

/* -------------------- Richmond Index weights ----------------------
   Component-specific multipliers per Richmond scoring convention.
   The total PAR = Σ (component score × weight). Defaults defensively
   to 1 for unlisted components to avoid NaN propagation.
------------------------------------------------------------------- */
const WEIGHTS: Record<string, number> = {
  "Upper Crowding": 1,
  "Lower Crowding": 1,
  "Upper Spacing" : 1,
  "Lower Spacing" : 1,
  Overjet         : 6,
  Centerline      : 4,
  Overbite        : 2,
  Crossbite       : 1,
};

/* -------------------- Debounce utility (trailing) -----------------
   Purpose:
   - Coalesce bursts of updates per key to reduce write-amplification
     to the backend. Prevents excessive network traffic during drag/
     resize interactions in the PAR editor.
------------------------------------------------------------------- */
function useDebounced() {
  const timers = useRef<Record<string, any>>({});
  return (key: string, fn: () => void, ms = 250) => {
    clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(fn, ms);
  };
}

/* -------------------- Context contract ----------------------------
   - components: live snapshot of in-visit PAR annotations
   - update/create/delete: optimistic local changes + debounced I/O
   - getComponentsByView: stratify components by image viewId
------------------------------------------------------------------- */
interface Ctx {
  components: PARComponent[];
  loading: boolean;
  error: string | null;
  updateComponent(id: string, patch: Partial<PARComponent>): void;
  createComponent(comp: Omit<PARComponent, "id">): Promise<PARComponent>;
  deleteComponent(id: string): Promise<void>;
  getComponentsByView(viewId: string): PARComponent[];
}
const C = createContext<Ctx | undefined>(undefined);

export function PARComponentsProvider({
  patientId,
  visitId,
  children,
}: {
  patientId: string;
  visitId: string;
  children: ReactNode;
}) {
  /* -------------------- Local state ---------------------------------------
     Invariants:
     - components is the single source of truth for UI; server is reconciled
       asynchronously with error-based recovery (refetch on failure).
  ------------------------------------------------------------------------- */
  const [components, setComponents] = useState<PARComponent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* -------------------- Fetch cycle ---------------------------------------
     Resets list if visitId is absent; otherwise hydrates from API with
     guarded error handling.
  ------------------------------------------------------------------------- */
  const fetchComponents = useCallback(async () => {
    if (!visitId) {
      setComponents([]); setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const { data } = await apiClient.getPARComponent(patientId, visitId);
      setComponents(data);
      setError(null);
    } catch (e: any) {
      setError(e.message ?? "Unable to load PAR components");
    } finally {
      setLoading(false);
    }
  }, [patientId, visitId]);

  useEffect(() => { fetchComponents(); }, [fetchComponents]);

  /* -------------------- Weighted total persistence ------------------------
     Mechanism:
     - Recompute weighted PAR on any local state change.
     - Debounced PUT to /visit to persist the aggregate.
     - Broadcast a CustomEvent 'par-score-updated' for external observers.
  ------------------------------------------------------------------------- */
  const debounced = useDebounced();
  const persistTotal = useCallback(
    (list: PARComponent[]) => {
      const total = list.reduce(
        (sum, c) => sum + (WEIGHTS[c.component] ?? 1) * c.score,
        0,
      );
      debounced("__total__", () =>
        apiClient
          .updateVisit(patientId, visitId, { parScore: total } as any)
          .then(() => {
            // Out-of-band notification for decoupled consumers
            window.dispatchEvent(
              new CustomEvent("par-score-updated", {
                detail: { patientId, visitId, parScore: total },
              }),
            );
          })
          .catch(() => { /* degrade silently; UI retains optimistic state */ }),
      );
    },
    [patientId, visitId, debounced],
  );

  /* -------------------- Update (optimistic + debounced PUT) --------------- */
  const updateComponent = useCallback(
    (id: string, patch: Partial<PARComponent>) => {
      setComponents(prev => {
        const next = prev.map(c => (c.id === id ? { ...c, ...patch } : c));
        persistTotal(next);
        return next;
      });

      // Debounce per-component network writes to reduce chatter
      debounced(id, () => {
        apiClient
          .updatePARComponent(patientId, visitId, id, {
            ...patch,
            modifiedBy: "frontend",
          })
          .catch(fetchComponents); // rollback to server state on failure
      });
    },
    [patientId, visitId, debounced, fetchComponents, persistTotal],
  );

  /* -------------------- Create (append + total recompute) ----------------- */
  const createComponent = async (
    comp: Omit<PARComponent, "id">,
  ): Promise<PARComponent> => {
    const { data: created } = await apiClient.createPARComponent(
      patientId,
      visitId,
      { ...comp, modifiedBy: "frontend" },
    );

    setComponents(prev => {
      const next = [...prev, created];
      persistTotal(next);
      return next;
    });
    return created;
  };

  /* -------------------- Delete (filter + best-effort sync) ---------------- */
  const deleteComponent = async (id: string) => {
    setComponents(prev => {
      const next = prev.filter(c => c.id !== id);
      persistTotal(next);
      return next;
    });
    try {
      await apiClient.deletePARComponent(patientId, visitId, id);
    } catch {
      fetchComponents(); // reconcile on error
    }
  };

  /* -------------------- Query helper ------------------------------------- */
  const getComponentsByView = (viewId: string) =>
    components.filter(c => c.viewId === viewId);

  return (
    <C.Provider
      value={{
        components,
        loading,
        error,
        updateComponent,
        createComponent,
        deleteComponent,
        getComponentsByView,
      }}
    >
      {children}
    </C.Provider>
  );
}

export function usePARComponentsContext(
  _patientId?: string,
  _visitId?: string,
) {
  const ctx = useContext(C);
  if (!ctx)
    throw new Error(
      "usePARComponentsContext must be used inside PARComponentsProvider",
    );
  return ctx;
}
