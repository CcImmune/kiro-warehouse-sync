Kiro Warehouse Sync

This folder is a static packaged copy of the deployed Kiro app from:
https://kiro-warehouse-sync.base44.app/

Contents
- index.html: app entry point
- 404.html: GitHub Pages fallback for client-side routes
- manifest.json: simple web app manifest
- assets/: bundled app JavaScript and CSS
- static/js/badge.js: Base44 badge script copied from the deployed app

Important Note
This is a packaged public build, not the original editable Base44 source project.
It is suitable for saving on GitHub or hosting as a static website, but the original
component-level source code should be exported from Base44 if you want fully editable
React files.

Local Preview
From this folder, run:

python3 -m http.server 4177

Then open:

http://127.0.0.1:4177/

Verification
The packaged app was opened locally and the home screen plus client-side Tasks
navigation rendered successfully.

GitHub Pages
If publishing on GitHub Pages, use the repository root as the Pages source. The
404.html file is included so GitHub Pages can fall back to the app for client-side
routes.
