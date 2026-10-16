# Gallery browser checks

Run from the repository root:

```bash
npm run build
npm run test:gallery
```

Also check the exact running preview before handing its URL to the user:

```bash
npm run dev -- --host 127.0.0.1 --port 5173
# In another terminal, without starting a replacement test server:
npm run test:preview
```

`test:preview` requires all 10 gallery SVGs before any selection and verifies
that opening/closing a detail keeps them in the gallery. An unavailable or old
preview exits nonzero. The default live URL is
`http://127.0.0.1:5173/awesome-workflow/`; use `-- --url <localhost-url>` to check
another local address. The dev command refuses an occupied port rather than
silently moving to a different URL.

On 2026-10-16 the still-running old preview failed this check. After restarting
that same port, it passed with 10 initial diagrams, 0 initial dialogs and no
page errors. The before/after results are `preview-before.json` and
`live-preview.json`; matching full-page screenshots use the same basenames.

The script serves the production build, exercises all published cases, and
opens a separate development-only harness for synthetic graphs. The harness is
not imported by the gallery build. No external source or business workflow is
executed. Both test servers close after the run.

`report.json` records the actual checks, browser version and screenshot files.
The 10 current screenshots cover desktop/phone gallery, node/connection details,
parallel flow, long labels and a selected node in a split graph. `before.png`
is the original gallery comparison. `fixture-load-failure.png` is an earlier
failed test-page load, retained for diagnosis; it is not a current passing image.

The actual test-page load and keyboard focus issues were repaired. Screenshot
inspection and user acceptance are recorded separately in
[implementation status](../implementation-status.md).
