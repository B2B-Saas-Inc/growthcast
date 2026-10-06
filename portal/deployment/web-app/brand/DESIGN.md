# GrowthCast portal design

Source: https://growthcast.app, captured 2026-09-25 with Firecrawl branding/images, corroborated by the website source in `src/styles.css`.
Evidence: `.firecrawl/portal-branding.json`. The user's attached transparent wordmark is preserved byte-for-byte as `growthcast-wordmark.png`.

Observed tokens: warm paper #f4f1e9, charcoal #242426, coral #ff6b4a, secondary text #5d5952, warm border #d6d1c7. Manrope is the heading/body face; DM Mono is used for small uppercase labels. Primary CTAs are square charcoal rectangles with white text, rather than teal rounded buttons. Headings use tight negative tracking. The site combines warm paper, white sections, fine rules and generous whitespace.

Portal adaptation: 14px body, 32–40px page titles and compact navigation preserve dashboard usability. Login uses the editorial heading scale (52–80px on desktop), a thin ruled header, a coral accent and a restrained form panel. Inputs/buttons have 2px corners; status pills remain rounded. Use the exact local site font files. Keep the wordmark's aspect ratio and crop its transparent padding only with a CSS viewport; do not modify its pixels. Use the existing site symbol as favicon. Lock the branded light palette to match the source rather than inherit the upstream teal/system-dark palette.
