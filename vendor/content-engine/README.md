# Vendored content engine

GrowthCast consumes `@ejwhite/content-engine` 0.1.0 from the adjacent tarball so installs do not depend on a remote package registry for this private package.

- Upstream repository: `/Users/ejwhite/Code/content-engine`
- Upstream commit: `d4aaa9d2586e6e61c8ec923046708082b39cf446`
- Artifact: `ejwhite-content-engine-0.1.0-d4aaa9d.tgz`
- SHA-256: `0c0f9c676ea65f5dd6bbcc985f0f318d829db6aaa2e00641b2bd5dc54e2504b3`

Verify before use:

```sh
sha256sum -c vendor/content-engine/SHA256SUMS
```

The package contains compiled runtime files, schemas, policies, and profiles from the pinned upstream release. Update the commit, tarball, checksum, package lock, and compatibility checks together.
