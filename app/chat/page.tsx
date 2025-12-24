"use client";
import { useState } from "react";

export default function VibeCodingInterface() {
  const [prompt, setPrompt] = useState("");
  const [chat, setChat] = useState<{role: string, content: string}[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [files, setFiles] = useState<Record<string, string>>({});

  const handleExecute = async () => {
    setChat(prev => [...prev, { role: "user", content: prompt }]);
    
    const response = await fetch("/api/orchestrator", {
      method: "POST",
      body: JSON.stringify({ prompt }),
    });

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader!.read();
      if (done) break;
      
      const lines = decoder.decode(value).split("\n").filter(Boolean);
      for (const line of lines) {
        const data = JSON.parse(line);
        if (data.type === "chat") setChat(prev => [...prev, { role: "assistant", content: data.content }]);
        if (data.type === "log") setLogs(prev => [...prev, data.content]);
        if (data.type === "files") setFiles(prev => ({ ...prev, ...data.files }));
      }
    }
  };

  return (
    <div className="flex h-screen bg-[#050505] text-zinc-400 font-sans italic-selection">
      {/* SECTION CHAT & MANAGER (Génération de la Vibe) */}
      <div className="w-[400px] border-r border-white/5 flex flex-col p-4 space-y-4">
        <div className="flex-1 overflow-y-auto space-y-4 p-2 custom-scrollbar">
          {chat.map((msg, i) => (
            <div key={i} className={`p-3 rounded-xl text-sm ${msg.role === 'user' ? 'bg-white/5 ml-8 text-white' : 'bg-blue-600/10 mr-8 text-blue-200 border border-blue-500/20'}`}>
              {msg.content}
            </div>
          ))}
          {logs.length > 0 && (
            <div className="mt-4 p-3 bg-black border border-zinc-800 rounded font-mono text-[10px] text-zinc-500">
              {logs.map((log, i) => <div key={i} className="animate-pulse">→ {log}</div>)}
            </div>
          )}
        </div>
        <input 
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleExecute()}
          placeholder="Start vibing... (ex: Create a Tinder for cats)"
          className="w-full bg-zinc-900 border border-zinc-800 p-3 rounded-lg outline-none focus:border-blue-500 transition-all text-white"
        />
      </div>

      {/* SECTION EXPLORATEUR DE FICHIERS (Vraie structure) */}
      <div className="flex-1 flex bg-black">
        <div className="w-64 border-r border-white/5 p-4">
          <h4 className="text-[10px] uppercase tracking-widest mb-4">Project Tree</h4>
          {Object.keys(files).map(path => (
            <div key={path} className="text-xs py-1 hover:text-white cursor-pointer flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_blue]" />
              {path}
            </div>
          ))}
        </div>
        <div className="flex-1 p-8 overflow-auto font-mono text-sm">
           {/* Preview du code sélectionné */}
           <pre className="text-zinc-300"><code>{Object.values(files)[0] || "// Waiting for agents..."}</code></pre>
        </div>
      </div>
    </div>
  );
          }
