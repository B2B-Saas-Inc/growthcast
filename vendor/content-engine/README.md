# Vendored content engine

GrowthCast consumes `@ejwhite/content-engine` 0.1.0 from the adjacent tarball so installs do not depend on a remote package registry for this private package.

- Upstream repository: `/Users/ejwhite/Code/content-engine`
- Immutable package identifier: `package-sha256:80391614a40f19394d5fc9477edcf15bc39da49c32477709c47d63f047975509`
- Artifact: `ejwhite-content-engine-0.1.0-80391614a40f.tgz`
- SHA-256: `80391614a40f19394d5fc9477edcf15bc39da49c32477709c47d63f047975509`

Verify before use:

```sh
sha256sum -c vendor/content-engine/SHA256SUMS
```

The package contains compiled runtime files, schemas, policies, and profiles from the pinned upstream release. Update the immutable package identifier, tarball, checksum, package lock, and compatibility checks together.
