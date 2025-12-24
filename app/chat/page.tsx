"use client";
import { useState } from "react";

export default function VibeCoding() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<{role: string, content: string}[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [files, setFiles] = useState<Record<string, string>>({});

  const run = async () => {
    setMessages(prev => [...prev, { role: "user", content: input }]);
    const res = await fetch("/api/orchestrator", {
      method: "POST",
      body: JSON.stringify({ prompt: input }),
    });

    const reader = res.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) return;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split("\n").filter(Boolean);

      for (const line of lines) {
        try {
          const data = JSON.parse(line);
          if (data.type === "chat") setMessages(prev => [...prev, { role: "assistant", content: data.content }]);
          if (data.type === "log") setLogs(prev => [...prev, data.content]);
          if (data.type === "files") setFiles(prev => ({ ...prev, ...data.files }));
        } catch (e) { console.error("Parse error", e); }
      }
    }
  };

  return (
    <div className="flex h-screen bg-[#050505] text-white font-mono">
      {/* Sidebar Chat */}
      <div className="w-1/3 border-r border-zinc-800 flex flex-col">
        <div className="flex-1 p-4 overflow-y-auto space-y-4">
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "text-blue-400" : "text-zinc-300"}>
              <span className="opacity-50 text-[10px] block">{m.role.toUpperCase()}</span>
              {m.content}
            </div>
          ))}
          <div className="pt-4 border-t border-zinc-900">
            {logs.map((l, i) => <div key={i} className="text-[10px] text-zinc-600 tracking-tighter animate-pulse">{l}</div>)}
          </div>
        </div>
        <div className="p-4 bg-zinc-950">
          <input 
            className="w-full bg-zinc-900 border border-zinc-800 p-2 text-xs outline-none focus:border-blue-500"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && run()}
            placeholder="Type your vibe..."
          />
        </div>
      </div>

      {/* Explorateur de Code */}
      <div className="flex-1 p-6 overflow-auto">
        <div className="grid grid-cols-2 gap-4">
          {Object.entries(files).map(([name, code]) => (
            <div key={name} className="border border-zinc-800 rounded p-2 bg-black">
              <div className="text-[10px] text-blue-500 mb-2 border-b border-zinc-800 pb-1">{name}</div>
              <pre className="text-[10px] leading-tight text-zinc-400 overflow-x-auto">
                <code>{code}</code>
              </pre>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
