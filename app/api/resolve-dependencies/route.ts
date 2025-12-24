import { NextResponse } from "next/server"
import { resolvePackage } from "@/lib/npm/resolvePackage"
import { extractDependencies } from "@/lib/npm/extractDependencies"

export async function POST(req: Request) {
  try {
    const { files } = (await req.json()) as { files: Record<string, string> }

    if (!files || Object.keys(files).length === 0) {
      return NextResponse.json({
        success: true,
        dependencies: {},
        logs: ["No files provided, skipping dependency resolution"],
      })
    }

    console.log("[resolve-dependencies] Extracting dependencies from files...")

    // Step 1: Extract dependencies from generated files
    const extracted = extractDependencies(files)
    console.log(`[resolve-dependencies] Found ${extracted.length} unique packages`, extracted)

    if (extracted.length === 0) {
      console.log("[resolve-dependencies] No dependencies found, returning empty")
      return NextResponse.json({
        success: true,
        dependencies: {},
        logs: ["No npm dependencies detected in generated code"],
      })
    }

    // Step 2: Resolve each dependency with exact version
    const logs: string[] = []
    const resolvedDependencies: Record<string, string> = {}
    const failedDependencies: Record<string, string> = {}

    for (const dep of extracted) {
      try {
        console.log(`[resolve-dependencies] Resolving ${dep.name}...`)
        logs.push(`Resolving: ${dep.name}`)

        const pkgInfo = await resolvePackage(dep.name)
        resolvedDependencies[dep.name] = `^${pkgInfo.version}`

        console.log(`[resolve-dependencies] ${dep.name}@${pkgInfo.version} ✓`)
        logs.push(`✓ ${dep.name}@${pkgInfo.version} (from ${dep.source})`)
      } catch (err: any) {
        const errorMsg = err.message || "Unknown error"
        console.error(`[resolve-dependencies] Failed to resolve ${dep.name}:`, errorMsg)
        logs.push(`✗ ${dep.name} - ${errorMsg}`)
        failedDependencies[dep.name] = errorMsg
      }
    }

    console.log("[resolve-dependencies] Resolution complete", {
      resolved: Object.keys(resolvedDependencies).length,
      failed: Object.keys(failedDependencies).length,
    })

    return NextResponse.json({
      success: Object.keys(failedDependencies).length === 0,
      dependencies: resolvedDependencies,
      failed: failedDependencies,
      logs,
    })
  } catch (err: any) {
    console.error("[resolve-dependencies] Fatal error:", err.message)
    return NextResponse.json({ error: err.message, logs: [err.message] }, { status: 500 })
  }
}
