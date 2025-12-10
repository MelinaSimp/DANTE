// app/gigaai/EvaluationData.tsx
// Overall company analytics component

"use client";

import { useState, useEffect } from "react";
import { useTheme } from "./ThemeProvider";
import { CompanyAnalytics } from "@/app/api/evaluations/data/route";
import { TrendingUp, Phone, MessageSquare, Users, Clock, BarChart3 } from "lucide-react";

export default function EvaluationData() {
  const { colors } = useTheme();
  const [analytics, setAnalytics] = useState<CompanyAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAnalytics();
  }, []);

  async function loadAnalytics() {
    try {
      setLoading(true);
      const response = await fetch("/api/evaluations/data");
      if (!response.ok) throw new Error("Failed to load analytics");
      const data = await response.json();
      setAnalytics(data);
    } catch (error) {
      console.error("Error loading analytics:", error);
    } finally {
      setLoading(false);
    }
  }

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat().format(num);
  };

  const formatPercentage = (num: number) => {
    return `${num.toFixed(1)}%`;
  };

  const formatDuration = (seconds: number) => {
    if (seconds === 0) return "N/A";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  if (loading) {
    return (
      <div className={`h-full flex items-center justify-center ${colors.bg}`}>
        <div className={`text-center ${colors.textTertiary} text-sm`}>
          Loading analytics...
        </div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className={`h-full flex items-center justify-center ${colors.bg}`}>
        <div className={`text-center ${colors.textTertiary} text-sm`}>
          Failed to load analytics
        </div>
      </div>
    );
  }

  return (
    <div className={`h-full overflow-y-auto ${colors.bg} p-6`}>
      <div className="max-w-6xl mx-auto">
        <h2 className={`text-2xl font-semibold ${colors.text} mb-6`}>Analytics</h2>

        {/* Key Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {/* Total Conversations */}
          <div className={`rounded-xl border ${colors.border} ${colors.cardBg} p-6`}>
            <div className="flex items-center justify-between mb-2">
              <div className={`text-sm ${colors.textTertiary}`}>Total Conversations</div>
              <MessageSquare className={`h-5 w-5 ${colors.iconSecondary}`} />
            </div>
            <div className={`text-3xl font-bold ${colors.text}`}>
              {formatNumber(analytics.totalConversations)}
            </div>
          </div>

          {/* Active Customers */}
          <div className={`rounded-xl border ${colors.border} ${colors.cardBg} p-6`}>
            <div className="flex items-center justify-between mb-2">
              <div className={`text-sm ${colors.textTertiary}`}>Active Customers</div>
              <Users className={`h-5 w-5 ${colors.iconSecondary}`} />
            </div>
            <div className={`text-3xl font-bold ${colors.text}`}>
              {formatNumber(analytics.activeCustomers.current)}
            </div>
            <div className={`text-xs ${colors.textTertiary} mt-1`}>
              {analytics.activeCustomers.inquiry} Inquiry, {analytics.activeCustomers.past} Past
            </div>
          </div>

          {/* AI Response Ratio */}
          <div className={`rounded-xl border ${colors.border} ${colors.cardBg} p-6`}>
            <div className="flex items-center justify-between mb-2">
              <div className={`text-sm ${colors.textTertiary}`}>AI Response Rate</div>
              <TrendingUp className={`h-5 w-5 ${colors.iconSecondary}`} />
            </div>
            <div className={`text-3xl font-bold ${colors.text}`}>
              {formatPercentage(analytics.responseMetrics.aiResponseRatio)}
            </div>
          </div>

          {/* Average Call Duration */}
          <div className={`rounded-xl border ${colors.border} ${colors.cardBg} p-6`}>
            <div className="flex items-center justify-between mb-2">
              <div className={`text-sm ${colors.textTertiary}`}>Avg Call Duration</div>
              <Clock className={`h-5 w-5 ${colors.iconSecondary}`} />
            </div>
            <div className={`text-3xl font-bold ${colors.text}`}>
              {formatDuration(analytics.callMetrics.averageDuration)}
            </div>
          </div>
        </div>

        {/* Detailed Metrics */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Customer Status Breakdown */}
          <div className={`rounded-xl border ${colors.border} ${colors.cardBg} p-6`}>
            <h3 className={`text-lg font-semibold ${colors.text} mb-4`}>Customer Status</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-orange-500"></div>
                  <span className={colors.text}>Inquiry</span>
                </div>
                <span className={`font-medium ${colors.text}`}>
                  {formatNumber(analytics.activeCustomers.inquiry)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                  <span className={colors.text}>Current</span>
                </div>
                <span className={`font-medium ${colors.text}`}>
                  {formatNumber(analytics.activeCustomers.current)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-gray-500"></div>
                  <span className={colors.text}>Past</span>
                </div>
                <span className={`font-medium ${colors.text}`}>
                  {formatNumber(analytics.activeCustomers.past)}
                </span>
              </div>
            </div>
          </div>

          {/* Response Metrics */}
          <div className={`rounded-xl border ${colors.border} ${colors.cardBg} p-6`}>
            <h3 className={`text-lg font-semibold ${colors.text} mb-4`}>Response Metrics</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className={colors.textSecondary}>AI Responses</span>
                <span className={`font-medium ${colors.text}`}>
                  {formatPercentage(analytics.responseMetrics.aiResponseRatio)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className={colors.textSecondary}>Human Responses</span>
                <span className={`font-medium ${colors.text}`}>
                  {formatPercentage(analytics.responseMetrics.humanResponseRatio)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className={colors.textSecondary}>Avg Response Time</span>
                <span className={`font-medium ${colors.text}`}>
                  {analytics.responseMetrics.averageResponseTime > 0
                    ? `${analytics.responseMetrics.averageResponseTime}s`
                    : "N/A"}
                </span>
              </div>
            </div>
          </div>

          {/* Call Metrics */}
          <div className={`rounded-xl border ${colors.border} ${colors.cardBg} p-6`}>
            <h3 className={`text-lg font-semibold ${colors.text} mb-4`}>Call Metrics</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className={colors.textSecondary}>Total Calls</span>
                <span className={`font-medium ${colors.text}`}>
                  {formatNumber(analytics.callMetrics.totalCalls)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className={colors.textSecondary}>Success Rate</span>
                <span className={`font-medium ${colors.text}`}>
                  {formatPercentage(analytics.callMetrics.successRate)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className={colors.textSecondary}>Average Duration</span>
                <span className={`font-medium ${colors.text}`}>
                  {formatDuration(analytics.callMetrics.averageDuration)}
                </span>
              </div>
            </div>
          </div>

          {/* Peak Activity */}
          <div className={`rounded-xl border ${colors.border} ${colors.cardBg} p-6`}>
            <h3 className={`text-lg font-semibold ${colors.text} mb-4`}>Peak Activity</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className={colors.textSecondary}>Busiest Hour</span>
                <span className={`font-medium ${colors.text}`}>
                  {analytics.peakActivity.busiestHour}:00
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className={colors.textSecondary}>Busiest Day</span>
                <span className={`font-medium ${colors.text}`}>
                  {analytics.peakActivity.busiestDay}
                </span>
              </div>
            </div>
          </div>

          {/* Customer Growth */}
          <div className={`rounded-xl border ${colors.border} ${colors.cardBg} p-6`}>
            <h3 className={`text-lg font-semibold ${colors.text} mb-4`}>Customer Growth</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className={colors.textSecondary}>Last 7 Days</span>
                <span className={`font-medium ${colors.text}`}>
                  {formatNumber(analytics.customerGrowth.newCustomersLast7Days)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className={colors.textSecondary}>Last 30 Days</span>
                <span className={`font-medium ${colors.text}`}>
                  {formatNumber(analytics.customerGrowth.newCustomersLast30Days)}
                </span>
              </div>
            </div>
          </div>

          {/* AI Performance */}
          <div className={`rounded-xl border ${colors.border} ${colors.cardBg} p-6`}>
            <h3 className={`text-lg font-semibold ${colors.text} mb-4`}>AI Performance</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className={colors.textSecondary}>Handled by AI</span>
                <span className={`font-medium ${colors.text}`}>
                  {formatPercentage(analytics.aiPerformance.handledByAI)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className={colors.textSecondary}>Escalation Rate</span>
                <span className={`font-medium ${colors.text}`}>
                  {formatPercentage(analytics.aiPerformance.escalationRate)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}





