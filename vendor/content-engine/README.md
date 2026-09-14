# Vendored content engine

GrowthCast consumes `@ejwhite/content-engine` 0.1.0 from the adjacent tarball so installs do not depend on a remote package registry for this private package.

- Upstream repository: `/Users/ejwhite/Code/content-engine`
- Immutable package identifier: `package-sha256:8fa6712fa8c1802d109aea24164871b31b6b902252d3b641f3fd25be845bd7a4`
- Artifact: `ejwhite-content-engine-0.1.0-8fa6712fa8c1.tgz`
- SHA-256: `8fa6712fa8c1802d109aea24164871b31b6b902252d3b641f3fd25be845bd7a4`

Verify before use:

```sh
sha256sum -c vendor/content-engine/SHA256SUMS
```

The package contains compiled runtime files, schemas, policies, and profiles from the pinned upstream release. Update the immutable package identifier, tarball, checksum, package lock, and compatibility checks together.
