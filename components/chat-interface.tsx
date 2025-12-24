"use client"

import type React from "react"

import { useState, useRef, useEffect } from "react"
import { Send, Upload, Loader, X } from "lucide-react"

interface Message {
  role: "user" | "assistant"
  content: string
  timestamp: number
  actions?: any[]
  logs?: string[] // Ajouter les logs aux messages
}

interface ChatInterfaceProps {
  messages: Message[]
  onSendMessage: (message: string, images: string[]) => void
  isLoading: boolean
  onCancel: () => void
}

export default function ChatInterface({ messages, onSendMessage, isLoading, onCancel }: ChatInterfaceProps) {
  const [input, setInput] = useState("")
  const [images, setImages] = useState<string[]>([])
  const [expandedLogs, setExpandedLogs] = useState<number | null>(null) // Tracker les logs expandus
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.currentTarget.files
    if (!files) return

    Array.from(files).forEach((file) => {
      const reader = new FileReader()
      reader.onload = (event) => {
        const result = event.target?.result
        if (typeof result === "string") {
          setImages((prev) => [...prev, result])
        }
      }
      reader.readAsDataURL(file)
    })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return
    onSendMessage(input, images)
    setInput("")
    setImages([])
  }

  return (
    <div className="flex flex-col h-full bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-zinc-400">
            <p className="text-lg font-medium">Start a conversation</p>
            <p className="text-sm">Describe your application and AI will generate it</p>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div key={idx} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-xs lg:max-w-md px-4 py-3 rounded-lg ${
                  msg.role === "user"
                    ? "bg-blue-600 text-white rounded-br-none"
                    : "bg-zinc-800 text-zinc-100 rounded-bl-none"
                }`}
              >
                <p className="text-sm">{msg.content}</p>

                {msg.actions && msg.actions.length > 0 && (
                  <div className="mt-3 space-y-2 pt-3 border-t border-zinc-600">
                    {msg.actions.map((action, aIdx) => (
                      <div key={aIdx} className="text-xs">
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              action.status === "running"
                                ? "bg-yellow-400"
                                : action.status === "completed"
                                  ? "bg-green-400"
                                  : "bg-red-400"
                            }`}
                          />
                          <span className="font-medium capitalize">{action.stage}</span>
                        </div>
                        {action.files && Object.keys(action.files).length > 0 && (
                          <div className="ml-4 mt-1 text-zinc-300">
                            {Object.keys(action.files).map((file) => (
                              <div key={file} className="text-xs opacity-75">
                                ✓ {file}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {msg.logs && msg.logs.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-zinc-600">
                    <button
                      onClick={() => setExpandedLogs(expandedLogs === idx ? null : idx)}
                      className="text-xs font-medium text-zinc-300 hover:text-white transition"
                    >
                      {expandedLogs === idx ? "▼" : "▶"} Build Logs ({msg.logs.length})
                    </button>
                    {expandedLogs === idx && (
                      <div className="mt-2 bg-zinc-900 rounded p-2 max-h-48 overflow-y-auto text-xs font-mono text-zinc-400">
                        {msg.logs.map((log, lIdx) => (
                          <div key={lIdx} className="whitespace-pre-wrap break-words">
                            {log}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <p className="text-xs opacity-75 mt-2">{new Date(msg.timestamp).toLocaleTimeString()}</p>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <form onSubmit={handleSubmit} className="border-t border-zinc-800 p-4 space-y-3 bg-zinc-950">
        {images.length > 0 && (
          <div className="flex gap-2">
            {images.map((img, idx) => (
              <div key={idx} className="relative group">
                <img src={img || "/placeholder.svg"} alt={`Upload ${idx}`} className="w-12 h-12 object-cover rounded" />
                <button
                  type="button"
                  onClick={() => setImages((prev) => prev.filter((_, i) => i !== idx))}
                  className="absolute -top-2 -right-2 bg-red-600 rounded-full p-1 opacity-0 group-hover:opacity-100"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <label className="p-2 hover:bg-zinc-800 rounded cursor-pointer transition">
            <Upload className="w-5 h-5" />
            <input type="file" multiple accept="image/*" onChange={handleImageUpload} className="hidden" />
          </label>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isLoading}
            placeholder="Describe your app..."
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-4 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded transition flex items-center gap-2"
          >
            {isLoading ? <Loader className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </button>
        </div>

        {isLoading && (
          <button
            type="button"
            onClick={onCancel}
            className="w-full bg-zinc-800 hover:bg-zinc-700 text-white py-2 rounded text-sm transition"
          >
            Cancel
          </button>
        )}
      </form>
    </div>
  )
}
