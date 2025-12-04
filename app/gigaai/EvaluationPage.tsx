"use client";

import { useState } from "react";
import { useTheme } from "./ThemeProvider";
import EvaluationInbox from "./EvaluationInbox";
import EvaluationData from "./EvaluationData";
import EvaluationTranscript from "./EvaluationTranscript";

interface EvaluationPageProps {
  agentId?: string;
}

type ViewType = "guests" | "data" | "transcript";

export default function EvaluationPage({ agentId }: EvaluationPageProps) {
  const { colors } = useTheme();
  const [activeView, setActiveView] = useState<ViewType>("guests");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  const handleSelectCustomer = (customerId: string) => {
    setSelectedCustomerId(customerId);
    setActiveView("transcript");
  };

  const handleBack = () => {
    setSelectedCustomerId(null);
    setActiveView("guests");
  };

  return (
    <div className={`h-full flex flex-col ${colors.bg}`}>
      {/* Top Navigation Tabs */}
      <div className={`border-b ${colors.border} px-6 bg-[#ffffff]`}>
        <div className="flex items-center gap-6">
          <button
            onClick={() => {
              setActiveView("guests");
              setSelectedCustomerId(null);
            }}
            className={`py-3 border-b-2 transition ${
              activeView === "guests"
                ? `border-[#3351ff] ${colors.text} font-medium`
                : `border-transparent ${colors.textTertiary} hover:${colors.textSecondary}`
            }`}
          >
            Guests
          </button>
          <button
            onClick={() => {
              setActiveView("data");
              setSelectedCustomerId(null);
            }}
            className={`py-3 border-b-2 transition ${
              activeView === "data"
                ? `border-[#3351ff] ${colors.text} font-medium`
                : `border-transparent ${colors.textTertiary} hover:${colors.textSecondary}`
            }`}
          >
            Data
          </button>
          {selectedCustomerId && (
            <button
              onClick={() => setActiveView("transcript")}
              className={`py-3 border-b-2 transition ${
                activeView === "transcript"
                  ? `border-[#3351ff] ${colors.text} font-medium`
                  : `border-transparent ${colors.textTertiary} hover:${colors.textSecondary}`
              }`}
            >
              Transcript
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeView === "guests" && (
          <EvaluationInbox onSelectCustomer={handleSelectCustomer} />
        )}
        {activeView === "data" && <EvaluationData />}
        {activeView === "transcript" && selectedCustomerId && (
          <EvaluationTranscript customerId={selectedCustomerId} onBack={handleBack} />
        )}
      </div>
    </div>
  );
}
