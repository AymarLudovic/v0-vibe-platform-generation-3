import { NextResponse } from "next/server"

interface PackageInfo {
  name: string
  version: string
  status: "found" | "notfound" | "error"
  description?: string
  error?: string
}

interface ValidationResult {
  packages: PackageInfo[]
  packageJson: Record<string, string>
  timestamp: string
  logs: string[]
  success: boolean
}

function extractImports(files: Record<string, string>): Set<string> {
  const imports = new Set<string>()

  // Regex patterns pour ESM et CommonJS
  const patterns = [
    /import\s+(?:(?:\{[^}]*\})|(?:\*\s+as\s+\w+)|(?:[^'"]*?))\s+from\s+['"]([^'"]+)['"]/g,
    /import\s+['"]([^'"]+)['"]/g,
    /require\s*$$\s*['"]([^'"]+)['"]\s*$$/g,
    /from\s+['"]([^'"]+)['"]/g,
  ]

  Object.entries(files).forEach(([filename, content]) => {
    if (!content) return

    patterns.forEach((pattern) => {
      let match
      while ((match = pattern.exec(content)) !== null) {
        const packageName = match[1]

        // Ignorer les imports internes et relatifs
        if (
          packageName &&
          !packageName.startsWith(".") &&
          !packageName.startsWith("node:") &&
          !packageName.startsWith("/") &&
          packageName !== ""
        ) {
          // Extraire le nom du package (gérer les scoped packages @org/package)
          const baseName = packageName.startsWith("@")
            ? packageName.split("/").slice(0, 2).join("/")
            : packageName.split("/")[0]

          imports.add(baseName)
        }
      }
    })
  })

  return imports
}

async function fetchNpmPackageWithRetry(
  packageName: string,
  retries = 3,
  logs: string[] = [],
): Promise<{ result: PackageInfo; logs: string[] }> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const logMsg = `[npm-validator] Fetching ${packageName} (attempt ${attempt + 1}/${retries})`
      logs.push(logMsg)
      console.log(logMsg)

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 8000) // 8 secondes timeout

      const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(packageName)}`, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "User-Agent": "Vibe-Platform/1.0",
        },
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const notFoundMsg = `[npm-validator] ✗ ${packageName} not found (HTTP ${response.status})`
        logs.push(notFoundMsg)
        console.log(notFoundMsg)
        return {
          result: {
            name: packageName,
            version: "NOT_FOUND",
            status: "notfound",
            error: `Package not found (HTTP ${response.status})`,
          },
          logs,
        }
      }

      const data = (await response.json()) as {
        "dist-tags"?: { latest?: string }
        description?: string
      }

      const latestVersion = data["dist-tags"]?.latest
      if (!latestVersion) {
        const noVersionMsg = `[npm-validator] ✗ ${packageName}: No version found`
        logs.push(noVersionMsg)
        console.log(noVersionMsg)
        return {
          result: {
            name: packageName,
            version: "NO_VERSION",
            status: "error",
            error: "No version information found",
          },
          logs,
        }
      }

      const successMsg = `[npm-validator] ✓ ${packageName}@${latestVersion}`
      logs.push(successMsg)
      console.log(successMsg)

      return {
        result: {
          name: packageName,
          version: latestVersion,
          status: "found",
          description: data.description,
        },
        logs,
      }
    } catch (error: any) {
      const errorMsg = `[npm-validator] ⚠ Attempt ${attempt + 1} failed for ${packageName}: ${error?.message || String(error)}`
      logs.push(errorMsg)
      console.log(errorMsg)

      // Retry avec délai exponentiel
      if (attempt < retries - 1) {
        const delay = Math.pow(2, attempt) * 1000
        const delayMsg = `[npm-validator] Waiting ${delay}ms before retry...`
        logs.push(delayMsg)
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }
  }

  // Tous les retries échoués
  const failedMsg = `[npm-validator] ✗ All retries failed for ${packageName}`
  logs.push(failedMsg)
  console.log(failedMsg)

  return {
    result: {
      name: packageName,
      version: "ERROR",
      status: "error",
      error: "Failed to fetch after multiple retries",
    },
    logs,
  }
}

async function validatePackages(files: Record<string, string>): Promise<ValidationResult> {
  const logs: string[] = []

  const startMsg = "[npm-validator] Starting NPM package validation..."
  logs.push(startMsg)
  console.log(startMsg)

  // Extraire les imports
  const importedPackages = extractImports(files)
  const foundMsg = `[npm-validator] Found ${importedPackages.size} unique packages: ${Array.from(importedPackages).join(", ")}`
  logs.push(foundMsg)
  console.log(foundMsg)

  if (importedPackages.size === 0) {
    const noImportsMsg = "[npm-validator] No imports found"
    logs.push(noImportsMsg)
    console.log(noImportsMsg)
    return {
      packages: [],
      packageJson: {},
      timestamp: new Date().toISOString(),
      logs,
      success: true,
    }
  }

  // Valider chaque package
  const packageResults: PackageInfo[] = []
  const packageJson: Record<string, string> = {}

  const packageArray = Array.from(importedPackages).sort()
  const batchSize = 1 // Un package à la fois pour éviter les throttles

  const batchMsg = `[npm-validator] Starting batch validation (batch size: ${batchSize})...`
  logs.push(batchMsg)
  console.log(batchMsg)

  for (let i = 0; i < packageArray.length; i += batchSize) {
    const batch = packageArray.slice(i, i + batchSize)

    for (const pkgName of batch) {
      const { result, logs: pkgLogs } = await fetchNpmPackageWithRetry(pkgName, 3, logs)
      logs.push(...pkgLogs)
      packageResults.push(result)

      // Ajouter au package.json seulement si trouvé
      if (result.status === "found") {
        packageJson[result.name] = `^${result.version}`
        const addedMsg = `[npm-validator] Added to package.json: ${result.name}@^${result.version}`
        logs.push(addedMsg)
        console.log(addedMsg)
      }
    }

    // Délai entre les batches
    if (i + batchSize < packageArray.length) {
      const waitMsg = "[npm-validator] Waiting 500ms before next batch..."
      logs.push(waitMsg)
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }

  const foundCount = packageResults.filter((p) => p.status === "found").length
  const errorCount = packageResults.filter((p) => p.status !== "found").length

  const completeMsg = `[npm-validator] Validation complete: ${foundCount} found, ${errorCount} not found/error`
  logs.push(completeMsg)
  console.log(completeMsg)

  return {
    packages: packageResults,
    packageJson,
    timestamp: new Date().toISOString(),
    logs,
    success: errorCount === 0,
  }
}

export async function POST(req: Request) {
  const logs: string[] = []

  try {
    const startMsg = "[npm-validator] API request received"
    logs.push(startMsg)
    console.log(startMsg)

    const body = await req.json()
    const { files } = body as { files?: Record<string, string> }

    const filesMsg = `[npm-validator] Files received: ${Object.keys(files || {}).length} files`
    logs.push(filesMsg)
    console.log(filesMsg)

    if (!files || typeof files !== "object" || Object.keys(files).length === 0) {
      const errorMsg = "[npm-validator] Invalid files object - empty or not an object"
      logs.push(errorMsg)
      console.error(errorMsg)

      return NextResponse.json(
        {
          error: "Invalid files object",
          packages: [],
          packageJson: {},
          timestamp: new Date().toISOString(),
          logs,
          success: false,
        },
        { status: 400 },
      )
    }

    const result = await validatePackages(files)
    return NextResponse.json({ ...result, logs: [...logs, ...result.logs] })
  } catch (error: any) {
    const errorMsg = `[npm-validator] Fatal error: ${error?.message || String(error)}`
    logs.push(errorMsg)
    console.error(errorMsg)

    return NextResponse.json(
      {
        error: errorMsg,
        packages: [],
        packageJson: {},
        timestamp: new Date().toISOString(),
        logs,
        success: false,
      },
      { status: 500 },
    )
  }
}
