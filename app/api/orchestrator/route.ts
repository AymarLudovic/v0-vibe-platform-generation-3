import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const MODEL = "gemini-3-flash-preview"; // Le modèle haute performance

// --- TES 4 AGENTS (Systèmes de Prompts) ---
const AGENTS = {
  PKG: "Tu es l'Agent PKG. Ton rôle est de créer un Blueprint architectural détaillé (Pages, APIs, DB, Auth) en Markdown.",
  BACKEND: "Tu es l'Agent Backend. Génère uniquement les API Routes Next.js basées sur le Blueprint PKG. Format: ```ts file='path/route.ts'...",
  UI: "Tu es l'Agent UI. Génère les composants React et pages basés sur le Backend. Format: ```tsx file='path/page.tsx'...",
  VALIDATOR: "Tu es l'Agent Validator. Analyse le code généré, cherche les imports morts ou erreurs et propose les corrections."
};

async function callAgent(agentSystemPrompt: string, context: string) {
  const model = genAI.getGenerativeModel({ 
    model: MODEL, 
    systemInstruction: agentSystemPrompt 
  });
  const result = await model.generateContent(context);
  return result.response.text();
}

export async function POST(req: Request) {
  const { prompt } = await req.json();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (type: string, content: string, files?: any) => {
        controller.enqueue(encoder.encode(JSON.stringify({ type, content, files }) + "\n"));
      };

      try {
        // --- ÉTAPE 1 : PKG GENERATOR ---
        send("log", "🏗️ Agent PKG : Conception du blueprint...");
        const blueprint = await callAgent(AGENTS.PKG, prompt);
        send("stage_complete", "Blueprint créé", { "blueprint.md": blueprint });

        // --- ÉTAPE 2 : BACKEND BUILDER ---
        send("log", "⚙️ Agent Backend : Génération des routes API...");
        const backendCode = await callAgent(AGENTS.BACKEND, `Blueprint: ${blueprint}\nDemande: ${prompt}`);
        send("stage_complete", "Backend généré", extractFiles(backendCode));

        // --- ÉTAPE 3 : UI BUILDER ---
        send("log", "🎨 Agent UI : Création des interfaces...");
        const uiCode = await callAgent(AGENTS.UI, `Backend: ${backendCode}\nBlueprint: ${blueprint}`);
        send("stage_complete", "UI générée", extractFiles(uiCode));

        // --- ÉTAPE 4 : VALIDATOR ---
        send("log", "🔍 Agent Validator : Vérification finale...");
        const validation = await callAgent(AGENTS.VALIDATOR, `Code total: ${backendCode} ${uiCode}`);
        send("log", "✅ Validation terminée.");
        
        controller.close();
      } catch (e) {
        send("error", "Erreur d'orchestration");
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson" } });
}

// Utilitaire de parsing pour transformer le texte de Gemini en fichiers réels
function extractFiles(text: string): Record<string, string> {
  const files: Record<string, string> = {};
  const regex = /```(?:tsx?|js|css)\s+file="([^"]+)"\n([\s\S]*?)```/g;
  let m;
  while ((m = regex.exec(text)) !== null) {
    files[m[1]] = m[2].trim();
  }
  return files;
}
