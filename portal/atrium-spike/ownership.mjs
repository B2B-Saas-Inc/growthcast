import { NotFoundException } from '@nestjs/common';
import { digest } from '../../gateway/src/store.mjs';

export function createOwnership(pool) {
  async function owned(kind, id) {
    if (typeof id !== 'string') return false;
    const sql = {
      document: 'SELECT 1 FROM provider_documents WHERE document_id=$1',
      invoice: 'SELECT 1 FROM provider_invoices WHERE invoice_id=$1',
      token: 'SELECT 1 FROM provider_documents p JOIN document_access_token t ON t."documentId"=p.document_id WHERE t.token=$1',
      file: `SELECT 1 FROM provider_documents p JOIN document d ON d.id=p.document_id WHERE d."fileId"=$1 OR d."signedFileId"=$1
        UNION ALL SELECT 1 FROM provider_documents p JOIN document_version v ON v."documentId"=p.document_id WHERE v."fileId"=$1
        UNION ALL SELECT 1 FROM provider_invoices p JOIN invoice i ON i.id=p.invoice_id WHERE i."uploadedFileId"=$1`,
    }[kind];
    if (!sql) throw Error('Unknown ownership kind');
    return (await pool.query(sql, [kind === 'token' ? digest(id) : id])).rowCount > 0;
  }
  async function assertNative(kind, id) {
    if (await owned(kind,id)) throw new NotFoundException('Resource unavailable');
  }
  function protect(service, kind, methods) {
    return new Proxy(service, {
      get(target,key,receiver) {
        const method = Reflect.get(target,key,receiver);
        if (methods.includes(key)) return async (...args) => {
          await assertNative(kind,args[0]); return Reflect.apply(method,receiver,args);
        };
        return method;
      },
    });
  }
  return {
    assertNative,
    documents: service => {
      const protectedService = protect(service,'document',[
        'send','voidDocument','trackView','assertDocumentAccess','findOne','respond',
        'getViewStream','setSignatureFields','sign','getSigningInfo','remove','uploadVersion',
        'getVersions','restoreVersion','getAccessTokens','generateAccessToken','revokeAccessToken','generateCertificate',
      ]);
      return protect(protectedService,'token',['validateAccessToken']);
    },
    invoicePdf: service => protect(service,'invoice',['generate']),
    invoices: service => protect(service,'invoice',['findOne','findOneMine','update','remove']),
    files: service => protect(service,'file',['download','getDownloadUrl','update','remove']),
    // Real controller requests are checked before interceptors or side effects.
    guard: {
      async canActivate(context) {
        const req = context.switchToHttp().getRequest();
        const controller = context.getClass().name;
        if (controller === 'DocumentsController') {
          if (req.params.token) await assertNative('token',req.params.token);
          if (req.params.id) await assertNative('document',req.params.id);
        }
        if (controller === 'InvoicesController' && req.params.id) await assertNative('invoice',req.params.id);
        if (controller === 'PaymentsController' && req.params.invoiceId) await assertNative('invoice',req.params.invoiceId);
        if (controller === 'FilesController' && req.params.id) await assertNative('file',req.params.id);
        return true;
      },
    },
    // Guard the service entrypoints too: workers can bypass HTTP controllers.
    payments(service) {
      return new Proxy(service, {
        get(target, key, receiver) {
          const method = Reflect.get(target,key,receiver);
          if (key === 'createCheckoutSession') return async (...args) => {
            await assertNative('invoice',args[0]); return Reflect.apply(method,receiver,args);
          };
          if (key === 'handleWebhookEvent') return async (...args) => {
            const event = args[0];
            if (['checkout.session.completed','checkout.session.expired'].includes(event?.type))
              await assertNative('invoice',event.data?.object?.metadata?.invoiceId);
            return Reflect.apply(method,receiver,args);
          };
          return method;
        },
      });
    },
  };
}
