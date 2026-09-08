# Vendored content engine

GrowthCast consumes `@ejwhite/content-engine` 0.1.0 from the adjacent tarball so installs do not depend on a remote package registry for this private package.

- Upstream repository: `/Users/ejwhite/Code/content-engine`
- Immutable package identifier: `package-sha256:7c80c1c117ff0bbec78d64225ec36d695ed92e1f74118d9de4be7cfffad5900f`
- Artifact: `ejwhite-content-engine-0.1.0-7c80c1c117ff.tgz`
- SHA-256: `7c80c1c117ff0bbec78d64225ec36d695ed92e1f74118d9de4be7cfffad5900f`

Verify before use:

```sh
sha256sum -c vendor/content-engine/SHA256SUMS
```

The package contains compiled runtime files, schemas, policies, and profiles from the pinned upstream release. Update the immutable package identifier, tarball, checksum, package lock, and compatibility checks together.
