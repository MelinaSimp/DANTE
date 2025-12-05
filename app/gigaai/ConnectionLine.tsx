// Blocky connection line component for workflow builder
// Creates structured paths with sharp corners (blocky style) that can connect from any side
// 
// LINE LENGTHS EXPLANATION:
// - The `length` prop controls the vertical distance between steps
// - Different lengths create spacing between workflow steps
// - Default is 32px, but can be adjusted based on step spacing needs
//
// BLOCKY STYLE EXPLANATION:
// - "Blocky" means rectangular paths with sharp 90-degree corners (not smooth curves)
// - Uses `strokeLinejoin="miter"` for sharp corners
// - Creates structured, organized-looking connections
// - Can have slight rounded corners on the line caps for a polished look
//
// CURVED BUT BLOCKY:
// - The lines can "curve" around by using L-shaped paths (horizontal then vertical)
// - But the corners remain sharp/blocky, not smooth Bezier curves
// - This creates a structured, flowchart-like appearance

"use client";

interface ConnectionLineProps {
  from?: "top" | "bottom" | "left" | "right";
  to?: "top" | "bottom" | "left" | "right";
  length?: number; // Vertical/horizontal length in pixels (controls spacing between steps)
  horizontalOffset?: number; // For branch paths that go left/right first
  color?: string;
  strokeWidth?: number;
  className?: string;
}

export default function ConnectionLine({ 
  from = "bottom", 
  to = "top", 
  length = 32, 
  horizontalOffset = 0, 
  color = "#70d4b4",
  strokeWidth = 2,
  className = ""
}: ConnectionLineProps) {
  // Calculate path based on connection sides
  let pathData = "";
  let svgWidth = Math.max(strokeWidth, 4); // Minimum 4px width for clean rendering
  let svgHeight = length;
  let arrowX = svgWidth / 2;
  let arrowY = length;
  
  if (from === "bottom" && to === "top") {
    // Straight vertical connection for regular steps
    if (horizontalOffset === 0) {
      // Perfectly straight vertical line for regular connections
      const centerX = svgWidth / 2;
      pathData = `M ${centerX} 0 L ${centerX} ${length}`;
      arrowX = centerX;
      arrowY = length;
    } else {
      // Curved path with smooth corners when there's a horizontal offset
      const maxWidth = Math.abs(horizontalOffset) + strokeWidth * 2;
      svgWidth = maxWidth;
      const centerX = maxWidth / 2;
      // Smooth curved path with rounded corners
      pathData = `M ${centerX} 0 C ${centerX} ${length * 0.25}, ${centerX + horizontalOffset * 0.3} ${length * 0.5}, ${centerX + horizontalOffset * 0.7} ${length * 0.75} C ${centerX + horizontalOffset * 0.85} ${length * 0.9}, ${centerX + horizontalOffset * 0.95} ${length * 0.98}, ${centerX + horizontalOffset} ${length}`;
      arrowX = centerX + horizontalOffset;
      arrowY = length;
    }
  } else if (from === "left" && to === "top") {
    // Branch path: smooth curved path from left
    const horizontalLength = horizontalOffset || 40;
    svgWidth = horizontalLength + strokeWidth * 2;
    const startX = 0;
    const endX = horizontalLength;
    // Smooth curved path
    pathData = `M ${startX} ${strokeWidth} C ${startX + horizontalLength * 0.3} ${strokeWidth}, ${endX - horizontalLength * 0.1} ${length * 0.4}, ${endX} ${length}`;
    arrowX = endX;
    arrowY = length;
  } else if (from === "right" && to === "top") {
    // Branch path: smooth curved path from right
    const horizontalLength = horizontalOffset || 40;
    svgWidth = horizontalLength + strokeWidth * 2;
    const startX = svgWidth;
    const endX = svgWidth - horizontalLength;
    // Smooth curved path
    pathData = `M ${startX} ${strokeWidth} C ${startX - horizontalLength * 0.3} ${strokeWidth}, ${endX + horizontalLength * 0.1} ${length * 0.4}, ${endX} ${length}`;
    arrowX = endX;
    arrowY = length;
  } else {
    // Default: straight vertical line
    pathData = `M ${svgWidth / 2} 0 L ${svgWidth / 2} ${length}`;
    arrowX = svgWidth / 2;
    arrowY = length;
  }
  
  return (
    <svg 
      className={`absolute left-1/2 transform -translate-x-1/2 ${className}`}
      style={{ 
        width: svgWidth,
        height: svgHeight,
        pointerEvents: "none"
      }}
      viewBox={`0 0 ${svgWidth} ${svgHeight}`}
      preserveAspectRatio="none"
    >
      {/* Main line path - smooth style with rounded corners */}
      <path
        d={pathData}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round" // Rounded ends for polish
        strokeLinejoin="round" // Rounded corners for smooth style
        fill="none"
      />
      {/* Arrowhead at the end pointing down */}
      {to === "top" && (
        <path
          d={`M ${arrowX} ${arrowY - 2} L ${arrowX - 4} ${arrowY - 10} L ${arrowX + 4} ${arrowY - 10} Z`}
          fill={color}
        />
      )}
    </svg>
  );
}


