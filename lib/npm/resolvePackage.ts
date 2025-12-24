import packageJson from "package-json"

export type NpmPackageInfo = {
  name: string
  version: string
  description?: string
  homepage?: string
  repository?: string
  license?: string
  author?: string
  distTags?: Record<string, string>
}

const NPM_NAME_REGEX = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/i

export async function resolvePackage(name: string): Promise<NpmPackageInfo> {
  if (!name || !NPM_NAME_REGEX.test(name)) {
    throw new Error("INVALID_PACKAGE_NAME")
  }

  try {
    const pkg = await packageJson(name, {
      fullMetadata: false,
    })

    return {
      name: pkg.name,
      version: pkg.version,
      description: pkg.description,
      homepage: pkg.homepage,
      repository: typeof pkg.repository === "string" ? pkg.repository : pkg.repository?.url,
      license: pkg.license,
      author: typeof pkg.author === "string" ? pkg.author : pkg.author?.name,
      distTags: pkg["dist-tags"],
    }
  } catch (err: any) {
    if (err?.statusCode === 404) {
      throw new Error("PACKAGE_NOT_FOUND")
    }

    throw new Error("NPM_REGISTRY_ERROR")
  }
}
