/**
 * @file NotesEditor.tsx
 * @brief Minimal clinician notes editor that persists a visit's
 *        doctorReview.doctorNotes via PATCH to the API.
 *
 * @design
 * - Local state mirrors the textarea, debounced only by user interaction.
 * - Save writes a structured doctorReview payload (status, author, timestamp).
 * - Parent may subscribe to onSaved for optimistic UI or cache invalidation.
 */

import { useState } from "react";
import { apiClient } from "@/lib/api";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";

interface Props {
  patientId : string;
  visitId   : string;
  initial   : string | undefined;
  onSaved  ?: (txt: string) => void;
}

/**
 * NotesEditor
 * @param patientId Target patient identifier.
 * @param visitId   Target visit identifier.
 * @param initial   Preloaded note text (optional).
 * @param onSaved   Callback invoked after a successful save with the text.
 */
export function NotesEditor({ patientId, visitId, initial = "", onSaved }: Props) {
  const [txt, setTxt]   = useState(initial);
  const [busy, setBusy] = useState(false);

  /**
   * Persist the current note to doctorReview and mark the visit as reviewed.
   * Uses an ISO-8601 timestamp and a placeholder reviewer that upstream code
   * may overwrite based on authentication context.
   */
  async function save() {
    try {
      setBusy(true);
      await apiClient.updateVisit(patientId, visitId, {
        doctorReview: {
          status      : "reviewed",
          doctorNotes : txt,
          reviewedBy  : "Dr ×",
          reviewDate  : new Date().toISOString()
        }
      });
      onSaved?.(txt);
    } catch (e) {
      alert("Saving notes failed – see console");
      console.error(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <Textarea
        rows={5}
        value={txt}
        placeholder="Write clinical notes…"
        onChange={e => setTxt(e.target.value)}
      />
      <Button onClick={save} disabled={busy || txt.trim() === ""}>
        {busy ? "Saving…" : "Save notes"}
      </Button>
    </div>
  );
}
