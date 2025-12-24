export interface ExtractedDependency {
  name: string
  source: string // which file mentioned it
}

export function extractDependencies(files: Record<string, string>): ExtractedDependency[] {
  const dependencies = new Map<string, string>()

  // Patterns pour extraire les imports
  const patterns = [
    /import\s+(?:{[^}]*}|[^'"]+)\s+from\s+['"]([^'"]+)['"]/g, // ES6 imports
    /require$$['"]([^'"]+)['"]$$/g, // CommonJS
    /from\s+['"]([^'"]+)['"]/g, // Additional ESM pattern
  ]

  for (const [filename, content] of Object.entries(files)) {
    if (
      !filename.endsWith(".ts") &&
      !filename.endsWith(".tsx") &&
      !filename.endsWith(".js") &&
      !filename.endsWith(".jsx")
    ) {
      continue
    }

    for (const pattern of patterns) {
      let match
      while ((match = pattern.exec(content)) !== null) {
        const importPath = match[1]

        // Skip relative imports et builtin modules
        if (importPath.startsWith(".") || importPath.startsWith("/") || isBuiltinModule(importPath)) {
          continue
        }

        // Extract package name (handle @scoped packages)
        const packageName = importPath.startsWith("@")
          ? importPath.split("/").slice(0, 2).join("/")
          : importPath.split("/")[0]

        if (!dependencies.has(packageName)) {
          dependencies.set(packageName, filename)
        }
      }
    }
  }

  return Array.from(dependencies.entries()).map(([name, source]) => ({
    name,
    source,
  }))
}

function isBuiltinModule(name: string): boolean {
  const builtins = [
    "fs",
    "path",
    "http",
    "https",
    "events",
    "stream",
    "util",
    "crypto",
    "os",
    "url",
    "querystring",
    "buffer",
    "process",
    "child_process",
    "net",
    "dgram",
    "dns",
    "domain",
    "inspector",
    "cluster",
    "zlib",
    "perf_hooks",
    "async_hooks",
    "v8",
    "repl",
    "readline",
    "tty",
    "vm",
    "assert",
    "constants",
    "module",
    "next",
    "react",
    "react-dom",
  ]
  return builtins.includes(name)
}
