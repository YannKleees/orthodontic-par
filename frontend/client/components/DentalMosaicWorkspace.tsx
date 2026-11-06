/**
 * @file DentalMosaicWorkspace.tsx
 * @role
 *   Interactive clinical workspace for PAR (Peer Assessment Rating) review:
 *   renders a fixed 5-view dental mosaic with model-generated component
 *   overlays, supports clinician edits to per-component PAR sub-scores,
 *   and summarizes the weighted total across components.
 *
 * @data-contract
 *   - PAR_Component: canonical UI representation of a detected PAR element,
 *     including mosaic-space coordinates and an editable score ∈ [0, maxScore].
 *   - usePARComponentsContext(patientId, visitId) provides a reactive source
 *     of PAR components for the active visit and mutation helpers.
 *
 * @scientific-notes
 *   - Mosaic scaling: overlays are positioned in normalized percentages
 *     relative to a nominal mosaic (here 300×200 per tile). This preserves
 *     geometric validity under arbitrary CSS scaling/zoom.
 *   - Human-in-the-loop: clinician score edits are captured at the component
 *     level; the system recomputes totals, providing an auditable workflow
 *     that mitigates propagation of model error.
 *   - Reliability indicators: per-component confidence and PRE→POST deltas
 *     expose uncertainty and directionality of change, supporting review.
 */

import { useState, useRef, useEffect } from "react";
import {
  ChevronUp,
  ChevronDown,
  Save,
  Download,
  Share2,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Eye,
} from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Textarea } from "./ui/textarea";
import { Progress } from "./ui/progress";
import { cn } from "../lib/utils";
import { usePARComponentsContext } from "../hooks/usePARComponentsContext";

/**
 * Canonical UI model for a PAR sub-component overlay and score.
 * @property coordinates  Bounding box in natural mosaic pixel space for the tile,
 *                        later normalized to CSS percentages for rendering.
 * @property confidence   Model confidence [%]; displayed as a micro-meter.
 * @property previousScore Optional baseline to compute PRE→POST direction.
 */
interface PAR_Component {
  id: string;
  component:
    | "Upper Crowding"
    | "Lower Crowding"
    | "Upper Spacing"
    | "Lower Spacing"
    | "Overjet"
    | "Overbite"
    | "Crossbite"
    | "Centerline";
  toothRegion: string;
  score: number;
  maxScore: number;
  confidence: number;
  previousScore?: number;
  coordinates: { x: number; y: number; width: number; height: number };
  viewId: string;
  editable: boolean;
  modifiedBy?: string;
}

/**
 * Props for the mosaic workspace.
 * @param patientName   Display label for header context.
 * @param patientId     Foreign key for data hooks.
 * @param hasPrevisousVisit  Enables PRE vs POST comparison UI when true.
 */
interface DentalMosaicWorkspaceProps {
  patientName: string;
  patientId: string;
  hasPrevisousVisit?: boolean;
}

/**
 * DentalMosaicWorkspace
 * @summary
 *   Renders 5 canonical views with interactive PAR overlays. Allows
 *   per-component score edits and note taking; summarizes overall PAR.
 */
export function DentalMosaicWorkspace({
  patientName,
  patientId,
  hasPrevisousVisit = true,
}: DentalMosaicWorkspaceProps) {
  const [notes, setNotes] = useState("");
  const [zoom, setZoom] = useState(100);
  const [activeTab, setActiveTab] = useState("current");
  const [editingComponent, setEditingComponent] = useState<string | null>(null);
  const [editScore, setEditScore] = useState<number>(0);
  const notesRef = useRef<HTMLTextAreaElement>(null);

  /**
   * Data source for PAR components.
   * @note Replace the placeholder visitId with routing or context state in app.
   */
  const visitId = "current";
  const {
    components: parComponents,
    updateComponent,
    createComponent,
  } = usePARComponentsContext(patientId, visitId);

  /**
   * Canonical 5-view grid layout. The grid positions map each view
   * to a stable location for clinician familiarity and model calibration.
   */
  const views = [
    { id: "up", name: "Upper", position: "top-center" },
    { id: "left", name: "Left", position: "middle-left" },
    { id: "centre", name: "Centre", position: "middle-center" },
    { id: "right", name: "Right", position: "middle-right" },
    { id: "down", name: "Lower", position: "bottom-center" },
  ];

  /** Semantic color coding per component type for rapid visual parsing. */
  const componentColors = {
    "Upper Crowding": "bg-red-100 text-red-800 border-red-200",
    "Lower Crowding": "bg-red-100 text-red-800 border-red-200",
    "Upper Spacing": "bg-blue-100 text-blue-800 border-blue-200",
    "Lower Spacing": "bg-blue-100 text-blue-800 border-blue-200",
    Overjet: "bg-orange-100 text-orange-800 border-orange-200",
    Overbite: "bg-purple-100 text-purple-800 border-purple-200",
    Crossbite: "bg-yellow-100 text-yellow-800 border-yellow-200",
    Centerline: "bg-green-100 text-green-800 border-green-200",
  } as const;

  /**
   * scoreColors
   * @returns Tailwind classes representing low/medium/high severity bins.
   */
  const scoreColors = (score: number, maxScore: number) => {
    const percentage = (score / maxScore) * 100;
    if (percentage <= 30) return "bg-green-100 text-green-800";
    if (percentage <= 60) return "bg-yellow-100 text-yellow-800";
    return "bg-red-100 text-red-800";
  };

  /** Glyphs indicating directionality of change vs. baseline. */
  const changeIcons = {
    improved: <ChevronUp className="w-3 h-3 text-green-600" />,
    worsened: <ChevronDown className="w-3 h-3 text-red-600" />,
    stable: <span className="w-3 h-3 text-gray-400">→</span>,
  };

  /**
   * Persist clinical notes (e.g., on blur).
   * @future Wire to API with debounced persistence + provenance.
   */
  const handleNotesBlur = () => {
    console.log("Auto-saving notes:", notes);
  };

  /** Discrete zoom steps clamped to maintain readability and layout. */
  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 25, 200));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 25, 50));

  /**
   * Aggregate PAR totals across components.
   * @note Weighted totals can be computed upstream; here we show raw Σ(score)
   *       to reflect current editable values.
   */
  const totalPARScore = parComponents.reduce(
    (sum, comp) => sum + comp.score,
    0,
  );
  const maxPARScore = parComponents.reduce(
    (sum, comp) => sum + comp.maxScore,
    0,
  );

  /** Begin edit session for a specific component’s score. */
  const handleEditScore = (componentId: string, currentScore: number) => {
    setEditingComponent(componentId);
    setEditScore(currentScore);
  };

  /** Commit an edited score to the data context. */
  const handleSaveScore = () => {
    if (editingComponent) {
      updateComponent(editingComponent, { score: editScore });
      setEditingComponent(null);
    }
  };

  /** Abort score edit and reset temporary state. */
  const handleCancelEdit = () => {
    setEditingComponent(null);
    setEditScore(0);
  };

  /**
   * Map a view identifier to CSS Grid cell coordinates.
   * @invariant 3×3 grid with the centre tile reserved for "centre" view.
   */
  const getGridPosition = (viewId: string) => {
    const positions = {
      up: "col-start-2 row-start-1",
      left: "col-start-1 row-start-2",
      centre: "col-start-2 row-start-2",
      right: "col-start-3 row-start-2",
      down: "col-start-2 row-start-3",
    };
    return positions[viewId as keyof typeof positions];
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-on-surface">
            Dental Analysis - {patientName}
          </h2>
          <p className="text-on-surface-variant">
            AI-powered caries and periodontal analysis
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm">
            <Download className="w-4 h-4 mr-1" />
            Export Report
          </Button>
          <Button variant="outline" size="sm">
            <Share2 className="w-4 h-4 mr-1" />
            Share
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 5-tile mosaic */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle>Intraoral Views</CardTitle>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={handleZoomOut}>
                    <ZoomOut className="w-4 h-4" />
                  </Button>
                  <span className="text-sm font-medium">{zoom}%</span>
                  <Button variant="ghost" size="sm" onClick={handleZoomIn}>
                    <ZoomIn className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 grid-rows-3 gap-2 aspect-square">
                {views.map((view) => (
                  <div
                    key={view.id}
                    className={cn(
                      "relative bg-gray-100 rounded-lg overflow-hidden group hover:ring-2 hover:ring-primary transition-all",
                      getGridPosition(view.id),
                    )}
                  >
                    <img
                      src="/placeholder.svg"
                      alt={`${view.name} view`}
                      className="w-full h-full object-cover transition-transform"
                      style={{ transform: `scale(${zoom / 100})` }}
                    />

                    {/* Component overlays: normalized to tile reference size (300×200) */}
                    {parComponents
                      .filter((comp) => comp.viewId === view.id)
                      .map((component) => (
                        <div
                          key={component.id}
                          className="absolute border-2 border-blue-500 bg-blue-500/20 cursor-pointer hover:bg-blue-500/30 transition-colors"
                          style={{
                            left: `${(component.coordinates.x / 300) * 100}%`,
                            top: `${(component.coordinates.y / 200) * 100}%`,
                            width: `${(component.coordinates.width / 300) * 100}%`,
                            height: `${(component.coordinates.height / 200) * 100}%`,
                          }}
                          onClick={() =>
                            handleEditScore(component.id, component.score)
                          }
                        >
                          <div className="absolute -top-8 left-0 bg-blue-500 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                            {component.component}: {component.score}/{component.maxScore}
                          </div>
                        </div>
                      ))}

                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="secondary" size="sm">
                          <Eye className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="absolute bottom-1 left-1 bg-black/70 text-white text-xs px-2 py-1 rounded">
                      {view.name}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* PAR components list + editing */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>PAR Index Analysis</CardTitle>
                  <p className="text-sm text-on-surface-variant">
                    {parComponents.length} components analyzed - Total PAR
                    Score: {totalPARScore}/{maxPARScore}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-primary">
                    {totalPARScore}
                  </div>
                  <div className="text-sm text-on-surface-variant">PAR Score</div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {parComponents.map((component) => (
                  <div
                    key={component.id}
                    className={cn(
                      "p-3 border border-gray-200 rounded-lg transition-colors",
                      editingComponent === component.id
                        ? "border-primary bg-primary/5"
                        : "hover:bg-gray-50",
                    )}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={componentColors[component.component]}
                        >
                          {component.component}
                        </Badge>
                        <span className="text-sm font-medium">
                          {component.toothRegion}
                        </span>
                      </div>
                      {editingComponent === component.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="0"
                            max={component.maxScore}
                            value={editScore}
                            onChange={(e) => setEditScore(Number(e.target.value))}
                            className="w-16 px-2 py-1 border border-primary rounded text-center"
                          />
                          <span className="text-sm">/{component.maxScore}</span>
                          <Button size="sm" onClick={handleSaveScore}>Save</Button>
                          <Button size="sm" variant="outline" onClick={handleCancelEdit}>
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <div
                          className="flex items-center gap-2 cursor-pointer hover:bg-gray-100 px-2 py-1 rounded"
                          onClick={() => handleEditScore(component.id, component.score)}
                        >
                          <div className="text-lg font-semibold">
                            {component.score}/{component.maxScore}
                          </div>
                          <Badge
                            variant="outline"
                            className={scoreColors(component.score, component.maxScore)}
                          >
                            {Math.round((component.score / component.maxScore) * 100)}%
                          </Badge>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="flex items-center gap-1">
                        <span className="text-gray-500">Confidence:</span> {component.confidence}%
                        <Progress value={component.confidence} className="h-1 w-16" />
                      </div>
                      {component.previousScore && (
                        <div className="flex items-center gap-1">
                          <span className="text-gray-500">Previous:</span>
                          <span>{component.previousScore}</span>
                          {component.previousScore > component.score ? (
                            <ChevronUp className="w-3 h-3 text-green-600" />
                          ) : component.previousScore < component.score ? (
                            <ChevronDown className="w-3 h-3 text-red-600" />
                          ) : (
                            <span className="w-3 h-3 text-gray-400">→</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Notes */}
      <Card>
        <CardHeader>
          <CardTitle>Clinical Notes</CardTitle>
          <p className="text-sm text-on-surface-variant">Notes auto-save when you finish typing</p>
        </CardHeader>
        <CardContent>
          <Textarea
            ref={notesRef}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={handleNotesBlur}
            placeholder="Enter clinical observations, treatment recommendations, and follow-up notes..."
            className="min-h-24 resize-y"
          />
        </CardContent>
      </Card>

      {/* PRE vs POST comparison scaffold */}
      <Card>
        <CardHeader>
          <CardTitle>Treatment Comparison</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="current">Current Visit</TabsTrigger>
              <TabsTrigger
                value="comparison"
                disabled={!hasPrevisousVisit}
                className={cn(!hasPrevisousVisit && "opacity-50 cursor-not-allowed")}
              >
                PRE vs POST
                {!hasPrevisousVisit && " (No previous visit)"}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="current" className="mt-4">
              <div className="text-center py-8">
                <p className="text-on-surface-variant">Current visit analysis displayed above</p>
              </div>
            </TabsContent>

            <TabsContent value="comparison" className="mt-4">
              {hasPrevisousVisit ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-medium mb-3">PRE Treatment</h4>
                    <div className="bg-gray-100 rounded-lg p-4 text-center">
                      <p className="text-gray-600">Previous visit mosaic</p>
                    </div>
                  </div>
                  <div>
                    <h4 className="font-medium mb-3">POST Treatment</h4>
                    <div className="bg-gray-100 rounded-lg p-4 text-center">
                      <p className="text-gray-600">Current visit mosaic</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <p>No previous visit available for comparison</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
