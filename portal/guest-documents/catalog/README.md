# Document catalog editing and PDF field tags

Document catalog, Clients and Recipients use accessible three-dot menus for creation/refresh and each record's view/edit/delete actions. Document rows also offer PDF upload and review. Deletion asks for confirmation, hides the record and revokes related prepared access; immutable versions, approvals and signature history remain. Removing a client hides its documents and recipients. A recipient email change creates or restores the matching client-scoped recipient and revokes the former recipient's access. Renaming an uploaded document creates a new version requiring fresh approval.

Migration011 (`schema.sql`) adds catalog state and audit tables without changing migration010. Migration012 (`restore-stable.sql`) gives the equivalent label constraint a dump/restore-stable representation. The future delivery migration is now013. Catalog edits and uploads serialize within the organization to avoid approving or uploading against a concurrently removed record. All operations retain current staff/session/organization authorization.

## Documenso PDF placeholders

Author selectable text in the source document and export it to PDF. Upload through Documents → document menu → Add PDF/Upload new version. Open Review PDF and select the recipient. Detected fields appear on the PDF and remain editable before approval.

Examples:

```
{{signature, r1}}
{{text, r1, required=true, label=Company Name}}
{{date, r1}}
{{number, r1, minValue=0, maxValue=100}}
```

`r1` maps to the selected recipient. Supported types are signature, initials, name, email, date, text, number and checkbox. Imported options include label/required and type-appropriate readOnly, fontSize, textAlign, placeholder, text, characterLimit, value, minValue, maxValue and numberFormat. Unknown types/options and other recipient numbers produce a visible warning and block approval so fields are not silently assigned or lost. Scanned/image-only PDFs have no selectable tags and need manual field placement. The source PDF is retained unchanged.

Syntax follows the pinned Documenso implementation and [official PDF placeholder guide](https://docs.documenso.com/docs/users/documents/advanced/pdf-placeholders). It is the currently supported single-recipient subset, not a claim that all Documenso field types or multiple recipients are supported.

Live sending remains disabled pending managed runtime deployment. The tagged-PDF provider handoff now passes locally against pinned Documenso: approved raw bytes are verified, expected placeholder whiteout is derived, parsed PDF objects are bound independently of generated file IDs, and provider auto-fields are replaced with the exact approved layout. The queue records field configuration before any provider writes and holds ambiguous outcomes for review. The real client-input/signature/completion/download flow also passes with a tagged source PDF.

## Verification

The workflow suite covers client/document/recipient scoping, edits, hidden records, preserved history, revocation, audit records and restricted database permissions. The placeholder suite uses real PDFs. The browser suite exercises menus, modal editing/deletion, pagination, tag import/approval, keyboard focus and mobile width. Its two batches are paced to respect the unchanged API request limit.
