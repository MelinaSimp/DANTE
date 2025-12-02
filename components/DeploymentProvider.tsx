"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

interface DeploymentContextType {
  isDeployed: boolean;
  deploymentStatus: string;
  refreshStatus: () => void;
}

const DeploymentContext = createContext<DeploymentContextType>({
  isDeployed: false,
  deploymentStatus: "idle",
  refreshStatus: () => {},
});

export function DeploymentProvider({ children }: { children: ReactNode }) {
  const [isDeployed, setIsDeployed] = useState(false);
  const [deploymentStatus, setDeploymentStatus] = useState("idle");

  const refreshStatus = async () => {
    try {
      const response = await fetch("/api/deploy/status");
      if (response.ok) {
        const data = await response.json();
        setIsDeployed(data.isDeployed || false);
        setDeploymentStatus(data.status || "idle");
      }
    } catch (error) {
      console.error("Error fetching deployment status:", error);
    }
  };

  useEffect(() => {
    refreshStatus();
    const interval = setInterval(refreshStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <DeploymentContext.Provider value={{ isDeployed, deploymentStatus, refreshStatus }}>
      {children}
    </DeploymentContext.Provider>
  );
}

export function useDeployment() {
  return useContext(DeploymentContext);
}



