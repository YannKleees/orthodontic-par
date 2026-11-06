/**
 * @file SimilarPatientList.tsx
 * @brief Presentational list of K most-similar patients for a given patientId.
 *
 * @description
 * Fetches via `useSimilarPatients(patientId, k)` and renders a simple list
 * with loading and empty states. Selection is delegated to `onSelect`.
 */

import { useSimilarPatients } from "@/hooks/useApi";
import { Loader2, Users } from "lucide-react";

export function SimilarPatientList({
  patientId,
  k = 10,
  onSelect,
}: {
  patientId: string;
  k?: number;
  onSelect: (id: string, name: string) => void;
}) {
  const { data, loading } = useSimilarPatients(patientId, k);

  if (loading) {
    return (
      <div className="flex justify-center py-6" role="status" aria-live="polite">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }
  if (!data?.length) {
    return (
      <div className="text-sm text-gray-500 py-6 flex flex-col items-center">
        <Users className="w-6 h-6 mb-1" />
        No similar patients found
      </div>
    );
  }

  return (
    <ul className="space-y-1">
      {data.map((p) => {
        const pct = Math.round(p.similarity);
        return (
          <li key={p.id}>
            <button
              onClick={() => onSelect(p.id, p.name)}
              className="block w-full text-left rounded-lg p-2 hover:bg-blue-50 transition"
              aria-label={`Open ${p.name}, ${pct}% match`}
            >
              <div className="font-medium truncate">{p.name}</div>
              <div className="text-[11px] text-gray-500">{pct}% match&nbsp;</div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
