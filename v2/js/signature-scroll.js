// =============================================================
// signature-scroll.js — index.html only.
// The pinned "zoom-out + ED signature write-on" hero scene.
// Requires GSAP + ScrollTrigger + Lenis to be loaded first.
// Exposes window.__zoScrub / window.__zoTL for the live preview
// on the This Website case study.
// The signature is written by the pen in #zoPen (see PEN_ORDER below);
// pages with the older 3-guide markup (zoG1-3) keep the guide wipe.
// =============================================================
(function(){
  /* TUNE: how far the banner zooms back (1 = full, lower = further away).
     Pin LENGTH = the .hero-track height in signature-scroll.css (265vh).
     ZOOM_TO is mirrored in that css: .zo-label top and the zo-reduced still. */
  var ZOOM_TO = 0.62;

  var track   = document.getElementById('heroTrack');
  var scaler  = document.getElementById('heroScaler');
  var marquee = document.getElementById('zoMarquee');
  var band1   = document.getElementById('zoBand1');
  var band2   = document.getElementById('zoBand2');
  var label   = document.getElementById('zoLabel');
  var sign    = document.getElementById('zoSign');
  var settle  = document.getElementById('zoSignSettle');
  var intro   = document.querySelector('.hero-scaler .hero-intro');
  var cue     = document.querySelector('.hero-scaler .scrollcue');
  var penRoot = document.getElementById('zoPen');

  /* ================= the pen (index.html: #zoPen) =================
     PEN_ORDER: the order the strokes are written in, and their direction.
     Each entry is [the stroke's data-stroke id in the svg, 1 = as its centerline runs, -1 = reversed].
     The markup splits the ink where strokes overlap for THIS order (the stroke written first owns
     the crossing, the later one fills the junction fillets), so a reorder means regenerating it.
       e     E first: the pen lands where the top bar will be (a round start, the stem hangs from the
             bar in the artwork), down the stem, curving into the foot, cusp, bottom bar out to the right
       d     D: one clockwise sweep that also lays down the E's top and middle bars: top bar (over the
             stem's start) > bowl > back along the bottom > round the left end > up through the E as
             its middle bar, the pen skipping off in a tiny dot
       tail  the zigzag (up, down, up, down) running into the long flick out through the bowl
       dot   the i-dot: a short upward flick */
  var PEN_ORDER = [['e',1], ['d',1], ['tail',1], ['dot',1]];
  /* pen dynamics. Lengths are in units of the 2892-wide artwork; "slow" = extra time per unit.
     curve     slowness per unit of curvature (data-c, per mille): tight turns are slower, max curveMax
     ease      how far the pen speeds up after landing / slows down before lifting (easeSlow at the tip);
               a stroke ending in a taper (last segment under taper x its widest) flicks off at speed
     cusp      the same around a cusp (a sharp reversal inside one stroke, where two parts meet)
     size      big strokes are written faster than small ones: a stroke L units long takes
               (L/1000)^-size times as long per unit, clamped to sizeMin..sizeMax. The sweep
               flies, the zigzag and the dot take their time
     lift      the pen-lift pause between strokes, as the time of that many units of straight line */
  var PEN = { curve:0.04, curveMax:1.6, ease:110, easeSlow:1.5, taper:0.6, cusp:45, cuspSlow:1.2,
              size:0.4, sizeMin:0.6, sizeMax:1.8, lift:220 };

  function buildPen(root){
    var strokes = [], total = 0;
    PEN_ORDER.forEach(function(o){
      var g = root.querySelector('[data-stroke="' + o[0] + '"]'); if(!g) return;
      var rev = o[1] < 0;
      var els = Array.prototype.slice.call(g.querySelectorAll('path'));
      if(rev) els.reverse();
      var segs = [], cusps = [], len = 0, part = null;
      els.forEach(function(el){
        var L = el.getTotalLength(), D = L + 1;
        el.style.strokeDasharray = D + ' ' + D;
        el.style.visibility = 'hidden';
        if(part && el.parentNode !== part) cusps.push(len);
        part = el.parentNode;
        segs.push({ el:el, L:L, D:D, s0:len, c:+el.getAttribute('data-c') || 0, rev:rev, shown:0 });
        len += L;
      });
      /* time along the stroke: integrate the slowness in small steps */
      var sA = [0], tA = [0], t = 0;
      var size = Math.min(PEN.sizeMax, Math.max(PEN.sizeMin, Math.pow(len / 1000, -PEN.size)));
      /* a stroke that ends in a taper (its last segment much narrower than its widest) is the pen
         lifting off while still moving: it keeps its speed into the tip. Only a blunt end slows
         down before the lift. A short stroke eases over at most half its length. */
      var ws = segs.map(function(sg){ return +sg.el.getAttribute('stroke-width') || 0; });
      var taper = ws[ws.length - 1] < PEN.taper * Math.max.apply(null, ws);
      var easeL = Math.min(PEN.ease, len / 2);
      function slow(s, c){
        var k = size * (1 + Math.min(c * PEN.curve, PEN.curveMax)), e = 0;
        var a = 1 - s / easeL, b = 1 - (len - s) / easeL;
        if(a > 0) e += PEN.easeSlow * a * a;
        if(b > 0 && !taper) e += PEN.easeSlow * b * b;
        cusps.forEach(function(x){ var q = 1 - Math.abs(s - x) / PEN.cusp; if(q > 0) e += PEN.cuspSlow * q * q; });
        return k * (1 + e);
      }
      segs.forEach(function(sg){
        var n = Math.max(1, Math.ceil(sg.L / 5)), h = sg.L / n;
        for(var i = 0; i < n; i++){
          t += h * slow(sg.s0 + (i + 0.5) * h, sg.c);
          sA.push(sg.s0 + (i + 1) * h); tA.push(t);
        }
      });
      if(strokes.length) total += PEN.lift;
      strokes.push({ segs:segs, len:len, sA:sA, tA:tA, t0:total, T:t, s:-1 });
      total += t;
    });

    function at(st, t){        /* stroke time -> arc length (binary search + lerp) */
      var tA = st.tA, lo = 0, hi = tA.length - 1;
      while(hi - lo > 1){ var m = (lo + hi) >> 1; if(tA[m] <= t) lo = m; else hi = m; }
      var f = (t - tA[lo]) / ((tA[hi] - tA[lo]) || 1);
      return st.sA[lo] + f * (st.sA[hi] - st.sA[lo]);
    }
    function draw(p){          /* p: 0..1 of the whole signature */
      var T = p * total;
      strokes.forEach(function(st){
        var t = T - st.t0;
        var s = t <= 0 ? 0 : t >= st.T ? st.len : at(st, t);
        if(s === st.s) return; st.s = s;
        st.segs.forEach(function(sg){
          var v = s - sg.s0; v = v <= 0 ? 0 : v >= sg.L ? sg.D : v;
          if(v === sg.shown) return; sg.shown = v;
          var st2 = sg.el.style;
          if(v === 0){ st2.visibility = 'hidden'; return; }
          st2.visibility = 'visible';
          /* only the segment under the pen is dashed: a finished one drops the dash, so the browser
             doesn't re-dash every written segment on every frame */
          if(v === sg.D){ st2.strokeDasharray = 'none'; return; }
          st2.strokeDasharray = sg.D + ' ' + sg.D;
          st2.strokeDashoffset = sg.rev ? v - sg.L : sg.D - v;
        });
      });
    }
    return { draw:draw, total:total, strokes:strokes };
  }

  /* the v2 alternates (photo / eyes / concept-*) still carry the older 3-guide pen-mask markup */
  var pen     = penRoot ? buildPen(penRoot) : null;
  window.__zoPen = pen;   /* debug: __zoPen.draw(0..1) poses the pen directly */
  var guides  = penRoot ? [] : ['zoG1','zoG2','zoG3'].map(function(id){return document.getElementById(id);});

  /* prime every pen-guide as a hidden dashed line (length → 0 writes it on) */
  var lens = guides.map(function(p){
    var L = p.getTotalLength();
    p.style.strokeDasharray = L; p.style.strokeDashoffset = L;
    p.style.opacity = 0;   /* gated on only while writing (kills the round-cap residue dot) */
    return L;
  });

  var reduce = window.matchMedia('(prefers-reduced-motion:reduce)').matches;
  var coarse = window.matchMedia('(pointer:coarse)').matches;   /* touch: native scroll, no Lenis */
  /* the scroll cue's glide: how long the trip from the banner to the work takes,
     and an even ease (sine), so the zoom-out and the pen don't rush past */
  var CUE_SECONDS = 4.5;
  var cueEase = function(t){ return -(Math.cos(Math.PI * t) - 1) / 2; };
  /* native scroll (touch, no Lenis): the same glide by hand; any touch, wheel
     or key from the visitor takes over at once */
  function glide(to, ms){
    var from = window.scrollY, t0 = performance.now(), stop = false;
    var root = document.documentElement, sb = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';   // css smooth-scroll would chase every step
    var end = function(){ stop = true; root.style.scrollBehavior = sb; };
    ['touchstart', 'wheel', 'keydown'].forEach(function(ev){ window.addEventListener(ev, end, { once:true, passive:true }); });
    (function step(now){
      if(stop) return;
      var u = Math.min((now - t0) / ms, 1);
      window.scrollTo(0, from + (to - from) * cueEase(u));
      if(u < 1) requestAnimationFrame(step); else end();
    })(t0);
  }
  var narrow = window.matchMedia('(max-width:1023px)').matches;
  var libs   = window.gsap && window.ScrollTrigger && window.Lenis;
  var force  = location.hash.indexOf('zoforce') >= 0;   /* debug: paused timeline, scrubbed by hand */
  var canEffect = libs && (force || !reduce);

  if(!canEffect){
    /* no pin/zoom — normal v1 banner (reduced-motion / libs missing).
       Reduced-motion on desktop still shows the finished signature. */
    document.body.classList.add('zo-static');
    if(reduce && !coarse && !narrow) document.body.classList.add('zo-reduced');
    /* '#top' maps to 0 here too: in the zo-reduced still the header is scaled
       inside the stage, so the native jump would stop short of the caption.
       The other anchors keep the browser's own jump (they land under the nav). */
    document.addEventListener('click', function(e){
      var a = e.target.closest && e.target.closest('a[href="#top"]'); if(!a) return;
      e.preventDefault();
      window.scrollTo({ top:0, behavior: reduce ? 'auto' : 'smooth' });
      if(history.replaceState) history.replaceState(null, '', '#top');
    });
    return;
  }

  gsap.registerPlugin(ScrollTrigger);

  function buildTimeline(paused){
    var tl = gsap.timeline({ defaults:{ ease:'none' }, paused: paused });

    /* (A) zoom the banner back: scale down, round, darken + desaturate.
       Touch devices skip the animated filter (re-filtering the big portrait
       layers every frame is the main jank risk on phones) and fade a dark
       #zoDim layer over the card instead. */
    var zFrom = { scale:1, borderRadius:'0px' },
        zTo   = { scale:ZOOM_TO, borderRadius:'34px', ease:'power2.inOut', duration:0.62 };
    if(!coarse){
      zFrom.filter = 'brightness(1) saturate(1) contrast(1)';
      zTo.filter   = 'brightness(0.72) saturate(0.5) contrast(1.04)';
    }
    tl.fromTo(scaler, zFrom, zTo, 0);
    if(coarse){
      tl.fromTo('#zoDim', { opacity:0 }, { opacity:.3, ease:'power2.inOut', duration:0.62 }, 0);
      /* the dim darkens but can't desaturate: the card's green lockup also steps
         back, so it doesn't compete with the ED in the same green. Words only:
         the labels' own opacity follows --t in css. */
      var words = document.querySelectorAll('.hero-scaler .label .word');
      if(words.length) tl.fromTo(words, { opacity:1 },
        { opacity:.5, ease:'power2.inOut', duration:0.62 }, 0);
    }
    /* the centred lockup the same way, to its css --zo-lock (touch default .5):
       held upright, the ED is signed over it, so it goes completely there
       (portfolio.css). With a mouse (a narrow upright window) the filter dims
       the card instead, so the lockup only fades where --zo-lock asks for it.
       A function, so a rotation / resize (refresh) reads it again */
    var lock = document.querySelector('.hero-scaler .hero-mobile');
    if(lock) tl.fromTo(lock, { opacity:1 }, { opacity:function(){
      var v = parseFloat(getComputedStyle(lock).getPropertyValue('--zo-lock'));
      return isNaN(v) ? (coarse ? .5 : 1) : v;
    }, ease:'power2.inOut', duration:0.62 }, 0);

    /* marquee bands fade in and drift (subtle parallax, opposite directions) */
    tl.fromTo(marquee, { opacity:0 }, { opacity:1, duration:0.3 }, 0.12);
    tl.fromTo(band1, { xPercent:2 },  { xPercent:-14, duration:1 }, 0);
    tl.fromTo(band2, { xPercent:-12 }, { xPercent:4, duration:1 }, 0);
    /* the caption lands as the card settles, not over it while it's still large */
    tl.fromTo(label, { opacity:0, y:-10 }, { opacity:1, y:0, duration:0.2 }, 0.46);
    /* the banner's own name line + scroll cue would shrink to micro-text in the card:
       they step aside early. autoAlpha on the cue so the hidden link can't be
       clicked or tabbed to; plain opacity on the intro so its h1 stays readable
       to assistive tech. Their css entrance (fill backwards) hands opacity over
       once done; if the scene moves while it still runs (a reload restored
       mid-scene), it's ended so it can't flash them back in over the card. */
    function endEntrance(){ intro.style.animation = cue.style.animation = 'none'; }
    tl.fromTo(intro, { opacity:1 }, { opacity:0, duration:0.18, onStart:endEntrance }, 0.02);
    tl.fromTo(cue, { autoAlpha:1 }, { autoAlpha:0, duration:0.18 }, 0.02);

    /* (B) write the signature ON between W0 and W1 of the timeline */
    var W0 = 0.34, W1 = 0.93;
    if(pen){
      /* the pen: one tween scrubs the pen's own clock (strokes in PEN_ORDER, pen speed and
         lift pauses from PEN); the scroll position maps linearly onto that clock */
      var penT = { p:0 };
      tl.fromTo(penT, { p:0 }, { p:1, duration:W1-W0, onUpdate:function(){ pen.draw(penT.p); } }, W0);
      /* settle: the crisp full copy fades in once the pen has lifted */
      tl.fromTo(settle, { opacity:0 }, { opacity:1, duration:0.07 }, W1);
    } else {
      /* older markup: 3 guides in order, time ∝ length for even pen speed */
      var total = lens.reduce(function(a,b){return a+b;}, 0), acc = 0;
      guides.forEach(function(p, i){
        var s = W0 + (W1-W0) * (acc/total);
        acc += lens[i];
        var e = W0 + (W1-W0) * (acc/total);
        tl.set(p, { opacity:1 }, s);
        tl.to(p, { strokeDashoffset:0, duration:(e-s) }, s);
      });
      /* settle: a crisp full copy fades in to guarantee a complete end state */
      tl.fromTo(settle, { opacity:0 }, { opacity:1, duration:0.08 }, 0.92);
    }
    /* hold: the finished card + signature stay put for a beat before the pin
       releases (the timeline ends at 1.18; the track grew 240→265vh to match) */
    tl.to({}, { duration:0.18 });
    return tl;
  }

  if(force){
    /* DEBUG: paused timeline, scrub directly via window.__zoScrub(p) */
    var tlF = buildTimeline(true);
    /* the nav ink re-reads the scaled card on every scrub, as in the live scene */
    tlF.eventCallback('onUpdate', window.__navInk || function(){});
    window.__zoTL = tlF;
    window.__zoScrub = function(p){ tlF.progress(p); };
  } else {
    /* Lenis smooth scroll, driven by GSAP's single clock. Mouse/trackpad only:
       touch keeps the browser's native momentum scroll (the pin is css sticky,
       so there's no pin-spacer to fight it), and the address bar showing/hiding
       mustn't re-measure the scene mid-swipe. */
    var lenis = null;
    if(!coarse){
      lenis = new Lenis({ duration:1.1, smoothWheel:true,
        easing:function(t){ return Math.min(1, 1.001 - Math.pow(2, -10*t)); } });
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add(function(time){ lenis.raf(time*1000); });
      gsap.ticker.lagSmoothing(0);
    } else {
      ScrollTrigger.config({ ignoreMobileResize:true });
    }

    var tl = buildTimeline(false);
    /* body.zo-pinned keeps the nav see-through while nothing scrolls under it
       (css); the nav ink re-reads the card's seam on every scrubbed frame */
    var navInk = window.__navInk || function(){};
    tl.eventCallback('onUpdate', navInk);
    ScrollTrigger.create({ trigger:track, start:'top top', end:'bottom bottom',
      scrub: coarse ? 0.5 : 1, animation:tl, invalidateOnRefresh:true,
      toggleClass:{ targets:document.body, className:'zo-pinned' }, onToggle:navInk });

    /* in-page links scroll through Lenis (html.lenis turns native smooth-scroll
       off). Delegated, so links added later are covered too. '#top' maps to 0:
       the real header sits inside the sticky, scaled stage. Keyboard activations
       (detail 0) keep the browser's own jump, which also moves focus to the
       target (the skip link relies on that). On touch (no Lenis) the native
       smooth anchors + scroll-padding already land right; only '#top' needs it. */
    document.addEventListener('click', function(e){
      var a = e.target.closest && e.target.closest('a[href^="#"]'); if(!a) return;
      var h = a.getAttribute('href'); if(h.length < 2) return;
      /* the hero's scroll cue: a slow, even glide down, so the zoom-out and the
         signature play through at a pace you can watch (not a jump past them) */
      if(a.classList.contains('scrollcue') && !reduce){
        var to = document.querySelector(h); if(to === null) return;
        e.preventDefault();
        var off = -document.getElementById('nav').offsetHeight;
        if(lenis) lenis.scrollTo(to, { offset:off, duration:CUE_SECONDS, easing:cueEase });
        else glide(to.getBoundingClientRect().top + scrollY + off, CUE_SECONDS * 1000);
        if(history.replaceState) history.replaceState(null, '', h);
        return;
      }
      if(e.detail === 0 && h !== '#top') return;
      if(!lenis && h !== '#top') return;
      var t = h === '#top' ? 0 : document.querySelector(h); if(t === null) return;
      e.preventDefault();
      if(lenis) lenis.scrollTo(t, { offset: h === '#top' ? 0 : -document.getElementById('nav').offsetHeight });
      else window.scrollTo({ top:0, behavior:'smooth' });
      if(history.replaceState) history.replaceState(null, '', h);
    });

    window.addEventListener('load', function(){ ScrollTrigger.refresh(); });
    window.__zoTL = tl; window.__lenis = lenis;
  }
})();
