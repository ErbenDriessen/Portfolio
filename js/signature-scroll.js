// =============================================================
// signature-scroll.js — index.html only.
// The pinned "zoom-out + ED signature write-on" hero scene.
// Requires GSAP + ScrollTrigger + Lenis to be loaded first.
// Exposes window.__zoScrub / window.__zoTL for the live preview
// on the This Website case study.
// =============================================================
(function(){
  /* TUNE: how far the banner zooms back (1 = full, lower = further away).
     Pin LENGTH = the .hero-track height in signature-scroll.css (240vh). */
  var ZOOM_TO = 0.62;

  var track   = document.getElementById('heroTrack');
  var scaler  = document.getElementById('heroScaler');
  var marquee = document.getElementById('zoMarquee');
  var band1   = document.getElementById('zoBand1');
  var band2   = document.getElementById('zoBand2');
  var label   = document.getElementById('zoLabel');
  var sign    = document.getElementById('zoSign');
  var settle  = document.getElementById('zoSignSettle');
  var guides  = ['zoG1','zoG2','zoG3'].map(function(id){return document.getElementById(id);});

  /* prime every pen-guide as a hidden dashed line (length → 0 writes it on) */
  var lens = guides.map(function(p){
    var L = p.getTotalLength();
    p.style.strokeDasharray = L; p.style.strokeDashoffset = L;
    p.style.opacity = 0;   /* gated on only while writing (kills the round-cap residue dot) */
    return L;
  });

  var reduce = window.matchMedia('(prefers-reduced-motion:reduce)').matches;
  var coarse = window.matchMedia('(pointer:coarse)').matches;
  var narrow = window.matchMedia('(max-width:1023px)').matches;
  var libs   = window.gsap && window.ScrollTrigger && window.Lenis;
  var force  = location.hash.indexOf('zoforce') >= 0;   /* debug: force effect on narrow */
  var canEffect = libs && (force || (!reduce && !coarse && !narrow));

  if(!canEffect){
    /* no pin/zoom — normal v1 banner. Reduced-motion still shows the finished signature. */
    document.body.classList.add('zo-static');
    if(reduce && !coarse && !narrow) document.body.classList.add('zo-reduced');
    return;
  }

  gsap.registerPlugin(ScrollTrigger);

  function buildTimeline(paused){
    var tl = gsap.timeline({ defaults:{ ease:'none' }, paused: paused });

    /* (A) zoom the banner back: scale down, round, darken + desaturate */
    tl.fromTo(scaler,
      { scale:1, borderRadius:'0px', filter:'brightness(1) saturate(1) contrast(1)' },
      { scale:ZOOM_TO, borderRadius:'34px', filter:'brightness(0.72) saturate(0.5) contrast(1.04)',
        ease:'power2.inOut', duration:0.62 }, 0);

    /* marquee bands fade in and drift (subtle parallax, opposite directions) */
    tl.fromTo(marquee, { opacity:0 }, { opacity:1, duration:0.3 }, 0.12);
    tl.fromTo(band1, { xPercent:2 },  { xPercent:-14, duration:1 }, 0);
    tl.fromTo(band2, { xPercent:-12 }, { xPercent:4, duration:1 }, 0);
    tl.fromTo(label, { opacity:0, y:-10 }, { opacity:1, y:0, duration:0.26 }, 0.2);

    /* (B) write the signature ON — 4 guides in order, time ∝ length for even pen speed */
    var total = lens.reduce(function(a,b){return a+b;}, 0);
    var W0 = 0.34, W1 = 0.93, acc = 0;
    guides.forEach(function(p, i){
      var s = W0 + (W1-W0) * (acc/total);
      acc += lens[i];
      var e = W0 + (W1-W0) * (acc/total);
      tl.set(p, { opacity:1 }, s);
      tl.to(p, { strokeDashoffset:0, duration:(e-s) }, s);
    });
    /* settle: a crisp full copy fades in to guarantee a complete end state */
    tl.fromTo(settle, { opacity:0 }, { opacity:1, duration:0.08 }, 0.92);
    return tl;
  }

  if(force){
    /* DEBUG: paused timeline, scrub directly via window.__zoScrub(p) */
    var tlF = buildTimeline(true);
    window.__zoTL = tlF;
    window.__zoScrub = function(p){ tlF.progress(p); };
  } else {
    /* Lenis smooth scroll, driven by GSAP's single clock */
    var lenis = new Lenis({ duration:1.1, smoothWheel:true,
      easing:function(t){ return Math.min(1, 1.001 - Math.pow(2, -10*t)); } });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(function(time){ lenis.raf(time*1000); });
    gsap.ticker.lagSmoothing(0);

    var tl = buildTimeline(false);
    ScrollTrigger.create({ trigger:track, start:'top top', end:'bottom bottom',
      scrub:1, animation:tl, invalidateOnRefresh:true });

    window.addEventListener('load', function(){ ScrollTrigger.refresh(); });
    window.__zoTL = tl; window.__lenis = lenis;
  }
})();
