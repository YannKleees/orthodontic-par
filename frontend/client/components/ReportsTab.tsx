/**
 * @file ReportsTab.tsx
 * @brief Read-only listing and quick actions for patient reports.
 *
 * @description
 * Displays a curated set of clinical report cards (e.g., imaging, lab,
 * consultation). Each card shows type, status, author, date, and a concise
 * synopsis suitable for clinical review. Action buttons are stubs that can be
 * wired to view/download flows or report generation.
 */

import { FileText, Download, Eye, Calendar, User, Plus } from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

/**
 * Props for the reports tab.
 */
interface ReportsTabProps {
  /** Patient display name for context headers. */
  patientName: string;
  /** Patient identifier used when wiring real data sources. */
  patientId: string;
}

/**
 * Canonical report structure for dental/orthodontic workflows.
 *
 * @remarks
 * - `type` denotes clinical modality; use to color-code or filter.
 * - `status` distinguishes preliminary vs signed-off results.
 */
interface Report {
  id: string;
  title: string;
  type: "lab" | "imaging" | "consultation" | "discharge";
  date: string;
  doctor: string;
  status: "final" | "preliminary" | "pending";
  summary: string;
}

/**
 * ReportsTab
 *
 * @param patientName Render context for headings.
 * @param patientId   Reserved for future data fetching integration.
 *
 * @remarks
 * - Placeholder dataset is used; swap with API data when backend is available.
 * - Cards are keyboard-accessible; actions expose predictable labels.
 * - Color treatment communicates modality and report status at a glance.
 */
export function ReportsTab({ patientName, patientId }: ReportsTabProps) {
  const reports: Report[] = [
    {
      id: "1",
      title: "Intraoral Imaging Analysis",
      type: "imaging",
      date: "2024-01-15",
      doctor: "Dr. Sarah Johnson, DDS",
      status: "final",
      summary:
        "AI analysis detected 2 caries on teeth 36 and 11. Moderate periodontal involvement on tooth 46. Treatment plan: composite fillings and scaling.",
    },
    {
      id: "2",
      title: "Periodontal Assessment",
      type: "lab",
      date: "2024-01-14",
      doctor: "Dr. Michael Chen, DDS",
      status: "final",
      summary:
        "Comprehensive periodontal charting completed. Average pocket depth 3.2mm. Localized 5-6mm pockets on posterior teeth requiring SRP.",
    },
    {
      id: "3",
      title: "Treatment Consultation",
      type: "consultation",
      date: "2024-01-13",
      doctor: "Dr. Sarah Johnson, DDS",
      status: "final",
      summary:
        "Patient discussed treatment options for caries management. Preventive protocol established. Follow-up in 3 months for re-evaluation.",
    },
    {
      id: "4",
      title: "Panoramic Radiograph",
      type: "imaging",
      date: "2024-01-12",
      doctor: "Dr. Robert Wilson, DDS",
      status: "preliminary",
      summary:
        "Panoramic x-ray shows third molar impaction on lower left. No pathology detected. Extraction consultation recommended.",
    },
  ];

  /** Visual classes for report modality semantics. */
  const typeColors: Record<Report["type"], string> = {
    lab: "bg-blue-100 text-blue-800",
    imaging: "bg-purple-100 text-purple-800",
    consultation: "bg-green-100 text-green-800",
    discharge: "bg-orange-100 text-orange-800",
  };

  /** Visual classes for report verification state. */
  const statusColors: Record<Report["status"], string> = {
    final: "bg-green-100 text-green-800",
    preliminary: "bg-yellow-100 text-yellow-800",
    pending: "bg-gray-100 text-gray-800",
  };

  /**
   * Placeholder action for generating a new report.
   * Replace with navigation or mutation that triggers report creation.
   */
  const handleGenerateReport = () => {
    alert("Generate new report functionality would be implemented here");
  };

  /**
   * Placeholder action for opening a report detail view.
   * @param reportId Target report identifier.
   */
  const handleViewReport = (reportId: string) => {
    alert(`View report ${reportId} functionality would be implemented here`);
  };

  /**
   * Placeholder action for downloading a report artifact.
   * @param reportId Target report identifier.
   */
  const handleDownloadReport = (reportId: string) => {
    alert(`Download report ${reportId} functionality would be implemented here`);
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold text-on-surface">
            Reports - {patientName}
          </h2>
          <p className="text-on-surface-variant">Medical reports and test results</p>
        </div>
        <Button onClick={handleGenerateReport} className="gap-2" aria-label="Generate report">
          <Plus className="w-4 h-4" />
          Generate Report
        </Button>
      </div>

      <div className="space-y-4">
        {reports.map((report) => (
          <Card key={report.id} className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{report.title}</CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={typeColors[report.type]}>
                    {report.type.charAt(0).toUpperCase() + report.type.slice(1)}
                  </Badge>
                  <Badge variant="outline" className={statusColors[report.status]}>
                    {report.status.charAt(0).toUpperCase() + report.status.slice(1)}
                  </Badge>
                </div>
              </div>
            </CardHeader>

            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="w-4 h-4 text-on-surface-variant" aria-hidden />
                  <span className="font-medium">Date:</span>
                  <span>{new Date(report.date).toLocaleDateString()}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <User className="w-4 h-4 text-on-surface-variant" aria-hidden />
                  <span className="font-medium">Doctor:</span>
                  <span>{report.doctor}</span>
                </div>
              </div>

              <div className="bg-gray-50 p-3 rounded-lg mb-4">
                <div className="flex items-start gap-2">
                  <FileText className="w-4 h-4 text-on-surface-variant mt-0.5" aria-hidden />
                  <div>
                    <span className="font-medium text-sm">Summary:</span>
                    <p className="text-sm text-on-surface-variant mt-1">{report.summary}</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleViewReport(report.id)}
                  aria-label={`View report ${report.title}`}
                >
                  <Eye className="w-4 h-4 mr-1" />
                  View
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDownloadReport(report.id)}
                  aria-label={`Download report ${report.title}`}
                >
                  <Download className="w-4 h-4 mr-1" />
                  Download
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
