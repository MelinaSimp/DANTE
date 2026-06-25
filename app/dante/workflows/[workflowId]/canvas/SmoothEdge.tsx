"use client";

import { createContext, useContext } from "react";
import { getBezierPath, getSmoothStepPath, type EdgeProps } from "@xyflow/react";

// Connection-style toggle (Curved vs Stepped). The editor provides the
// value; every edge consumes it here so flipping the toggle re-renders
// all edges at once.
export const SteppedEdgeContext = createContext(false);

export interface SmoothEdgeData {
  itemCount?: number | null;
  isExecuting?: boolean;
  [key: string]: unknown;
}

export default function SmoothEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  label,
  style,
  markerEnd,
  selected,
  data,
}: EdgeProps) {
  const edgeData = (data ?? {}) as SmoothEdgeData;
  const itemCount = edgeData.itemCount;
  const isExecuting = edgeData.isExecuting;

  const stepped = useContext(SteppedEdgeContext);
  const [edgePath, labelX, labelY] = stepped
    ? getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 10 })
    : getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, curvature: 0.25 });

  const strokeColor = selected
    ? "var(--ink)"
    : isExecuting
      ? "var(--accent)"
      : (style?.stroke as string) ?? "var(--ink-subtle)";

  return (
    <>
      {/* Wider invisible hit area */}
      <path
        d={edgePath}
        fill="none"
        strokeWidth={14}
        stroke="transparent"
        className="react-flow__edge-interaction"
      />
      {/* Visible edge */}
      <path
        id={id}
        d={edgePath}
        fill="none"
        strokeWidth={selected ? 2.5 : 2}
        className="react-flow__edge-path"
        style={{
          ...style,
          stroke: strokeColor,
          // Preserve a configured dash (e.g. agent sub-node edges) at rest;
          // only the executing animation overrides it.
          strokeDasharray: isExecuting ? "6 4" : (style?.strokeDasharray as string | undefined),
          animation: isExecuting ? "dash-flow 0.6s linear infinite" : undefined,
        }}
        markerEnd={markerEnd as string}
      />
      {/* Branch label (true/false/case) */}
      {label && (
        <foreignObject
          width={60}
          height={20}
          x={labelX - 30}
          y={labelY - 10}
          requiredExtensions="http://www.w3.org/1999/xhtml"
          style={{ overflow: "visible", pointerEvents: "none" }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%" }}>
            <span
              style={{
                fontSize: 9,
                fontFamily: "ui-monospace, monospace",
                fontWeight: 600,
                padding: "1px 6px",
                borderRadius: 3,
                background: "var(--canvas)",
                border: "1px solid var(--rule)",
                color: label === "true" ? "var(--verified)" : label === "false" || label === "error" ? "var(--danger)" : "var(--ink-muted)",
              }}
            >
              {label as string}
            </span>
          </div>
        </foreignObject>
      )}
      {/* Item count badge after execution */}
      {itemCount != null && !isExecuting && (
        <foreignObject
          width={50}
          height={20}
          x={labelX - 25}
          y={label ? labelY + 8 : labelY - 10}
          requiredExtensions="http://www.w3.org/1999/xhtml"
          style={{ overflow: "visible", pointerEvents: "none" }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: "100%" }}>
            <span
              style={{
                fontSize: 9,
                fontFamily: "ui-monospace, monospace",
                fontWeight: 600,
                padding: "1px 5px",
                borderRadius: 3,
                background: "var(--canvas-subtle)",
                border: "1px solid var(--rule)",
                color: "var(--ink-muted)",
              }}
            >
              {itemCount} item{itemCount !== 1 ? "s" : ""}
            </span>
          </div>
        </foreignObject>
      )}
      {/* CSS animation for executing edges */}
      {isExecuting && (
        <style>{`
          @keyframes dash-flow {
            to { stroke-dashoffset: -20; }
          }
        `}</style>
      )}
    </>
  );
}
