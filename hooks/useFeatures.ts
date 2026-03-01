"use client";

import { useState, useEffect } from "react";
import type { FeatureId } from "@/lib/features";

interface FeaturesState {
  features: FeatureId[];
  planStatus: string;
  loading: boolean;
  hasFeature: (feature: FeatureId) => boolean;
}

export function useFeatures(): FeaturesState {
  const [features, setFeatures] = useState<FeatureId[]>([]);
  const [planStatus, setPlanStatus] = useState("active");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/features", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setFeatures(data.enabled_features || []);
          setPlanStatus(data.plan_status || "active");
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const hasFeature = (feature: FeatureId) => features.includes(feature);

  return { features, planStatus, loading, hasFeature };
}
