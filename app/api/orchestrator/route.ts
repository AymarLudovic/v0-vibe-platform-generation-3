import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const MODEL = "gemini-3-flash-preview";

const AGENTS = {
  MANAGER: "Tu es le Manager de projet. Ton rôle est d'accuser réception de la demande, d'expliquer brièvement ton plan d'action et de rassurer l'utilisateur. Sois concis, moderne et pro.",
  PKG: "Tu es l'Agent PKG. Crée un Blueprint architectural complet (Pages, API, DB) en Markdown.",
  BACKEND: "Tu es l'Agent Backend. Génère les API Routes Next.js. Format: ```ts file='path/route.ts'\n[code]\n```",
  UI: "Tu es l'Agent UI. Génère les composants React/Tailwind. Format: ```tsx file='path/page.tsx'\n[code]\n```",
  VALIDATOR: "Tu es l'Agent Validator. Analyse et corrige les erreurs potentielles."
};

async function callAgent(agentRole: string, context: string, systemPrompt: string) {
  const model = genAI.getGenerativeModel({ model: MODEL, systemInstruction: systemPrompt });
  const result = await model.generateContent(context);
  return result.response.text();
}

export async function POST(req: Request) {
  const { prompt, history } = await req.json();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (type: string, content: string, data?: any) => {
        controller.enqueue(encoder.encode(JSON.stringify({ type, content, ...data }) + "\n"));
      };

      try {
        // --- ÉTAPE 0 : AGENT MANAGER (La réponse immédiate) ---
        const managerResponse = await callAgent(
          "MANAGER", 
          `L'utilisateur veut : ${prompt}. Réponds-lui directement.`, 
          AGENTS.MANAGER
        );
        send("chat", managerResponse); // Message qui s'affiche dans le chat

        // --- ÉTAPE 1 : PKG (Le Plan) ---
        send("log", "🏗️ Agent PKG : Établissement de la structure...");
        const blueprint = await callAgent("PKG", prompt, AGENTS.PKG);
        send("files", "Plan généré", { files: { "blueprint.md": blueprint } });

        // --- ÉTAPE 2 : BACKEND ---
        send("log", "⚙️ Agent Backend : Programmation des points d'accès...");
        const backendCode = await callAgent("BACKEND", `Prompt: ${prompt}\nBlueprint: ${blueprint}`, AGENTS.BACKEND);
        send("files", "Backend prêt", { files: extractFiles(backendCode) });

        // --- ÉTAPE 3 : UI ---
        send("log", "🎨 Agent UI : Design des interfaces...");
        const uiCode = await callAgent("UI", `Prompt: ${prompt}\nBackend: ${backendCode}`, AGENTS.UI);
        send("files", "UI complétée", { files: extractFiles(uiCode) });

        // --- ÉTAPE 4 : VALIDATION ---
        send("log", "🔍 Agent Validator : Scan final...");
        const validation = await callAgent("VALIDATOR", `Code: ${backendCode}\n${uiCode}`, AGENTS.VALIDATOR);
        send("chat", "Validation terminée. Votre application est prête à être testée !");

        controller.close();
      } catch (e) {
        send("error", "Interruption de l'orchestration");
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson" } });
}

function extractFiles(text: string): Record<string, string> {
  const files: Record<string, string> = {};
  const regex = /```(?:tsx?|js|css)\s+file="([^"]+)"\n([\s\S]*?)```/g;
  let m;
  while ((m = regex.exec(text)) !== null) {
    files[m[1]] = m[2].trim();
  }
  return files;
          }
