/**
 * @file MosaicFullscreen.tsx
 * @brief
 *   Full-screen PAR editing workspace. Renders a single mosaic image with
 *   overlayed PAR components (axis-aligned rectangles) and provides
 *   direct-manipulation tools (move/resize/add/delete) in a fixed, model-space
 *   coordinate system.
 *
 * @rationale
 *   The mosaic is treated as the canonical reference frame. All bounding-boxes
 *   persist in “natural” pixel coordinates (MOSAIC_WIDTH × MOSAIC_HEIGHT) to
 *   avoid cumulative rounding errors from repeated CSS transforms. UI scale and
 *   rotation are applied visually; the stored geometry remains invariant.
 *
 * @interaction-model
 *   • Edit Mode toggles a small tool-palette: Move (drag), Resize (corner handles),
 *     Add (click to insert default box), Delete (click to remove).
 *   • Drag operations are parameterized by (startX, startY, startCoords),
 *     updated by deltas in client space, then clamped to model bounds.
 *   • Score/type edits are performed through an inline modal; maxScore derives
 *     from the selected component taxonomy.
 *
 * @invariants
 *   • All coordinates are clamped to [0, W] × [0, H].
 *   • Rotation is visual only (no change to stored coordinates).
 *   • Percent-based CSS positioning is computed from model space, keeping
 *     layouts DPI-independent and responsive.
 */

import { useState, useEffect } from "react";
import {
  RotateCw,
  Download,
  Share2,
  Edit3,
  Save,
  X,
  Move,
  Square,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Progress } from "./ui/progress";
import { cn } from "../lib/utils";
import { usePARComponentsContext } from "../hooks/usePARComponentsContext";
import { useVisitDetail } from "@/hooks/useApi";
import { mosaicUrl }       from "@/lib/paths";

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
}

interface MosaicFullscreenProps {
  patientName: string;
  patientId:   string;
  visitId     : string;
}

/**
 * Lightweight metadata for header display when a real visit is not yet wired.
 * Keeps UI predictable during early integration.
 */
export function getMosaicData(patientName: string) {
  return {
    title   : "Latest visit",
    date    : new Date().toISOString().slice(0,10),
    visitId : "dummy",
    imageUrl: "/placeholder/mosaic.png",
  };
}

export function MosaicFullscreen({
  patientName,
  patientId,
  visitId,
}: MosaicFullscreenProps) {
  const {
    components: parComponents,
    updateComponent,
    createComponent,
    deleteComponent,
    getComponentsByView,
  } = usePARComponentsContext(patientId, visitId);

  const { data: visit, loading } = useVisitDetail(visitId);

  /** Visual state (does not alter persisted geometry). */
  const [rotation,        setRotation]        = useState(0);
  const [editMode,        setEditMode]        = useState(false);
  const [selectedView,    setSelectedView]    = useState("centre");
  const [editTool,        setEditTool]        = useState<"move"|"resize"|"add"|"delete">("move");
  const [editingComponent,setEditingComponent]= useState<string|null>(null);
  const [editScore,       setEditScore]       = useState(0);
  const [editComponentType,setEditComponentType]=useState("");

  /**
   * Canonical model-space resolution used by the backend. All boxes are stored
   * and updated in this space; percentages for CSS are derived from it.
   */
  const MOSAIC_WIDTH = 600;
  const MOSAIC_HEIGHT = 400;

  /**
   * Drag/resize state:
   *  - startCoords caches immutable starting rectangle,
   *  - (startX, startY) are client pixels at mouse down,
   *  - mode/resizeHandle determine update rule.
   */
  const [dragState, setDragState] = useState<{
       isDragging: boolean;
       componentId: string | null;
       mode: "move" | "resize" | null;
       resizeHandle: string | null;
       startX: number;
       startY: number;
       startCoords: { x: number; y: number; width: number; height: number } | null;
   }>({
       isDragging: false,
       componentId: null,
       mode: null,
       resizeHandle: null,
       startX: 0,
       startY: 0,
       startCoords: null,
   });

  /** Registers/unregisters global listeners only while dragging is active. */
  useEffect(() => {
    if (!dragState.isDragging) return;
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup",   handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup",   handleMouseUp);
    };
  }, [dragState.isDragging]);

  /* Early exits after hooks are settled for predictable render flow. */
  if (loading) return <p className="p-6">Loading…</p>;
  if (!visit)  return <p className="p-6 text-red-600">Visit not found.</p>;

  /**
   * Mouse down begins an interaction episode. We capture starting client
   * coordinates and a snapshot of the rectangle; subsequent motion applies
   * deltas and clamps in model space.
   */
  const handleMouseDown = (
    e: React.MouseEvent,
    componentId: string,
    mode: "move" | "resize" = "move",
    handle?: string,
  ) => {
    e.preventDefault();
    e.stopPropagation();

    const component = parComponents.find((c) => c.id === componentId);
    if (!component || !editMode) return;

    setDragState({
      isDragging: true,
      componentId,
      mode,
      resizeHandle: handle || null,
      startX: e.clientX,
      startY: e.clientY,
      startCoords: { ...component.coordinates },
    });
  };

  /**
   * Mouse move applies delta updates per interaction mode:
   *  - Move: translate (x,y) with clamping to keep box fully in-frame.
   *  - Resize: modify width/height from a handle while maintaining non-negativity
   *            and minimum size constraints; also clamp to mosaic bounds.
   */
  const handleMouseMove = (e: MouseEvent) => {
    if (
      !dragState.isDragging ||
      !dragState.componentId ||
      !dragState.startCoords
    )
      return;

    const deltaX = e.clientX - dragState.startX;
    const deltaY = e.clientY - dragState.startY;

    if (dragState.componentId) {
      const startCoords = dragState.startCoords!;
      let newCoords = { ...startCoords };

      if (dragState.mode === "move") {
        newCoords.x = Math.max(0, Math.min(MOSAIC_WIDTH - startCoords.width, startCoords.x + deltaX));
        newCoords.y = Math.max(0, Math.min(MOSAIC_HEIGHT - startCoords.height, startCoords.y + deltaY));
      } else if (dragState.mode === "resize") {
        const minSize = 20;
        const maxSize = 200;

        switch (dragState.resizeHandle) {
          case "se":
            newCoords.width = Math.max(minSize, Math.min(maxSize, startCoords.width + deltaX));
            newCoords.height = Math.max(minSize, Math.min(maxSize, startCoords.height + deltaY));
            break;
          case "sw": {
            const newWidth = Math.max(minSize, Math.min(maxSize, startCoords.width - deltaX));
            newCoords.width = newWidth;
            newCoords.height = Math.max(minSize, Math.min(maxSize, startCoords.height + deltaY));
            newCoords.x = startCoords.x + (startCoords.width - newWidth);
            break;
          }
          case "ne": {
            newCoords.width = Math.max(minSize, Math.min(maxSize, startCoords.width + deltaX));
            const newHeight = Math.max(minSize, Math.min(maxSize, startCoords.height - deltaY));
            newCoords.height = newHeight;
            newCoords.y = startCoords.y + (startCoords.height - newHeight);
            break;
          }
          case "nw": {
            const newWidthNW = Math.max(minSize, Math.min(maxSize, startCoords.width - deltaX));
            const newHeightNW = Math.max(minSize, Math.min(maxSize, startCoords.height - deltaY));
            newCoords.width = newWidthNW;
            newCoords.height = newHeightNW;
            newCoords.x = startCoords.x + (startCoords.width - newWidthNW);
            newCoords.y = startCoords.y + (startCoords.height - newHeightNW);
            break;
          }
        }

        newCoords.x = Math.max(0, Math.min(MOSAIC_WIDTH - newCoords.width, newCoords.x));
        newCoords.y = Math.max(0, Math.min(MOSAIC_HEIGHT - newCoords.height, newCoords.y));
      }

      updateComponent(dragState.componentId, { coordinates: newCoords });
    }
  };

  /** Completes interaction and clears transient state. */
  const handleMouseUp = () => {
    if (dragState.isDragging) {
      setDragState({
        isDragging: false,
        componentId: null,
        mode: null,
        resizeHandle: null,
        startX: 0,
        startY: 0,
        startCoords: null,
      });
    }
  };

  /** Purely visual 90° rotation; underlying coordinates remain unchanged. */
  const handleRotate = () => setRotation((prev) => (prev + 90) % 360);

  /** Opens the score editor with current values for the selected component. */
  const handleEditScore = (componentId: string, currentScore: number) => {
    const component = parComponents.find((c) => c.id === componentId);
    if (component) {
      setEditingComponent(componentId);
      setEditScore(currentScore);
      setEditComponentType(component.component);
    }
  };

  /** Persists score + component type changes; maxScore derived from taxonomy. */
  const handleSaveScore = () => {
    if (editingComponent) {
      updateComponent(editingComponent, {
        score: editScore,
        component: editComponentType as PAR_Component["component"],
        maxScore: getMaxScoreForComponent(editComponentType),
      });
      setEditingComponent(null);
      setEditScore(0);
      setEditComponentType("");
    }
  };

  /** Encodes clinical bounds per component; used by editor and UI validation. */
  const getMaxScoreForComponent = (componentType: string): number => {
    const maxScores: Record<string, number> = {
      "Upper Crowding": 5,
      "Lower Crowding": 5,
      "Upper Spacing": 5,
      "Lower Spacing": 5,
      Overjet: 4,
      Overbite: 4,
      Crossbite: 4,
      Centerline: 4,
    };
    return maxScores[componentType] || 5;
  };

  /** Unweighted totals as displayed; (weighted sum is computed elsewhere). */
  const totalPARScore = parComponents.reduce(
    (sum, comp) => sum + comp.score,
    0,
  );
  const maxPARScore = parComponents.reduce(
    (sum, comp) => sum + comp.maxScore,
    0,
  );

  /** Visual encodings per component class for rapid pattern recognition. */
  const componentColors = {
    "Upper Crowding": "border-red-500 bg-red-500/20",
    "Lower Crowding": "border-red-500 bg-red-500/20",
    "Upper Spacing": "border-blue-500 bg-blue-500/20",
    "Lower Spacing": "border-blue-500 bg-blue-500/20",
    Overjet: "border-orange-500 bg-orange-500/20",
    Overbite: "border-purple-500 bg-purple-500/20",
    Crossbite: "border-yellow-500 bg-yellow-500/20",
    Centerline: "border-green-500 bg-green-500/20",
  };

  return (
    <div className="w-full h-full flex bg-gray-50">
      {/* Toolbar + context state */}
      <div className="flex-1 flex flex-col">
        <div className="bg-white border-b border-gray-200 p-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-on-surface">
              PAR Editor - {patientName}
            </h2>
            <p className="text-sm text-on-surface-variant">
              {editMode ? "Edit Mode Active" : ""}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleRotate}>
              <RotateCw className="w-4 h-4" />
            </Button>

            {/* Edit mode toggle with tool default */}
            <Button
              variant={editMode ? "default" : "outline"}
              size="sm"
              onClick={(e) => {
                e.preventDefault();
                const newEditMode = !editMode;
                setEditMode(newEditMode);
                if (newEditMode) {
                  setEditTool("move");
                }
              }}
              className={cn(
                "min-w-[120px]",
                editMode && "bg-green-600 hover:bg-green-700 text-white",
              )}
            >
              <Edit3 className="w-4 h-4 mr-2" />
              {editMode ? "Exit Edit" : "Edit Mode"}
              {editMode && <span className="ml-2 text-xs">(Active)</span>}
            </Button>

            {/* Tool palette */}
            {editMode && (
              <div className="flex items-center gap-1 border rounded-lg p-1 bg-gray-50">
                <Button
                  size="sm"
                  variant={editTool === "move" ? "default" : "ghost"}
                  onClick={(e) => {
                    e.preventDefault();
                    setEditTool("move");
                  }}
                  className="h-10 w-10 p-0 relative"
                  title="Move Tool - Click and drag components"
                >
                  <Move className="w-4 h-4" />
                  {editTool === "move" && (
                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 rounded-full"></div>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant={editTool === "resize" ? "default" : "ghost"}
                  onClick={(e) => {
                    e.preventDefault();
                    setEditTool("resize");
                  }}
                  className="h-10 w-10 p-0 relative"
                  title="Resize Tool - Drag corner handles to resize"
                >
                  <Square className="w-4 h-4" />
                  {editTool === "resize" && (
                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 rounded-full"></div>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant={editTool === "add" ? "default" : "ghost"}
                  onClick={(e) => {
                    e.preventDefault();
                    setEditTool("add");
                  }}
                  className="h-10 w-10 p-0 relative"
                  title="Add Tool - Click on image to add new component"
                >
                  <Plus className="w-4 h-4" />
                  {editTool === "add" && (
                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 rounded-full"></div>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant={editTool === "delete" ? "destructive" : "ghost"}
                  onClick={(e) => {
                    e.preventDefault();
                    setEditTool("delete");
                  }}
                  className="h-10 w-10 p-0 relative"
                  title="Delete Tool - Click on component to delete"
                >
                  <Trash2 className="w-4 h-4" />
                  {editTool === "delete" && (
                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full"></div>
                  )}
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Image + overlays (percent-based from model coordinates) */}
        <div className="flex-1 flex items-center justify-center p-6 overflow-hidden">
          <div
            className={cn(
              "relative bg-white rounded-lg shadow-lg overflow-hidden",
              editMode && editTool === "add" && "cursor-crosshair",
              "w-full max-w-[800px]"
            )}
            style={{
              aspectRatio: `${MOSAIC_WIDTH} / ${MOSAIC_HEIGHT}`,
              contain: 'strict'
            }}
            onClick={(e) => {
              if (editMode && editTool === "add") {
                const rect = e.currentTarget.getBoundingClientRect();
                const x = Math.round((e.clientX - rect.left) / rect.width * MOSAIC_WIDTH);
                const y = Math.round((e.clientY - rect.top) / rect.height * MOSAIC_HEIGHT);

                const newComponent = {
                  component: "Upper Crowding" as const,
                  toothRegion: "New region",
                  score: 0,
                  maxScore: 5,
                  confidence: 100,
                  coordinates: {
                    x: Math.max(0, x - 40),
                    y: Math.max(0, y - 30),
                    width: 80,
                    height: 60,
                  },
                  viewId: selectedView,
                  editable: true,
                };

                createComponent(newComponent);
                setEditTool("move");
              }
            }}
          >
            <img
              src={visit.mosaicUrl ?? mosaicUrl(visit.patientId, visit.id)}
              alt={`Mosaic – ${patientName}`}
              className="transition-transform duration-200 pointer-events-none object-contain w-full h-full"
              style={{
                transform: `rotate(${rotation}deg)`,
                transformOrigin: 'center center'
              }}
              draggable={false}
            />

            {/* Overlay rectangles derived from model-space percentages */}
            {getComponentsByView(selectedView).map((component) => (
              <div
                key={component.id}
                className={cn(
                  "absolute border-2 select-none",
                  componentColors[component.component],
                  dragState.componentId === component.id
                    ? "ring-2 ring-blue-500"
                    : "",
                  editMode && editTool === "move"
                    ? "cursor-move"
                    : "cursor-default",
                )}
                style={{
                  left  : `${(component.coordinates.x      / MOSAIC_WIDTH) * 100}%`,
                  top   : `${(component.coordinates.y      / MOSAIC_HEIGHT) * 100}%`,
                  width : `${(component.coordinates.width  / MOSAIC_WIDTH) * 100}%`,
                  height: `${(component.coordinates.height / MOSAIC_HEIGHT) * 100}%`,
                  boxSizing: 'border-box',
                  margin: 0,
                  padding: 0
                }}
                onMouseDown={(e) => {
                  if (editMode && editTool === "move") {
                    handleMouseDown(e, component.id, "move");
                  }
                }}
                onClick={(e) => {
                  if (editMode && editTool === "delete") {
                    e.stopPropagation();
                    if (confirm(`Delete ${component.component} component?`)) {
                      deleteComponent(component.id);
                    }
                  }
                }}
              >
                {/* Clickable label for score/type editing */}
                <div
                  className={cn(
                    "absolute -top-8 left-0 bg-black text-white text-xs px-2 py-1 rounded whitespace-nowrap transition-colors",
                    editMode
                      ? "cursor-pointer hover:bg-gray-800"
                      : "cursor-default",
                  )}
                  onClick={(e) => {
                    if (editMode) {
                      e.stopPropagation();
                      handleEditScore(component.id, component.score);
                    }
                  }}
                  title={
                    editMode
                      ? "Click to edit score and type"
                      : `${component.component}: ${component.score}/${component.maxScore}`
                  }
                >
                  {component.component}: {component.score}/{component.maxScore}
                  {editMode && (
                    <span className="ml-1 text-xs opacity-75">✏️</span>
                  )}
                </div>

                {/* Corner handles shown only during resize tool */}
                {editMode && editTool === "resize" && (
                  <>
                    <div
                      className="absolute -top-2 -left-2 w-6 h-6 bg-red-500 border-2 border-white rounded-full cursor-nw-resize hover:bg-red-600"
                      onMouseDown={(e) =>
                        handleMouseDown(e, component.id, "resize", "nw")
                      }
                    />
                    <div
                      className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 border-2 border-white rounded-full cursor-ne-resize hover:bg-red-600"
                      onMouseDown={(e) =>
                        handleMouseDown(e, component.id, "resize", "ne")
                      }
                    />
                    <div
                      className="absolute -bottom-2 -left-2 w-6 h-6 bg-red-500 border-2 border-white rounded-full cursor-sw-resize hover:bg-red-600"
                      onMouseDown={(e) =>
                        handleMouseDown(e, component.id, "resize", "sw")
                      }
                    />
                    <div
                      className="absolute -bottom-2 -right-2 w-6 h-6 bg-red-500 border-2 border-white rounded-full cursor-se-resize hover:bg-red-600"
                      onMouseDown={(e) =>
                        handleMouseDown(e, component.id, "resize", "se")
                      }
                    />
                  </>
                )}

                {/* Quick access score editor */}
                {editMode && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="absolute top-1 right-1 h-6 px-2 text-xs"
                    onClick={() =>
                      handleEditScore(component.id, component.score)
                    }
                  >
                    <Edit3 className="w-3 h-3 mr-1" />
                    Edit
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Status footer with active tool and aggregate totals */}
        <div
          className={cn(
            "border-t border-gray-200 p-4",
            editMode ? "bg-green-50" : "bg-white",
          )}
        >
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-4">
              <span
                className={cn(
                  "font-medium",
                  editMode ? "text-green-800" : "text-gray-600",
                )}
              >
                {editMode ? (
                  <>
                    ✏️ Edit Mode Active - {editTool.toUpperCase()} tool selected
                    {editTool === "move" && " (Click and drag components to move)"}
                    {editTool === "resize" && " (Red handles will appear - drag to resize)"}
                    {editTool === "add" && " (Click on image to add new component)"}
                    {editTool === "delete" && " (Click on component to delete)"}
                  </>
                ) : (
                  ""
                )}
              </span>
              <span className="text-xs text-gray-500">
                Components visible: {getComponentsByView(selectedView).length}
              </span>
            </div>
            <span className="text-gray-600">
              Total PAR Score: {totalPARScore}/{maxPARScore}
            </span>
          </div>
        </div>
      </div>

      {/* Modal for score/type editing (separate from drag/resize loop) */}
      {editingComponent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Edit PAR Component</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Component Type:
                </label>
                <select
                  value={editComponentType}
                  onChange={(e) => {
                    setEditComponentType(e.target.value);
                    setEditScore(0);
                  }}
                  className="w-full border rounded px-3 py-2 bg-white"
                >
                  <option value="Upper Crowding">Upper Crowding (0-5)</option>
                  <option value="Lower Crowding">Lower Crowding (0-5)</option>
                  <option value="Upper Spacing">Upper Spacing (0-5)</option>
                  <option value="Lower Spacing">Lower Spacing (0-5)</option>
                  <option value="Overjet">Overjet (0-4)</option>
                  <option value="Overbite">Overbite (0-4)</option>
                  <option value="Crossbite">Crossbite (0-4)</option>
                  <option value="Centerline">Centerline (0-4)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  Score (0-{getMaxScoreForComponent(editComponentType)}):
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="0"
                    max={getMaxScoreForComponent(editComponentType)}
                    value={editScore}
                    onChange={(e) => setEditScore(Number(e.target.value))}
                    className="flex-1"
                  />
                  <input
                    type="number"
                    min="0"
                    max={getMaxScoreForComponent(editComponentType)}
                    value={editScore}
                    onChange={(e) => setEditScore(Number(e.target.value))}
                    className="w-16 border rounded px-2 py-1 text-center"
                  />
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  Current: {editScore}/
                  {getMaxScoreForComponent(editComponentType)}
                </div>
              </div>
              <div className="bg-gray-50 p-3 rounded">
                <div className="text-xs text-gray-600">
                  <strong>Preview:</strong> {editComponentType}: {editScore}/
                  {getMaxScoreForComponent(editComponentType)}
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleSaveScore} className="flex-1">
                  <Save className="w-4 h-4 mr-2" />
                  Save Changes
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditingComponent(null);
                    setEditScore(0);
                    setEditComponentType("");
                  }}
                  className="flex-1"
                >
                  <X className="w-4 h-4 mr-2" />
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
