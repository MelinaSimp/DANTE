"use client";

import { useDeployment } from "./DeploymentProvider";
import { ReactNode } from "react";

interface ReadOnlyWrapperProps {
  children: ReactNode;
  fallback?: ReactNode;
}

export function ReadOnlyWrapper({ children, fallback }: ReadOnlyWrapperProps) {
  const { isDeployed } = useDeployment();

  if (isDeployed) {
    return (
      <div className="relative">
        <div className="pointer-events-none opacity-50 select-none">
          {children}
        </div>
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-sm rounded-lg">
          <div className="bg-black/80 border border-white/20 rounded-lg px-4 py-3 text-center">
            <p className="text-white font-medium">Deployment in progress</p>
            <p className="text-white/60 text-sm mt-1">Changes are locked during deployment</p>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}




