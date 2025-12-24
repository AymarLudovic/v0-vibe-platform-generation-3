import { NextResponse } from "next/server"
import { GoogleGenAI, type Part } from "@google/genai"
import { resolvePackage } from "@/lib/npm/resolvePackage"

interface Message {
  role: "user" | "assistant" | "system"
  content: string
  images?: string[]
  externalFiles?: { fileName: string; base64Content: string }[]
  mentionedFiles?: string[]
  functionResponse?: { name: string; response: any }
}

interface StreamEvent {
  type: "stage_start" | "stage_output" | "stage_complete" | "stage_error"
  stage: string
  chunk?: string
  output?: string
  files?: Record<string, string>
  error?: string
}

function getMimeTypeFromBase64(dataUrl: string): string {
  const match = dataUrl.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-+.=]+);base64,/)
  return match ? match[1] : "application/octet-stream"
}

function cleanBase64Data(dataUrl: string): string {
  return dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl
}

const PKG_GENERATOR_SYSTEM = `Tu es l'Agent PKG Generator - Expert en architecture logicielle.

DIRECTIVE ABSOLUE:
Crée un blueprint COMPLET et DÉTAILLÉ du projet contenant:
1. **Pages & Routes**: Liste exhaustive de chaque page, sa route, son type (public/protégé)
2. **Fonctionnalités**: Toutes les features détaillées avec user stories
3. **Interactions**: Flux utilisateur complet (navigation, formulaires, validations)
4. **APIs**: Tous les endpoints nécessaires (GET/POST/PUT/DELETE) avec paramètres
5. **Database**: Structure complète (tables, colonnes, relations)
6. **Authentification**: Flux complet (login, register, sessions, permissions)
7. **UI Components**: Liste des composants réutilisables nécessaires

Format: Markdown structuré avec sections claires.
Être EXTRÊMEMENT DÉTAILLÉ ET CONCIS.`

const BACKEND_GENERATOR_SYSTEM = `Tu es l'Agent Backend Builder - Expert Next.js API Routes.

DIRECTIVE ABSOLUE:
Génère UNIQUEMENT les fichiers backend basé sur le blueprint PKG reçu:
- UNIQUEMENT des fichiers app/api/** /route.ts
- Next.js 16 App Router avec streaming support
- Types TypeScript stricts
- Gestion d'erreurs complète avec try/catch
- Validation des inputs robuste
- ZERO UI, ZERO pages, ZERO composants

SORTIE FORMAT:
Pour chaque fichier API, utilise EXACTEMENT:
\`\`\`ts file="app/api/route/path/route.ts"
[CODE COMPLET]
\`\`\`

RÈGLE: Un seul fichier par bloc de code.`

const UI_GENERATOR_SYSTEM = `Tu es l'Agent UI Builder - Expert React & TypeScript.

DIRECTIVE ABSOLUE:
Génère UNIQUEMENT les fichiers UI/pages basé sur le blueprint PKG + code backend reçu:
- Pages dans app/** /page.tsx
- Composants dans components/**
- CSS natif UNIQUEMENT (pas de Tailwind sauf demande explicite)
- Intègre TOUS les API calls du backend
- CHAQUE élément UI DOIT ÊTRE 100% FONCTIONNEL
- Pas de boutons morts, pas de mocks, pas de placeholders
- State management avec useState/useReducer/Context API

SORTIE FORMAT:
Pour chaque fichier, utilise EXACTEMENT:
\`\`\`tsx file="app/ou/components/path/file.tsx"
[CODE COMPLET]
\`\`\`

RÈGLE: Un seul fichier par bloc de code.`

const VALIDATOR_SYSTEM = `Tu es l'Agent Validator - Expert QA/Intégration.

DIRECTIVE ABSOLUE:
Vérifie que TOUS les éléments du blueprint PKG original ont été implémentés:

CHECKLIST COMPLÈTE:
✓ Toutes les pages existent et sont fonctionnelles
✓ Tous les API endpoints correspondent au blueprint
✓ Authentification complète et sécurisée
✓ Interactions UI matchent le blueprint
✓ Types TypeScript sans any
✓ Gestion d'erreurs partout
✓ Pas de features manquantes
✓ Code backend intégré dans l'UI

SI MANQUENT DES ÉLÉMENTS:
- Liste EXACTEMENT ce qui manque (fichier, ligne, fonctionnalité)
- Indique la sévérité: CRITIQUE, IMPORTANTE, MINEURE

SORTIE: Rapport détaillé en Markdown avec checklist`

const CORRECTOR_SYSTEM = `Tu es l'Agent Corrector - Expert en correction de code.

DIRECTIVE ABSOLUE:
Basé sur le rapport de Validator, GÉNÈRE UNIQUEMENT les fichiers manquants ou à corriger:
- Si un fichier MANQUE: Crée-le complètement selon le blueprint
- Si un fichier A UNE ERREUR: Fournis la version corrigée COMPLÈTE
- Si une FONCTIONNALITÉ MANQUE: Génère le code pour l'ajouter

SORTIE FORMAT:
\`\`\`ts file="app/api/path/route.ts"
[CODE COMPLET]
\`\`\`
ou
\`\`\`tsx file="app/ou/components/path/file.tsx"
[CODE COMPLET]
\`\`\`

PRIORITÉ: Corriger les éléments CRITIQUES d'abord, puis IMPORTANTS`

const ERROR_FIXER_SYSTEM = `Tu es l'Agent Error Fixer - Expert en débogage et correction d'erreurs.

DIRECTIVE ABSOLUE:
Reçois les logs d'erreur (stdout/stderr) d'une action échouée (build, install, etc).
Analyse PRÉCISÉMENT l'erreur et génère les corrections nécessaires.

ANALYSE:
1. **Identifie le problème**: Pourquoi ça a échoué?
2. **Root cause**: C'est une dépendance manquante? Une erreur de syntaxe? Une config manquante?
3. **Solution**: Quel(s) fichier(s) faut-il créer ou corriger?

RÈGLES:
- Pour CHAQUE fichier à créer/corriger, fournis le code COMPLET
- Format des réponses:
  * Fichiers à créer: \`\`\`tsx/ts file="path/to/file"\n[CODE]\`\`\`
  * Résumé court du problème ET de la solution

PRIORITÉS DE CORRECTION:
1. Dépendances manquantes (ajouter les imports ou les fichiers)
2. Erreurs de syntaxe TypeScript/JSX
3. Chemins d'import incorrects
4. Fichiers de configuration manquants (next.config.js, etc)
5. Erreurs de type

Sois PRÉCIS et fournis le code corrigé INTÉGRALEMENT.`

const IDENTIFIER_SYSTEM = `Tu es l'Agent Identifier - Expert en dépendances npm.

DIRECTIVE ABSOLUE:
Lis les fichiers générés et identifie UNIQUEMENT les vrais packages npm à installer.

RÈGLES:
1. IGNORER les imports internes:
   - Chemins relatifs: import from './path' ou '../path'
   - Alias: import from '@/components' ou '@/lib'
   - Next.js internes: 'next/server', 'next/link', 'next/headers', etc.
   - Composants locaux: '@/components/Sidebar'

2. GARDER UNIQUEMENT les vrais packages npm:
   - 'react', 'react-dom'
   - 'zod', 'jsonwebtoken', 'bcryptjs'
   - Tout package externe qui vient de node_modules
  
3. Pour chaque package trouvé:
   - Vérifier qu'il est mentionné au moins une fois dans les imports
   - Retourner le nom EXACT du package

SORTIE FORMAT - JSON UNIQUEMENT:
\`\`\`json
{
  "packages": ["react", "zod", "jsonwebtoken", "bcryptjs"],
  "analysis": {
    "totalImportsScanned": 45,
    "npmPackagesFound": 4,
    "internalImportsIgnored": 41
  }
}
\`\`\`

AUCUN TEXTE EN DEHORS DU JSON!`

const MANAGER_SYSTEM = `Tu es l'Agent Manager - Expert en gestion de conversations et orchestration.

DIRECTIVE ABSOLUE:
Tu es le point d'entrée conversationnel de la plateforme. Tu interagis avec l'utilisateur en gardant l'historique complet de la conversation.

RESPONSABILITÉS:
1. **Comprendre les demandes** de l'utilisateur (génération, correction, déploiement, etc.)
2. **Dispatcher les agents appropriés** selon la demande:
   - Si demande de génération → PKG Generator → Backend → UI → Validator → Corrector
   - Si demande de correction d'erreur deploy → Corrector Agent directement
   - Si autre requête → Répondre directement
3. **Gérer l'historique** complet de la conversation et des fichiers
4. **Contextualiser** chaque interaction avec les fichiers précédemment générés

CONTEXTE DISPONIBLE:
- Historique complet des messages
- Fichiers générés précédemment
- Agents disponibles et leurs fonctions
- Logs des déploiements précédents

FORMAT RÉPONSE:
- Réponse conversationnelle naturelle ET claire
- Si tu appelles un agent: commence par "Je vais [action]..."
- Si correction générée: "Les corrections ont été générées, voici ce qui a été fait..."

Tu DOIS:
- Toujours garder le contexte de la conversation
- Expliquer clairement ce que tu fais
- Utiliser les agents de manière intelligente basée sur la demande
- Retourner les fichiers générés/corrigés`

async function callGeminiAgent(
  systemPrompt: string,
  userContent: string,
  apiKey: string,
  history?: Message[],
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey })
  const model = "gemini-3-flash-preview"

  const contents: { role: "user" | "model"; parts: Part[] }[] = []

  // Add history if provided
  if (history && history.length > 0) {
    for (const msg of history) {
      if (msg.role === "system") continue
      const role = msg.role === "assistant" ? "model" : "user"
      contents.push({
        role,
        parts: [{ text: msg.content }],
      })
    }
  }

  // Add current user message
  contents.push({
    role: "user",
    parts: [{ text: userContent }],
  })

  const response = await ai.models.generateContentStream({
    model,
    contents,
    config: { systemInstruction: systemPrompt },
  })

  let fullText = ""
  for await (const chunk of response) {
    if (chunk.text) {
      fullText += chunk.text
    }
  }

  return fullText
}

function extractFiles(text: string): Record<string, string> {
  const files: Record<string, string> = {}
  const fileRegex = /```(?:tsx?|js)\s+file="([^"]+)"\n([\s\S]*?)```/g

  let match
  while ((match = fileRegex.exec(text)) !== null) {
    files[match[1]] = match[2].trim()
  }

  return files
}

function encodeStreamEvent(event: StreamEvent | { type: "log"; message: string }): string {
  return JSON.stringify(event) + "\n"
}

async function* orchestrateAgents(
  prompt: string,
  apiKey: string,
  mode: "generate" | "correct" | "manager" = "generate",
  conversationHistory?: Message[],
  currentFiles?: Record<string, string>,
  deploymentError?: { action: string; stdout: string; stderr: string },
): AsyncGenerator<StreamEvent | { type: "log"; message: string }> {
  let pkgOutput = ""
  let backendOutput = ""
  let uiOutput = ""
  let validatorOutput = ""
  let correctorOutput = ""
  let errorFixerOutput = ""
  let allFiles: Record<string, string> = {}
  const orchestrationLogs: string[] = []

  // Stage 1: Manager Agent
  if (mode === "manager") {
    const msg0 = "[v0] Starting Manager Agent"
    console.log(msg0)
    yield { type: "log", message: msg0 }
    orchestrationLogs.push(msg0)
    yield { type: "stage_start", stage: "manager" }

    try {
      const managerContext = `
Historique de conversation:
${conversationHistory?.map((m) => `${m.role}: ${m.content}`).join("\n") || "Aucun historique"}

Fichiers actuels:
${currentFiles ? Object.keys(currentFiles).join(", ") : "Aucun fichier"}

Demande utilisateur: ${prompt}
`

      const managerOutput = await callGeminiAgent(MANAGER_SYSTEM, managerContext, apiKey, conversationHistory)

      yield {
        type: "stage_complete",
        stage: "manager",
        output: managerOutput,
        files: {},
      }

      // Parse manager output to determine what agent to call next
      const shouldGenerateApp =
        managerOutput.toLowerCase().includes("génération") ||
        managerOutput.toLowerCase().includes("créer") ||
        managerOutput.toLowerCase().includes("générer")
      const shouldCorrect =
        managerOutput.toLowerCase().includes("correction") ||
        managerOutput.toLowerCase().includes("corriger") ||
        deploymentError !== undefined

      if (!shouldGenerateApp && !shouldCorrect) {
        // Manager responded conversationally, return output
        yield { type: "complete", output: managerOutput }
        return
      }

      // Continue with appropriate agent based on manager decision
      if (shouldCorrect && deploymentError) {
        // Call corrector for deployment errors
        prompt = `Erreur ${deploymentError.action}:\nSTDOUT: ${deploymentError.stdout}\nSTDERR: ${deploymentError.stderr}\n\nFichiers actuels:\n${Object.entries(
          currentFiles || {},
        )
          .map(([path, content]) => `--- ${path} ---\n${content}`)
          .join("\n")}`
        mode = "correct"
      } else if (shouldGenerateApp) {
        mode = "generate"
      }
    } catch (error: any) {
      const msg = `[v0] Manager error: ${error.message}`
      console.log(msg)
      yield { type: "log", message: msg }
    }
  }

  // Stage 2: Corrector Agent
  if (mode === "correct") {
    const msg = "[v0] Starting Corrector stage for deployment error"
    console.log(msg)
    yield { type: "log", message: msg }
    orchestrationLogs.push(msg)
    yield { type: "stage_start", stage: "corrector" }

    try {
      const correctorPrompt = `Fichiers actuels:\n${Object.entries(currentFiles || {})
        .map(([path, content]) => `--- ${path} ---\n${content}`)
        .join("\n")}\n\nProblème à corriger:\n${prompt}`

      const correctorOutput = await callGeminiAgent(CORRECTOR_SYSTEM, correctorPrompt, apiKey, conversationHistory)

      const correctedFiles = extractFiles(correctorOutput)
      yield {
        type: "stage_complete",
        stage: "corrector",
        output: correctorOutput,
        files: correctedFiles,
      }
      return
    } catch (error: any) {
      const msg = `[v0] Corrector error: ${error.message}`
      console.log(msg)
      yield { type: "log", message: msg }
    }
  }

  // Stage 3: PKG Generator
  const msg1 = "[v0] Starting PKG Generator stage"
  console.log(msg1)
  yield { type: "log", message: msg1 }
  orchestrationLogs.push(msg1)
  yield { type: "stage_start", stage: "pkg" }

  try {
    pkgOutput = await callGeminiAgent(PKG_GENERATOR_SYSTEM, prompt, apiKey)
    const msg2 = `[v0] PKG Generator completed, output length: ${pkgOutput.length}`
    console.log(msg2)
    yield { type: "log", message: msg2 }
    orchestrationLogs.push(msg2)

    for (let i = 0; i < pkgOutput.length; i += 100) {
      yield { type: "stage_output", stage: "pkg", chunk: pkgOutput.slice(i, i + 100) }
    }

    yield {
      type: "stage_complete",
      stage: "pkg",
      output: pkgOutput,
      files: { "blueprint.md": pkgOutput },
    }
    allFiles["blueprint.md"] = pkgOutput
  } catch (error: any) {
    const errorMsg = `[v0] PKG Generator error: ${error.message}`
    console.log(errorMsg)
    yield { type: "log", message: errorMsg }
    orchestrationLogs.push(errorMsg)
    yield { type: "stage_error", stage: "pkg", error: error.message }
    return
  }

  // Stage 4: Backend Builder
  const msg3 = "[v0] Starting Backend Builder stage"
  console.log(msg3)
  yield { type: "log", message: msg3 }
  orchestrationLogs.push(msg3)
  yield { type: "stage_start", stage: "backend" }

  try {
    const backendPrompt = `Basé sur ce blueprint du projet:\n\n${pkgOutput}\n\nDemande originale:\n${prompt}`
    backendOutput = await callGeminiAgent(BACKEND_GENERATOR_SYSTEM, backendPrompt, apiKey)
    const msg4 = `[v0] Backend Builder completed, output length: ${backendOutput.length}`
    console.log(msg4)
    yield { type: "log", message: msg4 }
    orchestrationLogs.push(msg4)

    const backendFiles = extractFiles(backendOutput)
    const msg5 = `[v0] Extracted backend files: ${Object.keys(backendFiles).join(", ")}`
    console.log(msg5)
    yield { type: "log", message: msg5 }
    orchestrationLogs.push(msg5)

    for (let i = 0; i < backendOutput.length; i += 100) {
      yield { type: "stage_output", stage: "backend", chunk: backendOutput.slice(i, i + 100) }
    }

    yield {
      type: "stage_complete",
      stage: "backend",
      output: backendOutput,
      files: backendFiles,
    }
    allFiles = { ...allFiles, ...backendFiles }
  } catch (error: any) {
    const errorMsg = `[v0] Backend Builder error: ${error.message}`
    console.log(errorMsg)
    yield { type: "log", message: errorMsg }
    orchestrationLogs.push(errorMsg)
    yield { type: "stage_error", stage: "backend", error: error.message }
    return
  }

  // Stage 5: UI Builder
  const msg6 = "[v0] Starting UI Builder stage"
  console.log(msg6)
  yield { type: "log", message: msg6 }
  orchestrationLogs.push(msg6)
  yield { type: "stage_start", stage: "ui" }

  try {
    const uiPrompt = `Basé sur ce blueprint:\n\n${pkgOutput}\n\nEt ce code backend généré:\n\n${backendOutput}\n\nDemande originale:\n${prompt}`
    uiOutput = await callGeminiAgent(UI_GENERATOR_SYSTEM, uiPrompt, apiKey)
    const msg7 = `[v0] UI Builder completed, output length: ${uiOutput.length}`
    console.log(msg7)
    yield { type: "log", message: msg7 }
    orchestrationLogs.push(msg7)

    const uiFiles = extractFiles(uiOutput)
    const msg8 = `[v0] Extracted UI files: ${Object.keys(uiFiles).join(", ")}`
    console.log(msg8)
    yield { type: "log", message: msg8 }
    orchestrationLogs.push(msg8)

    for (let i = 0; i < uiOutput.length; i += 100) {
      yield { type: "stage_output", stage: "ui", chunk: uiOutput.slice(i, i + 100) }
    }

    yield {
      type: "stage_complete",
      stage: "ui",
      output: uiOutput,
      files: uiFiles,
    }
    allFiles = { ...allFiles, ...uiFiles }
  } catch (error: any) {
    const errorMsg = `[v0] UI Builder error: ${error.message}`
    console.log(errorMsg)
    yield { type: "log", message: errorMsg }
    orchestrationLogs.push(errorMsg)
    yield { type: "stage_error", stage: "ui", error: error.message }
    return
  }

  // Stage 6: Validator
  const msg9 = "[v0] Starting Validator stage"
  console.log(msg9)
  yield { type: "log", message: msg9 }
  orchestrationLogs.push(msg9)
  yield { type: "stage_start", stage: "validator" }

  try {
    const validatorPrompt = `Blueprint original:\n\n${pkgOutput}\n\nCode backend généré:\n\n${backendOutput}\n\nUI générée:\n\n${uiOutput}\n\nDemande originale:\n${prompt}`
    validatorOutput = await callGeminiAgent(VALIDATOR_SYSTEM, validatorPrompt, apiKey)
    const msg10 = `[v0] Validator completed, output length: ${validatorOutput.length}`
    console.log(msg10)
    yield { type: "log", message: msg10 }
    orchestrationLogs.push(msg10)

    for (let i = 0; i < validatorOutput.length; i += 100) {
      yield { type: "stage_output", stage: "validator", chunk: validatorOutput.slice(i, i + 100) }
    }

    yield {
      type: "stage_complete",
      stage: "validator",
      output: validatorOutput,
      files: { "validation-report.md": validatorOutput },
    }
  } catch (error: any) {
    const errorMsg = `[v0] Validator error: ${error.message}`
    console.log(errorMsg)
    yield { type: "log", message: errorMsg }
  }

  // Stage 7: Corrector
  const msg11 = "[v0] Starting Corrector stage"
  console.log(msg11)
  yield { type: "log", message: msg11 }
  orchestrationLogs.push(msg11)
  yield { type: "stage_start", stage: "corrector" }

  try {
    const correctorPrompt = `Rapport de validation:\n\n${validatorOutput}\n\nTous les fichiers générés:\n\n${JSON.stringify(Object.keys(allFiles))}\n\nDemande originale:\n${prompt}\n\nGénère UNIQUEMENT les fichiers manquants ou à corriger basé sur le rapport de validation.`
    correctorOutput = await callGeminiAgent(CORRECTOR_SYSTEM, correctorPrompt, apiKey, conversationHistory)

    const msg12 = `[v0] Corrector completed, output length: ${correctorOutput.length}`
    console.log(msg12)
    yield { type: "log", message: msg12 }
    orchestrationLogs.push(msg12)

    const correctedFiles = extractFiles(correctorOutput)
    const msg13 = `[v0] Extracted corrected/missing files: ${Object.keys(correctedFiles).join(", ")}`
    console.log(msg13)
    yield { type: "log", message: msg13 }
    orchestrationLogs.push(msg13)

    for (let i = 0; i < correctorOutput.length; i += 100) {
      yield { type: "stage_output", stage: "corrector", chunk: correctorOutput.slice(i, i + 100) }
    }

    yield {
      type: "stage_complete",
      stage: "corrector",
      output: correctorOutput,
      files: correctedFiles,
    }
    allFiles = { ...allFiles, ...correctedFiles }
  } catch (error: any) {
    const msg = `[v0] Corrector error: ${error.message}`
    console.log(msg)
    yield { type: "log", message: msg }
  }

  // Stage 8: Error Fixer
  const msg14 = "[v0] Starting Error Fixer stage"
  console.log(msg14)
  yield { type: "log", message: msg14 }
  orchestrationLogs.push(msg14)
  yield { type: "stage_start", stage: "errorFixer" }

  try {
    const errorFixerPrompt = `Logs d'erreur:\n\n${orchestrationLogs.join("\n")}\n\nDemande originale:\n${prompt}`
    errorFixerOutput = await callGeminiAgent(ERROR_FIXER_SYSTEM, errorFixerPrompt, apiKey)

    const msg15 = `[v0] Error Fixer completed, output length: ${errorFixerOutput.length}`
    console.log(msg15)
    yield { type: "log", message: msg15 }
    orchestrationLogs.push(msg15)

    const fixedFiles = extractFiles(errorFixerOutput)
    const msg16 = `[v0] Extracted fixed files: ${Object.keys(fixedFiles).join(", ")}`
    console.log(msg16)
    yield { type: "log", message: msg16 }
    orchestrationLogs.push(msg16)

    for (let i = 0; i < errorFixerOutput.length; i += 100) {
      yield { type: "stage_output", stage: "errorFixer", chunk: errorFixerOutput.slice(i, i + 100) }
    }

    yield {
      type: "stage_complete",
      stage: "errorFixer",
      output: errorFixerOutput,
      files: fixedFiles,
    }
    allFiles = { ...allFiles, ...fixedFiles }
  } catch (error: any) {
    const msg = `[v0] Error Fixer error: ${error.message}`
    console.log(msg)
    yield { type: "log", message: msg }
  }

  // Stage 9: Identifier Agent to find real npm packages
  const msg18 = "[v0] Starting Package Identifier stage"
  console.log(msg18)
  yield { type: "log", message: msg18 }
  orchestrationLogs.push(msg18)
  yield { type: "stage_start", stage: "identifier" }

  try {
    // Convert all files to readable format for the identifier
    const filesDescription = Object.entries(allFiles)
      .filter(([path]) => path !== "blueprint.md" && path !== "validation-report.md" && path !== "final-report.json")
      .map(([path, content]) => `\n--- File: ${path} ---\n${content}`)
      .join("\n")

    const identifierPrompt = `Voici tous les fichiers générés du projet:\n\n${filesDescription}`
    const identifierOutput = await callGeminiAgent(IDENTIFIER_SYSTEM, identifierPrompt, apiKey)

    const msg19 = `[v0] Package Identifier completed, output length: ${identifierOutput.length}`
    console.log(msg19)
    yield { type: "log", message: msg19 }
    orchestrationLogs.push(msg19)

    // Parse the JSON output from identifier
    let identifiedPackages: string[] = []
    try {
      const jsonMatch = identifierOutput.match(/```json\n([\s\S]*?)```/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1])
        identifiedPackages = parsed.packages || []
        const msg20 = `[v0] Identified ${identifiedPackages.length} real npm packages: ${identifiedPackages.join(", ")}`
        console.log(msg20)
        yield { type: "log", message: msg20 }
        orchestrationLogs.push(msg20)
      }
    } catch (parseError) {
      const msg21 = `[v0] Failed to parse identifier output, using fallback extraction`
      console.log(msg21)
      yield { type: "log", message: msg21 }
      orchestrationLogs.push(msg21)
    }

    yield {
      type: "stage_complete",
      stage: "identifier",
      output: identifierOutput,
      files: { "packages-identified.json": JSON.stringify({ packages: identifiedPackages }) },
    }

    const msg22 = "[v0] Resolving identified packages on npm..."
    console.log(msg22)
    yield { type: "log", message: msg22 }
    orchestrationLogs.push(msg22)

    const corePackages = ["next", "react", "react-dom"]
    const allPackages = [...new Set([...identifiedPackages, ...corePackages])]

    const resolvedDependencies: Record<string, string> = {}

    for (const pkgName of allPackages) {
      try {
        const msg23 = `[v0] Resolving ${pkgName}...`
        console.log(msg23)
        yield { type: "log", message: msg23 }

        const pkgInfo = await resolvePackage(pkgName)
        resolvedDependencies[pkgInfo.name] = `^${pkgInfo.version}`

        const msg24 = `[v0] ✓ ${pkgInfo.name}@${pkgInfo.version}`
        console.log(msg24)
        yield { type: "log", message: msg24 }
        orchestrationLogs.push(msg24)
      } catch (error: any) {
        const msg25 = `[v0] ✗ ${pkgName}: ${error.message}`
        console.log(msg25)
        yield { type: "log", message: msg25 }
        orchestrationLogs.push(msg25)
      }
    }

    // Create package.json ONLY if dependencies found
    if (Object.keys(resolvedDependencies).length > 0) {
      const packageJsonContent = {
        name: "generated-app",
        version: "1.0.0",
        private: true,
        scripts: {
          dev: "next dev -p 3000 -H 0.0.0.0",
          build: "next build",
          start: "next start -p 3000 -H 0.0.0.0",
        },
        description: "Generated application",
        dependencies: resolvedDependencies,
        devDependencies: {
          typescript: "^5.0.0",
          "@types/node": "^20.0.0",
          "@types/react": "^18.0.0",
        },
      }
      allFiles["package.json"] = JSON.stringify(packageJsonContent, null, 2)
      const msg26 = `[v0] Created package.json with ${Object.keys(resolvedDependencies).length} dependencies`
      console.log(msg26)
      yield { type: "log", message: msg26 }
      orchestrationLogs.push(msg26)
    } else {
      const msg27 = "[v0] No npm packages found - skipping package.json"
      console.log(msg27)
      yield { type: "log", message: msg27 }
      orchestrationLogs.push(msg27)
    }

    const finalReport = {
      timestamp: new Date().toISOString(),
      filesGenerated: Object.keys(allFiles),
      dependenciesResolved: resolvedDependencies,
      allLogs: orchestrationLogs,
      totalStages: 9,
      status: "completed",
    }

    yield {
      type: "stage_complete",
      stage: "identifier",
      output: JSON.stringify(finalReport, null, 2),
      files: { ...allFiles, "final-report.json": JSON.stringify(finalReport, null, 2) },
    }
  } catch (error: any) {
    const errorMsg = `[v0] Package Identifier error: ${error.message}`
    console.log(errorMsg)
    yield { type: "log", message: errorMsg }
    orchestrationLogs.push(errorMsg)
    yield { type: "stage_error", stage: "identifier", error: error.message }
  }
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      const errorMsg = "[v0] GEMINI_API_KEY not found in environment"
      console.log(errorMsg)
      return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 })
    }

    const body = await req.json()
    const { prompt, mode, conversationHistory, currentFiles, deploymentError } = body

    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 })
    }

    const msg = `[v0] Orchestration started for prompt: ${prompt.substring(0, 50)}`
    console.log(msg)

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of orchestrateAgents(
            prompt,
            apiKey,
            mode,
            conversationHistory,
            currentFiles,
            deploymentError,
          )) {
            controller.enqueue(encoder.encode(encodeStreamEvent(event)))
          }
          controller.close()
        } catch (error: any) {
          console.error("[v0] Fatal stream error:", error)
          controller.enqueue(
            encoder.encode(encodeStreamEvent({ type: "log", message: `[v0] Fatal error: ${error.message}` })),
          )
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    })
  } catch (error: any) {
    console.error("[v0] POST error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
