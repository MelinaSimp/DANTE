"use client";

import { useState, useEffect } from "react";
import { X, Send, Loader2, Play, Square, Mic, MessageSquare } from "lucide-react";
import { useTheme } from "./ThemeProvider";

interface FlowTesterProps {
  agentId: string;
  scenarioId: string;
  scenario: any;
  isOpen: boolean;
  onClose: () => void;
  agentModality?: "voice" | "chat" | "multi-modal";
}

interface TestMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  stepId?: string;
  stepName?: string;
  stepType?: string;
}

export default function FlowTester({
  agentId,
  scenarioId,
  scenario,
  isOpen,
  onClose,
  agentModality = "voice",
}: FlowTesterProps) {
  const { colors } = useTheme();
  const [messages, setMessages] = useState<TestMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentStepId, setCurrentStepId] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [executionLog, setExecutionLog] = useState<string[]>([]);
  const [gatheredData, setGatheredData] = useState<Record<string, any>>({});
  const [transcript, setTranscript] = useState<Array<{ role: "user" | "assistant"; content: string; timestamp: string }>>([]);

  useEffect(() => {
    if (isOpen && scenario) {
      // Reset state
      setMessages([]);
      setGatheredData({});
      setTranscript([]);
      setCurrentStepId(null);
      setExecutionLog([]);
      
      // Initialize with greeting if scenario has steps
      const firstStep = scenario.steps?.[0];
      if (firstStep) {
        setCurrentStepId(firstStep.id);
        setMessages([
          {
            role: "system",
            content: `Starting test for ${agentModality === "voice" ? "voice" : "chat"} agent - Scenario: ${scenario.name}`,
            timestamp: new Date(),
          },
        ]);
        setExecutionLog([
          `Test started for scenario: ${scenario.name}`,
          `Agent modality: ${agentModality}`,
          `Initial step: ${firstStep.name || firstStep.type} (${firstStep.id})`,
        ]);
      } else {
        setMessages([
          {
            role: "system",
            content: `Starting test flow for scenario: ${scenario.name}`,
            timestamp: new Date(),
          },
        ]);
        setExecutionLog([`Test started for scenario: ${scenario.name}`]);
      }
    }
  }, [isOpen, scenario, agentModality]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userInput = input.trim();
    const userMessage: TestMessage = {
      role: "user",
      content: userInput,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);
    setIsRunning(true);

    // Add to transcript
    const newTranscript = [...transcript, { role: "user" as const, content: userInput, timestamp: new Date().toISOString() }];
    setTranscript(newTranscript);

    try {
      setExecutionLog((prev) => [...prev, `User input: "${userInput}"`]);
      
      // Call the actual agent executor API
      const response = await fetch(`/api/agents/${agentId}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userInput: userInput,
          scenarioId: scenarioId,
          currentStepId: currentStepId,
          gatheredData: gatheredData,
          transcript: newTranscript,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to execute step");
      }

      const result = await response.json();
      
      setExecutionLog((prev) => [
        ...prev,
        `Step executed: ${result.success ? "Success" : "Failed"}`,
        result.nextStepId ? `Next step: ${result.nextStepId}` : "No next step",
        result.gatheredData ? `Gathered data: ${JSON.stringify(result.gatheredData)}` : "",
      ]);

      // Update gathered data
      if (result.gatheredData) {
        setGatheredData(result.gatheredData);
      }

      // Update current step
      if (result.nextStepId) {
        setCurrentStepId(result.nextStepId);
      } else if (result.nextScenarioId) {
        setExecutionLog((prev) => [...prev, `Switching to scenario: ${result.nextScenarioId}`]);
        setCurrentStepId(null);
      } else {
        setCurrentStepId(null);
      }

      // Add assistant response
      if (result.output) {
        const assistantMessage: TestMessage = {
          role: "assistant",
          content: result.output,
          timestamp: new Date(),
          stepId: result.nextStepId || currentStepId,
        };

        setMessages((prev) => [...prev, assistantMessage]);
        
        // Add to transcript
        setTranscript((prev) => [
          ...prev,
          { role: "assistant", content: result.output, timestamp: new Date().toISOString() },
        ]);

        if (!result.shouldContinue) {
          setExecutionLog((prev) => [...prev, "Conversation ended"]);
        }
      } else if (result.error) {
        const errorMessage: TestMessage = {
          role: "system",
          content: `Error: ${result.error}`,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errorMessage]);
      }
    } catch (error) {
      console.error("Test execution error:", error);
      setMessages((prev) => [
        ...prev,
        {
          role: "system",
          content: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
          timestamp: new Date(),
        },
      ]);
      setExecutionLog((prev) => [...prev, `Error: ${error instanceof Error ? error.message : "Unknown error"}`]);
    } finally {
      setLoading(false);
      setIsRunning(false);
    }
  };

  const handleReset = () => {
    setMessages([]);
    setInput("");
    setCurrentStepId(null);
    setExecutionLog([]);
    setIsRunning(false);
    setGatheredData({});
    setTranscript([]);
    
    // Re-initialize
    const firstStep = scenario.steps?.[0];
    if (firstStep) {
      setCurrentStepId(firstStep.id);
      setMessages([
        {
          role: "system",
          content: `Test reset - Starting flow for scenario: ${scenario.name}`,
          timestamp: new Date(),
        },
      ]);
      setExecutionLog([
        `Test reset for scenario: ${scenario.name}`,
        `Initial step: ${firstStep.name || firstStep.type}`,
      ]);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className={`${colors.bg} ${colors.border} border rounded-3xl shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col`}>
        {/* Header */}
        <div className={`flex items-center justify-between p-6 border-b ${colors.border}`}>
          <div>
            <div className="flex items-center gap-2">
              {agentModality === "voice" ? (
                <Mic className="h-5 w-5 text-cyan-400" />
              ) : (
                <MessageSquare className="h-5 w-5 text-cyan-400" />
              )}
              <h2 className={`text-xl font-semibold ${colors.text}`}>Test {agentModality === "voice" ? "Voice" : "Chat"} Agent</h2>
            </div>
            <p className={`text-sm ${colors.textSecondary}`}>Simulate conversation flow - Scenario: {scenario.name}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleReset}
              className={`px-3 py-1.5 ${colors.cardBg} ${colors.border} border rounded-xl ${colors.textSecondary} hover:${colors.hover} transition text-sm`}
            >
              Reset
            </button>
            <button
              onClick={onClose}
              className={`p-2 ${colors.hover} rounded-lg transition`}
            >
              <X className={`h-5 w-5 ${colors.iconSecondary}`} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex">
          {/* Chat Area */}
          <div className="flex-1 flex flex-col border-r border-white/10">
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex gap-3 ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  {message.role === "assistant" && (
                    <div className="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center flex-shrink-0">
                      {agentModality === "voice" ? (
                        <Mic className="h-4 w-4 text-cyan-400" />
                      ) : (
                        <MessageSquare className="h-4 w-4 text-cyan-400" />
                      )}
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] rounded-3xl px-4 py-3 ${
                      message.role === "user"
                        ? "bg-cyan-600 text-white"
                        : message.role === "system"
                        ? "bg-white/5 text-white/60 text-xs"
                        : "bg-white/10 text-white border border-white/20"
                    }`}
                  >
                    <div className="whitespace-pre-wrap break-words">{message.content}</div>
                    {message.stepId && message.role === "assistant" && (
                      <div className="text-xs text-white/50 mt-2">
                        Step ID: {message.stepId.substring(0, 8)}...
                      </div>
                    )}
                    <div className="text-xs text-white/40 mt-1">
                      {message.timestamp.toLocaleTimeString()}
                    </div>
                  </div>
                  {message.role === "user" && (
                    <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-white text-xs">You</span>
                    </div>
                  )}
                </div>
              ))}
              {loading && (
                <div className="flex gap-3 justify-start">
                  <div className="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center">
                    <Loader2 className="h-4 w-4 text-cyan-400 animate-spin" />
                  </div>
                  <div className="bg-white/10 text-white border border-white/20 rounded-2xl px-4 py-3">
                    Processing...
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div className={`p-4 border-t ${colors.border}`}>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSend();
                }}
                className="flex gap-2"
              >
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={agentModality === "voice" ? "Type what you would say to the voice agent..." : "Type a message to test the flow..."}
                  className={`flex-1 ${colors.cardBg} ${colors.border} border rounded-xl px-4 py-2 ${colors.text} placeholder:${colors.textTertiary} focus:outline-none focus:ring-2 focus:ring-cyan-500/50`}
                  disabled={loading}
                />
                <button
                  type="submit"
                  disabled={!input.trim() || loading}
                  className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl transition"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </button>
              </form>
            </div>
          </div>

          {/* Execution Log */}
          <div className="w-80 flex flex-col border-l border-white/10">
            <div className={`p-4 border-b ${colors.border}`}>
              <h3 className={`font-semibold ${colors.text} text-sm`}>Execution Log</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {executionLog.map((log, index) => (
                <div key={index} className={`text-xs ${colors.textTertiary} font-mono`}>
                  {log}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

