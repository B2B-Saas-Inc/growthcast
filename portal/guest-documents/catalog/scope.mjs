// SQL fragments accept only static identifiers chosen by server source code.
export const active=(alias,entity)=>`NOT EXISTS(SELECT 1 FROM gc_atrium.guest_catalog_state hidden WHERE hidden.entity='${entity}' AND hidden.id=${alias}.id AND hidden.deleted_at IS NOT NULL)`;
export const clientActive=alias=>`NOT EXISTS(SELECT 1 FROM gc_atrium.guest_catalog_state hidden WHERE hidden.entity='clients' AND hidden.id=${alias}.client_id AND hidden.deleted_at IS NOT NULL)`;
export const label=(alias,entity,fallback)=>`coalesce((SELECT label FROM gc_atrium.guest_catalog_state names WHERE names.entity='${entity}' AND names.id=${alias}.id),${fallback})`;
