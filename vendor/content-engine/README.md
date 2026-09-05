# Vendored content engine

GrowthCast consumes `@ejwhite/content-engine` 0.1.0 from the adjacent tarball so installs do not depend on a remote package registry for this private package.

- Upstream repository: `/Users/ejwhite/Code/content-engine`
- Immutable package identifier: `package-sha256:473d26fdc3eecdf2f811ec16e94a3ea6198c068fdbbdccb5173136e8fb331f76`
- Artifact: `ejwhite-content-engine-0.1.0-473d26fdc3ee.tgz`
- SHA-256: `473d26fdc3eecdf2f811ec16e94a3ea6198c068fdbbdccb5173136e8fb331f76`

Verify before use:

```sh
sha256sum -c vendor/content-engine/SHA256SUMS
```

The package contains compiled runtime files, schemas, policies, and profiles from the pinned upstream release. Update the immutable package identifier, tarball, checksum, package lock, and compatibility checks together.
