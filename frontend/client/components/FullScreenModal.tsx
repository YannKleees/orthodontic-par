/**
 * @file FullScreenModal.tsx
 * @purpose
 *   Generic full-screen overlay modal with a centered content container,
 *   title, close button, and arbitrary child content.
 *
 * @interaction
 *   - Blocks background scroll.
 *   - Clicking the close button invokes `onClose`.
 *
 * @accessibility
 *   - `onClose` should be wired to Escape key handling in parent for full a11y.
 *   - Provide descriptive `title` for screen readers.
 */

import { X } from "lucide-react";

export default function FullScreenModal({
  title,
  children,
  onClose,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <div className="relative bg-white max-h-[95vh] w-full max-w-6xl shadow-2xl overflow-y-auto rounded-lg">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-500 hover:text-black"
        >
          <X className="w-6 h-6" />
        </button>
        <div className="p-6 pt-12">
          <h2 className="text-xl font-semibold mb-4">{title}</h2>
          {children}
        </div>
      </div>
    </div>
  );
}
