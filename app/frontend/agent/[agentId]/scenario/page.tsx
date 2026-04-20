// app/frontend/agent/[agentId]/scenario/page.tsx - Scenario Visualization
"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";

interface Step {
  id: string;
  name: string;
  type: string;
  sort_order: number;
  ai_message?: string;
  code?: string;
}

interface Branch {
  id: string;
  condition: string;
  condition_tag?: string;
  next_step_id?: string;
  next_scenario_id?: string;
  target?: string;
}

interface Scenario {
  id: string;
  name: string;
  description?: string;
}

interface StepNode {
  step: Step;
  x: number;
  y: number;
  branches: Branch[];
  width: number;
  height: number;
}

// Generate random gradient colors if not set
function generateGradientColor(seed: string): string {
  const colors = [
    ["#FF6B6B", "#4ECDC4", "#45B7D1"],
    ["#A8E6CF", "#FFD93D", "#FF6B9D"],
    ["#C471ED", "#F64F59", "#FBD786"],
    ["#30E8BF", "#FF8235", "#FF6E7F"],
    ["#667EEA", "#764BA2", "#F093FB"],
    ["#F093FB", "#F5576C", "#4FACFE"],
    ["#43E97B", "#38F9D7", "#667EEA"],
    ["#FA709A", "#FEE140", "#30CFC0"],
  ];
  const index = seed.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;
  return JSON.stringify(colors[index]);
}

// Layout algorithm - creates a hierarchical tree layout
function calculateLayout(
  steps: Step[],
  branches: Record<string, Branch[]>,
  stepMap: Map<string, Step>
): StepNode[] {
  const nodeWidth = 320;
  const baseHeight = 100;
  const horizontalSpacing = 400;
  const verticalSpacing = 250;
  const startX = 150;
  const startY = 150;

  const nodes: StepNode[] = [];
  const nodeMap = new Map<string, StepNode>();

  // Build graph structure
  const graph = new Map<string, string[]>();
  const reverseGraph = new Map<string, string[]>();

  steps.forEach((step) => {
    graph.set(step.id, []);
    reverseGraph.set(step.id, []);
  });

  // Add connections based on sort_order and branches
  const sortedSteps = [...steps].sort((a, b) => a.sort_order - b.sort_order);
  
  for (let i = 0; i < sortedSteps.length - 1; i++) {
    const current = sortedSteps[i];
    const next = sortedSteps[i + 1];
    graph.get(current.id)!.push(next.id);
    reverseGraph.get(next.id)!.push(current.id);
  }

  // Add branch connections
  sortedSteps.forEach((step) => {
    const stepBranches = branches[step.id] || [];
    stepBranches.forEach((branch) => {
      if (branch.next_step_id) {
        graph.get(step.id)!.push(branch.next_step_id);
        reverseGraph.get(branch.next_step_id)!.push(step.id);
      }
    });
  });

  // BFS to assign levels
  const levels: string[][] = [];
  const levelMap = new Map<string, number>();
  const queue: string[] = [];
  
  // Find root nodes (nodes with no incoming edges from sort_order)
  const rootNodes = sortedSteps.filter((step) => {
    const incoming = reverseGraph.get(step.id) || [];
    return incoming.length === 0 || step.sort_order === 0;
  });

  if (rootNodes.length === 0 && sortedSteps.length > 0) {
    queue.push(sortedSteps[0].id);
  } else {
    rootNodes.forEach((root) => queue.push(root.id));
  }

  let currentLevel = 0;
  while (queue.length > 0) {
    const levelSize = queue.length;
    const currentLevelNodes: string[] = [];

    for (let i = 0; i < levelSize; i++) {
      const nodeId = queue.shift()!;
      if (levelMap.has(nodeId)) continue;

      levelMap.set(nodeId, currentLevel);
      currentLevelNodes.push(nodeId);

      const children = graph.get(nodeId) || [];
      children.forEach((childId) => {
        if (!levelMap.has(childId)) {
          queue.push(childId);
        }
      });
    }

    if (currentLevelNodes.length > 0) {
      levels.push(currentLevelNodes);
    }
    currentLevel++;
  }

  // Position nodes based on levels
  levels.forEach((levelNodes, levelIndex) => {
    const y = startY + levelIndex * verticalSpacing;
    const levelWidth = levelNodes.length * horizontalSpacing;
    const startXForLevel = startX + (Math.max(...levels.map(l => l.length)) - levelNodes.length) * horizontalSpacing / 2;

    levelNodes.forEach((nodeId, nodeIndex) => {
      const step = stepMap.get(nodeId)!;
      const stepBranches = branches[nodeId] || [];
      
      // Calculate node height based on content
      let height = baseHeight;
      if (step.ai_message) height += 30;
      if (step.code) height += 30;
      if (stepBranches.length > 0) height += stepBranches.length * 35 + 20;

      const x = startXForLevel + nodeIndex * horizontalSpacing;
      
      const node: StepNode = {
        step,
        x,
        y,
        branches: stepBranches,
        width: nodeWidth,
        height,
      };

      nodes.push(node);
      nodeMap.set(nodeId, node);
    });
  });

  return nodes;
}

export default function ScenarioVisualizationPage() {
  const router = useRouter();
  const params = useParams();
  const agentId = (params?.agentId ?? "") as string;
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [selectedScenario, setSelectedScenario] = useState<Scenario | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [branches, setBranches] = useState<Record<string, Branch[]>>({});
  const [agent, setAgent] = useState<{ gradient_color?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [nodes, setNodes] = useState<StepNode[]>([]);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    async function loadData() {
      try {
        // Load agent
        const agentResponse = await fetch(`/api/agents/${agentId}`);
        if (agentResponse.ok) {
          const agentData = await agentResponse.json();
          setAgent({
            gradient_color: agentData.gradient_color || generateGradientColor(agentId),
          });
        }

        // Load scenarios
        const response = await fetch(`/api/agents/${agentId}/scenarios`);
        if (response.ok) {
          const scenariosData = await response.json();
          setScenarios(scenariosData);
          if (scenariosData.length > 0) {
            setSelectedScenario(scenariosData[0]);
          }
        }
      } catch (error) {
        console.error("Failed to load data:", error);
      } finally {
        setLoading(false);
      }
    }
    if (agentId) {
      loadData();
    }
  }, [agentId]);

  useEffect(() => {
    async function loadSteps() {
      if (!selectedScenario) return;

      try {
        const response = await fetch(`/api/scenarios/${selectedScenario.id}/steps`);
        if (response.ok) {
          const stepsData = await response.json();
          setSteps(stepsData || []);

          // Load branches for each step
          const branchesMap: Record<string, Branch[]> = {};
          for (const step of stepsData) {
            const branchesResponse = await fetch(`/api/steps/${step.id}/branches`);
            if (branchesResponse.ok) {
              const branchesData = await branchesResponse.json();
              branchesMap[step.id] = branchesData || [];
            }
          }
          setBranches(branchesMap);
        }
      } catch (error) {
        console.error("Failed to load steps:", error);
      }
    }
    loadSteps();
  }, [selectedScenario]);

  // Calculate layout when steps or branches change
  useEffect(() => {
    if (steps.length === 0) {
      setNodes([]);
      return;
    }

    const stepMap = new Map<string, Step>();
    steps.forEach((step) => stepMap.set(step.id, step));

    const layoutNodes = calculateLayout(steps, branches, stepMap);
    setNodes(layoutNodes);
  }, [steps, branches]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-light text-black mb-4">Agent not found</h1>
          <button
            onClick={() => router.push("/frontend")}
            className="px-6 py-3 rounded-2xl bg-black text-white hover:bg-gray-800 transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const gradientColors = JSON.parse(agent.gradient_color || generateGradientColor(agentId)) as string[];

  // Get step type display
  const getStepTypeDisplay = (type: string) => {
    const typeMap: Record<string, string> = {
      say: "Say",
      gather: "Gather",
      code: "Code",
      api_call: "API Call",
      condition: "Condition",
      if: "If",
      schedule: "Schedule",
      qa: "Q&A",
      loop: "Loop",
    };
    return typeMap[type] || type;
  };

  // Find step by ID
  const findStepById = (stepId: string) => {
    return steps.find((s) => s.id === stepId);
  };

  // Find node by step ID
  const findNodeByStepId = (stepId: string) => {
    return nodes.find((n) => n.step.id === stepId);
  };

  // Calculate canvas dimensions
  const maxX = nodes.length > 0 ? Math.max(...nodes.map(n => n.x + n.width)) + 200 : 2000;
  const maxY = nodes.length > 0 ? Math.max(...nodes.map(n => n.y + n.height)) + 200 : 1500;

  return (
    <div className="min-h-screen bg-white">
      <div className="w-full h-screen flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 px-8 py-4 border-b-2 border-black bg-white">
          <div className="flex items-center justify-between mb-3 relative">
            <button
              onClick={() => router.push("/agent")}
              className="text-gray-400 hover:text-black transition-colors text-sm"
            >
              ← Back
            </button>
            <h1 className="text-2xl font-light text-black absolute left-1/2 transform -translate-x-1/2">Scenario Flow</h1>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setZoom(Math.max(0.5, zoom - 0.1))}
                className="px-3 py-1 rounded-lg border-2 border-black text-sm hover:bg-gray-50"
              >
                −
              </button>
              <span className="text-sm text-gray-600 min-w-[60px] text-center">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={() => setZoom(Math.min(2, zoom + 0.1))}
                className="px-3 py-1 rounded-lg border-2 border-black text-sm hover:bg-gray-50"
              >
                +
              </button>
            </div>
          </div>

          {/* Scenario Selector */}
          {scenarios.length > 1 && (
            <div className="flex gap-2">
              {scenarios.map((scenario) => (
                <button
                  key={scenario.id}
                  onClick={() => setSelectedScenario(scenario)}
                  className={`px-3 py-1.5 rounded-lg border-2 transition-all text-xs ${
                    selectedScenario?.id === scenario.id
                      ? "border-black bg-black text-white"
                      : "border-black bg-white text-black hover:bg-gray-50"
                  }`}
                >
                  {scenario.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Flowchart Canvas */}
        <div 
          className="flex-1 relative overflow-auto bg-white" 
          style={{ cursor: "grab" }}
        >
          {selectedScenario && (
            <div className="flex justify-center items-start pt-12">
              <div 
                className="relative"
                style={{ 
                  width: `${maxX}px`, 
                  height: `${maxY}px`,
                  transform: `scale(${zoom})`,
                  transformOrigin: "top center"
                }}
              >
              {/* SVG for connections - render behind nodes */}
              <svg
                className="absolute pointer-events-none z-0"
                style={{ 
                  width: `${maxX}px`, 
                  height: `${maxY}px`,
                  left: 0,
                  top: 0
                }}
              >
                {/* Sequential connections */}
                {nodes.map((node, index) => {
                  const sortedSteps = [...steps].sort((a, b) => a.sort_order - b.sort_order);
                  const currentIndex = sortedSteps.findIndex(s => s.id === node.step.id);
                  const nextStep = sortedSteps[currentIndex + 1];
                  
                  if (!nextStep) return null;
                  
                  const nextNode = findNodeByStepId(nextStep.id);
                  if (!nextNode) return null;

                  // Draw line from bottom of current to top of next
                  const x1 = node.x + node.width / 2;
                  const y1 = node.y + node.height;
                  const x2 = nextNode.x + nextNode.width / 2;
                  const y2 = nextNode.y;

                  return (
                    <g key={`seq-${node.step.id}-${nextStep.id}`}>
                      <line
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        stroke="#000"
                        strokeWidth="2"
                        strokeDasharray="5,5"
                        markerEnd="url(#arrowhead)"
                      />
                    </g>
                  );
                })}

                {/* Branch connections */}
                {nodes.map((node) => {
                  return node.branches.map((branch) => {
                    if (branch.next_step_id) {
                      const targetNode = findNodeByStepId(branch.next_step_id);
                      if (!targetNode) return null;

                      const x1 = node.x + node.width / 2;
                      const y1 = node.y + node.height;
                      const x2 = targetNode.x + targetNode.width / 2;
                      const y2 = targetNode.y;

                      return (
                        <g key={`branch-${branch.id}`}>
                          <line
                            x1={x1}
                            y1={y1}
                            x2={x2}
                            y2={y2}
                            stroke="#666"
                            strokeWidth="2"
                            strokeDasharray="3,3"
                            markerEnd="url(#arrowhead-gray)"
                          />
                          {/* Branch label */}
                          <text
                            x={(x1 + x2) / 2}
                            y={(y1 + y2) / 2 - 5}
                            textAnchor="middle"
                            className="text-xs fill-gray-700 font-medium"
                            style={{ fontSize: "11px" }}
                          >
                            {branch.condition_tag || branch.condition}
                          </text>
                        </g>
                      );
                    }
                    return null;
                  });
                })}

                {/* Arrow markers */}
                <defs>
                  <marker
                    id="arrowhead"
                    markerWidth="10"
                    markerHeight="10"
                    refX="5"
                    refY="3"
                    orient="auto"
                  >
                    <polygon points="0 0, 10 3, 0 6" fill="#000" />
                  </marker>
                  <marker
                    id="arrowhead-gray"
                    markerWidth="10"
                    markerHeight="10"
                    refX="5"
                    refY="3"
                    orient="auto"
                  >
                    <polygon points="0 0, 10 3, 0 6" fill="#666" />
                  </marker>
                </defs>
              </svg>

              {/* Step Nodes */}
              {nodes.map((node, index) => {
                const sortedSteps = [...steps].sort((a, b) => a.sort_order - b.sort_order);
                const stepIndex = sortedSteps.findIndex(s => s.id === node.step.id);

                return (
                  <div
                    key={node.step.id}
                    className="absolute z-10"
                    style={{
                      left: `${node.x}px`,
                      top: `${node.y}px`,
                      width: `${node.width}px`,
                    }}
                  >
                    <div className="bg-white rounded-xl border-2 border-black shadow-lg">
                      {/* Header */}
                      <div className="px-4 py-3 border-b-2 border-black bg-white">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-8 h-8 rounded-full flex items-center justify-center text-white font-medium text-xs border-2 border-black"
                              style={{
                                background: `radial-gradient(circle, ${gradientColors[0]} 0%, ${gradientColors[1]} 50%, ${gradientColors[2]} 100%)`,
                              }}
                            >
                              {stepIndex + 1}
                            </div>
                            <h3 className="text-sm font-semibold text-black truncate max-w-[180px]">
                              {node.step.name}
                            </h3>
                          </div>
                          <span className="text-xs px-2 py-1 rounded-full bg-black text-white font-medium border-2 border-black">
                            {getStepTypeDisplay(node.step.type)}
                          </span>
                        </div>
                      </div>

                      {/* Content */}
                      <div className="px-4 py-3 space-y-2 bg-white">
                        {/* AI Message */}
                        {node.step.ai_message && (
                          <div className="text-xs">
                            <div className="text-gray-600 mb-1 font-medium">ai_message</div>
                            <div className="text-black bg-white rounded px-2 py-1 border-2 border-black font-mono text-[10px] truncate">
                              {node.step.ai_message}
                            </div>
                          </div>
                        )}

                        {/* Code */}
                        {node.step.code && (
                          <div className="text-xs">
                            <div className="text-gray-600 mb-1 font-medium">code</div>
                            <div className="text-black bg-white rounded px-2 py-1 border-2 border-black font-mono text-[10px] truncate">
                              {node.step.code}
                            </div>
                          </div>
                        )}

                        {/* Branches */}
                        {node.branches.length > 0 && (
                          <div className="pt-2 border-t-2 border-black">
                            <div className="text-xs text-gray-600 mb-2 font-medium">Branches:</div>
                            <div className="space-y-1.5">
                              {node.branches.map((branch) => (
                                <div
                                  key={branch.id}
                                  className="text-xs bg-white rounded px-2 py-1.5 border-2 border-black"
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="font-medium text-black">
                                      {branch.condition_tag || branch.condition}
                                    </span>
                                    {branch.next_step_id && (
                                      <span className="text-gray-600 text-[10px]">
                                        → {findStepById(branch.next_step_id)?.name || "Step"}
                                      </span>
                                    )}
                                    {branch.next_scenario_id && (
                                      <span className="text-gray-600 text-[10px]">→ Scenario</span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {nodes.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <div className="text-gray-400 text-lg mb-2">No steps in this scenario</div>
                    <p className="text-gray-500 text-sm">Add steps in the backend to see the flow here</p>
                  </div>
                </div>
              )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
