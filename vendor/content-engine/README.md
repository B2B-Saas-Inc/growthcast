# Vendored content engine

GrowthCast consumes `@ejwhite/content-engine` 0.1.0 from the adjacent tarball so installs do not depend on a remote package registry for this private package.

- Upstream repository: `/Users/ejwhite/Code/content-engine`
- Immutable package identifier: `package-sha256:e641494368a9cac902ce038a0b27cce50aeb38ba56764f2af4df603a6c43aa3a`
- Artifact: `ejwhite-content-engine-0.1.0-e641494368a9.tgz`
- SHA-256: `e641494368a9cac902ce038a0b27cce50aeb38ba56764f2af4df603a6c43aa3a`

Verify before use:

```sh
sha256sum -c vendor/content-engine/SHA256SUMS
```

The package contains compiled runtime files, schemas, policies, and profiles from the pinned upstream release. Update the immutable package identifier, tarball, checksum, package lock, and compatibility checks together.
