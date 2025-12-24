"use client"

import { useState, useRef } from "react"
import { Zap } from "lucide-react"
import ChatInterface from "@/components/chat-interface"
import PreviewPanel from "@/components/preview-panel"

export default function Home() {
  const [messages, setMessages] = useState<any[]>([])
  const [sandboxId, setSandboxId] = useState<string | null>(null)
  const [generatedFiles, setGeneratedFiles] = useState<Record<string, string>>({})
  const [isGenerating, setIsGenerating] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const handleSendMessage = async (message: string, images: string[]) => {
    setMessages((prev) => [...prev, { role: "user", content: message, timestamp: Date.now() }])
    setIsGenerating(true)
    abortRef.current = new AbortController()

    try {
      // First, create a sandbox if it doesn't exist
      if (!sandboxId) {
        const sandboxRes = await fetch("/api/sandbox", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "create" }),
        })
        const sandboxData = await sandboxRes.json()
        if (sandboxData.sandboxId) {
          setSandboxId(sandboxData.sandboxId)
        }
      }

      const response = await fetch("/api/orchestrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: message, images }),
        signal: abortRef.current.signal,
      })

      if (!response.ok) throw new Error(`API Error: ${response.statusText}`)

      const reader = response.body?.getReader()
      if (!reader) throw new Error("No response body")

      const decoder = new TextDecoder()
      let buffer = ""
      const aiMessage = {
        role: "assistant",
        content: "",
        actions: [] as any[],
        logs: [] as string[],
        timestamp: Date.now(),
      }
      let allFiles: Record<string, string> = {}

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
              aiMessage.logs.push(event.message)
              setMessages((prev) => [...prev.slice(0, -1), { ...aiMessage }])
            } else if (event.type === "stage_start") {
              aiMessage.actions.push({
                type: "stage_start",
                stage: event.stage,
                status: "running",
                output: "",
              })
              setMessages((prev) => [...prev.slice(0, -1), { ...aiMessage }])
            } else if (event.type === "stage_output") {
              const lastAction = aiMessage.actions[aiMessage.actions.length - 1]
              if (lastAction) {
                lastAction.output += event.chunk
              }
              setMessages((prev) => [...prev.slice(0, -1), { ...aiMessage }])
            } else if (event.type === "stage_complete") {
              const lastAction = aiMessage.actions[aiMessage.actions.length - 1]
              if (lastAction) {
                lastAction.status = "completed"
                lastAction.files = event.files || {}
              }
              allFiles = { ...allFiles, ...event.files }
              setMessages((prev) => [...prev.slice(0, -1), { ...aiMessage }])
              setGeneratedFiles(allFiles)
            } else if (event.type === "stage_error") {
              const lastAction = aiMessage.actions[aiMessage.actions.length - 1]
              if (lastAction) {
                lastAction.status = "error"
                lastAction.error = event.error
              }
              setMessages((prev) => [...prev.slice(0, -1), { ...aiMessage }])
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }

      if (aiMessage.actions.length > 0) {
        setMessages((prev) => [...prev.slice(0, -1), aiMessage])
      }

      if (Object.keys(allFiles).length > 0 && sandboxId) {
        await deploySandbox(sandboxId, allFiles)
      }
    } catch (error: any) {
      if (error.name !== "AbortError") {
        console.error("Error:", error)
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `Error: ${error.message}`,
            timestamp: Date.now(),
          },
        ])
      }
    } finally {
      setIsGenerating(false)
    }
  }

  const deploySandbox = async (sId: string, files: Record<string, string>) => {
    try {
      await fetch("/api/sandbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "addFiles",
          sandboxId: sId,
          files: Object.entries(files).map(([filePath, content]) => ({
            filePath,
            content,
          })),
        }),
      })

      const installRes = await fetch("/api/sandbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "install", sandboxId: sId }),
      })
      const installData = await installRes.json()
      if (!installData.success) {
        console.error("Install failed:", installData.stderr)
        return
      }

      const buildRes = await fetch("/api/sandbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "build", sandboxId: sId }),
      })
      const buildData = await buildRes.json()
      if (!buildData.success) {
        console.error("Build failed:", buildData.stderr)
        return
      }

      const startRes = await fetch("/api/sandbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", sandboxId: sId }),
      })
      const startData = await startRes.json()
      if (startData.success) {
        console.log("Server started:", startData.url)
      }
    } catch (error) {
      console.error("Sandbox deployment error:", error)
    }
  }

  return (
    <div className="min-h-screen bg-black text-white font-sans">
      <header className="border-b border-zinc-800 bg-black sticky top-0 z-50">
        <div className="max-w-screen-2xl mx-auto px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
              <Zap className="w-6 h-6" />
            </div>
            <h1 className="text-2xl font-bold">Vibe Platform Generator</h1>
          </div>
        </div>
      </header>

      <main className="max-w-screen-2xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 h-[calc(100vh-140px)]">
          {/* Left: Chat Interface */}
          <div className="lg:col-span-2 flex flex-col">
            <ChatInterface
              messages={messages}
              onSendMessage={handleSendMessage}
              isLoading={isGenerating}
              onCancel={() => abortRef.current?.abort()}
            />
          </div>

          {/* Right: Preview Panel */}
          <div className="lg:col-span-3 flex flex-col">
            <PreviewPanel sandboxId={sandboxId} generatedFiles={generatedFiles} onSandboxCreated={setSandboxId} />
          </div>
        </div>
      </main>
    </div>
  )
}
