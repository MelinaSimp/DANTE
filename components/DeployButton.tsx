"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Rocket, X, Loader2 } from "lucide-react";
import { toast } from "@/components/ui/toast";

interface DeploymentStatus {
  status: "idle" | "deploying" | "deployed" | "cancelled" | "failed";
  isDeployed: boolean;
  startedAt?: string;
  cancelledAt?: string;
  error?: string;
}

export default function DeployButton() {
  const [deploymentStatus, setDeploymentStatus] = useState<DeploymentStatus>({
    status: "idle",
    isDeployed: false,
  });
  const [loading, setLoading] = useState(false);

  // Poll for deployment status
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await fetch("/api/deploy/status");
        if (response.ok) {
          const data = await response.json();
          setDeploymentStatus(data);
        }
      } catch (error) {
        console.error("Error fetching deployment status:", error);
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 3000); // Poll every 3 seconds

    return () => clearInterval(interval);
  }, []);

  const handleDeploy = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/deploy", {
        method: "POST",
      });

      const data = await response.json();
      if (response.ok) {
        setDeploymentStatus({
          status: "deploying",
          isDeployed: true,
        });
      } else {
        toast.error("Failed to start deployment", data.error);
      }
    } catch (error: any) {
      toast.error("Failed to start deployment", error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/deploy/cancel", {
        method: "POST",
      });

      const data = await response.json();
      if (response.ok) {
        setDeploymentStatus({
          status: "cancelled",
          isDeployed: false,
        });
      } else {
        toast.error("Failed to cancel deployment", data.error);
      }
    } catch (error: any) {
      toast.error("Failed to cancel deployment", error.message);
    } finally {
      setLoading(false);
    }
  };

  const isDeployed = deploymentStatus.isDeployed || deploymentStatus.status === "deploying";

  return (
    <div className="flex items-center gap-3">
      {isDeployed ? (
        <>
          <div className="flex items-center gap-2 text-sm text-white/70">
            {deploymentStatus.status === "deploying" && (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
                <span>Deploying... Changes locked</span>
              </>
            )}
            {deploymentStatus.status === "deployed" && (
              <>
                <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                <span>Deployed - Changes locked</span>
              </>
            )}
            {deploymentStatus.status === "failed" && (
              <>
                <div className="h-2 w-2 rounded-full bg-red-500" />
                <span>Deployment failed</span>
              </>
            )}
          </div>
          <Button
            onClick={handleCancel}
            disabled={loading}
            variant="secondary"
            className="gap-2 border-red-500/50 text-red-400 hover:bg-red-500/10"
          >
            <X className="h-4 w-4" />
            Cancel Deploy
          </Button>
        </>
      ) : (
        <Button
          onClick={handleDeploy}
          disabled={loading}
          className="gap-2 bg-[#3351ff] hover:bg-[#4a64ff]"
        >
          <Rocket className="h-4 w-4" />
          {loading ? "Starting..." : "Deploy"}
        </Button>
      )}
    </div>
  );
}

