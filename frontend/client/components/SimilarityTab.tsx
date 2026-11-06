/**
 * @file SimilarityTab.tsx
 * @brief Summary cards and list of similar patients for quick comparison.
 *
 * @note Uses static sample data; wire to API when available.
 */

import { Users, TrendingUp, Eye, Calendar, Activity } from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Progress } from "./ui/progress";

interface SimilarityTabProps {
  patientName: string;
  patientId: string;
}

interface SimilarPatient {
  id: string;
  name: string;
  age: number;
  condition: string;
  similarity: number;
  treatment: string;
  outcome: "excellent" | "good" | "fair" | "poor";
  lastVisit: string;
  notes: string;
  initialParScore?: number | string;
  finalParScore?: number | string;
}

export function SimilarityTab({ patientName, patientId }: SimilarityTabProps) {
  /** Demo data; replace with API-fed list. */
  const similarPatients: SimilarPatient[] = [
    {
      id: "1",
      name: "Maria Garcia",
      age: 47,
      condition: "Hypertension",
      similarity: 94,
      treatment: "ACE Inhibitors + Lifestyle changes",
      outcome: "excellent",
      lastVisit: "2024-01-10",
      notes:
        "Similar age and condition. Responded very well to ACE inhibitor therapy combined with dietary changes.",
    },
    {
      id: "2",
      name: "Robert Chen",
      age: 43,
      condition: "Hypertension",
      similarity: 89,
      treatment: "Beta Blockers + Exercise program",
      outcome: "good",
      lastVisit: "2024-01-08",
      notes:
        "Slightly younger but same condition severity. Good response to beta blocker treatment.",
    },
    {
      id: "3",
      name: "Jennifer Wilson",
      age: 51,
      condition: "Hypertension + Diabetes",
      similarity: 82,
      treatment: "Combination therapy",
      outcome: "good",
      lastVisit: "2024-01-12",
      notes:
        "Additional diabetes complication but managed well with combination approach.",
    },
    {
      id: "4",
      name: "David Thompson",
      age: 49,
      condition: "Hypertension",
      similarity: 78,
      treatment: "Diuretics + Monitoring",
      outcome: "fair",
      lastVisit: "2024-01-09",
      notes:
        "Required multiple medication adjustments. Currently stable on diuretic therapy.",
    },
  ];

  const outcomeColors = {
    excellent: "bg-green-100 text-green-800",
    good: "bg-blue-100 text-blue-800",
    fair: "bg-yellow-100 text-yellow-800",
    poor: "bg-red-100 text-red-800",
  } as const;

  const getSimilarityColor = (similarity: number) => {
    if (similarity >= 90) return "text-green-600";
    if (similarity >= 80) return "text-blue-600";
    if (similarity >= 70) return "text-yellow-600";
    return "text-red-600";
  };

  const handleViewPatient = (id: string) => {
    alert(`View patient ${id} details functionality would be implemented here`);
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-on-surface mb-2">
          Similar Patients - {patientName}
        </h2>
        <p className="text-on-surface-variant">
          Patients with similar conditions and characteristics for treatment comparison
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Users className="w-8 h-8 text-blue-600" />
              <div>
                <p className="text-2xl font-semibold">{similarPatients.length}</p>
                <p className="text-sm text-on-surface-variant">Similar Cases Found</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <TrendingUp className="w-8 h-8 text-green-600" />
              <div>
                <p className="text-2xl font-semibold">
                  {Math.round(
                    similarPatients.reduce((acc, p) => acc + p.similarity, 0) /
                      similarPatients.length,
                  )}
                  %
                </p>
                <p className="text-sm text-on-surface-variant">Avg Similarity</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Activity className="w-8 h-8 text-purple-600" />
              <div>
                <p className="text-2xl font-semibold">
                  {
                    similarPatients.filter(
                      (p) => p.outcome === "excellent" || p.outcome === "good",
                    ).length
                  }
                  /{similarPatients.length}
                </p>
                <p className="text-sm text-on-surface-variant">Positive Outcomes</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Similar Patients List */}
      <div className="space-y-4">
        {similarPatients.map((patient) => (
          <Card key={patient.id} className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{patient.name}</CardTitle>
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={outcomeColors[patient.outcome]}
                  >
                    {patient.outcome.charAt(0).toUpperCase() +
                      patient.outcome.slice(1)}{" "}
                    Outcome
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div className="space-y-2">
                  <div className="text-sm">
                    <span className="font-medium">Age:</span> {patient.age}{" "}
                    years
                  </div>
                  <div className="text-sm">
                    <span className="font-medium">Condition:</span>{" "}
                    {patient.condition}
                  </div>
                  <div className="text-sm">
                    <span className="font-medium">Treatment:</span>{" "}
                    {patient.treatment}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-sm">
                    <span className="font-medium">Last Visit:</span>{" "}
                    {new Date(patient.lastVisit).toLocaleDateString()}
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">Similarity:</span>
                      <span className={`font-semibold ${getSimilarityColor(patient.similarity)}`}>
                        {patient.similarity}%
                      </span>
                    </div>
                    <Progress value={patient.similarity} className="h-2" />
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 p-3 rounded-lg mb-4">
                <p className="text-sm text-on-surface-variant">{patient.notes}</p>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => handleViewPatient(patient.id)}
                aria-label={`View details for ${patient.name}`}
              >
                <Eye className="w-4 h-4 mr-1" />
                View Details
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
