# Supabase CA trust

Public CA, not a private key. Downloaded over verified HTTPS from:
https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt

Supabase's SSL enforcement documentation identifies this CA filename and requires CA trust for verify-full:
https://supabase.com/docs/guides/platform/ssl-enforcement

PEM file SHA256: 700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7
Certificate fingerprint: 80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA
Validity: 2021-04-28 through 2031-04-26.

Verified a hosted session-pooler connection to the dedicated test project using growthcast_payment_login with rejectUnauthorized=true. Do not disable hostname or certificate verification. Review CA rotation before expiry; do not replace this file from an untrusted source.
