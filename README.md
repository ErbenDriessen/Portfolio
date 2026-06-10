# Portfolio — Erben Driessen

My personal portfolio. One portrait split down the middle — **frontend** (left) and
**backend** (right) — that follows your gaze. Scroll past the banner and it zooms back
while my signature draws itself on top.

Hand-built: plain HTML/CSS/JS, GSAP + ScrollTrigger + Lenis for the scroll choreography,
an SVG mask for the signature, and a live Supabase-backed "more projects" grid I manage
through a small admin.

## Pages
- `index.html` — homepage (banner + zoom-out + signature, work, about, contact)
- `banner.html` — the standalone split-portrait banner
- `powerplant.html` — case study: PowerPlan(t) (mobile app)
- `this-website.html` — case study about this site itself
- `planetpod.html` — case study: PlanetPod fleet monitoring
- `planetpod-dashboard.html` — interactive Grafana-style dashboard (recreation, sample data)
- `admin.html` — Supabase login to add/edit the smaller projects
- `case-study-template.html` — template for new case studies

## Stack
HTML · CSS · JavaScript · GSAP / ScrollTrigger · Lenis · SVG · Supabase

## Run locally
Open `index.html`, or serve the folder:
```
python -m http.server
```
