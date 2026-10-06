def apply(web):
 p=web/'src/app/(dashboard)/dashboard/settings/system/payments-section.tsx';s=p.read_text()
 s=s.replace('  const [showMethods, setShowMethods]', '  const [methodsError, setMethodsError] = useState("");\n  const [methodLookupAttempt, setMethodLookupAttempt] = useState(0);\n  const [chargesEnabled, setChargesEnabled] = useState(true);\n  const [showMethods, setShowMethods]')
 old='''    apiFetch<{ methods: { id: string; active: boolean }[] }>("/payments/available-methods")
      .then((data) => setAvailableMethods(data.methods))
      .catch(() => {});
  }, [status?.enabled]);'''
 new='''    let active = true;
    setMethodsError("");setAvailableMethods([]);
    apiFetch<{ methods: { id: string; active: boolean }[]; chargesEnabled?: boolean }>("/payments/available-methods")
      .then((data) => { if (active) {setAvailableMethods(data.methods);setChargesEnabled(data.chargesEnabled !== false);} })
      .catch((error) => {if (active) setMethodsError(error instanceof Error ? error.message : "Unable to check Stripe payment methods.");});
    return () => {active = false;};
  }, [status, methodLookupAttempt]);'''
 assert old in s;s=s.replace(old,new)
 s=s.replace('              {availableMethods.length === 0 ? (','''              {methodsError ? (
                <div role="alert" className="space-y-2 text-sm">
                  <p>{methodsError}</p>
                  <button type="button" className="underline" onClick={() => setMethodLookupAttempt(n => n + 1)}>Retry payment method check</button>
                </div>
              ) : availableMethods.length === 0 ? (''')
 s=s.replace('                    <span className="text-xs text-[var(--muted-foreground)]">Method</span>','                    <span className="text-xs text-[var(--muted-foreground)]">Method</span>')
 s=s.replace('                  {availableMethods.map((m) => {','''                  {!chargesEnabled && <p role="alert" className="text-sm text-amber-700">Stripe has not enabled charges for this account. Review the account requirements in your Stripe dashboard.</p>}
                  <p className="text-xs text-[var(--muted-foreground)]">At least one method must remain selected. Select another available method before deselecting the last one.</p>
                  {availableMethods.map((m) => {''')
 s=s.replace('${disabled ? "opacity-50" : "cursor-pointer"}', '${!m.active ? "opacity-50" : "cursor-pointer"}')
 s=s.replace('disabled={savingMethods}', 'disabled={savingMethods || !!methodsError || !chargesEnabled || availableMethods.length === 0}')
 p.write_text(s)
 p=web/'src/app/(dashboard)/dashboard/settings/layout.tsx';s=p.read_text();old='className="flex gap-1 border-b border-[var(--border)]"';assert old in s;s=s.replace(old,'className="flex flex-wrap gap-1 border-b border-[var(--border)]"');p.write_text(s)
