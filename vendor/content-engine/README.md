# Vendored content engine

GrowthCast consumes `@ejwhite/content-engine` 0.1.0 from the adjacent tarball so installs do not depend on a remote package registry for this private package.

- Upstream repository: `/Users/ejwhite/Code/content-engine`
- Immutable package identifier: `package-sha256:588028b232bd8169137fcdfea808f2151b151cb2fc6e69d0a8e8822201cf8531`
- Artifact: `ejwhite-content-engine-0.1.0-588028b232bd.tgz`
- SHA-256: `588028b232bd8169137fcdfea808f2151b151cb2fc6e69d0a8e8822201cf8531`

Verify before use:

```sh
sha256sum -c vendor/content-engine/SHA256SUMS
```

The package contains compiled runtime files, schemas, policies, and profiles from the pinned upstream release. Update the immutable package identifier, tarball, checksum, package lock, and compatibility checks together.
