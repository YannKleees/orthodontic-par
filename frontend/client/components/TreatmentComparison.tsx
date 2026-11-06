/**
 * @file TreatmentComparison.tsx
 * @brief First vs Current treatment-phase comparison with PAR deltas.
 *
 * @description
 * Renders two snapshots (first/current) with PAR scores, component deltas,
 * and a compact summary. Hidden when fewer than two phases are supplied.
 */

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";

import {
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Minus,
  Calendar,
  Award,
} from "lucide-react";

interface TreatmentPhase {
  id: string;
  name: string;
  date: string;
  parScore: number;
  parComponents: {
    upperCrowding: number;
    lowerCrowding: number;
    upperSpacing: number;
    lowerSpacing: number;
    overjet: number;
    overbite: number;
    crossbite: number;
    centerline: number;
  };
  imageUrl: string;
  notes: string;
}

interface TreatmentComparisonProps {
  patientName: string;
  patientId: string;
  treatmentPhases: TreatmentPhase[];
}

export function TreatmentComparison({
  patientName,
  patientId,
  treatmentPhases,
}: TreatmentComparisonProps) {
  if (treatmentPhases.length < 2) return null;

  // Compare first vs current (last)
  const firstPhase = treatmentPhases[0];
  const currentPhase = treatmentPhases[treatmentPhases.length - 1];

  const calculateChange = (current: number, previous: number) => current - previous;

  const getChangeIcon = (change: number) => {
    if (change > 0) return <TrendingUp className="w-4 h-4 text-red-500" />;
    if (change < 0) return <TrendingDown className="w-4 h-4 text-green-500" />;
    return <Minus className="w-4 h-4 text-gray-400" />;
  };

  const getChangeColor = (change: number) => {
    if (change > 0) return "text-red-600 bg-red-50";
    if (change < 0) return "text-green-600 bg-green-50";
    return "text-gray-600 bg-gray-50";
  };

  const parComponentLabels = {
    upperCrowding: "Upper Crowding",
    lowerCrowding: "Lower Crowding",
    upperSpacing: "Upper Spacing",
    lowerSpacing: "Lower Spacing",
    overjet: "Overjet",
    overbite: "Overbite",
    crossbite: "Crossbite",
    centerline: "Centerline",
  } as const;

  return (
    <div className="w-full max-w-[1060px] mx-auto">
      <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-[24px] p-4 shadow-lg border-2 border-green-200">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-800 mb-1">Treatment Progress Analysis</h2>
            <p className="text-sm text-gray-600">{patientName} - Comparing Treatment Phases</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-600 px-3 bg-white rounded-lg border">
              First vs Current Treatment
            </span>
          </div>
        </div>

        {/* Images Comparison */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
          {/* Before */}
          <Card className="bg-white shadow-md">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm text-gray-800">{firstPhase.name}</CardTitle>
                <Badge variant="outline" className="bg-blue-100 text-blue-800 text-xs">
                  First
                </Badge>
              </div>
              <div className="flex items-center gap-1 text-xs text-gray-600">
                <Calendar className="w-3 h-3" />
                {new Date(firstPhase.date).toLocaleDateString()}
              </div>
            </CardHeader>
            <CardContent className="p-3">
              <div className="aspect-video bg-gray-100 rounded-lg mb-2 flex items-center justify-center overflow-hidden">
                <img
                  src={firstPhase.imageUrl || "/placeholder.svg"}
                  alt={`${firstPhase.name} dental images`}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">PAR Score:</span>
                  <span className="text-sm font-bold text-blue-600">{firstPhase.parScore}</span>
                </div>
                <p className="text-xs text-gray-500 line-clamp-2">{firstPhase.notes}</p>
              </div>
            </CardContent>
          </Card>

          {/* Current */}
          <Card className="bg-white shadow-md">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm text-gray-800">{currentPhase.name}</CardTitle>
                <Badge variant="outline" className="bg-green-100 text-green-800 text-xs">
                  Current
                </Badge>
              </div>
              <div className="flex items-center gap-1 text-xs text-gray-600">
                <Calendar className="w-3 h-3" />
                {new Date(currentPhase.date).toLocaleDateString()}
              </div>
            </CardHeader>
            <CardContent className="p-3">
              <div className="aspect-video bg-gray-100 rounded-lg mb-2 flex items-center justify-center overflow-hidden">
                <img
                  src={currentPhase.imageUrl || "/placeholder.svg"}
                  alt={`${currentPhase.name} dental images`}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">PAR Score:</span>
                  <span className="text-sm font-bold text-green-600">{currentPhase.parScore}</span>
                </div>
                <p className="text-xs text-gray-500 line-clamp-2">{currentPhase.notes}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* PAR Components Comparison */}
        <Card className="bg-white shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Award className="w-4 h-4 text-orange-500" />
              PAR Components Analysis
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3">
            {/* Overall Score Change */}
            <div className="bg-gray-50 rounded-lg p-3 mb-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-800">Overall Change:</span>
                <div className="flex items-center gap-2">
                  {getChangeIcon(calculateChange(currentPhase.parScore, firstPhase.parScore))}
                  <span
                    className={`font-bold text-sm px-2 py-1 rounded-full ${getChangeColor(
                      calculateChange(currentPhase.parScore, firstPhase.parScore),
                    )}`}
                  >
                    {calculateChange(currentPhase.parScore, firstPhase.parScore) > 0 ? "+" : ""}
                    {calculateChange(currentPhase.parScore, firstPhase.parScore)}
                  </span>
                </div>
              </div>
            </div>

            {/* Component Changes Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-3">
              {Object.entries(parComponentLabels).map(([key, label]) => {
                const change = calculateChange(
                  currentPhase.parComponents[key as keyof typeof currentPhase.parComponents],
                  firstPhase.parComponents[key as keyof typeof firstPhase.parComponents],
                );

                return (
                  <div key={key} className="bg-gray-50 rounded p-2 border border-gray-200">
                    <div className="text-xs font-medium text-gray-800 mb-1">{label}</div>
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-gray-600">
                        {
                          firstPhase.parComponents[key as keyof typeof firstPhase.parComponents]
                        }{" "}
                        →→{" "}
                        {
                          currentPhase.parComponents[key as keyof typeof currentPhase.parComponents]
                        }
                      </div>
                      <div className="flex items-center gap-1">
                        {getChangeIcon(change)}
                        <span className={`text-xs font-semibold px-1 py-0.5 rounded ${getChangeColor(change)}`}>
                          {change > 0 ? "+" : ""}
                          {change}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Treatment Summary */}
            <div className="p-3 bg-gradient-to-r from-blue-50 to-green-50 rounded-lg border border-blue-200">
              <h4 className="text-sm font-semibold text-gray-800 mb-2">Summary</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="font-medium">Duration:</span>{" "}
                  <span className="text-gray-600">
                    {Math.ceil(
                      (new Date(currentPhase.date).getTime() - new Date(firstPhase.date).getTime()) /
                        (1000 * 60 * 60 * 24 * 30),
                    )}{" "}
                    months
                  </span>
                </div>
                <div>
                  <span className="font-medium">Status:</span>{" "}
                  <span
                    className={
                      calculateChange(currentPhase.parScore, firstPhase.parScore) <= 0
                        ? "text-green-600 font-semibold"
                        : "text-red-600 font-semibold"
                    }
                  >
                    {calculateChange(currentPhase.parScore, firstPhase.parScore) <= 0
                      ? "Improved"
                      : "Worsened"}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
