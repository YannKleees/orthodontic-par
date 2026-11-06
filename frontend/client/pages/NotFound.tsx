/** ============================================================================
 * pages/NotFound.tsx — 404 boundary (routing guard)
 * =============================================================================
 * PURPOSE
 *  - Terminal UI for unmatched client-side routes; logs path for observability.
 * RATIONALE
 *  - In SPAs, broken deep links or stale bookmarks surface as unmatched paths.
 *    Emitting a structured console error supports QA and analytics triage.
 * UX
 *  - Presents a neutral 404 with a deterministic return-to-home affordance.
 * ============================================================================ */
import { useLocation } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname,
    );
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">404</h1>
        <p className="text-xl text-gray-600 mb-4">Oops! Page not found</p>
        <a href="/" className="text-blue-500 hover:text-blue-700 underline">
          Return to Home
        </a>
      </div>
    </div>
  );
};

export default NotFound;
