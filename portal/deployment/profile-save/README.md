# Client company/profile save correction

The client settings form stored the complete GET `/api/clients/me/profile` response, then sent that object unchanged to PUT. Even an empty profile response contains `userId` and `organizationId`; an existing row also includes record metadata. The API's strict DTO correctly rejects these properties with HTTP 400. TypeScript's narrower interface does not remove runtime properties.

The pinned frontend overlay in `../web-app/prepare.py` now serializes only company, phone, address, website and description, normalizing missing values to empty strings. The backend retains its strict validation and derives account/organization scope from the authenticated request. No schema or access-control changes are needed.

`reproduction.json` records the observed rejection through the deployed form. `verify.py` exercises first save, full-page reload, an existing-profile edit, another reload, and deliberate identity-field rejection. `evidence.json` records the result. A disposable client account is used; the user's retained review profile is not modified. `cleanup-evidence.json` records independent before/after table hashes and empty fixture Storage verification.

Verification notes: the first post-alias attempt still served the previous deployment; the successful run asserts the current deployment ID in loaded assets. The manual negative request was corrected to include the normal CSRF header, so its HTTP 400 measures DTO validation rather than CSRF rejection. Cleanup explicitly removes the fixture client_profile row because that upstream model has no cascading relations. The final independent table comparison passes.
