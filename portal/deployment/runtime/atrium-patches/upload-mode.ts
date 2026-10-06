export function needsDocumentAction(doc: {requiresSignature?: boolean; requiresApproval?: boolean; options?: string | null}) {
  return Boolean(doc.requiresSignature || doc.requiresApproval || doc.options?.trim());
}
