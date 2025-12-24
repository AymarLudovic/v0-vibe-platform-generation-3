"use client"

import { useState } from "react"
import { Copy, Download, ChevronDown, ChevronUp } from "lucide-react"

type AgentStatus = "pending" | "running" | "completed" | "error"
type AgentStage = "pkg" | "backend" | "ui" | "validator"

interface AgentResult {
  stage: AgentStage
  status: AgentStatus
  output: string
  files: Record<string, string>
  error?: string
}

interface OutputViewerProps {
  results: AgentResult[]
  streamingOutput: string
  isStreaming: boolean
}

export default function OutputViewer({ results, streamingOutput, isStreaming }: OutputViewerProps) {
  const [expandedStage, setExpandedStage] = useState<AgentStage | null>(null)
  const [copiedFile, setCopiedFile] = useState<string | null>(null)

  const copyToClipboard = (text: string, fileName: string) => {
    navigator.clipboard.writeText(text)
    setCopiedFile(fileName)
    setTimeout(() => setCopiedFile(null), 2000)
  }

  const downloadAllFiles = () => {
    const allFiles = results.reduce((acc, result) => ({ ...acc, ...result.files }), {} as Record<string, string>)

    const content = Object.entries(allFiles)
      .map(([path, code]) => `// File: ${path}\n${"=".repeat(50)}\n${code}`)
      .join("\n\n")

    const element = document.createElement("a")
    element.setAttribute("href", "data:text/plain;charset=utf-8," + encodeURIComponent(content))
    element.setAttribute("download", "generated-app.txt")
    element.style.display = "none"
    document.body.appendChild(element)
    element.click()
    document.body.removeChild(element)
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
      <div className="bg-zinc-800 px-6 py-4 flex items-center justify-between border-b border-zinc-700">
        <h2 className="text-lg font-bold">Generated Output</h2>
        {results.some((r) => r.files && Object.keys(r.files).length > 0) && (
          <button
            onClick={downloadAllFiles}
            className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm font-medium transition"
          >
            <Download className="w-4 h-4" />
            Download Files
          </button>
        )}
      </div>

      <div className="max-h-96 overflow-y-auto">
        {/* Streaming Output */}
        {isStreaming && streamingOutput && (
          <div className="p-6 border-b border-zinc-700">
            <p className="text-sm text-zinc-400 mb-3">Live Output:</p>
            <pre className="bg-black rounded p-3 text-green-400 text-xs overflow-x-auto max-h-40 whitespace-pre-wrap break-words">
              {streamingOutput}
            </pre>
          </div>
        )}

        {/* Completed Stages */}
        {results.map((result) => (
          <div key={result.stage} className="border-b border-zinc-700 last:border-b-0">
            <button
              onClick={() => setExpandedStage(expandedStage === result.stage ? null : result.stage)}
              className="w-full p-6 flex items-center justify-between hover:bg-zinc-800/50 transition text-left"
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">
                  {result.stage === "pkg"
                    ? "📋"
                    : result.stage === "backend"
                      ? "⚙️"
                      : result.stage === "ui"
                        ? "🎨"
                        : "✓"}
                </span>
                <div>
                  <p className="font-semibold capitalize">{result.stage} Output</p>
                  <p className="text-xs text-zinc-400">{Object.keys(result.files).length} files generated</p>
                </div>
              </div>
              {expandedStage === result.stage ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </button>

            {expandedStage === result.stage && (
              <div className="px-6 pb-6 space-y-4">
                {Object.entries(result.files).map(([fileName, code]) => (
                  <div key={fileName} className="bg-black rounded-lg overflow-hidden">
                    <div className="bg-zinc-800 px-4 py-2 flex items-center justify-between">
                      <code className="text-xs text-zinc-300">{fileName}</code>
                      <button
                        onClick={() => copyToClipboard(code, fileName)}
                        className="flex items-center gap-2 px-2 py-1 text-xs bg-zinc-700 hover:bg-zinc-600 rounded transition"
                      >
                        <Copy className="w-3 h-3" />
                        {copiedFile === fileName ? "Copied!" : "Copy"}
                      </button>
                    </div>
                    <pre className="p-4 text-green-400 text-xs overflow-x-auto max-h-48 whitespace-pre-wrap break-words">
                      {code.substring(0, 500)}
                      {code.length > 500 && "..."}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
