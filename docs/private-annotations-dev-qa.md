# Batch 3 — Private Study Tools: DEV QA

## Privacy / scope
- Every annotation and highlight is keyed by authenticated Cognito sub, within the existing StudyActivityTable. Public APIs and published note records do not include them.
- Notes: private text comments (1–1000 characters) attached to the selected source file of a public study note. Supported on all existing source types.
- Highlights: private text ranges with selected quote, preview block index and offsets, and color. Supported on extracted text from DOCX, Pages and PPTX only.
- PDF is rendered by the browser and does NOT support inline highlights in V1. Images and Excel do not have stable selectable text anchoring in this release.
- The original file remains unmodified. Highlights match their exact original preview snippet; if source content changes, unmatched highlights remain in the private list but do not paint the wrong text.
- Only presently safe, public notes can be read/annotated. Unpublished, moderated and unsafe source content is never returned by annotation APIs. Users can delete their own annotation by ID even when the original note is no longer public.
- 100 annotations maximum per public note per user (V1). No public notification, comments feed, sharing, or moderation data exposed from personal annotations.

## Manual tests
- [ ] Sign in, open a public note; find **Your private study notes** below the source viewer.
- [ ] Add a personal note to a PDF; refresh and verify it remains privately visible.
- [ ] Select a short passage in a DOCX/Pages paragraph or a PPTX slide item; pick a color and use **Highlight selected text**.
- [ ] Selection becomes colored in the extracted preview. Refresh, switch to another source, return: the highlight remains.
- [ ] Remove the highlight; the color and private list entry disappear. Refresh to confirm deletion.
- [ ] Change PowerPoint slides and verify highlights remain attached to the appropriate slide and exact excerpt.
- [ ] Switch source files quickly while annotation data is loading; no annotation may appear on the wrong source.
- [ ] Select text spanning multiple paragraphs: user must be told to select within one paragraph/slide item.
- [ ] Highlighting on PDF/image/XLSX must not mislead users. PDF comments must still work.
- [ ] Try an overlapping selection; the UI should reject it rather than silently corrupt positioning.
- [ ] Unpublish or moderate a note after annotating; its old content and annotation list must not be accessible through GET.
- [ ] Sign out while reading a document: private annotation UI and visible highlight colors disappear.
- [ ] Sign into a different account: the first reader's annotations must NOT be visible. Both accounts can independently annotate the same public note.
- [ ] Verify anonymous readers cannot see annotation controls or call the authenticated API.
- [ ] Verify original uploaded file remains unchanged, and author sees no other reader's annotations.
- [ ] Test 320px mobile, Focus Mode, and keyboard-only source/annotation controls.
- [ ] Existing study sessions, Continue Studying, Helpful voting, Saved Notes, reports and source previews still function.

## Verification
Run: `python -m unittest discover -s tests -p 'test_private_annotations.py'` with boto3 available.
Backend Lambda route deployment is required, but this batch creates **no new DynamoDB table**. JavaScript parsing does not replace live browser and server QA.
Production/main remains unchanged until explicitly authorized.
