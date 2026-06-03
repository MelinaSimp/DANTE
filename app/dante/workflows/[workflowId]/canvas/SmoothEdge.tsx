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
  labelStyle,
  style,
  markerEnd,
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
      <path
        id={id}
        d={edgePath}
        fill="none"
        strokeWidth={2}
        className="react-flow__edge-path"
        style={style}
        markerEnd={markerEnd as string}
      />
      {label && (
        <text>
          <textPath
            href={`#${id}`}
            startOffset="50%"
            textAnchor="middle"
            dominantBaseline="central"
            className="react-flow__edge-text"
            style={labelStyle}
            dy={-10}
          >
            {label as string}
          </textPath>
        </text>
      )}
      <foreignObject
        width={1}
        height={1}
        x={labelX}
        y={labelY}
        requiredExtensions="http://www.w3.org/1999/xhtml"
        style={{ overflow: "visible", pointerEvents: "none" }}
      />
    </>
  );
}
