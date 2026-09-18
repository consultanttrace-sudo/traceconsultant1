# V4.3 Discovery Reliability Fix

## What changed
- Jabodetabek + Bandung discovery is split into 4 smaller Overpass batches instead of one oversized query.
- Jabodetabek is split into 3 batches; Bandung Raya remains 1 batch.
- A partial-success run is accepted if at least one batch returns data.
- `file://` no longer silently calls a Netlify function that cannot exist on the local file origin. It now gives a clear instruction to run `OPEN_TRACE.command` or use the deployed Netlify version.
- Both `index.html` and `trace-acquisition-os.html` use the same discovery fix.

## Correct local usage
1. Do **not** double-click the HTML file.
2. Run `OPEN_TRACE.command`.
3. The browser should open at `http://127.0.0.1:8765/index.html`.
4. Then click Start Discovery.

## Netlify usage
Deploy the folder containing `index.html`, `netlify.toml`, and `netlify/functions/`. The frontend uses the bundled Overpass serverless function automatically.
