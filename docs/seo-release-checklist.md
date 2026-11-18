# StudyGrounds SEO release checklist

## Current architecture

- Production homepage and study-notes landing page use static title, description, canonical, Open Graph and robots metadata.
- The frontend CloudFront template routes `/notes/*` and `/sitemap.xml` to the public SEO API. The two-entry checked-in `sitemap.xml` is a **static fallback** when these routes are correctly configured, not the intended full sitemap.
- The public SEO API serves crawlable LearningResource note pages and generates a sitemap with eligible published notes.
- We cannot establish deployed CloudFront configuration just by reading the template; verify it before the production merge.

## Safety checks

- Note SEO pages and sitemap exclude private, unpublished, moderation-held, or unsafe-file notes.
- The per-note SEO API fetch uses a consistent primary record read even if the note-id index returns an older locator.
- DEV static homepage and landing page are rewritten to noindex at deploy; DEV robots.txt disallows crawling; the DEV static sitemap fallback is empty.
- DEV public SEO API sets X-Robots-Tag noindex; PROD keeps public pages indexable.
- The frontend infrastructure template also specifies DEV X-Robots-Tag for all routes, **but frontend CloudFormation is not updated by the backend/static deployment workflow**. Applying the CloudFront template change is a separate operator action.

## Before any production merge

1. Compare actual PROD CloudFront behaviors with infrastructure/frontend.yaml: notes/* and sitemap.xml must point to the PROD API origin.
2. Check https://joinstudygrounds.com/sitemap.xml returns dynamic XML with published notes, not just the checked-in two URL static fallback. Compare with the production API sitemap endpoint.
3. Check a public note SEO URL for 200, canonical URL, LearningResource structured data, and redirect of mismatched slugs.
4. Check unpublished / moderation-held notes return 404 with X-Robots-Tag noindex and disappear from sitemap after CDN cache expiry.
5. Check DEV static homepage noindex, DEV robots disallow, and DEV SEO API X-Robots-Tag noindex. Never submit DEV sitemap to Search Console.
6. Check PROD robots.txt allows crawling and canonical sitemap indexes only intended public URLs.
7. Confirm CloudFront invalidation/caching, production response headers, and Search Console coverage after release.

SEO changes should accompany public content/discovery or URL behavior changes; private Home sections and admin features do not generally require SEO updates.
