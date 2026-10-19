Property CRM — Prototype Finisher (Figma plugin)
================================================

What it does
  Runs inside your "Property CRM — Responsive Prototype" Figma file and builds
  everything that is still missing, then wires every prototype interaction:
   • Desktop page: all 11 screens (rebuilt for consistency), 4 overlays,
     9 toast confirmations, and the interactive components (unit grid,
     lease wizard, rent tabs, rent entry form, maintenance board, reports,
     tenant portal).
   • Mobile page: all 11 screens at 390 px, slide-in menu drawer, bottom-sheet
     dialogs, one detail sheet per maintenance ticket, toasts.
   • ~4,800 prototype links (navigate, overlay, swap, back, close, change-to,
     button hover states) and two flow starting points per page.
  It is safe to run again: it deletes what it generated last time first.

How to run (Figma desktop app — plugins can't be imported in the browser)
  1. Unzip this folder anywhere on your computer.
  2. Open the file https://www.figma.com/design/SS1traQTXA6Sp4ckoknvWd in the
     Figma desktop app.
  3. Menu  →  Plugins  →  Development  →  Import plugin from manifest…
     and pick manifest.json from this folder.
  4. Menu  →  Plugins  →  Development  →  Property CRM — Prototype Finisher.
     Leave Figma open; it takes about 1–3 minutes and shows
     "Done: N frames, N prototype links" when finished.

Viewing the prototype
  • Desktop page → press ▶ Present, pick flow "1 · Admin app".
    Device: "Desktop" 1440 × 900 (Prototype panel → Device).
  • Mobile page → press ▶ Present, device iPhone 14/15 (390 × 844).
  • Flow "2 · Tenant portal" on either page starts the tenant app.

Do not rename the first three pages or the "Sidebar / Desktop" and
"Unit board / Desktop" component sets — the plugin looks them up by name.
