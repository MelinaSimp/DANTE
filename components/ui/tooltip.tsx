"use client";

import { useState, useRef, useEffect } from "react";

interface TooltipProps {
  content: string;
  children: React.ReactNode;
  position?: "top" | "bottom" | "left" | "right";
  delay?: number;
}

export function Tooltip({ 
  content, 
  children, 
  position = "top",
  delay = 200 
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  let timeoutId: NodeJS.Timeout | null = null;

  const showTooltip = () => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        const tooltipRect = tooltipRef.current?.getBoundingClientRect();
        
        let top = 0;
        let left = 0;
        
        switch (position) {
          case "top":
            top = rect.top - (tooltipRect?.height || 0) - 8;
            left = rect.left + rect.width / 2 - (tooltipRect?.width || 0) / 2;
            break;
          case "bottom":
            top = rect.bottom + 8;
            left = rect.left + rect.width / 2 - (tooltipRect?.width || 0) / 2;
            break;
          case "left":
            top = rect.top + rect.height / 2 - (tooltipRect?.height || 0) / 2;
            left = rect.left - (tooltipRect?.width || 0) - 8;
            break;
          case "right":
            top = rect.top + rect.height / 2 - (tooltipRect?.height || 0) / 2;
            left = rect.right + 8;
            break;
        }
        
        setTooltipPosition({ top, left });
        setIsVisible(true);
      }
    }, delay);
  };

  const hideTooltip = () => {
    if (timeoutId) clearTimeout(timeoutId);
    setIsVisible(false);
  };

  useEffect(() => {
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  return (
    <div 
      ref={triggerRef}
      className="relative inline-block"
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onFocus={showTooltip}
      onBlur={hideTooltip}
    >
      {children}
      {isVisible && (
        <div
          ref={tooltipRef}
          className="fixed z-50 px-3 py-1.5 text-xs text-white bg-gray-900 rounded-lg shadow-lg pointer-events-none whitespace-nowrap"
          style={{
            top: `${tooltipPosition.top}px`,
            left: `${tooltipPosition.left}px`,
          }}
        >
          {content}
          <div
            className={`absolute w-2 h-2 bg-gray-900 transform rotate-45 ${
              position === "top" ? "bottom-[-4px] left-1/2 -translate-x-1/2" :
              position === "bottom" ? "top-[-4px] left-1/2 -translate-x-1/2" :
              position === "left" ? "right-[-4px] top-1/2 -translate-y-1/2" :
              "left-[-4px] top-1/2 -translate-y-1/2"
            }`}
          />
        </div>
      )}
    </div>
  );
}



