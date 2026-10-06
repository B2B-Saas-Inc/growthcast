const limit = 3 * 1024 * 1024;
export class StorageClient {
  constructor({projectRef,bucket,credentials,fetchImpl=fetch,now=Date.now,maxBytes=limit,maxDownloadBytes=maxBytes}) {
    if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>16*1024*1024)throw Error('Bounded storage limit required');
    if(!Number.isSafeInteger(maxDownloadBytes)||maxDownloadBytes<1||maxDownloadBytes>16*1024*1024)throw Error('Bounded storage download limit required');
    if (!/^[a-z]{20}$/.test(projectRef) || !/^[a-z0-9-]{3,63}$/.test(bucket) ||
      !credentials?.publishableKey?.startsWith('sb_publishable_') ||
      !/^[a-f0-9-]{36}$/.test(credentials.subject ?? '') ||
      typeof credentials.email !== 'string' || typeof credentials.password !== 'string' || credentials.password.length < 32) {
      throw Error('Scoped storage configuration required');
    }
    this.origin = `https://${projectRef}.supabase.co`;
    this.bucket = bucket; this.credentials = credentials; this.fetch = fetchImpl; this.now = now; this.maxBytes=maxBytes; this.maxDownloadBytes=maxDownloadBytes;
  }
  async call(path,options={}) {
    try {
      return await this.fetch(this.origin+path,{...options,redirect:'error',signal:AbortSignal.timeout(15000)});
    } catch { throw Error('Storage transport failed'); }
  }
  async token() {
    if (this.access && this.expires > this.now()+60000) return this.access;
    if (!this.login) this.login = (async () => {
      const {email,password,publishableKey,subject} = this.credentials;
      const response = await this.call('/auth/v1/token?grant_type=password',{method:'POST',
        headers:{apikey:publishableKey,'content-type':'application/json'},body:JSON.stringify({email,password})});
      if (!response.ok) throw Error('Storage authentication failed');
      const data = await response.json();
      if (data.user?.id !== subject || typeof data.access_token !== 'string' || !Number.isFinite(data.expires_in) || data.expires_in < 120) throw Error('Storage identity mismatch');
      this.access = data.access_token; this.expires = this.now()+data.expires_in*1000;
      return this.access;
    })().finally(()=>{this.login=null;});
    return this.login;
  }
  objectPath(key) {
    if (typeof key !== 'string' || key.length > 1024 || key.includes('\\') || [...key].some(char=>char.charCodeAt(0)<32 || char.charCodeAt(0)===127) ||
      key.split('/').some(part=>!part || part==='.' || part==='..')) throw Error('Invalid storage key');
    return this.bucket+'/'+key.split('/').map(encodeURIComponent).join('/');
  }
  async headers() { return {apikey:this.credentials.publishableKey,Authorization:'Bearer '+await this.token()}; }
  async upload(key,bytes,contentType) {
    const path = this.objectPath(key);
    if (!(bytes instanceof Uint8Array) || bytes.byteLength > this.maxBytes || !/^[\w.+-]+\/[\w.+-]+$/.test(contentType)) throw Error('Invalid storage upload');
    const response = await this.call('/storage/v1/object/'+path,{method:'POST',headers:{...await this.headers(),'content-type':contentType,'x-upsert':'false'},body:bytes});
    if (!response.ok) throw Error('Storage upload failed');
    await response.body?.cancel();
  }
  async download(key) {
    const path = this.objectPath(key);
    const response = await this.call('/storage/v1/object/authenticated/'+path,{headers:await this.headers()});
    if (!response.ok || !response.body) { await response.body?.cancel(); throw Error('Storage download failed'); }
    const reader = response.body.getReader(), chunks=[]; let size=0;
    try {
      for (;;) {
        const {done,value} = await reader.read(); if(done) break;
        size += value.length;
        if (size > this.maxDownloadBytes) { await reader.cancel(); throw Error('Storage object exceeds limit'); }
        chunks.push(value);
      }
    } catch { throw Error('Storage download failed'); }
    return {bytes:Buffer.concat(chunks),contentType:response.headers.get('content-type') || 'application/octet-stream'};
  }
  async delete(key) {
    this.objectPath(key);
    const response = await this.call('/storage/v1/object/'+this.bucket,{method:'DELETE',headers:{...await this.headers(),'content-type':'application/json'},body:JSON.stringify({prefixes:[key]})});
    if (!response.ok) throw Error('Storage delete failed');
    await response.body?.cancel();
  }
}
