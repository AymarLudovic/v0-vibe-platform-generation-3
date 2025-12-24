"use client"

import { useEffect, useState } from "react"
import { ChevronDown, ChevronUp, Copy, Trash2 } from "lucide-react"

interface LogEntry {
  type: "log" | "error" | "warn" | "info"
  message: string
  timestamp: number
}

export default function LogCapture() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [isExpanded, setIsExpanded] = useState(true)

  useEffect(() => {
    // Capturer console.log
    const originalLog = console.log
    const originalError = console.error
    const originalWarn = console.warn
    const originalInfo = console.info

    const addLog = (type: LogEntry["type"], args: any[]) => {
      const message = args
        .map((arg) => {
          if (typeof arg === "object") {
            try {
              return JSON.stringify(arg, null, 2)
            } catch {
              return String(arg)
            }
          }
          return String(arg)
        })
        .join(" ")

      setLogs((prev) => [
        ...prev,
        {
          type,
          message,
          timestamp: Date.now(),
        },
      ])
    }

    console.log = (...args) => {
      originalLog(...args)
      addLog("log", args)
    }

    console.error = (...args) => {
      originalError(...args)
      addLog("error", args)
    }

    console.warn = (...args) => {
      originalWarn(...args)
      addLog("warn", args)
    }

    console.info = (...args) => {
      originalInfo(...args)
      addLog("info", args)
    }

    return () => {
      console.log = originalLog
      console.error = originalError
      console.warn = originalWarn
      console.info = originalInfo
    }
  }, [])

  const copyLogs = () => {
    const text = logs.map((log) => `[${log.type.toUpperCase()}] ${log.message}`).join("\n")
    navigator.clipboard.writeText(text)
  }

  const clearLogs = () => {
    setLogs([])
  }

  return (
    <div className="fixed bottom-0 right-0 left-0 lg:left-1/2 bg-zinc-950 border-t border-zinc-800 z-50">
      <div
        className="flex items-center justify-between p-3 bg-zinc-900 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          <span className="text-sm font-medium text-zinc-300">Console Logs ({logs.length})</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation()
              copyLogs()
            }}
            className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white"
            title="Copy all logs"
          >
            <Copy className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              clearLogs()
            }}
            className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white"
            title="Clear logs"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="max-h-64 overflow-y-auto p-4 space-y-1 bg-zinc-950 font-mono text-xs">
          {logs.length === 0 ? (
            <p className="text-zinc-500">No logs yet...</p>
          ) : (
            logs.map((log, idx) => (
              <div
                key={idx}
                className={`${
                  log.type === "error"
                    ? "text-red-400"
                    : log.type === "warn"
                      ? "text-yellow-400"
                      : log.type === "info"
                        ? "text-blue-400"
                        : "text-zinc-300"
                }`}
              >
                <span className="text-zinc-600">[{log.type.toUpperCase()}]</span> {log.message}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
