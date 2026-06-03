"use client";

import { getBezierPath, type EdgeProps } from "@xyflow/react";

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
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    curvature: 0.25,
  });

  return (
    <>
      {/* Wider invisible hit area for easier selection */}
      <path
        d={edgePath}
        fill="none"
        strokeWidth={14}
        stroke="transparent"
        className="react-flow__edge-interaction"
      />
      <path
        id={id}
        d={edgePath}
        fill="none"
        strokeWidth={selected ? 2 : 1.5}
        className="react-flow__edge-path"
        style={{
          ...style,
          stroke: selected ? "var(--ink)" : (style?.stroke ?? "var(--rule-strong)"),
        }}
        markerEnd={markerEnd as string}
      />
      {label && (
        <foreignObject
          width={60}
          height={20}
          x={labelX - 30}
          y={labelY - 10}
          requiredExtensions="http://www.w3.org/1999/xhtml"
          style={{ overflow: "visible", pointerEvents: "none" }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "100%",
              height: "100%",
            }}
          >
            <span
              style={{
                fontSize: 9,
                fontFamily: "ui-monospace, monospace",
                fontWeight: 600,
                padding: "1px 6px",
                borderRadius: 3,
                background: "var(--canvas)",
                border: "1px solid var(--rule)",
                color: label === "true" ? "var(--verified)" : label === "false" ? "var(--danger)" : "var(--ink-muted)",
              }}
            >
              {label as string}
            </span>
          </div>
        </foreignObject>
      )}
    </>
  );
}
