"use client";

// components/ui/agent-plan.tsx
//
// Animated plan visualization — used as the "live thinking" surface
// while a Drift agent runs (chat + Deep Research + Web Scraper).
// Each Task is one iteration of the agent loop; subtasks are the
// tool calls within that iteration. Status transitions ripple
// in via framer-motion when events arrive over SSE.
//
// Adapted from a community/21st.dev component. Two changes from the
// upstream source:
//   1. Theme tokens swapped from shadcn (bg-card, text-foreground,
//      bg-secondary, etc.) to Drift's CSS vars (var(--canvas),
//      var(--ink), var(--rule), var(--ink-muted)) so it matches the
//      rest of the app and inherits dark-mode for free.
//   2. Status mutation handlers stripped — this surface is read-only
//      (it visualizes what the agent did; the user doesn't edit). The
//      expand/collapse interactions are kept because they're useful
//      for inspecting tool calls.
//
// prefers-reduced-motion is honored — the OS-level accessibility
// setting auto-tones the framer choreography down for users who've
// asked for it. Important for the older-RIA buyer.

import React, { useState } from "react";
import {
  CheckCircle2,
  Circle,
  CircleAlert,
  CircleDotDashed,
  CircleX,
} from "lucide-react";
import { motion, AnimatePresence, LayoutGroup, type Variants } from "framer-motion";

export type AgentPlanStatus =
  | "completed"
  | "in-progress"
  | "pending"
  | "need-help"
  | "failed";

export interface AgentPlanSubtask {
  id: string;
  title: string;
  description?: string;
  status: AgentPlanStatus;
  /** Optional list of tools / resources this subtask used. Rendered
   *  as small chips when the subtask is expanded. */
  tools?: string[];
}

export interface AgentPlanTask {
  id: string;
  title: string;
  description?: string;
  status: AgentPlanStatus;
  /** Optional id list of upstream tasks this one depends on; renders
   *  as small chips on the right of the task row. */
  dependencies?: string[];
  subtasks?: AgentPlanSubtask[];
}

export interface AgentPlanProps {
  /** Tasks to render. When this changes (e.g. new tool_end event
   *  arrives), the component diff-animates the status transitions. */
  tasks: AgentPlanTask[];
  /** When set, this task starts expanded on mount. Defaults to the
   *  first in-progress task, then the first task overall. */
  defaultExpandedId?: string;
  /** Optional className applied to the outer wrapper. */
  className?: string;
}

export default function AgentPlan({
  tasks,
  defaultExpandedId,
  className,
}: AgentPlanProps) {
  const initialExpanded = (() => {
    if (defaultExpandedId) return [defaultExpandedId];
    const inProgress = tasks.find((t) => t.status === "in-progress");
    if (inProgress) return [inProgress.id];
    if (tasks[0]) return [tasks[0].id];
    return [] as string[];
  })();

  const [expandedTasks, setExpandedTasks] = useState<string[]>(initialExpanded);
  const [expandedSubtasks, setExpandedSubtasks] = useState<{
    [key: string]: boolean;
  }>({});

  const prefersReducedMotion =
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false;

  const toggleTaskExpansion = (taskId: string) => {
    setExpandedTasks((prev) =>
      prev.includes(taskId)
        ? prev.filter((id) => id !== taskId)
        : [...prev, taskId],
    );
  };
  const toggleSubtaskExpansion = (taskId: string, subtaskId: string) => {
    const key = `${taskId}-${subtaskId}`;
    setExpandedSubtasks((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // ── Animation variants ──────────────────────────────────────────

  const taskVariants: Variants = {
    hidden: { opacity: 0, y: prefersReducedMotion ? 0 : -5 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        type: prefersReducedMotion ? "tween" : "spring",
        stiffness: 500,
        damping: 30,
        duration: prefersReducedMotion ? 0.2 : undefined,
      },
    },
    exit: {
      opacity: 0,
      y: prefersReducedMotion ? 0 : -5,
      transition: { duration: 0.15 },
    },
  };
  const subtaskListVariants: Variants = {
    hidden: { opacity: 0, height: 0, overflow: "hidden" },
    visible: {
      height: "auto",
      opacity: 1,
      overflow: "visible",
      transition: {
        duration: 0.25,
        staggerChildren: prefersReducedMotion ? 0 : 0.05,
        when: "beforeChildren",
        ease: [0.2, 0.65, 0.3, 0.9],
      },
    },
    exit: {
      height: 0,
      opacity: 0,
      overflow: "hidden",
      transition: { duration: 0.2, ease: [0.2, 0.65, 0.3, 0.9] },
    },
  };
  const subtaskVariants: Variants = {
    hidden: { opacity: 0, x: prefersReducedMotion ? 0 : -10 },
    visible: {
      opacity: 1,
      x: 0,
      transition: {
        type: prefersReducedMotion ? "tween" : "spring",
        stiffness: 500,
        damping: 25,
        duration: prefersReducedMotion ? 0.2 : undefined,
      },
    },
    exit: {
      opacity: 0,
      x: prefersReducedMotion ? 0 : -10,
      transition: { duration: 0.15 },
    },
  };
  const subtaskDetailsVariants: Variants = {
    hidden: { opacity: 0, height: 0, overflow: "hidden" },
    visible: {
      opacity: 1,
      height: "auto",
      overflow: "visible",
      transition: { duration: 0.25, ease: [0.2, 0.65, 0.3, 0.9] },
    },
  };
  const statusBadgeVariants: Variants = {
    initial: { scale: 1 },
    animate: {
      scale: prefersReducedMotion ? 1 : [1, 1.08, 1],
      transition: { duration: 0.35, ease: [0.34, 1.56, 0.64, 1] },
    },
  };

  // ── Status iconography ──────────────────────────────────────────

  function StatusIcon({
    status,
    size,
  }: {
    status: AgentPlanStatus;
    size: number;
  }) {
    const cls = `text-emerald-600`;
    const dim = `${size}`;
    switch (status) {
      case "completed":
        return <CheckCircle2 className={cls} width={dim} height={dim} />;
      case "in-progress":
        return (
          <CircleDotDashed
            className="text-[var(--accent,#2563eb)]"
            width={dim}
            height={dim}
          />
        );
      case "need-help":
        return (
          <CircleAlert
            className="text-amber-600"
            width={dim}
            height={dim}
          />
        );
      case "failed":
        return (
          <CircleX className="text-red-600" width={dim} height={dim} />
        );
      default:
        return (
          <Circle
            className="text-[var(--ink-subtle)]"
            width={dim}
            height={dim}
          />
        );
    }
  }

  function statusBadgeClasses(s: AgentPlanStatus): string {
    switch (s) {
      case "completed":
        return "bg-emerald-50 text-emerald-700 border border-emerald-200";
      case "in-progress":
        return "bg-blue-50 text-blue-700 border border-blue-200";
      case "need-help":
        return "bg-amber-50 text-amber-700 border border-amber-200";
      case "failed":
        return "bg-red-50 text-red-700 border border-red-200";
      default:
        return "bg-[var(--canvas-subtle)] text-[var(--ink-muted)] border border-[var(--rule)]";
    }
  }

  return (
    <div
      className={`bg-[var(--canvas)] text-[var(--ink)] overflow-auto ${className || ""}`}
    >
      <motion.div
        className="bg-[var(--canvas)] border border-[var(--rule)] rounded-lg shadow-sm overflow-hidden"
        initial={{ opacity: 0, y: 10 }}
        animate={{
          opacity: 1,
          y: 0,
          transition: { duration: 0.3, ease: [0.2, 0.65, 0.3, 0.9] },
        }}
      >
        <LayoutGroup>
          <div className="p-4 overflow-hidden">
            <ul className="space-y-1 overflow-hidden">
              {tasks.map((task, index) => {
                const isExpanded = expandedTasks.includes(task.id);
                const isCompleted = task.status === "completed";
                const subtasks = task.subtasks ?? [];

                return (
                  <motion.li
                    key={task.id}
                    className={index !== 0 ? "mt-1 pt-2" : ""}
                    initial="hidden"
                    animate="visible"
                    variants={taskVariants}
                  >
                    {/* Task row */}
                    <motion.div
                      className="group flex items-center px-3 py-1.5 rounded-md"
                      whileHover={{
                        backgroundColor: "rgba(0,0,0,0.03)",
                        transition: { duration: 0.2 },
                      }}
                    >
                      <div className="mr-2 flex-shrink-0">
                        <AnimatePresence mode="wait">
                          <motion.div
                            key={task.status}
                            initial={{ opacity: 0, scale: 0.8, rotate: -10 }}
                            animate={{ opacity: 1, scale: 1, rotate: 0 }}
                            exit={{ opacity: 0, scale: 0.8, rotate: 10 }}
                            transition={{
                              duration: 0.2,
                              ease: [0.2, 0.65, 0.3, 0.9],
                            }}
                          >
                            <StatusIcon status={task.status} size={18} />
                          </motion.div>
                        </AnimatePresence>
                      </div>

                      <motion.div
                        className="flex min-w-0 flex-grow cursor-pointer items-center justify-between"
                        onClick={() => toggleTaskExpansion(task.id)}
                      >
                        <div className="mr-2 flex-1 truncate">
                          <span
                            className={
                              isCompleted
                                ? "text-[var(--ink-muted)] line-through"
                                : ""
                            }
                          >
                            {task.title}
                          </span>
                        </div>

                        <div className="flex flex-shrink-0 items-center space-x-2 text-xs">
                          {(task.dependencies?.length ?? 0) > 0 && (
                            <div className="flex items-center mr-2">
                              <div className="flex flex-wrap gap-1">
                                {(task.dependencies || []).map((dep, idx) => (
                                  <motion.span
                                    key={idx}
                                    className="bg-[var(--canvas-subtle)] text-[var(--ink-muted)] border border-[var(--rule)] rounded px-1.5 py-0.5 text-[10px] font-medium"
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{
                                      duration: 0.2,
                                      delay: idx * 0.05,
                                    }}
                                  >
                                    {dep}
                                  </motion.span>
                                ))}
                              </div>
                            </div>
                          )}

                          <motion.span
                            className={`rounded px-1.5 py-0.5 ${statusBadgeClasses(task.status)}`}
                            variants={statusBadgeVariants}
                            initial="initial"
                            animate="animate"
                            key={task.status}
                          >
                            {task.status}
                          </motion.span>
                        </div>
                      </motion.div>
                    </motion.div>

                    {/* Subtasks */}
                    <AnimatePresence mode="wait">
                      {isExpanded && subtasks.length > 0 && (
                        <motion.div
                          className="relative overflow-hidden"
                          variants={subtaskListVariants}
                          initial="hidden"
                          animate="visible"
                          exit="hidden"
                          layout
                        >
                          <div className="absolute top-0 bottom-0 left-[20px] border-l-2 border-dashed border-[var(--ink-subtle)]/30" />
                          <ul className="mt-1 mr-2 mb-1.5 ml-3 space-y-0.5">
                            {subtasks.map((subtask) => {
                              const subtaskKey = `${task.id}-${subtask.id}`;
                              const isSubtaskExpanded =
                                expandedSubtasks[subtaskKey];

                              return (
                                <motion.li
                                  key={subtask.id}
                                  className="group flex flex-col py-0.5 pl-6"
                                  onClick={() =>
                                    toggleSubtaskExpansion(task.id, subtask.id)
                                  }
                                  variants={subtaskVariants}
                                  initial="hidden"
                                  animate="visible"
                                  exit="exit"
                                  layout
                                >
                                  <motion.div
                                    className="flex flex-1 items-center rounded-md p-1"
                                    whileHover={{
                                      backgroundColor: "rgba(0,0,0,0.03)",
                                      transition: { duration: 0.2 },
                                    }}
                                    layout
                                  >
                                    <div className="mr-2 flex-shrink-0">
                                      <AnimatePresence mode="wait">
                                        <motion.div
                                          key={subtask.status}
                                          initial={{
                                            opacity: 0,
                                            scale: 0.8,
                                            rotate: -10,
                                          }}
                                          animate={{
                                            opacity: 1,
                                            scale: 1,
                                            rotate: 0,
                                          }}
                                          exit={{
                                            opacity: 0,
                                            scale: 0.8,
                                            rotate: 10,
                                          }}
                                          transition={{
                                            duration: 0.2,
                                            ease: [0.2, 0.65, 0.3, 0.9],
                                          }}
                                        >
                                          <StatusIcon
                                            status={subtask.status}
                                            size={14}
                                          />
                                        </motion.div>
                                      </AnimatePresence>
                                    </div>

                                    <span
                                      className={`cursor-pointer text-sm ${
                                        subtask.status === "completed"
                                          ? "text-[var(--ink-muted)] line-through"
                                          : ""
                                      }`}
                                    >
                                      {subtask.title}
                                    </span>
                                  </motion.div>

                                  <AnimatePresence mode="wait">
                                    {isSubtaskExpanded && (
                                      <motion.div
                                        className="text-[var(--ink-muted)] border-[var(--rule)] mt-1 ml-1.5 border-l border-dashed pl-5 text-xs overflow-hidden"
                                        variants={subtaskDetailsVariants}
                                        initial="hidden"
                                        animate="visible"
                                        exit="hidden"
                                        layout
                                      >
                                        {subtask.description && (
                                          <p className="py-1">
                                            {subtask.description}
                                          </p>
                                        )}
                                        {subtask.tools &&
                                          subtask.tools.length > 0 && (
                                            <div className="mt-0.5 mb-1 flex flex-wrap items-center gap-1.5">
                                              <span className="font-medium">
                                                Tools:
                                              </span>
                                              <div className="flex flex-wrap gap-1">
                                                {subtask.tools.map(
                                                  (tool, idx) => (
                                                    <motion.span
                                                      key={idx}
                                                      className="bg-[var(--canvas-subtle)] text-[var(--ink)] border border-[var(--rule)] rounded px-1.5 py-0.5 text-[10px] font-medium"
                                                      initial={{
                                                        opacity: 0,
                                                        y: -5,
                                                      }}
                                                      animate={{
                                                        opacity: 1,
                                                        y: 0,
                                                        transition: {
                                                          duration: 0.2,
                                                          delay: idx * 0.05,
                                                        },
                                                      }}
                                                    >
                                                      {tool}
                                                    </motion.span>
                                                  ),
                                                )}
                                              </div>
                                            </div>
                                          )}
                                      </motion.div>
                                    )}
                                  </AnimatePresence>
                                </motion.li>
                              );
                            })}
                          </ul>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.li>
                );
              })}
            </ul>
          </div>
        </LayoutGroup>
      </motion.div>
    </div>
  );
}
