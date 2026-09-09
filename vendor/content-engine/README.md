# Vendored content engine

GrowthCast consumes `@ejwhite/content-engine` 0.1.0 from the adjacent tarball so installs do not depend on a remote package registry for this private package.

- Upstream repository: `/Users/ejwhite/Code/content-engine`
- Immutable package identifier: `package-sha256:63ff65eb2b70ee94d4548e2b6fc8918dad095daa39583131362585360faef50a`
- Artifact: `ejwhite-content-engine-0.1.0-63ff65eb2b70.tgz`
- SHA-256: `63ff65eb2b70ee94d4548e2b6fc8918dad095daa39583131362585360faef50a`

Verify before use:

```sh
sha256sum -c vendor/content-engine/SHA256SUMS
```

The package contains compiled runtime files, schemas, policies, and profiles from the pinned upstream release. Update the immutable package identifier, tarball, checksum, package lock, and compatibility checks together.
