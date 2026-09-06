import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, open, readFile, realpath, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { validatePublicationBundle } from "@ejwhite/content-engine";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const extension = { "image/png": "png", "image/webp": "webp", "image/avif": "avif" };

async function readArtifact(root, artifactPath) {
  if (typeof artifactPath !== "string" || !artifactPath || path.isAbsolute(artifactPath)) throw new Error("unsafe artifact path");
  const segments = artifactPath.split(/[\\/]+/u);
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) throw new Error("unsafe artifact path");
  const candidate = path.resolve(root, ...segments);
  const relative = path.relative(root, candidate);
  if (relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) throw new Error("unsafe artifact path");
  let current = root;
  for (const segment of segments) {
    current = path.join(current, segment);
    const info = await lstat(current);
    if (info.isSymbolicLink()) throw new Error("unsafe artifact path: symbolic links are forbidden");
  }
  const info = await lstat(candidate);
  if (!info.isFile()) throw new Error("unsafe artifact path: regular file required");
  const [resolvedRoot, resolved] = await Promise.all([realpath(root), realpath(candidate)]);
  const resolvedRelative = path.relative(resolvedRoot, resolved);
  if (resolvedRelative.startsWith(`..${path.sep}`) || resolvedRelative === ".." || path.isAbsolute(resolvedRelative)) throw new Error("unsafe artifact path");
  return readFile(candidate);
}

async function exists(file) {
  try { await stat(file); return true; } catch (error) { if (error?.code === "ENOENT") return false; throw error; }
}

async function syncDirectory(directory) {
  const handle = await open(directory, "r");
  try { await handle.sync(); } finally { await handle.close(); }
}

async function writeExclusiveDurable(file, bytes) {
  const handle = await open(file, "wx", 0o644);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
}

async function writeReceipt(root, bundle, published, articleFileSha256) {
  const directory = path.join(root, ".content-runs", "publication-receipts");
  await mkdir(directory, { recursive: true });
  const target = path.join(directory, `${bundle.publication_bundle_sha256}.json`);
  if (await exists(target)) throw new Error("durable publication receipt already exists");
  const temporary = `${target}.tmp-${process.pid}-${randomUUID()}`;
  const receipt = {
    schema_version: 1,
    status: "local-content-verified",
    brand: "growthcast",
    article_slug: bundle.article.slug,
    article_sha256: bundle.article.content_sha256,
    asset_manifest_sha256: bundle.asset_manifest.asset_manifest_sha256,
    publication_bundle_sha256: bundle.publication_bundle_sha256,
    generated_article_file_sha256: articleFileSha256,
    verified_at: new Date().toISOString(),
    deploy_triggered: false,
  };
  try {
    await writeExclusiveDurable(temporary, `${JSON.stringify(receipt)}\n`);
    await rename(temporary, target);
    await syncDirectory(directory);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
  return { path: target, receipt };
}

function exactAssets(bundle) {
  const assets = bundle.asset_manifest.assets;
  for (const kind of ["inline-illustration", "hero", "og"])
    if (!assets.some((asset) => asset.request.kind === kind)) throw new Error(`missing required ${kind} asset`);
  const locators = new Set();
  for (const asset of assets.filter((item) => item.request.kind === "inline-illustration")) {
    const locator = asset.request.body_locator;
    if (!locator || !bundle.article.body.includes(locator)) throw new Error(`inline asset ${asset.request.asset_id} has a missing locator`);
    if (locators.has(locator)) throw new Error(`duplicate inline locator: ${locator}`);
    locators.add(locator);
  }
  return [...assets].sort((a, b) => a.request.asset_id.localeCompare(b.request.asset_id));
}

function assetName(asset) {
  const suffix = extension[asset.mime_type];
  if (!suffix || asset.request.format !== suffix) throw new Error(`asset ${asset.request.asset_id} MIME/format mismatch`);
  return `${asset.request.kind}-${asset.request.asset_id}-${asset.binary_sha256.slice(0, 12)}.${suffix}`;
}

/** Filesystem/deploy destination with no implicit network behavior. */
export class GrowthcastPublicationAdapter {
  #materializations = new WeakMap();

  constructor({ root, artifactRoot = path.join(root, "artifacts"), deploy = null }) { this.root = path.resolve(root); this.artifactRoot = path.resolve(artifactRoot); this.deploy = deploy; }

  async preflight(bundle, { qaPassed = false, shadow = false } = {}) {
    const errors = [...validatePublicationBundle(bundle)];
    if (!qaPassed) errors.push("QA report does not pass");
    if (shadow) errors.push("shadow mode cannot publish");
    let assets = [];
    try { assets = exactAssets(bundle); } catch (error) { errors.push(error.message); }
    if (errors.length) return { ready: false, errors };
    for (const asset of assets) {
      const bytes = await readArtifact(this.artifactRoot, asset.artifact_path);
      if (bytes.length !== asset.byte_length || sha256(bytes) !== asset.binary_sha256) errors.push(`asset ${asset.request.asset_id} bytes do not match manifest`);
    }
    return {
      ready: errors.length === 0,
      errors,
      reasons: errors,
      qaPassed,
      articleSha256: bundle.article.content_sha256,
      assetManifestSha256: bundle.asset_manifest.asset_manifest_sha256,
      publicationBundleSha256: bundle.publication_bundle_sha256,
      approvedBy: bundle.approval?.approved_by ?? null,
    };
  }

  async materialize(bundle, options = {}) {
    const check = await this.preflight(bundle, options);
    if (!check.ready) throw new Error(`publication preflight failed: ${check.errors.join(", ")}`);
    const slug = bundle.article.slug;
    const staging = path.join(this.root, ".content-runs", "publication-staging", bundle.publication_bundle_sha256);
    const publicDir = path.join(staging, "public", "blog", slug);
    const articleFile = path.join(staging, "article.md");
    await rm(staging, { recursive: true, force: true });
    await mkdir(publicDir, { recursive: true });
    const references = {};
    let body = bundle.article.body;
    for (const asset of exactAssets(bundle)) {
      const name = assetName(asset);
      const target = path.join(publicDir, name);
      const bytes = await readArtifact(this.artifactRoot, asset.artifact_path);
      await writeExclusiveDurable(target, bytes);
      const publicPath = `/blog/${slug}/${name}`;
      references[asset.request.asset_id] = { path: publicPath, sha256: asset.binary_sha256 };
      if (asset.request.kind === "inline-illustration") {
        const markdown = `\n\n![${asset.request.alt}](${publicPath}${asset.request.caption ? ` "${asset.request.caption}"` : ""})`;
        body = body.replace(asset.request.body_locator, `${asset.request.body_locator}${markdown}`);
      }
    }
    const hero = exactAssets(bundle).find((asset) => asset.request.kind === "hero");
    const og = exactAssets(bundle).find((asset) => asset.request.kind === "og");
    const frontmatter = ["---", `title: ${JSON.stringify(bundle.article.title)}`, `description: ${JSON.stringify(bundle.article.description)}`, `publishedAt: ${JSON.stringify(bundle.article.published_at)}`, `author: ${JSON.stringify(bundle.article.author)}`, "tags: []", "featured: false", "draft: false", `image: ${JSON.stringify(references[og.request.asset_id].path)}`, `artwork: ${JSON.stringify(references[hero.request.asset_id].path)}`, `contentSha256: ${JSON.stringify(bundle.article.content_sha256)}`, `publicationBundleSha256: ${JSON.stringify(bundle.publication_bundle_sha256)}`, "---", ""].join("\n");
    const articleBytes = Buffer.from(`${frontmatter}${body}\n`);
    await writeExclusiveDurable(articleFile, articleBytes);
    await syncDirectory(publicDir);
    await syncDirectory(staging);
    const materialized = { staging, articleFile, publicDir, references, bundleHash: bundle.publication_bundle_sha256, articleFileSha256: sha256(articleBytes) };
    this.#materializations.set(materialized, { bundleHash: bundle.publication_bundle_sha256, options: { qaPassed: options.qaPassed === true, shadow: options.shadow === true }, fingerprint: sha256(Buffer.from(JSON.stringify(materialized))) });
    return materialized;
  }

  async publish(bundle, materialized) {
    const seal = materialized && this.#materializations.get(materialized);
    if (!seal || seal.bundleHash !== bundle.publication_bundle_sha256 || seal.fingerprint !== sha256(Buffer.from(JSON.stringify(materialized)))) throw new Error("unsealed or mismatched materialization");
    const check = await this.preflight(bundle, seal.options);
    if (!check.ready) throw new Error(`publication preflight failed: ${check.errors.join(", ")}`);
    const articleTarget = path.join(this.root, "src", "content", "blog", `${bundle.article.slug}.md`);
    const assetTarget = path.join(this.root, "public", "blog", bundle.article.slug);
    if (await exists(articleTarget) || await exists(assetTarget)) throw new Error("destination exists; refusing overwrite");
    await mkdir(path.dirname(articleTarget), { recursive: true });
    await mkdir(path.dirname(assetTarget), { recursive: true });
    await rename(materialized.publicDir, assetTarget);
    try { await rename(materialized.articleFile, articleTarget); }
    catch (error) { await rename(assetTarget, materialized.publicDir); throw error; }
    await syncDirectory(path.dirname(articleTarget));
    await syncDirectory(path.dirname(assetTarget));
    const published = { articleTarget, assetTarget, references: materialized.references, bundleHash: materialized.bundleHash, articleFileSha256: materialized.articleFileSha256, deploymentStatus: this.deploy ? "pending" : "not-configured" };
    try {
      await this.readBack(bundle, published);
      const durableEvidence = await writeReceipt(this.root, bundle, published, materialized.articleFileSha256);
      published.receiptPath = durableEvidence.path;
    } catch (error) {
      await Promise.all([rm(articleTarget, { force: true }), rm(assetTarget, { recursive: true, force: true })]);
      throw error;
    }
    if (this.deploy) {
      try {
        await this.deploy({ slug: bundle.article.slug, publicationBundleSha256: bundle.publication_bundle_sha256, receiptPath: published.receiptPath });
        published.deploymentStatus = "triggered";
      } catch (cause) {
        // The hook may have accepted the request before its client observed failure. Keep the
        // verified local publication and receipt so an automatic retry cannot trigger twice.
        published.deploymentStatus = "unknown";
        const error = new Error("deploy outcome is unknown after local publication; manual reconciliation is required", { cause });
        error.published = published;
        error.rollback = this.rollbackMetadata(bundle, published);
        throw error;
      }
    }
    return published;
  }

  async readBack(bundle, published) {
    const sourceBytes = await readFile(published.articleTarget);
    if (!published.articleFileSha256 || sha256(sourceBytes) !== published.articleFileSha256) throw new Error("article readback bytes do not match materialization");
    const source = sourceBytes.toString("utf8");
    for (const asset of bundle.asset_manifest.assets) {
      const reference = published.references[asset.request.asset_id];
      const bytes = await readFile(path.join(this.root, "public", reference.path.replace(/^\//u, "")));
      if (sha256(bytes) !== asset.binary_sha256) throw new Error(`readback mismatch for asset ${asset.request.asset_id}`);
      if (!source.includes(reference.path)) throw new Error(`article readback is missing asset ${asset.request.asset_id}`);
    }
    if (!source.includes(`contentSha256: ${JSON.stringify(bundle.article.content_sha256)}`) || !source.includes(`publicationBundleSha256: ${JSON.stringify(bundle.publication_bundle_sha256)}`)) throw new Error("article readback mismatch");
    return { verified: true, articleSha256: bundle.article.content_sha256, publicationBundleSha256: bundle.publication_bundle_sha256 };
  }

  rollbackMetadata(bundle, published) {
    return { publicationBundleSha256: bundle.publication_bundle_sha256, createdPaths: [published.articleTarget, published.assetTarget], deploymentStatus: published.deploymentStatus ?? "unknown", manualReconciliationRequired: published.deploymentStatus === "unknown", overwritePerformed: false };
  }
}
