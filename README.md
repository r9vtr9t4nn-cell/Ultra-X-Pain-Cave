# THE LONG GAME — Ultra Coach

A mobile-first personal ultra-running companion for Ultra X Scotland 110K (1 May 2027).

## Current app features
- Black and hot-pink mobile app interface with bottom navigation
- 22-week provisional race build with weekly distance, long-run distance, ascent targets, paces, HR zones and session structure
- Run logging with distance, duration, average pace, HR, elevation, effort and notes
- Local weather and five-day forecast using Open-Meteo, with browser geolocation and Inverness fallback
- Gym workout logging with strength templates, sets, reps, load and RPE
- Feel / RPE guides and talk-test descriptions
- Nutrition checklist, shopping list and recovery check-ins
- Athlete profile, CSV import and JSON backup/restore

## Privacy and data
Training logs, check-ins, gym sessions, profile and notes are stored in browser localStorage. They are not sent to a coaching server. The weather feature calls Open-Meteo and may request browser location permission; if permission is declined, it uses Inverness coordinates. Anyone with access to the same browser profile/device may be able to access locally stored entries. Export a backup before clearing browser data or changing devices.

## Plan status
The 22-week training progression is a provisional draft based on the athlete's current 30–40 km/week, four run days (Tue/Wed/Fri/Sun), 20–25 km comfortable long run and the Ultra X Scotland 110K event. Weekly targets must be adjusted using recovery, symptoms, actual training data and coaching review. The HR zone guide is recorded as Z1 ≤135, Z2 136–150, Z3 151–163, Z4 164–175, Z5 176+ bpm; verify against current Garmin settings. Pace guidance is effort-led on trails and hills.

## Hosting
Enable GitHub Pages in repository Settings → Pages. The repository is currently private; GitHub Pages availability for a private repository depends on the account plan. Public source hosting requires making the repository public, which has not been done.
