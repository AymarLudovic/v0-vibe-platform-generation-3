"use client"

import { useState, useEffect } from "react"
import { Play, RotateCcw, Copy, FileText, Loader } from "lucide-react"
import DeploymentLogs from "./deployment-logs"

interface SandboxAction {
  action: string
  status: "pending" | "running" | "completed" | "error"
  stdout?: string
  stderr?: string
  output?: string
}

interface PreviewPanelProps {
  sandboxId: string | null
  generatedFiles: Record<string, string>
  onSandboxCreated: (id: string) => void
}

export default function PreviewPanel({ sandboxId, generatedFiles, onSandboxCreated }: PreviewPanelProps) {
  const [activeTab, setActiveTab] = useState<"preview" | "code" | "logs">("logs")
  const [selectedFile, setSelectedFile] = useState<string>("")
  const [previewUrl, setPreviewUrl] = useState("")
  const [navigationUrl, setNavigationUrl] = useState("/")
  const [sandboxActions, setSandboxActions] = useState<SandboxAction[]>([])
  const [isDeploying, setIsDeploying] = useState(false)
  const [isFixing, setIsFixing] = useState(false)

  useEffect(() => {
    if (generatedFiles && Object.keys(generatedFiles).length > 0) {
      setSelectedFile(Object.keys(generatedFiles)[0])
    }
  }, [generatedFiles])

  const createSandbox = async () => {
    try {
      setSandboxActions([])
      const res = await fetch("/api/sandbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create" }),
      })
      const data = await res.json()
      if (data.sandboxId) {
        onSandboxCreated(data.sandboxId)
        setSandboxActions((prev) => [
          ...prev,
          { action: "create", status: "completed", output: `Sandbox created: ${data.sandboxId}` },
        ])
      }
    } catch (error) {
      setSandboxActions((prev) => [...prev, { action: "create", status: "error", output: String(error) }])
    }
  }

  const deployApp = async () => {
    if (!sandboxId) return
    setIsDeploying(true)

    try {
      setSandboxActions((prev) => [...prev, { action: "write-files", status: "running" }])

      const writeRes = await fetch("/api/sandbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "addFiles",
          sandboxId,
          files: Object.entries(generatedFiles).map(([filePath, content]) => ({
            filePath,
            content,
          })),
        }),
      })

      if (!writeRes.ok) throw new Error("Write failed")
      setSandboxActions((prev) => prev.map((a) => (a.action === "write-files" ? { ...a, status: "completed" } : a)))

      setSandboxActions((prev) => [...prev, { action: "install", status: "running" }])
      const installRes = await fetch("/api/sandbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "install", sandboxId }),
      })
      const installData = await installRes.json()
      const installAction = {
        action: "install",
        status: installData.success ? "completed" : "error",
        stdout: installData.result?.stdout || "",
        stderr: installData.result?.stderr || "",
      } as SandboxAction

      setSandboxActions((prev) => [...prev.slice(0, -1), installAction])

      if (!installData.success) {
        await callCorrectorAgent("install", installAction.stdout, installAction.stderr)
        setIsDeploying(false)
        return
      }

      setSandboxActions((prev) => [...prev, { action: "build", status: "running" }])
      const buildRes = await fetch("/api/sandbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "build", sandboxId }),
      })
      const buildData = await buildRes.json()
      const buildAction = {
        action: "build",
        status: buildData.success ? "completed" : "error",
        stdout: buildData.result?.stdout || "",
        stderr: buildData.result?.stderr || "",
      } as SandboxAction

      setSandboxActions((prev) => [...prev.slice(0, -1), buildAction])

      if (!buildData.success) {
        await callCorrectorAgent("build", buildAction.stdout, buildAction.stderr)
        setIsDeploying(false)
        return
      }

      // Start step
      setSandboxActions((prev) => [...prev, { action: "start", status: "running" }])
      const startRes = await fetch("/api/sandbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", sandboxId }),
      })
      const startData = await startRes.json()
      setSandboxActions((prev) =>
        prev.map((a) =>
          a.action === "start"
            ? {
                ...a,
                status: startData.success ? "completed" : "error",
                stdout: startData.stdout,
                stderr: startData.stderr,
                output: startData.url || startData.stderr,
              }
            : a,
        ),
      )

      if (startData.success && startData.url) {
        setPreviewUrl(startData.url)
      }
    } catch (error) {
      console.error("Deploy error:", error)
    } finally {
      setIsDeploying(false)
    }
  }

  const callCorrectorAgent = async (action: string, stdout: string, stderr: string) => {
    setIsFixing(true)
    try {
      const fixRes = await fetch("/api/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentType: "CORRECTOR",
          deploymentError: {
            action,
            stdout,
            stderr,
          },
          currentFiles: generatedFiles,
        }),
      })

      if (!fixRes.ok) throw new Error("Corrector agent call failed")

      const reader = fixRes.body?.getReader()
      if (!reader) throw new Error("No response body")

      const decoder = new TextDecoder()
      let buffer = ""
      let correctionOutput = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        buffer += chunk

        const lines = buffer.split("\n")
        buffer = lines.pop() || ""

        for (const line of lines) {
          if (!line.trim()) continue

          try {
            const event = JSON.parse(line)

            if (event.type === "log") {
              console.log("[v0] Corrector:", event.message)
            } else if (event.type === "stage_output") {
              correctionOutput += event.chunk
            } else if (event.type === "stage_complete") {
              const correctedFiles = event.files || {}

              // Update generated files with corrections
              const updatedFiles = { ...generatedFiles, ...correctedFiles }

              // Re-deploy with corrected files
              const redeployRes = await fetch("/api/sandbox", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  action: "addFiles",
                  sandboxId,
                  files: Object.entries(updatedFiles).map(([filePath, content]) => ({
                    filePath,
                    content: typeof content === "string" ? content : JSON.stringify(content),
                  })),
                }),
              })

              if (!redeployRes.ok) throw new Error("Re-deployment failed")

              // Re-run the failed action
              setSandboxActions((prev) => prev.map((a) => (a.action === action ? { ...a, status: "running" } : a)))

              const retryRes = await fetch("/api/sandbox", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action, sandboxId }),
              })

              const retryData = await retryRes.json()
              setSandboxActions((prev) =>
                prev.map((a) =>
                  a.action === action
                    ? {
                        ...a,
                        status: retryData.success ? "completed" : "error",
                        stdout: retryData.result?.stdout || "",
                        stderr: retryData.result?.stderr || "",
                      }
                    : a,
                ),
              )

              // If build succeeded, try starting the server
              if (retryData.success && action === "build") {
                setSandboxActions((prev) => [...prev, { action: "start", status: "running" }])
                const startRes = await fetch("/api/sandbox", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "start", sandboxId }),
                })
                const startData = await startRes.json()
                setSandboxActions((prev) =>
                  prev.map((a) =>
                    a.action === "start"
                      ? {
                          ...a,
                          status: startData.success ? "completed" : "error",
                          stdout: startData.url || "",
                          stderr: startData.stderr || "",
                        }
                      : a,
                  ),
                )

                if (startData.success && startData.url) {
                  setPreviewUrl(startData.url)
                }
              }
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    } catch (error) {
      console.error("Corrector agent error:", error)
      setSandboxActions((prev) =>
        prev.map((a) => (a.action === action ? { ...a, output: `Correction failed: ${error}` } : a)),
      )
    } finally {
      setIsFixing(false)
    }
  }

  return (
    <div className="flex flex-col h-full bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
      {/* Header with Tabs */}
      <div className="border-b border-zinc-800 bg-zinc-950 p-4 space-y-3">
        <div className="flex items-center gap-3">
          <button
            onClick={createSandbox}
            disabled={sandboxId !== null}
            className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded text-sm transition"
          >
            <Play className="w-4 h-4" />
            Create Sandbox
          </button>
          <button
            onClick={deployApp}
            disabled={!sandboxId || Object.keys(generatedFiles).length === 0 || isDeploying}
            className="flex items-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded text-sm transition"
          >
            {isDeploying ? <Loader className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Deploy App
          </button>
          <button
            onClick={() => {
              setPreviewUrl("")
              setSandboxActions([])
            }}
            className="flex items-center gap-2 px-3 py-2 bg-zinc-700 hover:bg-zinc-600 rounded text-sm transition"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </button>
        </div>

        {previewUrl && (
          <div className="flex gap-2">
            <input
              type="text"
              value={navigationUrl}
              onChange={(e) => setNavigationUrl(e.target.value)}
              placeholder="/page-name"
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-white placeholder-zinc-500"
            />
            <button
              onClick={() => {
                const fullUrl = new URL(previewUrl)
                fullUrl.pathname = navigationUrl
                setPreviewUrl(fullUrl.toString())
              }}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm transition"
            >
              Go
            </button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 border-b border-zinc-800">
          <button
            onClick={() => setActiveTab("logs")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
              activeTab === "logs"
                ? "border-blue-500 text-blue-400"
                : "border-transparent text-zinc-400 hover:text-zinc-300"
            }`}
          >
            Logs
          </button>
          <button
            onClick={() => setActiveTab("preview")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
              activeTab === "preview"
                ? "border-blue-500 text-blue-400"
                : "border-transparent text-zinc-400 hover:text-zinc-300"
            }`}
          >
            Preview
          </button>
          <button
            onClick={() => setActiveTab("code")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
              activeTab === "code"
                ? "border-blue-500 text-blue-400"
                : "border-transparent text-zinc-400 hover:text-zinc-300"
            }`}
          >
            Code
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-hidden p-4">
        {activeTab === "logs" ? (
          <div className="h-full overflow-y-auto">
            <DeploymentLogs
              actions={sandboxActions}
              onFixErrors={async (idx) => {
                const action = sandboxActions[idx]
                if (action.stderr || action.stdout) {
                  console.log("[v0] Fix Error button clicked for:", action.action)
                  await callCorrectorAgent(action.action, action.stdout || "", action.stderr || "")
                }
              }}
              isFixing={isFixing}
            />
          </div>
        ) : activeTab === "preview" ? (
          <>
            {previewUrl ? (
              <iframe src={previewUrl} className="w-full h-full border-0 rounded-lg" title="App Preview" />
            ) : (
              <div className="flex h-full items-center justify-center text-zinc-400">
                <div className="text-center">
                  <p className="text-lg font-medium">No preview available</p>
                  <p className="text-sm">Deploy your app to see it here</p>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="h-full flex flex-col">
            <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-4 gap-4">
              {/* Left: File Tree */}
              <div className="lg:col-span-1 bg-zinc-950 border border-zinc-800 rounded-lg overflow-y-auto">
                <div className="sticky top-0 bg-zinc-900 border-b border-zinc-800 p-3">
                  <p className="text-xs font-medium text-zinc-400 uppercase">Files</p>
                </div>
                <div className="p-2 space-y-1">
                  {Object.keys(generatedFiles).map((file) => (
                    <button
                      key={file}
                      onClick={() => setSelectedFile(file)}
                      className={`w-full text-left px-3 py-2 rounded text-xs transition ${
                        selectedFile === file ? "bg-blue-600 text-white" : "text-zinc-300 hover:bg-zinc-800"
                      }`}
                    >
                      <FileText className="w-3 h-3 inline mr-2" />
                      {file.split("/").pop()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Right: Code Display */}
              <div className="lg:col-span-3 bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden flex flex-col">
                {selectedFile && generatedFiles[selectedFile] ? (
                  <>
                    <div className="bg-zinc-900 border-b border-zinc-800 px-4 py-2 flex items-center justify-between">
                      <code className="text-xs text-zinc-300">{selectedFile}</code>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(generatedFiles[selectedFile])
                        }}
                        className="flex items-center gap-2 px-2 py-1 text-xs bg-zinc-700 hover:bg-zinc-600 rounded transition"
                      >
                        <Copy className="w-3 h-3" />
                        Copy
                      </button>
                    </div>
                    <pre className="flex-1 overflow-auto p-4 text-xs font-mono text-green-400 bg-black">
                      {generatedFiles[selectedFile]}
                    </pre>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-zinc-400">
                    <p>Select a file to view</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
