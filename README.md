# The Long Game — Ultra Coaching

A mobile-first personal ultra-running companion for the Ultra X Scotland 110K project.

## Run locally
Open `index.html` in a browser. For PWA installation and offline service-worker support, serve this folder over HTTPS (GitHub Pages is suitable).

## Features
- Today dashboard and race countdown
- Editable weekly calendar (sessions remain explicitly unprescribed until athlete assessment is complete)
- Manual training log, CSV import, JSON backup/restore
- Daily recovery check-in
- Fuel checklist and shopping list
- Athlete profile
- Local browser storage; no coaching backend or third-party analytics

## Privacy
Training logs, check-ins, profile and notes are stored in the browser's localStorage. They are not transmitted to a server by this app. Anyone with access to the same browser profile/device may be able to access them. Export a backup before clearing browser data or changing devices.

## Deployment
Enable GitHub Pages for this repository (Settings → Pages → Deploy from a branch → main / root). If the repository remains private, Pages availability depends on the account plan. The source repository must be public for free GitHub Pages on GitHub Free.
