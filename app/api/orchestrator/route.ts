import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const MODEL = "gemini-3-flash-preview";

// Configuration des rôles
const AGENTS = {
  MANAGER: "Tu es le Manager. Réponds de façon concise à l'utilisateur pour valider sa demande et expliquer ce que tu vas construire. Ne génère pas de code.",
  PKG: "Tu es l'Agent PKG. Crée un Blueprint architectural (Pages, API, DB) en Markdown.",
  BACKEND: "Tu es l'Agent Backend. Génère les API Routes Next.js. Format: ```ts file='path/route.ts'\n[code]\n```",
  UI: "Tu es l'Agent UI. Génère les composants React/Tailwind. Format: ```tsx file='path/page.tsx'\n[code]\n```",
  VALIDATOR: "Tu es l'Agent Validator. Analyse le code et propose des corrections si nécessaire."
};

async function* orchestrate(prompt: string) {
  const callAgent = async (systemPrompt: string, context: string) => {
    const model = genAI.getGenerativeModel({ model: MODEL, systemInstruction: systemPrompt });
    const result = await model.generateContent(context);
    return result.response.text();
  };

  // 1. Manager parle
  const managerMsg = await callAgent(AGENTS.MANAGER, prompt);
  yield { type: "chat", content: managerMsg };

  // 2. PKG crée le plan
  yield { type: "log", content: "🏗️ Agent PKG : Établissement de la structure..." };
  const blueprint = await callAgent(AGENTS.PKG, prompt);
  yield { type: "files", files: { "blueprint.md": blueprint } };

  // 3. Backend génère le code serveur
  yield { type: "log", content: "⚙️ Agent Backend : Génération des API..." };
  const beCode = await callAgent(AGENTS.BACKEND, `Prompt: ${prompt}\nBlueprint: ${blueprint}`);
  yield { type: "files", files: extractFiles(beCode) };

  // 4. UI génère les vues
  yield { type: "log", content: "🎨 Agent UI : Création des interfaces..." };
  const uiCode = await callAgent(AGENTS.UI, `Prompt: ${prompt}\nBackend: ${beCode}`);
  yield { type: "files", files: extractFiles(uiCode) };

  yield { type: "log", content: "✅ Orchestration terminée." };
}

export async function POST(req: Request) {
  const { prompt } = await req.json();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      for await (const event of orchestrate(prompt)) {
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache" },
  });
}

function extractFiles(text: string): Record<string, string> {
  const files: Record<string, string> = {};
  const regex = /```(?:tsx?|js|css|md)\s+file=["']([^"']+)["']\n([\s\S]*?)```/g;
  let m;
  while ((m = regex.exec(text)) !== null) {
    files[m[1]] = m[2].trim();
  }
  return files;
         }
