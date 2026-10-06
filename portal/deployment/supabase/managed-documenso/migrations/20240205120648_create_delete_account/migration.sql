-- Create deleted@documenso.com
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "gc_documenso"."User" WHERE "email" = 'deleted-account@documenso.com') THEN
    INSERT INTO
      "gc_documenso"."User" (
        "email",
        "emailVerified",
        "password",
        "createdAt",
        "updatedAt",
        "lastSignedIn",
        "roles",
        "identityProvider",
        "twoFactorEnabled"
      )
    VALUES
      (
        'deleted-account@documenso.com',
        NOW(),
        NULL,
        NOW(),
        NOW(),
        NOW(),
        ARRAY['USER'::TEXT]::"gc_documenso"."Role" [],
        CAST('GOOGLE'::TEXT AS "gc_documenso"."IdentityProvider"),
        FALSE
      );
  END IF;
END $$
