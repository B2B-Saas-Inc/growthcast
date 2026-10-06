-- Copy only an authorized source's canonical artifacts to an account-derived
-- grant. Callers cannot supply artifact IDs, hashes or bytes.
CREATE FUNCTION copy_account_artifacts(target uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE source uuid;
BEGIN
  SELECT g.id INTO source
  FROM public.account_grants a
  JOIN public.grants child ON child.id=a.grant_id
  JOIN public.grants g ON g.id=(a.context->>'sourceGrant')::uuid
  JOIN public."session" s ON s.id=a.context->>'sessionId' AND s."userId"=a.context->>'userId' AND s."expiresAt">now()
  JOIN public."user" u ON u.id=s."userId" AND u."emailVerified"=true
  JOIN public.member m ON m."userId"=u.id AND m."organizationId"=g.binding->>'organizationId'
  JOIN public.project p ON p.id=a.context->>'projectId' AND p."organizationId"=m."organizationId"
  JOIN public.project_client pc ON pc."projectId"=p.id AND pc."userId"=u.id
  JOIN public.document d ON d.id=a.context->>'documentId' AND d."projectId"=p.id AND d."organizationId"=m."organizationId"
  WHERE a.grant_id=target AND child.id<>g.id
    AND child.binding=g.binding AND child.expires_at<=g.expires_at
    AND child.revoked_at IS NULL AND child.expires_at>now() AND child.generation=0
    AND g.revoked_at IS NULL AND g.expires_at>now() AND g.generation=(a.context->>'generation')::integer
    AND p.id=g.binding->>'clientId'
    AND d.id || '-v' || d."currentVersion"::text=g.binding->>'documentVersion'
    AND s."activeOrganizationId"=m."organizationId" AND lower(u.email)=lower(g.binding->>'recipientEmail')
    AND d."currentVersion"=(a.context->>'documentVersion')::integer AND d."fileId"=a.context->>'fileId'
    AND (CASE WHEN EXISTS(SELECT 1 FROM public.provider_documents pd WHERE pd.document_id=d.id)
      THEN EXISTS(SELECT 1 FROM public.provider_completions c JOIN public.sealed_artifacts sa ON sa.grant_id=c.grant_id AND sa.item_id=c.item_id
        WHERE c.document_id=d.id AND c.grant_id=g.id AND sa.data_id=c.data_id AND sa.sha256=c.sha256)
      ELSE d.status='signed' END)
  FOR SHARE OF g,child,s,u,m,p,pc,d;
  IF source IS NULL THEN RAISE EXCEPTION 'Account artifact scope denied' USING ERRCODE='42501'; END IF;
  INSERT INTO public.sealed_artifacts(grant_id,item_id,data_id,sha256)
    SELECT target,sa.item_id,sa.data_id,sa.sha256 FROM public.sealed_artifacts sa
    JOIN public.provider_completions c ON c.grant_id=sa.grant_id AND c.item_id=sa.item_id AND c.data_id=sa.data_id AND c.sha256=sa.sha256
    WHERE sa.grant_id=source;
END;
$$;
REVOKE ALL ON FUNCTION copy_account_artifacts(uuid) FROM PUBLIC;
