/**
 * @file DataStructureSummary.tsx
 * @role
 *   Static, clinician-facing summary of core entities used by the system:
 *   Patient, Visit, AI-derived attributes, and workflow states.
 *
 * @semantics
 *   Pure presentational component (no side effects, no data fetching).
 *   Communicates the minimal manual inputs vs. AI/derived fields for clarity.
 *
 * @ux
 *   Card-based layout with consistent iconography to support scanning.
 */

import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import {
  User,
  Calendar,
  Camera,
  Brain,
  FileText,
  TrendingUp,
  Clock,
  AlertTriangle,
} from "lucide-react";

export function DataStructureSummary() {
  return (
    <div className="w-full max-w-6xl mx-auto p-6 space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">
          🦷 Streamlined Orthodontics Data Structure
        </h2>
        <p className="text-gray-600">Simplified workflow with AI-powered automation</p>
      </div>

      <Card className="border-blue-200">
        <CardHeader className="bg-blue-50">
          <CardTitle className="flex items-center gap-2 text-blue-800">
            <User className="w-5 h-5" />
            Patient Record (Minimal Input Required)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <h4 className="font-medium text-sm text-gray-700">Required Fields</h4>
              <div className="space-y-1 text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">Manual</Badge>
                  <span>Patient ID</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">Manual</Badge>
                  <span>Full Name</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">Manual</Badge>
                  <span>Date of Birth</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className="bg-green-100 text-green-800 text-xs">Auto</Badge>
                  <span>Age (calculated)</span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="font-medium text-sm text-gray-700">AI-Generated Data</h4>
              <div className="space-y-1 text-sm">
                <div className="flex items-center gap-2">
                  <Badge className="bg-purple-100 text-purple-800 text-xs">AI</Badge>
                  <span>Current PAR Score</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className="bg-purple-100 text-purple-800 text-xs">AI</Badge>
                  <span>Treatment Urgency</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className="bg-purple-100 text-purple-800 text-xs">AI</Badge>
                  <span>Detected Conditions</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className="bg-blue-100 text-blue-800 text-xs">Calc</Badge>
                  <span>Total Visits</span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="font-medium text-sm text-gray-700">Visit Array</h4>
              <div className="text-sm text-gray-600">
                <p>Empty initially - populated when visits are added</p>
                <p className="text-xs mt-1">Each visit contains: images, AI analysis, doctor review, generated report</p>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="font-medium text-sm text-gray-700">Status</h4>
              <div className="space-y-1 text-sm">
                <Badge className="bg-green-100 text-green-800">Active</Badge>
                <p className="text-xs text-gray-500">Status changes based on treatment completion</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-green-200">
        <CardHeader className="bg-green-50">
          <CardTitle className="flex items-center gap-2 text-green-800">
            <Calendar className="w-5 h-5" />
            Visit Record (Image-Only Input)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="space-y-3">
              <h4 className="font-medium text-sm text-gray-700 flex items-center gap-2">
                <Camera className="w-4 h-4" />
                User Input (Images Only)
              </h4>
              <div className="space-y-1 text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">Upload</Badge>
                  <span>5 Dental Images</span>
                </div>
                <p className="text-xs text-gray-500 ml-6">Anterior, Left/Right Buccal, Upper/Lower Occlusal</p>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="font-medium text-sm text-gray-700 flex items-center gap-2">
                <Brain className="w-4 h-4" />
                AI Analysis (Automatic)
              </h4>
              <div className="space-y-1 text-sm">
                <div className="flex items-center gap-2">
                  <Badge className="bg-purple-100 text-purple-800 text-xs">AI</Badge>
                  <span>PAR Score Calculation</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className="bg-purple-100 text-purple-800 text-xs">AI</Badge>
                  <span>Component Detection</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className="bg-purple-100 text-purple-800 text-xs">AI</Badge>
                  <span>Condition Identification</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className="bg-orange-100 text-orange-800 text-xs">Calc</Badge>
                  <span>Treatment Urgency</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className="bg-blue-100 text-blue-800 text-xs">Gen</Badge>
                  <span>Image Mosaic</span>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="font-medium text-sm text-gray-700 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Generated Outputs
              </h4>
              <div className="space-y-1 text-sm">
                <div className="flex items-center gap-2">
                  <Badge className="bg-green-100 text-green-800 text-xs">Auto</Badge>
                  <span>Visit Report</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className="bg-yellow-100 text-yellow-800 text-xs">Pending</Badge>
                  <span>Doctor Review</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className="bg-blue-100 text-blue-800 text-xs">Track</Badge>
                  <span>Progress Comparison</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-purple-200">
        <CardHeader className="bg-purple-50">
          <CardTitle className="flex items-center gap-2 text-purple-800">
            <TrendingUp className="w-5 h-5" />
            Simplified Workflow
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-3">
              <h4 className="font-medium text-sm text-gray-700 flex items-center gap-2">
                <User className="w-4 h-4" />
                Step 1: Create Patient
              </h4>
              <div className="space-y-2 text-sm text-gray-600">
                <p>✓ Enter name and date of birth</p>
                <p>✓ Patient ID auto-generated</p>
                <p>✓ Age calculated automatically</p>
                <p>✓ Ready for visits</p>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="font-medium text-sm text-gray-700 flex items-center gap-2">
                <Camera className="w-4 h-4" />
                Step 2: Add Visit
              </h4>
              <div className="space-y-2 text-sm text-gray-600">
                <p>✓ Upload dental images only</p>
                <p>✓ AI processes images automatically</p>
                <p>✓ PAR scores calculated</p>
                <p>✓ Report generated instantly</p>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="font-medium text-sm text-gray-700 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Step 3: Review & Track
              </h4>
              <div className="space-y-2 text-sm text-gray-600">
                <p>✓ Doctor reviews AI analysis</p>
                <p>✓ Progress tracked automatically</p>
                <p>✓ Reports available instantly</p>
                <p>✓ Treatment urgency updated</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-orange-200">
        <CardHeader className="bg-orange-50">
          <CardTitle className="flex items-center gap-2 text-orange-800">
            <AlertTriangle className="w-5 h-5" />
            Key Benefits
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <Clock className="w-6 h-6 text-green-600" />
              </div>
              <h4 className="font-medium text-sm">90% Time Savings</h4>
              <p className="text-xs text-gray-600">Minimal manual data entry required</p>
            </div>
            <div className="text-center space-y-2">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto">
                <Brain className="w-6 h-6 text-blue-600" />
              </div>
              <h4 className="font-medium text-sm">AI-Powered</h4>
              <p className="text-xs text-gray-600">Automatic PAR calculation and analysis</p>
            </div>
            <div className="text-center space-y-2">
              <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto">
                <TrendingUp className="w-6 h-6 text-purple-600" />
              </div>
              <h4 className="font-medium text-sm">Progress Tracking</h4>
              <p className="text-xs text-gray-600">Automatic comparison across visits</p>
            </div>
            <div className="text-center space-y-2">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <h4 className="font-medium text-sm">Smart Urgency</h4>
              <p className="text-xs text-gray-600">Treatment priority calculated from PAR scores</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
