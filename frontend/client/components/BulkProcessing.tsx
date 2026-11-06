import { useState, useRef } from "react";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { Progress } from "./ui/progress";
import {
  Upload,
  Brain,
  AlertTriangle,
  CheckCircle,
  Eye,
  TrendingDown,
  TrendingUp,
  Filter,
  Download,
  RefreshCw,
} from "lucide-react";
import { cn } from "../lib/utils";

/**
 * @file BulkProcessing.tsx
 * @description
 * Batch UI for processing multiple intra-oral image sets (5 views per patient)
 * and triaging results by model uncertainty. Designed for "uncertainty-guided
 * exploration": cases with higher predictive uncertainty surface first for human
 * review, reducing expected error by allocating expert time where the model is
 * least confident.
 *
 * Notes (prototype):
 * - This component simulates analysis (no back-end call) via `simulateAIProcessing`.
 * - Uncertainty is inversely related to confidence with injected noise to mimic
 *   epistemic variability; replace with calibrated estimates in production.
 */

interface ProcessedMosaic {
  id: string;
  patientName: string;
  images: File[];
  results: {
    parScore: number;
    confidence: number;            // 0–100: model confidence proxy
    uncertainty: number;           // 0–100: higher means less certain
    detectedComponents: {
      component: string;
      score: number;
      confidence: number;
      boundingBox: { x: number; y: number; width: number; height: number };
    }[];
    processingTime: string;
    flaggedForReview: boolean;
  };
  status: "processing" | "completed" | "reviewed" | "flagged";
}

interface BulkProcessingProps {
  onClose: () => void;
}

/**
 * BulkProcessing
 * @description
 * End-to-end batch flow:
 * 1) User selects an arbitrary set of images (accepts all image/* types).
 * 2) Images are partitioned into 5-file groups (upper/lower occlusal, left/right
 *    buccal, frontal). Only complete groups are admitted as mosaics.
 * 3) Each mosaic is "analyzed" (simulated) to produce PAR proxy, confidence,
 *    uncertainty, and detected component summaries.
 * 4) Results can be filtered (flagged/reviewed) and sorted (uncertainty,
 *    confidence, PAR). Threshold adjusts which items are flagged.
 *
 * Replace points of simulation with API calls to your back-end:
 * - Upload: POST multipart to a bulk endpoint.
 * - Analysis: POST to trigger model inference; stream progress if available.
 * - Export: wire `Export Results` to generate CSV/PDF with server-side rendering.
 */
export function BulkProcessing({ onClose }: BulkProcessingProps) {
  const [uploadedMosaics, setUploadedMosaics] = useState<File[][]>([]);
  const [processedMosaics, setProcessedMosaics] = useState<ProcessedMosaic[]>([]);
  const [isProcessing, setBatchProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [uncertaintyThreshold, setUncertaintyThreshold] = useState(30);
  const [sortBy, setSortBy] = useState<"uncertainty" | "confidence" | "parScore">("uncertainty");
  const [filterBy, setFilterBy] = useState<"all" | "flagged" | "reviewed">("all");
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * handleBulkUpload
   * @description
   * Accepts a flat list of images and partitions into contiguous 5-image groups.
   * Assumes the user selected files already grouped per-patient; enforces the
   * five-view completeness constraint to avoid ill-posed mosaics.
   */
  const handleBulkUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const imageFiles = files.filter((file) => file.type.startsWith("image/"));

    const mosaicGroups: File[][] = [];
    for (let i = 0; i < imageFiles.length; i += 5) {
      const group = imageFiles.slice(i, i + 5);
      if (group.length === 5) mosaicGroups.push(group);
    }
    setUploadedMosaics(mosaicGroups);
  };

  /**
   * simulateAIProcessing
   * @description
   * Prototype-only stub that synthesizes plausible outputs (PAR score, confidence,
   * uncertainty, component list) for each mosaic on a timer. Use as a drop-in
   * scaffold for wiring real back-end inference and progress updates.
   *
   * Scientific intent:
   * - Uncertainty ~ inverse(confidence) + noise: encourages prioritization of
   *   low-confidence cases; in production, prefer calibrated uncertainty (e.g.,
   *   ensembles, MC-dropout, temperature scaling).
   */
  const simulateAIProcessing = () => {
    setBatchProcessing(true);
    setProcessingProgress(0);

    const totalMosaics = uploadedMosaics.length;
    let processed = 0;

    const processInterval = setInterval(() => {
      if (processed < totalMosaics) {
        const mosaic = uploadedMosaics[processed];
        const confidence = 60 + Math.random() * 35;
        const uncertainty = 100 - confidence + (Math.random() * 20 - 10);
        const parScore = Math.floor(Math.random() * 30) + 5;

        const processedMosaic: ProcessedMosaic = {
          id: `bulk-${Date.now()}-${processed}`,
          patientName: `Patient ${processed + 1}`,
          images: mosaic,
          results: {
            parScore,
            confidence: Math.round(confidence),
            uncertainty: Math.max(0, Math.min(100, Math.round(uncertainty))),
            detectedComponents: [
              {
                component: "Upper Crowding",
                score: Math.floor(Math.random() * 5),
                confidence: Math.round(confidence + Math.random() * 10 - 5),
                boundingBox: {
                  x: 100 + Math.random() * 100,
                  y: 80 + Math.random() * 50,
                  width: 80,
                  height: 60,
                },
              },
              {
                component: "Overjet",
                score: Math.floor(Math.random() * 9),
                confidence: Math.round(confidence + Math.random() * 10 - 5),
                boundingBox: {
                  x: 200 + Math.random() * 100,
                  y: 120 + Math.random() * 50,
                  width: 90,
                  height: 70,
                },
              },
            ],
            processingTime: `${(Math.random() * 2 + 1).toFixed(1)}s`,
            flaggedForReview: uncertainty > uncertaintyThreshold,
          },
          status: uncertainty > uncertaintyThreshold ? "flagged" : "completed",
        };

        setProcessedMosaics((prev) => [...prev, processedMosaic]);
        processed++;
        setProcessingProgress((processed / totalMosaics) * 100);
      } else {
        clearInterval(processInterval);
        setBatchProcessing(false);
      }
    }, 2000);
  };

  /**
   * getSortedAndFilteredMosaics
   * @description
   * Applies filter (all/flagged/reviewed) then sorts by the chosen criterion:
   * - uncertainty (desc): prioritize items needing review,
   * - confidence (asc): surface low-confidence results first,
   * - parScore (desc): triage higher-severity (if clinic prefers score-first).
   */
  const getSortedAndFilteredMosaics = () => {
    let filtered = processedMosaics;
    if (filterBy === "flagged") {
      filtered = filtered.filter((m) => m.results.flaggedForReview);
    } else if (filterBy === "reviewed") {
      filtered = filtered.filter((m) => m.status === "reviewed");
    }
    return filtered.sort((a, b) => {
      switch (sortBy) {
        case "uncertainty":
          return b.results.uncertainty - a.results.uncertainty;
        case "confidence":
          return a.results.confidence - b.results.confidence;
        case "parScore":
          return b.results.parScore - a.results.parScore;
        default:
          return 0;
      }
    });
  };

  /**
   * getUncertaintyColor
   * @description
   * Maps uncertainty into semantic color bands for quick-glance triage.
   * Thresholds are heuristic and can be replaced by clinic policy.
   */
  const getUncertaintyColor = (uncertainty: number) => {
    if (uncertainty > 70) return "bg-red-100 text-red-800 border-red-200";
    if (uncertainty > 40) return "bg-yellow-100 text-yellow-800 border-yellow-200";
    return "bg-green-100 text-green-800 border-green-200";
  };

  /**
   * getConfidenceIcon
   * @description
   * Visual aid encoding three confidence bands; complements numeric display.
   */
  const getConfidenceIcon = (confidence: number) => {
    if (confidence > 85) return <CheckCircle className="w-4 h-4 text-green-600" />;
    if (confidence > 70) return <Eye className="w-4 h-4 text-yellow-600" />;
    return <AlertTriangle className="w-4 h-4 text-red-600" />;
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-6 space-y-6">
      <Card className="border-purple-200 bg-purple-50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-purple-800">
              <Brain className="w-6 h-6" />
              Bulk Mosaic Processing with Uncertainty Guided Exploration
            </CardTitle>
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
          <p className="text-sm text-purple-700">
            Upload multiple patient mosaics for batch AI analysis with confidence-based review prioritization
          </p>
        </CardHeader>
      </Card>

      {uploadedMosaics.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5" />
              Bulk Mosaic Upload
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
                <h4 className="font-medium text-blue-800 mb-2">Upload Requirements:</h4>
                <ul className="text-sm text-blue-700 space-y-1">
                  <li>• Upload images in groups of 5 (one complete mosaic per patient)</li>
                  <li>• Each group should contain: Anterior, Left/Right Buccal, Upper/Lower Occlusal</li>
                  <li>• AI will process all mosaics simultaneously</li>
                  <li>• Results will be sorted by uncertainty for efficient review</li>
                </ul>
              </div>

              <div
                className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center hover:border-gray-400 transition-colors cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-xl font-medium text-gray-700 mb-2">Upload Multiple Patient Mosaics</h3>
                <p className="text-gray-500 mb-4">Select all images at once (groups of 5 per patient)</p>
                <Button size="lg">
                  <Upload className="w-4 h-4 mr-2" />
                  Select Images
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handleBulkUpload}
                  className="hidden"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {uploadedMosaics.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="w-5 h-5" />
              Batch Processing
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{uploadedMosaics.length} patient mosaics ready for processing</p>
                  <p className="text-sm text-gray-600">
                    {uploadedMosaics.length * 5} total images • Estimated processing time: {uploadedMosaics.length * 2}s
                  </p>
                </div>
                <Button onClick={simulateAIProcessing} disabled={isProcessing} size="lg">
                  <Brain className="w-4 h-4 mr-2" />
                  {isProcessing ? "Processing..." : "Start AI Analysis"}
                </Button>
              </div>

              {isProcessing && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Processing mosaics...</span>
                    <span>{Math.round(processingProgress)}%</span>
                  </div>
                  <Progress value={processingProgress} className="h-3" />
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {processedMosaics.length > 0 && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Filter className="w-5 h-5" />
                Uncertainty Guided Review
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Uncertainty Threshold</label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={uncertaintyThreshold}
                    onChange={(e) => setUncertaintyThreshold(Number(e.target.value))}
                    className="w-full"
                  />
                  <p className="text-xs text-gray-500 mt-1">{uncertaintyThreshold}% (flag for review)</p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Sort By</label>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    className="w-full p-2 border rounded"
                  >
                    <option value="uncertainty">Uncertainty (High First)</option>
                    <option value="confidence">Confidence (Low First)</option>
                    <option value="parScore">PAR Score (High First)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Filter</label>
                  <select
                    value={filterBy}
                    onChange={(e) => setFilterBy(e.target.value as any)}
                    className="w-full p-2 border rounded"
                  >
                    <option value="all">All Results</option>
                    <option value="flagged">Flagged for Review</option>
                    <option value="reviewed">Reviewed</option>
                  </select>
                </div>

                <div className="flex items-end">
                  <Button variant="outline" className="w-full">
                    <Download className="w-4 h-4 mr-2" />
                    Export Results
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {getSortedAndFilteredMosaics().map((mosaic) => (
              <Card
                key={mosaic.id}
                className={cn(
                  "border-2",
                  mosaic.results.flaggedForReview ? "border-red-200 bg-red-50" : "border-gray-200",
                )}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{mosaic.patientName}</CardTitle>
                    <div className="flex items-center gap-2">
                      {getConfidenceIcon(mosaic.results.confidence)}
                      {mosaic.results.flaggedForReview && (
                        <Badge className="bg-red-100 text-red-800">Needs Review</Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3">
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div className="text-center">
                      <div className="font-medium text-gray-700">PAR Score</div>
                      <div className="text-lg font-bold text-blue-600">{mosaic.results.parScore}</div>
                    </div>
                    <div className="text-center">
                      <div className="font-medium text-gray-700">Confidence</div>
                      <div className="text-lg font-bold text-green-600">{mosaic.results.confidence}%</div>
                    </div>
                    <div className="text-center">
                      <div className="font-medium text-gray-700">Uncertainty</div>
                      <div
                        className={cn(
                          "text-lg font-bold",
                          mosaic.results.uncertainty > 70
                            ? "text-red-600"
                            : mosaic.results.uncertainty > 40
                            ? "text-yellow-600"
                            : "text-green-600",
                        )}
                      >
                        {mosaic.results.uncertainty}%
                      </div>
                    </div>
                  </div>

                  <div
                    className={cn(
                      "p-2 rounded text-center text-sm font-medium border",
                      getUncertaintyColor(mosaic.results.uncertainty),
                    )}
                  >
                    {mosaic.results.uncertainty > 70
                      ? "🔴 High Uncertainty - Priority Review"
                      : mosaic.results.uncertainty > 40
                      ? "🟡 Medium Uncertainty - Standard Review"
                      : "🟢 Low Uncertainty - Reliable Result"}
                  </div>

                  <div className="space-y-1">
                    <h5 className="font-medium text-sm">Detected Components:</h5>
                    {mosaic.results.detectedComponents.map((comp, idx) => (
                      <div key={idx} className="flex justify-between text-xs">
                        <span>{comp.component}</span>
                        <span className="flex items-center gap-1">
                          <span>Score: {comp.score}</span>
                          <Badge variant="outline" className="text-xs">
                            {comp.confidence}% conf
                          </Badge>
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button size="sm" className="flex-1">
                      <Eye className="w-3 h-3 mr-1" />
                      Review
                    </Button>
                    <Button size="sm" variant="outline">
                      Edit
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="bg-gray-50">
            <CardContent className="p-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold text-gray-800">{processedMosaics.length}</div>
                  <div className="text-sm text-gray-600">Total Processed</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-red-600">
                    {processedMosaics.filter((m) => m.results.flaggedForReview).length}
                  </div>
                  <div className="text-sm text-gray-600">Flagged for Review</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-green-600">
                    {Math.round(
                      processedMosaics.reduce((acc, m) => acc + m.results.confidence, 0) /
                        processedMosaics.length,
                    )}
                    %
                  </div>
                  <div className="text-sm text-gray-600">Avg Confidence</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-blue-600">
                    {Math.round(
                      processedMosaics.reduce((acc, m) => acc + m.results.parScore, 0) /
                        processedMosaics.length,
                    )}
                  </div>
                  <div className="text-sm text-gray-600">Avg PAR Score</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
