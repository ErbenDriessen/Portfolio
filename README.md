# Portfolio — Erben Driessen

My personal developer portfolio. One portrait split down the middle — **frontend** (left)
and **backend** (right) — that follows your cursor. Scroll past the banner and it zooms
back like a card placed on a desk while my signature draws itself on top.

Hand-built with plain **HTML, CSS and JavaScript** — no framework, no build step. GSAP +
ScrollTrigger + Lenis drive the scroll choreography, an SVG mask animates the signature,
and a small Supabase-backed grid lists extra projects.

## Project structure

```
.
├── index.html                # homepage: banner, zoom-out + signature, work, about
├── banner.html               # standalone split-portrait banner (also embedded live)
├── powerplant.html           # case study — PowerPlan(t) (mobile app)
├── this-website.html         # case study — this site itself
├── planetpod.html            # case study — PlanetPod fleet monitoring
├── planetpod-dashboard.html  # interactive Grafana-style dashboard (recreation)
├── admin.html                # Supabase login to manage the "more projects" grid
├── case-study-template.html  # template for new case studies
├── css/
│   ├── portfolio.css         # homepage styles + design tokens
│   ├── signature-scroll.css  # pinned zoom-out + signature write-on
│   ├── case-study.css        # shared base for every case-study page (pp-* system)
│   ├── planetpod.css         # planetpod re-skin
│   └── this-website.css      # this-website re-skin
├── js/
│   ├── supabase-client.js    # Supabase client config
│   └── more-projects.js      # live "more projects" grid
├── img/                      # portrait images
└── media/                    # screenshots, video, mockup frames
```

## Stack

HTML · CSS · JavaScript · GSAP / ScrollTrigger · Lenis · SVG · Supabase

## Run locally

No build step — just open `index.html`, or serve the folder so the live previews and
Supabase calls work over `http://`:

```bash
python -m http.server 8000
# then open http://localhost:8000
```

## Deploy

Fully static, so it hosts anywhere (GitHub Pages, Netlify, Cloudflare Pages). `index.html`
sits at the repo root, so no extra configuration is needed.

## License

[MIT](LICENSE) © Erben Driessen
