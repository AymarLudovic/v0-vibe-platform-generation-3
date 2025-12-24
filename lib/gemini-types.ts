export interface GeminiConfig {
  apiKey: string
  model: "gemini-3-flash-preview" | "gemini-pro" | "gemini-pro-vision"
}

export interface AgentTask {
  stage: "pkg" | "backend" | "ui" | "validator"
  prompt: string
  context: string
}

export interface AgentOutput {
  stage: string
  success: boolean
  content: string
  files: Record<string, string>
  error?: string
}

export interface OrchestratorState {
  currentStage: string
  results: AgentOutput[]
  allFiles: Record<string, string>
}
