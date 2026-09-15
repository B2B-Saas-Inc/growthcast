# Vendored content engine

GrowthCast consumes `@ejwhite/content-engine` 0.1.0 from the adjacent tarball so installs do not depend on a remote package registry for this private package.

- Upstream repository: `/Users/ejwhite/Code/content-engine`
- Immutable package identifier: `package-sha256:b5d52f16bf9e1331e433d468dbd393b4fdf844e05e8a0d00a1e65d811b577a2c`
- Artifact: `ejwhite-content-engine-0.1.0-b5d52f16bf9e.tgz`
- SHA-256: `b5d52f16bf9e1331e433d468dbd393b4fdf844e05e8a0d00a1e65d811b577a2c`

Verify before use:

```sh
sha256sum -c vendor/content-engine/SHA256SUMS
```

The package contains compiled runtime files, schemas, policies, and profiles from the pinned upstream release. Update the immutable package identifier, tarball, checksum, package lock, and compatibility checks together.
