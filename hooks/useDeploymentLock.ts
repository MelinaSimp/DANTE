"use client";

import { useDeployment } from "@/components/DeploymentProvider";

/**
 * Hook to check if deployment is active and UI should be locked
 */
export function useDeploymentLock() {
  const { isDeployed } = useDeployment();
  
  return {
    isLocked: isDeployed,
    disabled: isDeployed,
    readOnly: isDeployed,
  };
}




