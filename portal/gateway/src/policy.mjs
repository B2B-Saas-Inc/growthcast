import { z } from 'zod';
const fieldTypes=['SIGNATURE','INITIALS','NAME','EMAIL','DATE','TEXT','NUMBER','CHECKBOX'];
const values={SIGNATURE:z.string().min(1).max(100000).nullable(),INITIALS:z.string().max(32).nullable(),NAME:z.string().max(255).nullable(),EMAIL:z.string().max(254).nullable(),TEXT:z.string().max(10000).nullable(),NUMBER:z.string().max(128).nullable(),DATE:z.boolean(),CHECKBOX:z.array(z.number().int().min(0).max(99)).max(100)};
const id = z.string().regex(/^[A-Za-z0-9_-]{1,160}$/);
export const Binding = z.object({
  environment: z.enum(['local-test','staging','production']), organizationId: id, clientId: id,
  documentVersion: id, envelopeId: id, documentId: z.number().int().positive(),
  recipientId: z.number().int().positive(), recipientToken: id,
  recipientName: z.string().min(1).max(255), recipientEmail: z.string().email(),
  fieldIds: z.array(z.number().int().positive()).max(100),
  pinRequired:z.boolean().optional(),
  fieldTypes:z.record(z.enum(fieldTypes)).optional(),
  items: z.array(z.object({ id, dataId: id }).strict()).min(1).max(10),
}).strict();

export function allowRequest(raw, method, body, binding, assets = new Set()) {
  // Never normalize attacker input into a different allowed upstream URL.
  if (raw.length > 12000 || !raw.startsWith('/') || raw.startsWith('//') || /[%\\\s#]/.test(raw.split('?')[0])) return false;
  const url = new URL(raw, 'https://gateway.invalid');
  if (url.pathname !== raw.split('?')[0] || !['GET', 'HEAD', 'POST'].includes(method)) return false;
  const b = Binding.parse(binding);
  if (['GET', 'HEAD'].includes(method) && assets.has(url.pathname)) return url.search === '';
  const sign = `/sign/${b.recipientToken}`;
  const embed = `/embed/sign/${b.recipientToken}`;
  if(['GET','HEAD'].includes(method) && url.pathname===embed)return url.search==='';
  if(method==='GET' && url.pathname===embed+'.data') {
    if(url.search==='')return true;
    const keys=[...url.searchParams.keys()];
    const routes=(url.searchParams.get('_routes')||'').split(',');
    return keys.length===1 && keys[0]==='_routes' && routes.length<=3 && routes.every(route=>
      ['root','routes/embed+/_v0+/_layout','routes/embed+/_v0+/sign.$token'].includes(route));
  }
  if (method === 'GET' && url.pathname === '/__manifest') {
    const keys = [...url.searchParams.keys()];
    const paths = (url.searchParams.get('paths') || '').split(',');
    return keys.length === 2 && new Set(keys).size === 2 && keys.every(x=>['paths','version'].includes(x)) &&
      /^[a-f0-9]{8,64}$/.test(url.searchParams.get('version') || '') &&
      paths.length <= 6 && paths.every(x=>['/','/articles','/articles/signature-disclosure','/embed','/embed/sign',embed,sign,...['complete','waiting','rejected','expired'].map(v=>`${sign}/${v}`)].includes(x));
  }
  if (['GET','HEAD'].includes(method) && url.pathname === '/articles/signature-disclosure') return url.search === '';
  if (['GET', 'HEAD'].includes(method) && [sign, ...['complete','waiting','rejected','expired'].map(x => `${sign}/${x}`)].includes(url.pathname)) {
    return url.search === '';
  }
  for (const item of b.items) {
    for(const version of ['original','signed']) {
      if(url.pathname===`/api/files/token/${b.recipientToken}/envelopeItem/${item.id}/download/${version}`)return ['GET','HEAD'].includes(method)&&url.search==='';
    }
    for (const version of ['initial', 'current']) {
      if (url.pathname === `/api/files/token/${b.recipientToken}/envelope/${b.envelopeId}/envelopeItem/${item.id}/dataId/${item.dataId}/${version}/item.pdf`) {
        return ['GET', 'HEAD'].includes(method) && url.search === '';
      }
    }
  }
  if (!url.pathname.startsWith('/api/trpc/')) return false;
  const names = url.pathname.slice('/api/trpc/'.length).split(',');
  if (names.length > 8 || names.some(x => !/^[a-zA-Z.]+$/.test(x))) return false;
  const keys = [...url.searchParams.keys()];
  if (new Set(keys).size !== keys.length || keys.some(x => !['batch','input'].includes(x))) return false;
  const batch = url.searchParams.get('batch');
  if (batch !== null && batch !== '1') return false;
  if (method === 'POST' && url.searchParams.has('input')) return false;
  let input;
  try { input = JSON.parse(method === 'POST' ? body : url.searchParams.get('input') || 'null'); } catch { return false; }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
  if (batch === '1' && (Object.keys(input).length !== names.length || names.some((_, i) => !Object.hasOwn(input, String(i))))) return false;
  if (!batch && names.length !== 1) return false;
  return names.every((name, index) => {
    const wrapped = batch ? input[index] : input;
    // Only the pinned client's top-level optional-undefined encoding is allowed.
    // Never admit arbitrary superjson paths, object references or type coercions.
    if (!wrapped || Object.keys(wrapped).some(x=>!['json','meta'].includes(x)) || !wrapped.json || typeof wrapped.json !== 'object') return false;
    const json = { ...wrapped.json };
    if (wrapped.meta) {
      if (!['recipient.completeDocumentWithToken','envelope.field.sign'].includes(name) ||
        Object.keys(wrapped.meta).sort().join() !== 'v,values' || wrapped.meta.v !== 1 ||
        !wrapped.meta.values || typeof wrapped.meta.values !== 'object') return false;
      for (const [key,value] of Object.entries(wrapped.meta.values)) {
        if (!(name==='envelope.field.sign'?['authOptions']:['accessAuthOptions','recipientOverride']).includes(key) || !Array.isArray(value) ||
            value.length !== 1 || value[0] !== 'undefined' || json[key] !== null) return false;
        delete json[key];
      }
    }
    const token = z.literal(b.recipientToken);
    const documentId = z.literal(b.documentId);
    let schema;
    if (method === 'GET' && name === 'envelope.signingStatus') schema = z.object({ token }).strict();
    if (method === 'GET' && name === 'envelope.attachment.find') schema = z.object({ token, envelopeId: z.literal(b.envelopeId) }).strict();
    if (method === 'GET' && name === 'envelope.item.getManyByToken') schema = z.object({ envelopeId: z.literal(b.envelopeId), access: z.object({ type: z.literal('recipient'), token }).strict() }).strict();
    if (method === 'POST' && name === 'envelope.field.sign') {
      const type=b.fieldTypes?b.fieldTypes[String(json.fieldId)]:'SIGNATURE';
      if(!Object.hasOwn(values,type??''))return false;
      schema = z.object({
      token, fieldId: z.number().int().refine(value => b.fieldIds.includes(value)),
      fieldValue: z.object({ type: z.literal(type), value:b.fieldTypes?values[type]:z.string().min(1).max(100000) }).strict(),
      authOptions: z.object({ type: z.literal('EXPLICIT_NONE') }).strict().optional(),
    }).strict();
    }
    if (method === 'POST' && name === 'recipient.completeDocumentWithToken') schema = z.object({
      token, documentId,
      recipientOverride: z.object({ name: z.literal(b.recipientName), email: z.literal(b.recipientEmail) }).strict().optional(),
    }).strict();
    if (method === 'POST' && name === 'recipient.rejectDocumentWithToken') schema = z.object({ token, documentId, reason: z.string().min(1).max(1000) }).strict();
    return !!schema?.safeParse(json).success;
  });
}
