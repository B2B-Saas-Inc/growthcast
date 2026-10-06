'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
type Entry = { id: string; title: string; type: string; status: string };
export default function DocumentsPage() {
  const [entries,setEntries] = useState<Entry[]>([]);
  const [loading,setLoading] = useState(true);
  const [opening,setOpening] = useState<string|null>(null);
  const [error,setError] = useState('');
  useEffect(() => {
    let active=true;
    apiFetch<Entry[]>('/portal/catalog').then(value=>{if(active)setEntries(value);})
      .catch(()=>{if(active)setError('Your documents could not be loaded. Please try again.');})
      .finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[]);
  async function open(id:string) {
    setOpening(id);setError('');
    try {
      const result=await apiFetch<{handoff:string}>('/portal/catalog/'+encodeURIComponent(id)+'/open',{method:'POST',body:'{}'});
      if(typeof result.handoff!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(result.handoff))throw Error('Unavailable');
      window.location.assign('https://signing.growthcast.test:8443/enter#'+result.handoff);
    } catch {setError('This document is no longer available. Refresh your documents or contact your agency.');setOpening(null);}
  }
  return <section aria-labelledby="documents-title" className="mx-auto max-w-4xl px-4 py-8">
    <h1 id="documents-title" className="text-2xl font-semibold">Your documents</h1>
    <p className="mt-2 text-sm text-gray-600">View the completed agreements shared with your account.</p>
    {error && <p role="alert" className="mt-4 rounded-lg border border-red-300 p-4">{error}</p>}
    {loading ? <p role="status" className="mt-6">Loading documents…</p> : entries.length===0 && !error ?
      <p className="mt-6 rounded-lg border p-6">No documents are available for this account.</p> :
      <ul className="mt-6 space-y-4">{entries.map(entry=><li key={entry.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border p-5">
        <div><h2 className="font-semibold break-words">{entry.title}</h2><p className="mt-1 text-sm text-gray-600">{entry.status}</p></div>
        <button type="button" disabled={opening!==null} onClick={()=>void open(entry.id)} className="rounded-lg bg-teal-800 px-4 py-2 text-white disabled:opacity-50">
          {opening===entry.id?'Opening…':'View document'}</button>
      </li>)}</ul>}
  </section>;
}
