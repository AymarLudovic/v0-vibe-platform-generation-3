"use client";
import { useState } from "react";

export default function ChatPage() {
  const [messages, setMessages] = useState<string[]>([]);
  const [projectFiles, setProjectFiles] = useState<Record<string, string>>({});

  const startOrchestrator = async (prompt: string) => {
    const res = await fetch("/api/orchestrator", {
      method: "POST",
      body: JSON.stringify({ prompt }),
    });

    const reader = res.body?.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader!.read();
      if (done) break;

      const lines = decoder.decode(value).split("\n").filter(Boolean);
      for (const line of lines) {
        const data = JSON.parse(line);
        if (data.type === "log") setMessages(prev => [...prev, data.content]);
        if (data.type === "stage_complete") {
          setProjectFiles(prev => ({ ...prev, ...data.files }));
        }
      }
    }
  };

  return (
    <div className="grid grid-cols-2 h-screen bg-black text-white">
      {/* GAUCHE : LE CHAT & LOGS AGENTS */}
      <div className="border-r border-zinc-800 p-6 flex flex-col">
        <h2 className="text-xl font-bold mb-4">Agents Orchestrator</h2>
        <div className="flex-1 overflow-y-auto space-y-2 mb-4 font-mono text-sm">
          {messages.map((m, i) => (
            <div key={i} className="text-zinc-400">
              <span className="text-green-500 mr-2">●</span>{m}
            </div>
          ))}
        </div>
        <input 
          onKeyDown={(e) => e.key === 'Enter' && startOrchestrator(e.currentTarget.value)}
          placeholder="Décris l'app..."
          className="bg-zinc-900 p-3 rounded-lg border border-zinc-700 outline-none"
        />
      </div>

      {/* DROITE : L'EXPLORATEUR DE CODE */}
      <div className="bg-[#050505] p-6 overflow-auto">
        <h3 className="text-zinc-500 text-xs mb-4 uppercase tracking-widest">Fichiers Générés</h3>
        <div className="space-y-4">
          {Object.entries(projectFiles).map(([path, code]) => (
            <div key={path} className="border border-zinc-800 rounded-lg overflow-hidden">
              <div className="bg-zinc-900 px-4 py-2 text-xs font-mono text-blue-400">{path}</div>
              <pre className="p-4 text-xs font-mono text-zinc-300 bg-black">
                <code>{code}</code>
              </pre>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
    }
