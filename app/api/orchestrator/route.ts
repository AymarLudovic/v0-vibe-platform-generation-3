import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

// INITIALISATION DU SDK DERNIÈRE GÉNÉRATION
const apiKey = process.env.GEMINI_API_KEY!;
const genAI = new GoogleGenAI(apiKey);
const MODEL_NAME = "gemini-3-flash-preview"; // Le nom officiel à utiliser dans le SDK

const AGENTS = {
  MANAGER: "Tu es le Manager. Réponds de façon concise à l'utilisateur. Dis ce que tu vas faire.",
  PKG: "Agent PKG. Génère un blueprint Markdown du projet.",
  CODE: "Agent Builder. Génère les fichiers au format: ```file='chemin/nom.ts'\ncode\n```"
};

export async function POST(req: Request) {
  const { prompt } = await req.json();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: any) => {
        controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
      };

      try {
        // --- 1. MANAGER ---
        const manager = genAI.getGenerativeModel({ 
          model: MODEL_NAME, 
          systemInstruction: AGENTS.MANAGER 
        });
        const managerResult = await manager.generateContent(prompt);
        send({ type: "chat", content: managerResult.response.text() });

        // --- 2. PKG (Planification) ---
        send({ type: "log", content: "🏗️ Agent PKG : Planification..." });
        const pkgAgent = genAI.getGenerativeModel({ model: MODEL_NAME, systemInstruction: AGENTS.PKG });
        const pkgResult = await pkgAgent.generateContent(prompt);
        const blueprint = pkgResult.response.text();
        send({ type: "files", files: { "blueprint.md": blueprint } });

        // --- 3. BUILDER (Génération des fichiers) ---
        send({ type: "log", content: "⚙️ Agent Builder : Écriture du code..." });
        const codeAgent = genAI.getGenerativeModel({ model: MODEL_NAME, systemInstruction: AGENTS.CODE });
        const codeResult = await codeAgent.generateContent(`Plan: ${blueprint}. Prompt: ${prompt}`);
        const codeText = codeResult.response.text();
        
        // Extraction et envoi immédiat
        const extracted = extractFiles(codeText);
        send({ type: "files", files: extracted });

        send({ type: "log", content: "✅ Terminé." });
        controller.close();
      } catch (err: any) {
        send({ type: "log", content: "❌ Erreur: " + err.message });
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson" }
  });
}

function extractFiles(text: string): Record<string, string> {
  const files: Record<string, string> = {};
  const regex = /```[\w]*\s+file=['"]([^'"]+)['"]\n([\s\S]*?)```/g;
  let m;
  while ((m = regex.exec(text)) !== null) {
    files[m[1]] = m[2].trim();
  }
  return files;
    }
