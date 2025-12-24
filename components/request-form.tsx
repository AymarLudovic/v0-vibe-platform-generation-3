"use client"

import type React from "react"

import { useState } from "react"
import { Upload, Send, Loader, X } from "lucide-react"

interface RequestFormProps {
  onSubmit: (prompt: string, images: string[]) => void
  isLoading: boolean
  onCancel: () => void
}

export default function RequestForm({ onSubmit, isLoading, onCancel }: RequestFormProps) {
  const [prompt, setPrompt] = useState("")
  const [images, setImages] = useState<string[]>([])

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
    if (!prompt.trim()) return
    onSubmit(prompt, images)
  }

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index))
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 sticky top-8">
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-2">Your Request</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={isLoading}
            placeholder="Describe your full-stack application in detail. Include all pages, features, and interactions..."
            className="w-full h-32 bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500 disabled:opacity-50"
          />
        </div>

        <div className="space-y-3">
          <label className="block text-sm font-medium text-zinc-300">Design References (Optional)</label>
          <label className="flex items-center justify-center w-full h-24 border-2 border-dashed border-zinc-700 rounded-lg cursor-pointer hover:border-blue-500 transition">
            <div className="flex flex-col items-center justify-center pt-5 pb-6">
              <Upload className="w-5 h-5 text-zinc-400 mb-2" />
              <p className="text-sm text-zinc-400">Click to upload images</p>
            </div>
            <input
              type="file"
              multiple
              accept="image/*"
              onChange={handleImageUpload}
              disabled={isLoading}
              className="hidden"
            />
          </label>

          {images.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {images.map((img, idx) => (
                <div key={idx} className="relative group">
                  <img
                    src={img || "/placeholder.svg"}
                    alt={`Reference ${idx + 1}`}
                    className="w-full h-16 object-cover rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={() => removeImage(idx)}
                    className="absolute -top-2 -right-2 bg-red-600 rounded-full p-1 opacity-0 group-hover:opacity-100 transition"
                  >
                    <X className="w-4 h-4 text-white" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-3 pt-4">
          <button
            type="submit"
            disabled={isLoading || !prompt.trim()}
            className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-3 rounded-lg transition"
          >
            {isLoading ? (
              <>
                <Loader className="w-5 h-5 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Send className="w-5 h-5" />
                Generate App
              </>
            )}
          </button>

          {isLoading && (
            <button
              type="button"
              onClick={onCancel}
              className="px-6 bg-zinc-800 hover:bg-zinc-700 text-white font-medium py-3 rounded-lg transition"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </form>
  )
}
