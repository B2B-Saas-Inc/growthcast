# Vendored content engine

GrowthCast consumes `@ejwhite/content-engine` 0.1.0 from the adjacent tarball so installs do not depend on a remote package registry for this private package.

- Upstream repository: `/Users/ejwhite/Code/content-engine`
- Immutable package identifier: `package-sha256:86a92a483a1245c0ffbbf1627997e915da8be28d0a57a60a96e340dde15fcaae`
- Artifact: `ejwhite-content-engine-0.1.0-86a92a483a12.tgz`
- SHA-256: `86a92a483a1245c0ffbbf1627997e915da8be28d0a57a60a96e340dde15fcaae`

Verify before use:

```sh
sha256sum -c vendor/content-engine/SHA256SUMS
```

The package contains compiled runtime files, schemas, policies, and profiles from the pinned upstream release. Update the immutable package identifier, tarball, checksum, package lock, and compatibility checks together.
