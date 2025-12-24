"use client";
import { useState, useRef, useEffect } from "react";

export default function VibeCodingPage() {
  const [prompt, setPrompt] = useState("");
  const [chat, setChat] = useState<{role: string, content: string}[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [files, setFiles] = useState<Record<string, string>>({});
  const [activeFile, setActiveFile] = useState<string | null>(null);

  const handleRun = async () => {
    setChat(prev => [...prev, { role: "user", content: prompt }]);
    setLogs(["Démarrage de l'orchestrateur..."]);
    
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
        if (data.type === "chat") setChat(prev => [...prev, { role: "assistant", content: data.content }]);
        if (data.type === "log") setLogs(prev => [...prev, data.content]);
        if (data.type === "files") {
          setFiles(prev => {
            const newFiles = { ...prev, ...data.files };
            if (!activeFile) setActiveFile(Object.keys(newFiles)[0]);
            return newFiles;
          });
        }
      }
    }
  };

  return (
    <div className="flex h-screen bg-[#0a0a0a] text-zinc-300 font-mono">
      {/* Sidebar : Chat & Agent Logs */}
      <div className="w-[400px] border-r border-zinc-800 flex flex-col bg-[#0f0f0f]">
        <div className="p-4 border-b border-zinc-800 flex justify-between items-center text-[10px] uppercase tracking-widest text-zinc-500">
          <span>Gemini-3-Flash Orchestrator</span>
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm scrollbar-hide">
          {chat.map((m, i) => (
            <div key={i} className={`p-3 rounded-lg ${m.role === 'user' ? 'bg-zinc-800/50 text-white border border-zinc-700' : 'bg-blue-600/10 text-blue-100 border border-blue-500/20'}`}>
              <div className="text-[10px] opacity-40 mb-1">{m.role.toUpperCase()}</div>
              {m.content}
            </div>
          ))}
          <div className="space-y-1 mt-6">
            {logs.map((log, i) => (
              <div key={i} className="text-[11px] text-zinc-500 flex items-center gap-2 italic">
                <span className="text-blue-500">›</span> {log}
              </div>
            ))}
          </div>
        </div>

        <div className="p-4 border-t border-zinc-800 bg-black/40">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), handleRun())}
            placeholder="Décrivez votre application..."
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-xs focus:border-blue-500 outline-none resize-none"
            rows={3}
          />
          <button onClick={handleRun} className="w-full mt-2 bg-white text-black text-xs font-bold py-2 rounded hover:bg-zinc-200 transition-all">
            EXECUTE AGENTS
          </button>
        </div>
      </div>

      {/* Main : File Explorer & Code View */}
      <div className="flex-1 flex flex-col">
        <div className="h-12 border-b border-zinc-800 flex items-center px-4 gap-2 bg-[#050505]">
          <div className="text-[10px] text-zinc-500 mr-4">PROJECT EXPLORER</div>
          {Object.keys(files).map(path => (
            <button 
              key={path} 
              onClick={() => setActiveFile(path)}
              className={`px-3 py-1 rounded text-[11px] transition-all ${activeFile === path ? 'bg-zinc-800 text-white border border-zinc-700' : 'text-zinc-600 hover:text-zinc-400'}`}
            >
              {path.split('/').pop()}
            </button>
          ))}
        </div>
        
        <div className="flex-1 p-6 overflow-auto bg-[#020202]">
          {activeFile ? (
            <pre className="text-sm leading-relaxed text-zinc-400">
              <code className="block whitespace-pre-wrap">{files[activeFile]}</code>
            </pre>
          ) : (
            <div className="h-full flex items-center justify-center text-zinc-700 text-xs italic tracking-widest uppercase">
              // En attente de génération par les agents
            </div>
          )}
        </div>
      </div>
    </div>
  );
    }
