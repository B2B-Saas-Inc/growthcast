# Vendored content engine

GrowthCast consumes `@ejwhite/content-engine` 0.1.0 from the adjacent tarball so installs do not depend on a remote package registry for this private package.

- Upstream repository: `/Users/ejwhite/Code/content-engine`
- Immutable package identifier: `package-sha256:f8499258bd6e3ac101f99a625b6759f26634879e5a44821269c69628e9ccc55c`
- Artifact: `ejwhite-content-engine-0.1.0-f8499258bd6e.tgz`
- SHA-256: `f8499258bd6e3ac101f99a625b6759f26634879e5a44821269c69628e9ccc55c`

Verify before use:

```sh
sha256sum -c vendor/content-engine/SHA256SUMS
```

The package contains compiled runtime files, schemas, policies, and profiles from the pinned upstream release. Update the immutable package identifier, tarball, checksum, package lock, and compatibility checks together.
