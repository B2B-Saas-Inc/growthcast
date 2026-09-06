# Vendored content engine

GrowthCast consumes `@ejwhite/content-engine` 0.1.0 from the adjacent tarball so installs do not depend on a remote package registry for this private package.

- Upstream repository: `/Users/ejwhite/Code/content-engine`
- Immutable package identifier: `package-sha256:835eb9f7c72aa2916ff67038f836607737dec8f8344ae6f1549e1466d6d34be9`
- Artifact: `ejwhite-content-engine-0.1.0-835eb9f7c72a.tgz`
- SHA-256: `835eb9f7c72aa2916ff67038f836607737dec8f8344ae6f1549e1466d6d34be9`

Verify before use:

```sh
sha256sum -c vendor/content-engine/SHA256SUMS
```

The package contains compiled runtime files, schemas, policies, and profiles from the pinned upstream release. Update the immutable package identifier, tarball, checksum, package lock, and compatibility checks together.
