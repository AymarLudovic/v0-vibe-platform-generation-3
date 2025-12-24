"use client"

import { CheckCircle, Loader, AlertCircle, Code } from "lucide-react"

type AgentStatus = "pending" | "running" | "completed" | "error"
type AgentStage = "pkg" | "backend" | "ui" | "validator"

interface AgentResult {
  stage: AgentStage
  status: AgentStatus
  output: string
  files: Record<string, string>
  error?: string
}

const STAGES = [
  { id: "pkg", name: "Package Generator", description: "Creates detailed project blueprint", icon: "📋" },
  { id: "backend", name: "Backend Builder", description: "Generates backend code & APIs", icon: "⚙️" },
  { id: "ui", name: "UI Builder", description: "Creates frontend components", icon: "🎨" },
  { id: "validator", name: "Validator", description: "Verifies & fixes integration", icon: "✓" },
]

interface AgentFlowProps {
  results: AgentResult[]
  currentStage: AgentStage | null
  isRunning: boolean
}

export default function AgentFlow({ results, currentStage, isRunning }: AgentFlowProps) {
  const getStageStatus = (stageId: AgentStage): AgentStatus => {
    const result = results.find((r) => r.stage === stageId)
    if (result) return result.status
    if (currentStage === stageId) return "running"
    return "pending"
  }

  const getStatusIcon = (status: AgentStatus) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="w-6 h-6 text-green-500" />
      case "running":
        return <Loader className="w-6 h-6 text-blue-500 animate-spin" />
      case "error":
        return <AlertCircle className="w-6 h-6 text-red-500" />
      default:
        return <Code className="w-6 h-6 text-zinc-500" />
    }
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8">
      <h2 className="text-xl font-bold mb-8">Agent Workflow</h2>

      <div className="space-y-6">
        {STAGES.map((stage, idx) => {
          const status = getStageStatus(stage.id as AgentStage)

          return (
            <div key={stage.id}>
              <div
                className={`flex items-start gap-4 p-4 rounded-lg border transition ${
                  status === "completed"
                    ? "bg-green-500/10 border-green-500/30"
                    : status === "running"
                      ? "bg-blue-500/10 border-blue-500/30"
                      : status === "error"
                        ? "bg-red-500/10 border-red-500/30"
                        : "bg-zinc-800/50 border-zinc-700"
                }`}
              >
                <div className="flex-shrink-0 mt-1">{getStatusIcon(status)}</div>
                <div className="flex-1">
                  <h3 className="font-semibold text-white">{stage.name}</h3>
                  <p className="text-sm text-zinc-400 mt-1">{stage.description}</p>
                  {status === "error" && (
                    <p className="text-sm text-red-400 mt-2">{results.find((r) => r.stage === stage.id)?.error}</p>
                  )}
                </div>
              </div>

              {idx < STAGES.length - 1 && (
                <div
                  className={`h-6 border-l-2 ml-3 ${status === "completed" ? "border-green-500/30" : "border-zinc-700"}`}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
