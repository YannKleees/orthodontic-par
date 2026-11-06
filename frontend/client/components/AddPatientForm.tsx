import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { User, X } from "lucide-react";
import "./AddPatientForm.css";

/**
 * @file AddPatientForm.tsx
 * @description
 * Patient-creation form used to register a new record prior to PAR analysis.
 * The minimum demographic data required for downstream clinical workflows is:
 * full name and date of birth (DOB). DOB is used to derive age, which can
 * influence malocclusion severity distributions and treatment planning norms.
 *
 * UX notes:
 * - Floating labels reduce vertical space while maintaining explicit labeling.
 * - A computed age preview reinforces correct DOB entry before submission.
 *
 * Data flow:
 * - onSave(name, dateOfBirth) is invoked immediately on submit; the parent
 *   component is responsible for persistence (API) and navigation.
 * - onCancel() returns control to the parent without side effects.
 */

interface AddPatientFormProps {
  onSave: (patient: { name: string; dateOfBirth: string }) => void;
  onCancel: () => void;
}

/**
 * FloatingInput
 * @description
 * Accessible floating-label input with optional format hint rendered in the label.
 * Designed for deterministic forms where the label must remain visible while typing.
 *
 * @param id        Unique control id; also used by the label's htmlFor.
 * @param label     Visible label text.
 * @param type      HTML input type (default: "text").
 * @param value     Controlled value.
 * @param required  Whether the field is mandatory for submission.
 * @param onChange  Emits the next string value only (no event object).
 * @param max       Optional max attribute (e.g., for type="date" upper bound).
 * @param formatHint Optional hint such as "YYYY-MM-DD"; rendered inline with label.
 */
function FloatingInput(props: {
  id: string;
  label: string;
  type?: string;
  value: string;
  required?: boolean;
  onChange: (v: string) => void;
  max?: string;
  formatHint?: string;
}) {
  const {
    id,
    label,
    type = "text",
    value,
    required,
    onChange,
    max,
    formatHint,
  } = props;

  return (
    <div className="form-control">
      <input
        id={id}
        type={type}
        value={value}
        required={required}
        onChange={e => onChange(e.target.value)}
        {...(max ? { max } : {})}
      />
      <label htmlFor={id}>
        {label.split("").map((ch, i) => (
          <span key={i} className="char" style={{ transitionDelay: `${i * 50}ms` }}>
            {ch}
          </span>
        ))}
        {formatHint && <span className="hint">({formatHint})</span>}
      </label>
    </div>
  );
}

/**
 * AddPatientForm
 * @description
 * Minimal patient registration form. Validates presence of name and DOB,
 * shows a derived age label, and forwards values to the parent via onSave.
 *
 * Clinical context:
 * - Age is a relevant covariate in orthodontic assessment; surfacing it
 *   at entry helps prevent data entry errors (e.g., incorrect year).
 *
 * Accessibility:
 * - Close button exposes aria-label and uses an icon with discernible text.
 */
export function AddPatientForm({ onSave, onCancel }: AddPatientFormProps) {
  const [formData, setFormData] = useState({
    name: "",
    dateOfBirth: "",
    ageLabel: "",
  });
  const [submitting, setSubmitting] = useState(false);

  /**
   * calcAge
   * @description
   * Computes whole-year age based on DOB and today's date.
   * Used only for real-time feedback; the canonical age should be
   * recomputed server-side for auditability if needed.
   *
   * @param dob ISO date string ("YYYY-MM-DD")
   * @returns localized age label, e.g., "12 years" or "" if dob is empty
   */
  const calcAge = (dob: string) => {
    if (!dob) return "";
    const today = new Date();
    const birth = new Date(dob);
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return `${age} years`;
  };

  /**
   * handleSubmit
   * @description
   * Client-side presence validation; delegates persistence to parent via onSave.
   * Leaves optimistic navigation/notifications to the caller for consistency
   * with the rest of the app.
   */
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.dateOfBirth) {
      alert("Please fill name and DOB");
      return;
    }

    setSubmitting(true);
    onSave({ name: formData.name, dateOfBirth: formData.dateOfBirth });
  };

  return (
    <div className="w-full max-w-2xl mx-auto p-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-xl">
              <User className="w-5 h-5" /> Add New Patient
            </CardTitle>
            <button
              onClick={onCancel}
              className="p-1 rounded hover:bg-gray-100 transition"
              aria-label="Close form"
              type="button"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit}>
            <FloatingInput
              id="name"
              label="Full Name*"
              required
              value={formData.name}
              onChange={v => setFormData(f => ({ ...f, name: v }))}
            />

            <FloatingInput
              id="dob"
              label="Date of Birth*"
              type="date"
              required
              max={new Date().toISOString().split("T")[0]}
              formatHint=""
              value={formData.dateOfBirth}
              onChange={v =>
                setFormData(f => ({
                  ...f,
                  dateOfBirth: v,
                  ageLabel: calcAge(v),
                }))
              }
            />

            {formData.ageLabel && (
              <p className="text-sm font-medium text-gray-500 -mt-3 mb-6">
                Age: {formData.ageLabel}
              </p>
            )}

            <div className="flex gap-4">
              <button
                type="submit"
                className="button flex-1"
                style={{ "--clr": "#7cbcf8ff" } as React.CSSProperties}
                disabled={submitting}
              >
                <span className="button-decor" />
                <div className="button-content">
                  <div className="button__icon">
                    <User className="w-100 h-100" />
                  </div>
                  <span className="button__text">
                    {submitting ? "Creating..." : "Create Patient"}
                  </span>
                </div>
              </button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
