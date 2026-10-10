import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import "./wizard.css";
import {
  AD_PLATFORMS,
  ANGLES,
  CONSENT_TEXT,
  FUNNEL_STAGES,
  GENERATION_LIMIT,
  RESEARCH_KINDS,
  UPLOAD_EXTENSIONS,
  UPLOAD_MAX_BYTES,
  URL_TYPES,
  WEBSITE_FORMATS,
} from "./wizard/constants";
import type { IcpCandidate } from "./wizard/icp";
import { buildBundle, saveBlob, slugify, stepDoc, stepPdf } from "./wizard/export";
import { renderMarkdown } from "./wizard/markdown";

type ModuleId = "research" | "jtbd" | "positioning" | "pmm" | "copy";
type Me = { firstName: string; email: string; remaining: number; runs: { id: string; product: string; feature: string; created_at: string; modules: string[] }[] };
type Job = { id: string; module: ModuleId; status: "running" | "succeeded" | "failed"; input: { reviseJobId?: string; copy?: { format?: string } }; output: string | null; error: string | null; startedAt: string };
type Evidence = { id: string; kind: "upload" | "url"; name: string; url: string | null; urlType: string | null; note: string; status: "pending" | "ready" | "failed"; error: string | null; chars: number };
type Brief = { kinds: string[]; competitors: string; queries: string; audience: string; depth: "standard" | "deep" };
type RunData = {
  run: { id: string; product: string; feature: string; website: string; audience: string; researchBrief: Partial<Brief>; icp: { name: string; summary?: string } | null };
  evidence: Evidence[];
  jobs: Job[];
  icps: IcpCandidate[];
  limits: { copyPerRun: number; revisionsPerModule: number; uploadsPerRun: number; urlsPerRun: number };
};
type CopyDraft = { kind: "website" | "ad" | null; format: string; funnelStage: string; angle: string; conversionAction: string; variations: number; constraints: string };

const STEPS: { id: ModuleId; num: string; name: string; title: string; desc: string }[] = [
  { id: "research", num: "00", name: "Evidence", title: "Bring the evidence, or let us find it.", desc: "Upload interviews, reviews, or survey exports, add links worth reading, and brief a web research sweep. The output is indexed research notes with verbatim quotes." },
  { id: "jtbd", num: "01", name: "Jobs-to-be-Done", title: "What progress are customers hiring you for?", desc: "Core job statements, functional, emotional and social dimensions, the four forces of progress, true competition, and prioritized opportunities." },
  { id: "positioning", num: "02", name: "Positioning", title: "Where you win, and for whom.", desc: "Competitive alternatives, unique attributes, a value map, ICP candidates, market category, and a positioning statement per ICP." },
  { id: "pmm", num: "03", name: "ICP guidance", title: "Messaging for one ICP.", desc: "Choose an ICP from the positioning work. You get product marketing context plus messaging pillars, objections, and channels for that ICP." },
  { id: "copy", num: "04", name: "Copy", title: "Turn the strategy into copy.", desc: "Build a brief for website or ad copy. Every headline traces back to a job, a switching force, or a proof point." },
];

async function api<T>(route: string, init: { method?: string; body?: unknown; query?: Record<string, string> } = {}): Promise<T> {
  const qs = init.query ? `?${new URLSearchParams(init.query)}` : "";
  const res = await fetch(`/api/wizard/${route}${qs}`, {
    method: init.method ?? "GET",
    credentials: "same-origin",
    headers: init.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const data = (await res.json().catch(() => null)) as (T & { message?: string; error?: string }) | null;
  if (!res.ok) throw Object.assign(new Error(data?.message ?? "Something went wrong. Please try again."), { status: res.status });
  return data as T;
}

const readFile = (file: File, as: "text" | "base64") =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(as === "base64" ? result.slice(result.indexOf(",") + 1) : result);
    };
    if (as === "base64") reader.readAsDataURL(file);
    else reader.readAsText(file);
  });

const runFromUrl = () => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("run"));
const done = (data: RunData | null, id: ModuleId) => !!data?.jobs.some((j) => j.module === id && j.status === "succeeded");
const outputsFor = (data: RunData | null, id: ModuleId) => (data?.jobs ?? []).filter((j) => j.module === id && j.status === "succeeded" && j.output);

function jobLabel(job: Job, index: number, all: Job[]) {
  const before = all.slice(0, index);
  if (job.input.reviseJobId) return `Revision ${before.filter((j) => j.input.reviseJobId).length + 1}`;
  if (job.module === "copy") return job.input.copy?.format ?? `Copy ${index + 1}`;
  const n = before.filter((j) => !j.input.reviseJobId).length;
  return n === 0 ? "Original" : `Version ${n + 1}`;
}

export default function WizardApp({ onContact }: { onContact: () => void }) {
  const [me, setMe] = useState<Me | null | "loading">("loading");
  const [runId, setRunId] = useState<string | null>(runFromUrl);
  const [data, setData] = useState<RunData | null>(null);
  const [step, setStep] = useState<ModuleId>("research");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const loadMe = useCallback(async () => {
    try {
      const next = await api<Me & { signedIn: boolean }>("me");
      setMe(next.signedIn ? next : null);
    } catch (e) {
      if ((e as { status?: number }).status === 401) setMe(null);
      else {
        setMe(null);
        setError((e as Error).message);
      }
    }
  }, []);

  const loadRun = useCallback(async (id: string) => {
    try {
      const next = await api<RunData>("run", { query: { id } });
      setData(next);
      return next;
    } catch (e) {
      setError((e as Error).message);
      if ((e as { status?: number }).status === 404) openRun(null);
      return null;
    }
  }, []);

  function openRun(id: string | null) {
    setRunId(id);
    setData(null);
    setError("");
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("run", id);
    else url.searchParams.delete("run");
    window.history.replaceState({}, "", url);
  }

  useEffect(() => {
    let active = true;
    api<Me & { signedIn: boolean }>("me")
      .then((next) => active && setMe(next.signedIn ? next : null))
      .catch((e: Error & { status?: number }) => {
        if (!active) return;
        setMe(null);
        if (e.status !== 401) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!runId || !me || me === "loading") return;
    let active = true;
    api<RunData>("run", { query: { id: runId } })
      .then((next) => {
        if (!active) return;
        setData(next);
        setStep(STEPS.find((s) => !done(next, s.id))?.id ?? "copy");
      })
      .catch((e: Error & { status?: number }) => {
        if (!active) return;
        setError(e.message);
        if (e.status === 404) openRun(null);
      });
    return () => {
      active = false;
    };
  }, [runId, me]);

  const running = data?.jobs.find((j) => j.status === "running") ?? null;
  useEffect(() => {
    if (!running || !runId) return;
    const timer = window.setInterval(() => void loadRun(runId), 4000);
    return () => window.clearInterval(timer);
  }, [running, runId, loadRun]);

  const signOut = async () => {
    await api("logout", { method: "POST", body: {} }).catch(() => null);
    openRun(null);
    setMe(null);
  };

  if (me === "loading") return <article className="homeCard agencyHome wizard"><WizardHero /><p className="wzStatus" role="status">Loading…</p></article>;

  return (
    <article className="homeCard agencyHome wizard">
      <WizardHero me={me} onSignOut={signOut} />
      {error && <p className="wzError" role="alert">{error} <button type="button" className="wzLink" onClick={() => setError("")}>Dismiss</button></p>}
      {notice && <p className="wzNotice" role="status">{notice}</p>}
      {!me ? (
        <Gate onDone={(next) => { setMe(next); void loadMe(); }} />
      ) : !runId ? (
        <Dashboard me={me} onOpen={openRun} onCreated={async (id) => { await loadMe(); openRun(id); }} onContact={onContact} />
      ) : !data ? (
        <p className="wzStatus" role="status">Loading run…</p>
      ) : (
        <RunView
          data={data}
          step={step}
          setStep={setStep}
          busy={busy || !!running}
          running={running}
          onBack={() => { openRun(null); void loadMe(); }}
          refresh={() => loadRun(data.run.id)}
          act={async (fn, success) => {
            setBusy(true);
            setError("");
            setNotice("");
            try {
              await fn();
              if (success) setNotice(success);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
              await loadRun(data.run.id);
            }
          }}
        />
      )}
    </article>
  );
}

function WizardHero({ me, onSignOut }: { me?: Me | null; onSignOut?: () => void }) {
  return (
    <section className="wzHero">
      <span className="wzEyebrow">Resources · Tools</span>
      <h1>Positioning Wizard</h1>
      <p>Go from customer evidence to Jobs-to-be-Done, positioning, ICP messaging, and ad or website copy. Each step builds on the last, and every claim traces back to evidence.</p>
      {me && (
        <p className="wzAccount">
          {me.email} · {me.remaining} of {GENERATION_LIMIT} runs left · <button type="button" className="wzLink" onClick={onSignOut}>Sign out</button>
        </p>
      )}
    </section>
  );
}

function Gate({ onDone }: { onDone: (me: Me) => void }) {
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setStatus("");
    try {
      const result = await api<Omit<Me, "runs">>("session", {
        method: "POST",
        body: { firstName: form.get("firstName"), email: form.get("email"), consent: form.get("consent") === "on" },
      });
      onDone({ ...result, runs: [] });
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setPending(false);
    }
  };
  return (
    <section className="wzGate">
      <div>
        <h2>Free for your first {GENERATION_LIMIT} runs.</h2>
        <ol className="wzSteps">
          {STEPS.map((s) => <li key={s.id}><b>{s.num}</b><span>{s.name}</span></li>)}
        </ol>
      </div>
      <form className="wzPanel wzForm" onSubmit={submit}>
        <label>First name<input name="firstName" autoComplete="given-name" required maxLength={80} /></label>
        <label>Work email<input name="email" type="email" autoComplete="email" required maxLength={254} /></label>
        <label className="wzCheck"><input name="consent" type="checkbox" required /> <span>{CONSENT_TEXT} See our <a href="/privacy">Privacy Policy</a>.</span></label>
        <button className="wzPrimary" type="submit" disabled={pending}>{pending ? "Starting…" : "Start the wizard"}</button>
        {status && <p className="wzError" role="alert">{status}</p>}
      </form>
    </section>
  );
}

function Dashboard({ me, onOpen, onCreated, onContact }: { me: Me; onOpen: (id: string) => void; onCreated: (id: string) => Promise<void>; onContact: () => void }) {
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(false);
  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setStatus("");
    try {
      const { id } = await api<{ id: string }>("runs", { method: "POST", body: Object.fromEntries(form.entries()) });
      await onCreated(id);
    } catch (e) {
      setStatus((e as Error).message);
      setPending(false);
    }
  };
  return (
    <section className="wzDashboard">
      <div>
        <h2>Your runs</h2>
        {me.runs.length ? (
          <ul className="wzRuns">
            {me.runs.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => onOpen(r.id)}>
                  <b>{r.product}</b>
                  <span>{r.feature || "Whole product"}</span>
                  <small>{r.modules.filter((m) => m !== "research").length}/4 modules · {new Date(r.created_at).toLocaleDateString()}</small>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="wzMuted">No runs yet. Start one to begin.</p>
        )}
      </div>
      {me.remaining > 0 ? (
        <form className="wzPanel wzForm" onSubmit={create}>
          <h3>Start a new run</h3>
          <p className="wzMuted">This uses 1 of your {me.remaining} remaining runs. Revisions and extra copy inside a run are included.</p>
          <label>Product or company<input name="product" required maxLength={120} placeholder="e.g. Acme Billing" /></label>
          <label>Website (optional)<input name="website" type="url" maxLength={300} placeholder="https://example.com" /></label>
          <label>Feature to position (optional)<input name="feature" maxLength={160} placeholder="Leave empty for the whole product" /></label>
          <label>Audience or market (optional)<input name="audience" maxLength={500} placeholder="e.g. Independent home service owners" /></label>
          <label>Competitors and alternatives (optional)<input name="competitors" maxLength={500} placeholder="e.g. Jobber, spreadsheets, an agency" /></label>
          <button className="wzPrimary" type="submit" disabled={pending}>{pending ? "Creating…" : "Create run"}</button>
          {status && <p className="wzError" role="alert">{status}</p>}
        </form>
      ) : (
        <div className="wzPanel">
          <h3>You have used all {GENERATION_LIMIT} runs.</h3>
          <p className="wzMuted">You can still open and download your existing runs. Want help applying the positioning across your growth plan?</p>
          <button className="wzPrimary" type="button" onClick={onContact}>Let&apos;s Talk Growth</button>
        </div>
      )}
    </section>
  );
}

type Act = (fn: () => Promise<unknown>, success?: string) => Promise<void>;

function RunView({ data, step, setStep, busy, running, onBack, refresh, act }: {
  data: RunData; step: ModuleId; setStep: (s: ModuleId) => void; busy: boolean; running: Job | null;
  onBack: () => void; refresh: () => Promise<unknown>; act: Act;
}) {
  const current = STEPS.find((s) => s.id === step)!;
  const { run } = data;
  return (
    <section className="wzRun">
      <button type="button" className="wzLink wzBack" onClick={onBack}>← All runs</button>
      <div className="wzRunHead">
        <div>
          <h2 className="wzRunTitle">{run.feature ? `${run.product}: ${run.feature}` : run.product}</h2>
          <p className="wzMuted">{run.icp ? `ICP: ${run.icp.name}` : "No ICP chosen yet. You will pick one in step 03."}</p>
        </div>
        <BundleButton data={data} />
      </div>
      <nav className="wzStepper" aria-label="Wizard steps">
        {STEPS.map((s) => {
          const state = running?.module === s.id ? "running" : done(data, s.id) ? "done" : "";
          return (
            <button key={s.id} type="button" className={s.id === step ? "active" : ""} aria-current={s.id === step ? "step" : undefined} onClick={() => setStep(s.id)}>
              <span className="wzNum">{s.num}</span>
              <span className="wzName">{s.name}</span>
              <small className={`wzState ${state}`}>{state === "running" ? "Running" : state === "done" ? "Saved" : s.id === "research" ? "Optional" : "Not started"}</small>
            </button>
          );
        })}
      </nav>
      <div className="wzModuleHead">
        <span className="wzEyebrow">Step {current.num}</span>
        <h3>{current.title}</h3>
        <p>{current.desc}</p>
      </div>
      {running && <p className="wzRunning" role="status"><span className="wzSpinner" aria-hidden="true" /> {STEPS.find((s) => s.id === running.module)?.name} is running. This usually takes one to three minutes. You can leave this page and come back.</p>}
      {step === "copy" && done(data, "copy") && (
        <div className="wzPanel wzBundlePanel">
          <div>
            <h4>Your workshop is complete</h4>
            <p className="wzMuted">Download everything in one ZIP: each step as Markdown and PDF, a combined report, your evidence sources, and every revision.</p>
          </div>
          <BundleButton data={data} primary />
        </div>
      )}
      <div className="wzGrid">
        <div className="wzBrief">
          {step === "research" && <EvidencePanel data={data} busy={busy} act={act} refresh={refresh} />}
          {step === "jtbd" && <SimpleModule module="jtbd" label="Run Jobs-to-be-Done" data={data} busy={busy} act={act} hint={done(data, "research") ? "Uses your research notes as the primary evidence." : "No research notes yet. The analysis will use your links, documents, and a web search, and label findings as hypotheses."} />}
          {step === "positioning" && <SimpleModule module="positioning" label="Run positioning" data={data} busy={busy} act={act} blocked={!done(data, "jtbd") ? "Run Jobs-to-be-Done first." : ""} />}
          {step === "pmm" && <IcpPanel data={data} busy={busy} act={act} />}
          {step === "copy" && <CopyPanel data={data} busy={busy} act={act} />}
          <RevisePanel data={data} module={step} busy={busy} act={act} />
        </div>
        <OutputViewer data={data} module={step} />
      </div>
    </section>
  );
}

function runModule(act: Act, runId: string, body: Record<string, unknown>, success: string) {
  return act(async () => {
    const result = await api<{ job: { status: string; error: string | null } }>("module", { method: "POST", body: { runId, ...body } }).catch((e: Error & { status?: number }) => {
      if (e.status === 502) return { job: { status: "failed", error: e.message } };
      throw e;
    });
    if (result.job.status !== "succeeded") throw new Error(result.job.error ?? "The step failed. Try again.");
  }, success);
}

function NotesField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return <label>Notes (optional)<textarea value={value} maxLength={2000} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} /></label>;
}

function SimpleModule({ module, label, data, busy, act, hint, blocked }: { module: ModuleId; label: string; data: RunData; busy: boolean; act: Act; hint?: string; blocked?: string }) {
  const [notes, setNotes] = useState("");
  const again = done(data, module);
  return (
    <div className="wzPanel wzForm">
      {hint && <p className="wzMuted">{hint}</p>}
      {blocked && <p className="wzMuted">{blocked}</p>}
      <NotesField value={notes} onChange={setNotes} placeholder="Anything to emphasize or avoid" />
      <button className="wzPrimary" type="button" disabled={busy || !!blocked} onClick={() => runModule(act, data.run.id, { module, notes }, "Saved. Review the document, then continue.")}>
        {again ? `${label} again` : label}
      </button>
    </div>
  );
}

function EvidencePanel({ data, busy, act, refresh }: { data: RunData; busy: boolean; act: Act; refresh: () => Promise<unknown> }) {
  const { run, evidence, limits } = data;
  const [brief, setBrief] = useState<Brief>({ kinds: [], competitors: "", queries: "", audience: "", depth: "standard", ...run.researchBrief });
  const [url, setUrl] = useState("");
  const [urlType, setUrlType] = useState<string>(URL_TYPES[0]);
  const [note, setNote] = useState("");
  const [notes, setNotes] = useState("");
  const [uploading, setUploading] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const uploads = evidence.filter((e) => e.kind === "upload");
  const links = evidence.filter((e) => e.kind === "url");
  const saveBrief = (next: Brief) => api("brief", { method: "POST", body: { runId: run.id, brief: next } });

  const upload = async (files: FileList | null) => {
    for (const file of Array.from(files ?? [])) {
      const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
      if (!UPLOAD_EXTENSIONS.includes(ext)) {
        await act(async () => { throw new Error(`${file.name}: upload ${UPLOAD_EXTENSIONS.join(", ")} files. Export Word or PowerPoint as PDF first.`); });
        continue;
      }
      if (file.size > UPLOAD_MAX_BYTES) {
        await act(async () => { throw new Error(`${file.name} is larger than 3 MB.`); });
        continue;
      }
      setUploading(file.name);
      await act(async () => {
        const isPdf = ext === ".pdf";
        const content = await readFile(file, isPdf ? "base64" : "text");
        await api("evidence", { method: "POST", body: { runId: run.id, kind: "upload", name: file.name, mime: file.type, ...(isPdf ? { dataBase64: content } : { text: content }) } });
      });
    }
    setUploading("");
    if (fileInput.current) fileInput.current.value = "";
  };

  const status = (e: Evidence) => (e.status === "ready" ? "Ready" : e.status === "failed" ? `Failed: ${e.error ?? "unreadable"}` : "Read when research runs");
  const canRun = uploads.length > 0 || links.length > 0 || brief.kinds.length > 0 || !!brief.competitors || !!brief.queries;

  return (
    <>
      <div className="wzPanel wzForm">
        <h4>Documents <small>{uploads.length}/{limits.uploadsPerRun}</small></h4>
        <label className="wzDrop" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void upload(e.dataTransfer.files); }}>
          <input ref={fileInput} type="file" multiple accept={UPLOAD_EXTENSIONS.join(",")} disabled={busy} onChange={(e) => void upload(e.target.files)} />
          <b>{uploading ? `Uploading ${uploading}…` : "Drop files or choose files"}</b>
          <small>Interview transcripts, reviews, survey exports, call notes. PDF, TXT, MD, CSV, VTT, or SRT up to 3 MB.</small>
        </label>
        {uploads.length > 0 && (
          <ul className="wzItems">
            {uploads.map((e) => (
              <li key={e.id}><span>{e.name}<small>{status(e)}</small></span><button type="button" className="wzLink" disabled={busy} onClick={() => act(() => api("evidence", { method: "DELETE", body: { runId: run.id, id: e.id } }))}>Remove</button></li>
            ))}
          </ul>
        )}
      </div>

      <form className="wzPanel wzForm" onSubmit={(e) => { e.preventDefault(); void act(async () => { await api("evidence", { method: "POST", body: { runId: run.id, kind: "url", url, urlType, note } }); setUrl(""); setNote(""); }); }}>
        <h4>Links <small>{links.length}/{limits.urlsPerRun}</small></h4>
        <label>URL<input value={url} onChange={(e) => setUrl(e.target.value)} required placeholder="https://www.g2.com/products/…/reviews" /></label>
        <div className="wzRow">
          <label>Type<select value={urlType} onChange={(e) => setUrlType(e.target.value)}>{URL_TYPES.map((t) => <option key={t}>{t}</option>)}</select></label>
          <button className="wzSecondary" type="submit" disabled={busy}>Add link</button>
        </div>
        <label>Why it matters (optional)<input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} /></label>
        {links.length > 0 && (
          <ul className="wzItems">
            {links.map((e) => (
              <li key={e.id}><span><span className="wzPill">{e.urlType}</span> {e.url?.replace(/^https?:\/\//u, "")}<small>{status(e)}</small></span><button type="button" className="wzLink" disabled={busy} onClick={() => act(() => api("evidence", { method: "DELETE", body: { runId: run.id, id: e.id } }))}>Remove</button></li>
            ))}
          </ul>
        )}
      </form>

      <div className="wzPanel wzForm">
        <h4>Research brief</h4>
        <p className="wzMuted">We search the web for these and cite every source with an access date.</p>
        <fieldset className="wzChecks">
          <legend>Look for</legend>
          {RESEARCH_KINDS.map((k) => (
            <label key={k} className="wzCheck">
              <input type="checkbox" checked={brief.kinds.includes(k)} onChange={(e) => {
                const next = { ...brief, kinds: e.target.checked ? [...brief.kinds, k] : brief.kinds.filter((x) => x !== k) };
                setBrief(next);
                void saveBrief(next).catch(() => null);
              }} />
              <span>{k}</span>
            </label>
          ))}
        </fieldset>
        <label>Competitors and alternatives<input value={brief.competitors} maxLength={500} onChange={(e) => setBrief({ ...brief, competitors: e.target.value })} onBlur={() => void saveBrief(brief).catch(() => null)} /></label>
        <label>Searches to start from<textarea value={brief.queries} maxLength={1000} placeholder="One per line" onChange={(e) => setBrief({ ...brief, queries: e.target.value })} onBlur={() => void saveBrief(brief).catch(() => null)} /></label>
        <label>Audience or market<input value={brief.audience} maxLength={500} onChange={(e) => setBrief({ ...brief, audience: e.target.value })} onBlur={() => void saveBrief(brief).catch(() => null)} /></label>
        <fieldset className="wzChoices">
          <legend>Depth</legend>
          {(["standard", "deep"] as const).map((d) => (
            <button key={d} type="button" className={brief.depth === d ? "selected" : ""} aria-pressed={brief.depth === d} onClick={() => { const next = { ...brief, depth: d }; setBrief(next); void saveBrief(next).catch(() => null); }}>
              {d === "standard" ? "Focused sweep" : "Deep: more sources"}
            </button>
          ))}
        </fieldset>
      </div>

      <div className="wzPanel wzForm">
        <NotesField value={notes} onChange={setNotes} placeholder="e.g. prioritize churned-customer language; skip vendor blogs" />
        <button className="wzPrimary" type="button" disabled={busy || !canRun} onClick={async () => { await saveBrief(brief).catch(() => null); await runModule(act, run.id, { module: "research", notes }, "Research notes saved. Continue to Jobs-to-be-Done."); await refresh(); }}>
          {done(data, "research") ? "Run research again" : "Run research"}
        </button>
        {!canRun && <p className="wzMuted">Add a document, a link, or a research brief first. Or skip to step 01.</p>}
      </div>
    </>
  );
}

function IcpPanel({ data, busy, act }: { data: RunData; busy: boolean; act: Act }) {
  const { run, icps } = data;
  const [custom, setCustom] = useState(run.icp && !icps.some((c) => c.name === run.icp?.name) ? run.icp.name : "");
  const [notes, setNotes] = useState("");
  const choose = (icp: { name: string; summary?: string }) => act(() => api("icp", { method: "POST", body: { runId: run.id, icp } }));
  if (!done(data, "positioning")) return <div className="wzPanel"><p className="wzMuted">Run positioning first. It proposes the ICP candidates you choose from here.</p></div>;
  return (
    <div className="wzPanel wzForm">
      <h4>Choose an ICP</h4>
      {icps.length ? (
        <div className="wzIcps">
          {icps.map((c) => (
            <button key={c.name} type="button" className={run.icp?.name === c.name ? "selected" : ""} aria-pressed={run.icp?.name === c.name} disabled={busy} onClick={() => choose(c)}>
              <b>{c.name}</b>
              {c.summary && <span>{c.summary}</span>}
              {c.confidence && <small className={`wzPill ${c.confidence === "high" ? "high" : ""}`}>{c.confidence} confidence</small>}
            </button>
          ))}
        </div>
      ) : (
        <p className="wzMuted">The positioning document did not list ICP candidates. Describe one below.</p>
      )}
      <form className="wzRow" onSubmit={(e) => { e.preventDefault(); if (custom.trim()) void choose({ name: custom.trim(), summary: "" }); }}>
        <label>Or describe your own<input value={custom} maxLength={160} onChange={(e) => setCustom(e.target.value)} placeholder="Circumstance, job, and traits" /></label>
        <button className="wzSecondary" type="submit" disabled={busy || !custom.trim()}>Use this ICP</button>
      </form>
      <NotesField value={notes} onChange={setNotes} placeholder="e.g. emphasize migration risk; no ROI claims" />
      <button className="wzPrimary" type="button" disabled={busy || !run.icp} onClick={() => runModule(act, run.id, { module: "pmm", notes }, "ICP guidance saved. Continue to copy.")}>
        {done(data, "pmm") ? "Create ICP guidance again" : "Create ICP guidance"}
      </button>
    </div>
  );
}

function Choices({ legend, items, value, set }: { legend: string; items: readonly string[]; value: string; set: (v: string) => void }) {
  return (
    <fieldset className="wzChoices">
      <legend>{legend}</legend>
      {items.map((it) => <button key={it} type="button" className={value === it ? "selected" : ""} aria-pressed={value === it} onClick={() => set(it)}>{it}</button>)}
    </fieldset>
  );
}

function CopyPanel({ data, busy, act }: { data: RunData; busy: boolean; act: Act }) {
  const [c, setC] = useState<CopyDraft>({ kind: null, format: "", funnelStage: "", angle: ANGLES[0], conversionAction: "", variations: 3, constraints: "" });
  const [notes, setNotes] = useState("");
  const used = data.jobs.filter((j) => j.module === "copy" && !j.input.reviseJobId && j.status === "succeeded").length;
  if (!done(data, "pmm")) return <div className="wzPanel"><p className="wzMuted">Create the ICP guidance first. Copy builds on it.</p></div>;
  const formats = c.kind === "ad" ? AD_PLATFORMS : WEBSITE_FORMATS;
  const ready = c.kind && c.format && c.funnelStage && c.angle && used < data.limits.copyPerRun;
  return (
    <div className="wzPanel wzForm">
      <h4>Copy brief <small>{used}/{data.limits.copyPerRun} pieces</small></h4>
      <Choices legend="What are you writing?" items={["Website copy", "Ad copy"]} value={c.kind === "ad" ? "Ad copy" : c.kind === "website" ? "Website copy" : ""} set={(v) => setC({ ...c, kind: v === "Ad copy" ? "ad" : "website", format: "" })} />
      {c.kind && <Choices legend={c.kind === "ad" ? "Platform" : "Page or element"} items={formats} value={c.format} set={(v) => setC({ ...c, format: v })} />}
      {c.format && (
        <>
          <Choices legend="Funnel stage" items={FUNNEL_STAGES} value={c.funnelStage} set={(v) => setC({ ...c, funnelStage: v })} />
          <Choices legend="Lead angle" items={ANGLES} value={c.angle} set={(v) => setC({ ...c, angle: v })} />
          <label>Conversion action<input value={c.conversionAction} maxLength={120} placeholder="e.g. Start a free trial" onChange={(e) => setC({ ...c, conversionAction: e.target.value })} /></label>
          {c.kind === "ad" && <label>Variations<input type="number" min={1} max={8} value={c.variations} onChange={(e) => setC({ ...c, variations: Number(e.target.value) })} /></label>}
          <label>Constraints (optional)<textarea value={c.constraints} maxLength={1000} placeholder="Character limits, tone, legal disclosures, prohibited claims" onChange={(e) => setC({ ...c, constraints: e.target.value })} /></label>
          <NotesField value={notes} onChange={setNotes} placeholder="Anything else to know" />
        </>
      )}
      <button className="wzPrimary" type="button" disabled={busy || !ready} onClick={() => runModule(act, data.run.id, { module: "copy", copy: c, notes }, "Copy saved.")}>Write copy</button>
      {used >= data.limits.copyPerRun && <p className="wzMuted">This run has used all its copy pieces. You can still revise them.</p>}
    </div>
  );
}

function BundleButton({ data, primary = false }: { data: RunData; primary?: boolean }) {
  const [status, setStatus] = useState<"idle" | "working" | "error">("idle");
  const ready = data.jobs.some((j) => j.status === "succeeded" && j.output);
  const download = async () => {
    setStatus("working");
    try {
      const { zip, folder } = await buildBundle(data.run, data.jobs, data.evidence);
      saveBlob(`${folder}.zip`, await zip.generateAsync({ type: "blob", compression: "DEFLATE" }));
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  };
  return (
    <div className="wzBundle">
      <button type="button" className={primary ? "wzPrimary" : "wzSecondary"} disabled={!ready || status === "working"} onClick={() => void download()} title={ready ? undefined : "Run a step first"}>
        {status === "working" ? "Preparing bundle…" : "Download full bundle (.zip)"}
      </button>
      {status === "error" && <p className="wzError" role="alert">The bundle could not be created. Try again.</p>}
    </div>
  );
}

function RevisePanel({ data, module, busy, act }: { data: RunData; module: ModuleId; busy: boolean; act: Act }) {
  const outputs = outputsFor(data, module);
  const [target, setTarget] = useState("");
  const [notes, setNotes] = useState("");
  const used = data.jobs.filter((j) => j.module === module && j.input.reviseJobId).length;
  if (!outputs.length) return null;
  const left = data.limits.revisionsPerModule - used;
  const targetId = target || outputs[outputs.length - 1].id;
  return (
    <form className="wzPanel wzForm" onSubmit={(e) => { e.preventDefault(); void runModule(act, data.run.id, { module, reviseJobId: targetId, notes }, "Revision saved.").then(() => setNotes("")); }}>
      <h4>Request a revision <small>{Math.max(0, left)} left</small></h4>
      {outputs.length > 1 && (
        <label>Document<select value={targetId} onChange={(e) => setTarget(e.target.value)}>{outputs.map((j, i) => <option key={j.id} value={j.id}>{jobLabel(j, i, outputs)}</option>)}</select></label>
      )}
      <label>What should change?<textarea value={notes} required maxLength={2000} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. the second job reads like a feature; reframe it around the trigger" /></label>
      <button className="wzSecondary" type="submit" disabled={busy || left <= 0 || !notes.trim()}>Revise</button>
    </form>
  );
}

function OutputViewer({ data, module }: { data: RunData; module: ModuleId }) {
  const outputs = outputsFor(data, module);
  const [selected, setSelected] = useState<string | null>(null);
  const failed = [...data.jobs].reverse().find((j) => j.module === module && j.status === "failed");
  const job = outputs.find((j) => j.id === selected) ?? outputs[outputs.length - 1];
  const html = job?.output ? renderMarkdown(job.output, { hideFence: /icp-candidates/u }) : "";
  const step = STEPS.find((s) => s.id === module)!;
  const exportStep = (format: "md" | "pdf") => {
    if (!job?.output) return;
    const doc = stepDoc(job, data.jobs);
    const name = `${slugify(data.run.product)}-${doc.file}`;
    if (format === "md") saveBlob(`${name}.md`, new Blob([doc.markdown], { type: "text/markdown" }));
    else stepPdf(data.run, doc).save(`${name}.pdf`);
  };
  return (
    <div className="wzOutput">
      {outputs.length > 1 && (
        <div className="wzTabs" role="tablist">
          {outputs.map((j, i) => <button key={j.id} type="button" role="tab" aria-selected={j.id === job?.id} className={j.id === job?.id ? "selected" : ""} onClick={() => setSelected(j.id)}>{jobLabel(j, i, outputs)}</button>)}
        </div>
      )}
      {failed && (!job || new Date(failed.startedAt) > new Date(job.startedAt)) && <p className="wzError" role="alert">The last attempt failed: {failed.error}</p>}
      {job ? (
        <>
          <div className="wzDocActions">
            <span className="wzExportLabel">Export this step</span>
            <button type="button" className="wzSecondary" onClick={() => exportStep("md")}>Markdown</button>
            <button type="button" className="wzSecondary" onClick={() => exportStep("pdf")}>PDF</button>
            <button type="button" className="wzSecondary" onClick={() => void navigator.clipboard?.writeText(stepDoc(job, data.jobs).markdown)}>Copy text</button>
          </div>
          <div className="wzDoc" dangerouslySetInnerHTML={{ __html: html }} />
        </>
      ) : (
        <div className="wzDoc wzEmpty"><b>{step.num}</b><span>No output yet. Fill in the brief and run this step.</span></div>
      )}
    </div>
  );
}
