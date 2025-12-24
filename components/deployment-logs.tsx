"use client"

import { useState } from "react"
import { ChevronDown, ChevronUp, Copy } from "lucide-react"

interface LogAction {
  action: string
  status: "pending" | "running" | "completed" | "error"
  stdout?: string
  stderr?: string
  output?: string
}

interface DeploymentLogsProps {
  actions: LogAction[]
  onFixErrors?: (actionIndex: number) => void | Promise<void>
  isFixing?: boolean
}

export default function DeploymentLogs({ actions, onFixErrors, isFixing }: DeploymentLogsProps) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)
  const [showStdout, setShowStdout] = useState(true)
  const [showStderr, setShowStderr] = useState(true)
  const [fixingIdx, setFixingIdx] = useState<number | null>(null)

  const copyLogs = (logs: string) => {
    navigator.clipboard.writeText(logs)
  }

  const cleanAnsiCodes = (text: string): string => {
    return text
      .replace(/\x1B\[[0-9;]*[A-Za-z]/g, "")
      .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "")
      .trim()
  }

  const handleFixError = async (idx: number) => {
    setFixingIdx(idx)
    try {
      if (onFixErrors) {
        await onFixErrors(idx)
      }
    } finally {
      setFixingIdx(null)
    }
  }

  if (actions.length === 0) {
    return <div className="text-xs text-zinc-500 p-3">No deployment actions yet...</div>
  }

  return (
    <div className="space-y-2">
      {actions.map((action, idx) => {
        const hasError = action.status === "error"
        const hasStdout = action.stdout && action.stdout.trim().length > 0
        const hasStderr = action.stderr && action.stderr.trim().length > 0
        const isExpanded = expandedIdx === idx

        return (
          <div
            key={idx}
            className={`border rounded-lg overflow-hidden ${
              action.status === "completed"
                ? "border-green-500/30 bg-green-500/5"
                : action.status === "running"
                  ? "border-blue-500/30 bg-blue-500/5"
                  : action.status === "error"
                    ? "border-red-500/30 bg-red-500/5"
                    : "border-zinc-700 bg-zinc-950"
            }`}
          >
            {/* Header */}
            <button
              onClick={() => setExpandedIdx(isExpanded ? null : idx)}
              className="w-full flex items-center justify-between p-3 hover:bg-zinc-800/50 transition"
            >
              <div className="flex items-center gap-3 flex-1">
                <div
                  className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    action.status === "running"
                      ? "bg-blue-400 animate-pulse"
                      : action.status === "completed"
                        ? "bg-green-400"
                        : "bg-red-400"
                  }`}
                />
                <div className="text-left">
                  <p className="text-sm font-medium text-white capitalize">{action.action}</p>
                  {hasError && <p className="text-xs text-red-400 mt-0.5">Failed - Click to view error details</p>}
                </div>
              </div>
              {isExpanded ? (
                <ChevronUp className="w-4 h-4 text-zinc-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-zinc-400" />
              )}
            </button>

            {/* Expandable Content */}
            {isExpanded && (
              <div className="border-t border-zinc-700 bg-zinc-950 p-3 space-y-3">
                {/* Tab Toggles */}
                {(hasStdout || hasStderr) && (
                  <div className="flex gap-2">
                    {hasStdout && (
                      <button
                        onClick={() => setShowStdout(!showStdout)}
                        className={`text-xs px-2 py-1 rounded transition ${
                          showStdout
                            ? "bg-blue-500/30 text-blue-300 border border-blue-500/50"
                            : "text-zinc-400 hover:text-zinc-300"
                        }`}
                      >
                        STDOUT
                      </button>
                    )}
                    {hasStderr && (
                      <button
                        onClick={() => setShowStderr(!showStderr)}
                        className={`text-xs px-2 py-1 rounded transition ${
                          showStderr
                            ? "bg-red-500/30 text-red-300 border border-red-500/50"
                            : "text-zinc-400 hover:text-zinc-300"
                        }`}
                      >
                        STDERR
                      </button>
                    )}
                  </div>
                )}

                {/* Logs Display */}
                <div className="space-y-2">
                  {showStdout && hasStdout && (
                    <div className="bg-black/50 rounded border border-zinc-800 overflow-hidden">
                      <div className="flex items-center justify-between bg-zinc-900 px-3 py-2 border-b border-zinc-800">
                        <span className="text-xs font-mono text-zinc-400">Standard Output</span>
                        <button
                          onClick={() => copyLogs(action.stdout!)}
                          className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition text-xs"
                          title="Copy logs"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>
                      <pre className="p-3 text-xs font-mono text-green-400 overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap break-words">
                        {cleanAnsiCodes(action.stdout)}
                      </pre>
                    </div>
                  )}

                  {showStderr && hasStderr && (
                    <div className="bg-black/50 rounded border border-zinc-800 overflow-hidden">
                      <div className="flex items-center justify-between bg-zinc-900 px-3 py-2 border-b border-zinc-800">
                        <span className="text-xs font-mono text-zinc-400">Error Output</span>
                        <button
                          onClick={() => copyLogs(action.stderr!)}
                          className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition text-xs"
                          title="Copy logs"
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>
                      <pre className="p-3 text-xs font-mono text-red-300 overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap break-words">
                        {cleanAnsiCodes(action.stderr)}
                      </pre>
                    </div>
                  )}

                  {!hasStdout && !hasStderr && action.output && (
                    <div className="bg-black/50 rounded border border-zinc-800 p-3">
                      <pre className="text-xs font-mono text-zinc-300 overflow-x-auto whitespace-pre-wrap break-words">
                        {cleanAnsiCodes(action.output)}
                      </pre>
                    </div>
                  )}
                </div>

                {/* Fix Errors Button */}
                {hasError && onFixErrors && (
                  <button
                    onClick={() => handleFixError(idx)}
                    disabled={fixingIdx !== null}
                    className="w-full mt-2 px-3 py-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white text-xs font-medium rounded transition flex items-center justify-center gap-2"
                  >
                    {fixingIdx === idx ? (
                      <>
                        <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Fixing Error...
                      </>
                    ) : (
                      "Fix Error with AI"
                    )}
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
