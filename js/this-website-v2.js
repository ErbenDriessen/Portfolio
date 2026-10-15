// =============================================================
// this-website-v2.js: the "This website" case study (v2).
//   1. the plate strip: prev / next arrows that follow the scroll
//   2. the before / after sliders: drag, or the keyboard (a range input)
//   3. the live signature: the homepage's ED, loaded when it gets close
//      and written by the same pen (createPen, below: the pen engine
//      from v2/js/signature-scroll.js, factored out so it takes any
//      root, order and dynamics), with Replay and a drag scrubber
//   4. the replays: the homepage's ED loader and the page-transition
//      curtain, rebuilt small on stills, on their own clock
//   5. copy the email address (as on the homepage)
//   6. the versions, live: a button per version, each one's page running
//      in one window (a scaled frame, hero only), stills on phones
// Everything no-ops without its markup. Reduced motion: no hint glide,
// no autoplay (the signature shows finished, the replays their key
// frame; Replay and Play again still work).
// =============================================================
(function(){
  'use strict';
  var reduce = window.matchMedia('(prefers-reduced-motion:reduce)').matches;
  var raf = window.requestAnimationFrame.bind(window);

  /* ================= the pen (factored out of v2/js/signature-scroll.js) =================
     order: [the stroke's data-stroke id, 1 = as its centerline runs, -1 = reversed]
     cfg:   the pen dynamics (see PEN below). Lengths are in units of the artwork.
     Returns { draw(p 0..1), total, strokes }. The markup (one <g data-stroke> per
     stroke, parts of segments with data-c curvature) is the homepage's #zoPen. */
  var PEN_ORDER = [['e',1], ['d',1], ['tail',1], ['dot',1]];
  var PEN = { curve:0.04, curveMax:1.6, ease:110, easeSlow:1.5, taper:0.6, cusp:45, cuspSlow:1.2,
              size:0.4, sizeMin:0.6, sizeMax:1.8, lift:220 };

  function createPen(root, order, cfg){
    order = order || PEN_ORDER; cfg = cfg || PEN;
    var strokes = [], total = 0;
    order.forEach(function(o){
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
      var size = Math.min(cfg.sizeMax, Math.max(cfg.sizeMin, Math.pow(len / 1000, -cfg.size)));
      /* a stroke ending in a taper keeps its speed into the tip; only a blunt end slows before the lift */
      var ws = segs.map(function(sg){ return +sg.el.getAttribute('stroke-width') || 0; });
      var taper = ws[ws.length - 1] < cfg.taper * Math.max.apply(null, ws);
      var easeL = Math.min(cfg.ease, len / 2);
      function slow(s, c){
        var k = size * (1 + Math.min(c * cfg.curve, cfg.curveMax)), e = 0;
        var a = 1 - s / easeL, b = 1 - (len - s) / easeL;
        if(a > 0) e += cfg.easeSlow * a * a;
        if(b > 0 && !taper) e += cfg.easeSlow * b * b;
        cusps.forEach(function(x){ var q = 1 - Math.abs(s - x) / cfg.cusp; if(q > 0) e += cfg.cuspSlow * q * q; });
        return k * (1 + e);
      }
      segs.forEach(function(sg){
        var n = Math.max(1, Math.ceil(sg.L / 5)), h = sg.L / n;
        for(var i = 0; i < n; i++){
          t += h * slow(sg.s0 + (i + 0.5) * h, sg.c);
          sA.push(sg.s0 + (i + 1) * h); tA.push(t);
        }
      });
      if(strokes.length) total += cfg.lift;
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
          if(v === sg.D){ st2.strokeDasharray = 'none'; return; }
          st2.strokeDasharray = sg.D + ' ' + sg.D;
          st2.strokeDashoffset = sg.rev ? v - sg.L : sg.D - v;
        });
      });
    }
    return { draw:draw, total:total, strokes:strokes };
  }

  /* when an element first comes near the viewport (or at once without IntersectionObserver) */
  function whenNear(el, margin, fn, ratio){
    if(!('IntersectionObserver' in window)){ fn(); return; }
    var io = new IntersectionObserver(function(es){
      for(var i = 0; i < es.length; i++) if(es[i].isIntersecting){ io.disconnect(); fn(); return; }
    }, { rootMargin:margin, threshold:ratio || 0 });
    io.observe(el);
  }

  /* ================= 1. the plate strip ================= */
  var strip = document.getElementById('howStrip');
  if(strip){
    var arrows = document.querySelectorAll('[data-strip]');
    var step = function(){
      var a = strip.children[0], b = strip.children[1];
      return a && b ? b.getBoundingClientRect().left - a.getBoundingClientRect().left : strip.clientWidth * .8;
    };
    var sync = function(){
      var max = strip.scrollWidth - strip.clientWidth - 2;
      arrows.forEach(function(btn){
        var dir = +btn.getAttribute('data-strip');
        btn.disabled = dir < 0 ? strip.scrollLeft <= 2 : strip.scrollLeft >= max;
      });
    };
    arrows.forEach(function(btn){
      btn.addEventListener('click', function(){
        strip.scrollBy({ left:+btn.getAttribute('data-strip') * step(), behavior: reduce ? 'auto' : 'smooth' });
      });
    });
    var pending = false;
    strip.addEventListener('scroll', function(){ if(pending) return; pending = true; raf(function(){ pending = false; sync(); }); }, { passive:true });
    window.addEventListener('resize', sync);
    sync();
  }

  /* ================= 2. before / after sliders ================= */
  [].forEach.call(document.querySelectorAll('[data-cmp]'), function(fig){
    var frame = fig.querySelector('.tw-cmp-frame'), input = fig.querySelector('.tw-cmp-range');
    if(!frame || !input) return;
    var touched = false, glide = null;
    /* what each side shows, for the screen reader's value ("70% before, 30% now") */
    var names = (fig.getAttribute('data-names') || 'before|now').split('|');
    function set(v){
      v = Math.max(0, Math.min(100, v));
      frame.style.setProperty('--pos', v + '%');
      input.value = Math.round(v);
      input.setAttribute('aria-valuetext', Math.round(v) + '% ' + names[0] + ', ' + (100 - Math.round(v)) + '% ' + names[1]);
      /* a corner label steps aside when the handle runs over it */
      frame.classList.toggle('hide-l', v < 18);
      frame.classList.toggle('hide-r', v > 82);
    }
    set(+fig.getAttribute('data-start') || 50);
    function fromX(x){ var r = frame.getBoundingClientRect(); return (x - r.left) / r.width * 100; }
    function stopGlide(){ touched = true; if(glide){ cancelAnimationFrame(glide); glide = null; } }

    /* mouse / pen: jump to the pointer at once. A finger only moves the handle once
       it moves sideways (touch-action:pan-y: an up/down swipe stays a page scroll and
       cancels the pointer), or on a tap */
    var dragging = false, moved = false, isTouch = false;
    frame.addEventListener('pointerdown', function(e){
      if(e.button !== undefined && e.button !== 0) return;
      stopGlide(); dragging = true; moved = false; isTouch = e.pointerType === 'touch';
      frame.classList.add('dragging');
      if(!isTouch){
        if(frame.setPointerCapture) try { frame.setPointerCapture(e.pointerId); } catch(err){}
        set(fromX(e.clientX));
      }
    });
    frame.addEventListener('pointermove', function(e){ if(dragging){ moved = true; set(fromX(e.clientX)); } });
    function end(){ dragging = false; frame.classList.remove('dragging'); }
    frame.addEventListener('pointerup', function(e){ if(dragging && isTouch && !moved) set(fromX(e.clientX)); end(); });
    frame.addEventListener('pointercancel', end);
    frame.addEventListener('lostpointercapture', end);
    input.addEventListener('input', function(){ stopGlide(); set(+input.value); });

    /* once, as it comes into view: the handle glides over so you see what changed (and that it moves) */
    var hint = +fig.getAttribute('data-hint');
    if(reduce && hint >= 0 && !isNaN(hint)) set(hint);   /* no glide: just start where it would end */
    else if(hint >= 0 && !isNaN(hint)) whenNear(frame, '0px 0px -25% 0px', function(){
      setTimeout(function(){
        if(touched) return;
        var from = +input.value, t0 = 0, D = 1500;
        var ease = function(u){ return u < .5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; };
        (function tick(ts){
          if(touched) return;
          if(!t0) t0 = ts;
          var u = Math.min((ts - t0) / D, 1);
          set(from + (hint - from) * ease(u));
          glide = u < 1 ? raf(tick) : null;
        })(performance.now());
      }, 450);
    }, .5);
  });

  /* ================= 3. the live signature ================= */
  var live = document.querySelector('[data-sign]');
  if(live){
    var stage = live.querySelector('.tw-live-stage'),
        replay = live.querySelector('.tw-replay'),
        scrub = live.querySelector('.tw-scrub'),
        lands = live.querySelectorAll('.tw-lands li');
    var pen = null, p = 0, playing = null, loaded = false, autoplayed = false;
    var DURATION = 3600;         /* ms for the whole signature, pen lifts included */

    function show(v){            /* v: 0..1 */
      p = v;
      if(pen){
        pen.draw(v);
        /* a landing lights up once its stroke has started */
        pen.strokes.forEach(function(st, i){ if(lands[i]) lands[i].classList.toggle('on', v >= 1 || v * pen.total > st.t0); });
      }
      stage.classList.toggle('is-done', v >= 1);
      var pc = Math.round(v * 100);
      scrub.value = Math.round(v * 1000);
      scrub.style.setProperty('--p', (v * 100).toFixed(2) + '%');
      scrub.setAttribute('aria-valuetext', pc + '% written');
    }
    function stop(){ if(playing){ cancelAnimationFrame(playing); playing = null; } }
    function play(){
      if(!pen) return;
      stop();
      var t0 = 0;
      show(0);
      (function tick(ts){
        if(!t0) t0 = ts;
        var u = Math.min((ts - t0) / DURATION, 1);
        show(u);
        playing = u < 1 ? raf(tick) : null;
      })(performance.now());
    }
    function fail(){ stage.classList.remove('is-loading'); live.classList.add('is-off'); }
    function load(){
      if(loaded) return; loaded = true;
      stage.classList.add('is-loading');
      if(typeof fetch !== 'function'){ fail(); return; }
      fetch('media/tw2-signature.svg').then(function(r){ if(!r.ok) throw r.status; return r.text(); }).then(function(txt){
        var doc = new DOMParser().parseFromString(txt, 'image/svg+xml');
        var svg = doc.documentElement;
        if(!svg || svg.nodeName.toLowerCase() !== 'svg' || doc.getElementsByTagName('parsererror').length) throw 'parse';
        /* frame the ink like the stroke-order plate next to it: same size, same spot */
        svg.setAttribute('viewBox', '0 -229 2903 1814');
        svg = document.importNode(svg, true);
        var root = svg.querySelector('#zoPen');
        if(!root) throw 'markup';
        stage.insertBefore(svg, stage.querySelector('.tw-lands'));
        pen = createPen(root);
        stage.classList.remove('is-loading');
        stage.classList.add('has-svg');
        replay.disabled = scrub.disabled = false;
        if(reduce) show(1);
        else { show(0); whenNear(stage, '0px 0px -15% 0px', function(){ if(!autoplayed){ autoplayed = true; setTimeout(play, 250); } }, .45); }
      }).catch(fail);
    }
    whenNear(live, '600px 0px', load);
    replay.addEventListener('click', function(){ autoplayed = true; play(); });
    scrub.addEventListener('input', function(){ autoplayed = true; stop(); show(+scrub.value / 1000); });
  }

  /* ================= 4. the replays: the ED loader and the curtain =================
     Small rebuilds of the homepage's loader (the inline script in index.html)
     and the page-transition curtain (css/transitions.css, js/transitions.js), on stills of
     the live site. Same shapes, timing and easing as the real ones; the waits that hang on
     loading in the real ones (the portrait, the next page) get a fixed length here.
     Each runs on its own clock (frame time, capped, so a stall is a pause and not a jump),
     which stops while it's off screen. It plays once when it comes into view (the second
     waits for the first if both come in together); Play again restarts it. */
  function bez(x1, y1, x2, y2){            /* cubic-bezier(x1,y1,x2,y2) as a function of time */
    function c(a, b, u){ return 3*a*(1-u)*(1-u)*u + 3*b*(1-u)*u*u + u*u*u; }
    return function(t){
      if(t <= 0) return 0; if(t >= 1) return 1;
      var lo = 0, hi = 1, u = t;
      for(var i = 0; i < 20; i++){ u = (lo + hi) / 2; if(c(x1, x2, u) < t) lo = u; else hi = u; }
      return c(y1, y2, u);
    };
  }
  var IO_EASE = bez(.76, 0, .24, 1),         /* the zoom and the curtain's slides */
      CSS_EASE = bez(.25, .1, .25, 1);       /* css 'ease' (the curtain name's fades) */
  function span(t, a, d){ var u = (t - a) / d; return u < 0 ? 0 : u > 1 ? 1 : u; }
  function setAttr(el, k, v){ if(el.getAttribute(k) !== v) el.setAttribute(k, v); }
  function setStyle(el, k, v){ if(el.style[k] !== v) el.style[k] = v; }

  /* --- the loader, on a 960x600 screen: the mark at 2px a favicon unit, centred --- */
  function loaderDemo(stage){
    var W = 960, H = 600, K0 = 2, OX = 416, OY = 236;
    /* index.html's TUNE: the pens' [start, end] from PEN0, in writing order (E: stem, three
       arms; D: stem, bowl); then the wait; then the zoom: ZOOM long, aiming OVER past "one
       stroke covers the screen", the green fading over its first FADE */
    var PEN0 = 300, PENS = [[0, 190], [140, 280], [200, 330], [260, 400], [360, 530], [450, 720]],
        WROTE = PEN0 + 720, ZS = WROTE + 420, ZOOM = 900, OVER = 1.3, FADE = .15;
    var penEase = bez(.55, 0, .25, 1), bowlEase = bez(.45, 0, .3, 1), outEase = bez(0, 0, .58, 1);
    /* the ED (img/favicon.svg): E, D, the D's counter (evenodd) */
    var G = ('M9 16L29 16L29 23L16 23L16 28.5L27 28.5L27 35.5L16 35.5L16 41L29 41L29 48L9 48Z' +
             'M35 16L44 16C51 16 55 20 55 27L55 37C55 44 51 48 44 48L35 48Z' +
             'M42 23L42 41L44 41C46.8 41 48 39.6 48 36.5L48 27.5C48 24.4 46.8 23 44 23Z')
            .match(/[MLCZ]|-?[\d.]+/g).map(function(s){ return /\d/.test(s) ? +s : s; });
    function glyph(k, x, y){
      var s = '', n = 0;
      for(var i = 0; i < G.length; i++){
        var v = G[i];
        s += typeof v === 'string' ? v : ' ' + (n++ % 2 ? y + k * v : x + k * v).toFixed(2);
      }
      return s;
    }
    var veil = stage.querySelector('.tw-ld-veil'), ink = stage.querySelector('.tw-ld-ink'),
        pens = stage.querySelector('.tw-ld-pens'), sweep = stage.querySelector('#twLdSweep rect'),
        glow = stage.querySelector('.tw-ld-glow'), name = stage.querySelector('.tw-ld-name'),
        page = stage.querySelector('.tw-demo-img');
    var bars = pens.querySelectorAll('rect'), FULL = [32, 13, 11, 13, 32], RECT = 'M-4 -4H964V604H-4Z';
    /* the window's target: the stroke that covers the screen soonest (the E's middle arm here) */
    var tg = [{ x0:9, x1:27, y0:28.5, y1:35.5 }, { x0:9, x1:16, y0:16, y1:48 }].reduce(function(a, r){
      r.k = Math.max(W / (r.x1 - r.x0), H / (r.y1 - r.y0)); return !a || r.k < a.k ? r : a; }, null);
    var P = { x:(tg.x0 + tg.x1) / 2, y:(tg.y0 + tg.y1) / 2 }, kr = Math.max(1.01, tg.k * OVER / K0),
        s0x = OX + K0 * P.x, s0y = OY + K0 * P.y;
    function at(u){            /* the zoom at u (0..1): scale, origin, covered yet? */
      var e = IO_EASE(u), k = K0 * Math.pow(kr, e),
          x = s0x + (W / 2 - s0x) * e - k * P.x, y = s0y + (H / 2 - s0y) * e - k * P.y;
      return { k:k, x:x, y:y, done:x + k * tg.x0 <= 0 && x + k * tg.x1 >= W && y + k * tg.y0 <= 0 && y + k * tg.y1 >= H };
    }
    /* it ends the moment one stroke covers the screen (~75% into the curve) */
    var zEnd = ZOOM;
    for(var ms = 0; ms <= ZOOM; ms += 4){ if(at(ms / ZOOM).done){ zEnd = ms; break; } }
    var END = ZS + zEnd;

    function render(t){
      var written = t >= WROTE, open = t >= ZS;
      /* 1. the pens */
      setAttr(pens, 'visibility', !written && t > PEN0 ? 'visible' : 'hidden');
      if(!written){
        for(var i = 0; i < 5; i++){
          var p = penEase(span(t, PEN0 + PENS[i][0], PENS[i][1] - PENS[i][0])), v = (FULL[i] * p).toFixed(3);
          setAttr(bars[i], i === 0 || i === 4 ? 'height' : 'width', v);
        }
        var b = bowlEase(span(t, PEN0 + PENS[5][0], PENS[5][1] - PENS[5][0]));
        setAttr(sweep, 'transform', 'rotate(' + (-90 + 180 * b).toFixed(2) + ' 42 32)');
      }
      /* 2. written: the one filled glyph; 3. the window */
      if(!open){
        setAttr(veil, 'd', RECT);
        setAttr(ink, 'd', written ? glyph(K0, OX, OY) : '');
        setStyle(ink, 'opacity', '1');
      } else if(t >= END){
        setAttr(veil, 'd', ''); setAttr(ink, 'd', '');
      } else {
        var u = (t - ZS) / ZOOM, z = at(u), g = glyph(z.k, z.x, z.y), f = Math.min(1, u / FADE);
        setAttr(veil, 'd', RECT + g);
        setAttr(ink, 'd', g);
        setStyle(ink, 'opacity', (1 - f * f * (3 - 2 * f)).toFixed(3));
      }
      /* the page under it: only once the window opens */
      if(page) setStyle(page, 'visibility', open ? 'visible' : 'hidden');
      setStyle(glow, 'opacity', open ? (1 - outEase(span(t, ZS, 400))).toFixed(3) : '1');
      setStyle(name, 'opacity', open ? (1 - CSS_EASE(span(t, ZS, 300))).toFixed(3) : '1');
      return t < PEN0 ? -1 : t < WROTE ? 0 : t < ZS ? 1 : t < END ? 2 : -1;
    }
    /* the key frame: the ED written, before the window opens */
    return { end:END, still:WROTE + 1, render:render };
  }

  /* --- the curtain: home -> SlaapCampus (js/transitions.js's COVER and LEAVE, css/transitions.css's easing) --- */
  function curtainDemo(stage){
    var CLICK = 300, C0 = 380, COVER = 600, L0 = C0 + COVER + 450, LEAVE = 700, END = L0 + LEAVE;
    var nameIn = bez(.22, 1, .36, 1), clickOut = bez(0, 0, .58, 1);
    var to = stage.querySelector('.tw-ct-to'), panel = stage.querySelector('.tw-ct-panel'),
        name = stage.querySelector('.tw-ct-name'), click = stage.querySelector('.tw-ct-click');
    function render(t){
      /* the click on the card */
      var c = span(t, CLICK, 450);
      setStyle(click, 'opacity', c > 0 && c < 1 ? (.9 * (1 - c)).toFixed(3) : '0');
      setStyle(click, 'transform', 'scale(' + (.45 + .9 * clickOut(c)).toFixed(3) + ')');
      /* the panel: up over the page, a wait while the next one loads, then off the top */
      var y, o, ny;
      if(t < L0){
        y = 100 * (1 - IO_EASE(span(t, C0, COVER)));
        o = CSS_EASE(span(t, C0 + 180, 400));
        ny = 26 * (1 - nameIn(span(t, C0 + 120, 480)));
      } else {
        y = -100 * IO_EASE(span(t, L0, LEAVE));
        o = 1 - CSS_EASE(span(t, L0, 250));
        ny = -26 * IO_EASE(span(t, L0, 500));
      }
      setStyle(panel, 'visibility', y >= 100 || y <= -100 ? 'hidden' : 'visible');
      setStyle(panel, 'transform', y ? 'translate3d(0,' + y.toFixed(3) + '%,0)' : 'none');
      setStyle(name, 'opacity', o.toFixed(3));
      /* 26px on a 1440px screen */
      setStyle(name, 'transform', ny ? 'translateY(' + (ny / 14.4).toFixed(3) + 'cqw)' : 'none');
      /* the next page, under the panel once it covers */
      setStyle(to, 'visibility', t >= C0 + COVER ? 'visible' : 'hidden');
      return t < C0 ? -1 : t < C0 + COVER ? 0 : t < L0 ? 1 : t < END ? 2 : -1;
    }
    /* the key frame: the page covered, the name on it */
    return { end:END, still:C0 + COVER + 1, render:render };
  }

  /* one observer for all of them: when two come into view together, they play in page order */
  var chainEnd = 0,   /* when the autoplay that's on now ends (performance.now()) */
      watched = [], demoIO = 'IntersectionObserver' in window ? new IntersectionObserver(function(es){
        es.slice().sort(function(a, b){ return watched.indexOf(a.target) - watched.indexOf(b.target); })
          .forEach(function(e){ if(e.target.__tw) e.target.__tw(e); });
      }, { threshold:[0, .45] }) : null;
  [].forEach.call(document.querySelectorAll('[data-demo]'), function(fig){
    var stage = fig.querySelector('.tw-demo-stage'), btn = fig.querySelector('.tw-replay'),
        label = fig.querySelector('.tw-replay-t'), steps = fig.querySelectorAll('.tw-phases li');
    if(!stage || !btn) return;
    var kind = fig.getAttribute('data-demo'), demo;
    try { demo = kind === 'loader' ? loaderDemo(stage) : kind === 'curtain' ? curtainDemo(stage) : null; } catch(e){ demo = null; }
    if(!demo) return;   /* the markup's key frame stays, without its controls */
    var t = 0, running = false, seen = false, shown = false, frame = 0, last = 0, auto = false;
    function paint(still){
      var step = demo.render(t);
      for(var i = 0; i < steps.length; i++) steps[i].classList.toggle('on', !still && i === step);
    }
    function loop(now){
      frame = 0;
      if(!running || !shown) return;
      t = Math.min(demo.end, t + (last ? Math.min(now - last, 50) : 0)); last = now;
      paint();
      if(t >= demo.end){ running = false; fig.classList.remove('is-playing'); return; }
      frame = raf(loop);
    }
    function kick(){ if(running && shown && !frame){ last = 0; frame = raf(loop); } }
    function play(){
      t = 0; running = true; fig.classList.add('is-playing');
      if(label) label.textContent = 'Play again';
      paint(); kick();
    }
    /* the stills it shows: decoded first, so nothing pops in mid-play */
    function whenLoaded(fn){
      var imgs = [].slice.call(stage.querySelectorAll('img')), done = false;
      function go(){ if(!done){ done = true; fn(); } }
      setTimeout(go, 1500);
      Promise.all(imgs.map(function(im){
        return im.decode ? im.decode().catch(function(){}) : Promise.resolve();
      })).then(go, go);
    }
    if(reduce){ t = demo.still; paint(true); if(label) label.textContent = 'Play'; }
    else { t = 0; paint(); }
    fig.classList.add('is-ready');
    btn.addEventListener('click', function(){ auto = true; play(); });

    if(!demoIO){ shown = true; return; }
    /* on screen at all: the clock runs. Half in view, the first time: it plays */
    stage.__tw = function(e){
      shown = e.isIntersecting;
      if(shown) kick();
      if(!seen && !reduce && !auto && e.intersectionRatio >= .45){
        seen = true;
        var now = performance.now(), wait = Math.max(250, chainEnd + 300 - now);
        chainEnd = now + wait + demo.end;
        whenLoaded(function(){
          setTimeout(function(){ if(!auto){ auto = true; play(); } }, Math.max(0, wait - (performance.now() - now)));
        });
      }
    };
    watched.push(stage);
    demoIO.observe(stage);
  });

  /* ================= 5. copy the email address ================= */
  var status = document.getElementById('copyStatus');
  function legacyCopy(text){
    var ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;';
    document.body.appendChild(ta); ta.select();
    var ok = false; try { ok = document.execCommand('copy'); } catch(e){}
    ta.remove(); return ok;
  }
  [].forEach.call(document.querySelectorAll('[data-copy]'), function(b){
    var t = null;
    function done(ok){
      b.classList.toggle('is-copied', ok);
      if(status) status.textContent = ok ? 'Email address copied' : 'Copy failed: the address is erben.l.driessen@gmail.com';
      clearTimeout(t);
      t = setTimeout(function(){ b.classList.remove('is-copied'); if(status) status.textContent = ''; }, 2000);
    }
    b.addEventListener('click', function(){
      var text = b.getAttribute('data-copy');
      if(navigator.clipboard && window.isSecureContext){
        navigator.clipboard.writeText(text).then(function(){ done(true); }, function(){ done(legacyCopy(text)); });
      } else done(legacyCopy(text));
    });
  });

  /* ================= 6. the versions, live =================
     One window, a button per version (and each still in the timeline above picks one too).
     A version is a page: an archived copy under versions/ (noindex), or for Now the homepage
     itself. It runs in a frame laid out at 1440x900 and scaled down to the window, so it looks
     the way it did on a laptop and still follows the cursor (the frame's coordinates scale
     with it). Hero only: once the page has loaded, a small style in it stops all scrolling,
     and its wheel never reaches its own scripts (Lenis on the homepage), so it scrolls this
     page instead; every click, middle click, drag and submit in it is cancelled, so no link in
     it goes anywhere, and nothing in it takes the keyboard focus. The homepage plays no loader
     or curtain in a frame (its head snippet and js/transitions.js check window.top).
     Lazy: nothing loads until the window is within 3/4 of a screen of the viewport, then the
     chosen version (Now) and only that one: switching replaces the frame. More than two
     screens away the frame goes, its WebGL with it, and the still comes back. Each version's
     still covers its frame until the page is ready: loaded, and its live face up (or given up
     on, at most 2.5 s) where it has one (data-ready).
     Phones, touch and windows under 760px get the stills, each with its caption. */
  var verRoot = document.querySelector('[data-versions]');
  if(verRoot) (function(){
    var tabs = [].slice.call(verRoot.querySelectorAll('.tw-ver-tab')),
        picks = [].slice.call(document.querySelectorAll('.tw-evo-pick')),
        win = verRoot.querySelector('.tw-ver-win'),
        stage = verRoot.querySelector('.tw-ver-stage'),
        poster = verRoot.querySelector('.tw-ver-poster'),
        state = verRoot.querySelector('.tw-ver-state'),
        addr = verRoot.querySelector('.tw-ver-url'),
        cap = verRoot.querySelector('.tw-ver-cap');
    if(!tabs.length || !stage || !poster) return;
    var W = 1440, H = 900, WAIT = 2500;
    var liveMq = window.matchMedia('(hover:hover) and (pointer:fine) and (min-width:760px)');
    var byId = {}, cur = null, frame = null, token = 0, near = false, broken = {};
    tabs.forEach(function(b){ byId[b.getAttribute('data-ver')] = b; });
    function live(){ return liveMq.matches && !broken[cur]; }

    /* the bar's state: still (a screenshot), loading, running */
    var STATES = { still:'screenshot', load:'loading', run:'running' };
    function setState(s){ state.setAttribute('data-state', s); state.textContent = STATES[s]; }
    function caption(){ cap.textContent = byId[cur].getAttribute(live() ? 'data-live' : 'data-still'); }

    /* the frame's scale: the stage's width over the 1440 it's laid out at */
    function fit(){ stage.style.setProperty('--s', (stage.clientWidth / W).toFixed(5)); }
    if('ResizeObserver' in window) new ResizeObserver(fit).observe(stage); else window.addEventListener('resize', fit);
    fit();

    /* inside the frame: hero only, nothing to follow */
    var HUSH = 'html,body{overflow:hidden!important;overscroll-behavior:auto!important;scrollbar-width:none!important}' +
               'html::-webkit-scrollbar,body::-webkit-scrollbar{display:none!important}' +
               'a,button,label,summary,input,[role=button]{cursor:inherit!important}' +
               '.hlab,.hlab-toast{display:none!important}';   /* the homepage's hero lab, if it's on in this tab */
    function hush(w, d){
      var st = d.createElement('style');
      st.textContent = HUSH;
      (d.head || d.documentElement).appendChild(st);
      var stop = function(e){ e.preventDefault(); e.stopImmediatePropagation(); };
      ['click', 'auxclick', 'dblclick', 'submit', 'dragstart', 'keydown'].forEach(function(t){ w.addEventListener(t, stop, true); });
      /* no focus or text selection from a press, and the focus stays on this page */
      w.addEventListener('mousedown', function(e){ e.preventDefault(); }, true);
      w.addEventListener('focus', function(){ if(frame && document.activeElement === frame) frame.blur(); });
      w.addEventListener('wheel', function(e){ e.stopImmediatePropagation(); }, { capture:true, passive:true });
      w.addEventListener('scroll', function(){ if(w.scrollX || w.scrollY) w.scrollTo(0, 0); }, { passive:true });
      [].forEach.call(d.querySelectorAll('a[href], area, button, input, select, textarea, summary, iframe, [tabindex], [contenteditable]'),
        function(el){ el.setAttribute('tabindex', '-1'); });
      w.scrollTo(0, 0);
    }
    /* ready: loaded, and the live face up (or failed) where there is one */
    function ready(kind, w, d){
      try {
        if(kind === 'depth-state') return w.__depthState !== 'pending';
        if(kind === 'depth-on'){ var h = d.getElementById('top'); return !h || h.classList.contains('depth-on'); }
      } catch(e){}
      return true;
    }

    function unload(){
      token++;
      stage.classList.remove('is-live');
      if(frame){
        var f = frame; frame = null;
        try { f.src = 'about:blank'; } catch(e){}
        if(f.parentNode) f.parentNode.removeChild(f);
      }
    }
    function fail(){ broken[cur] = true; unload(); setState('still'); caption(); }
    function load(){
      unload();
      var b = byId[cur], my = token, f = document.createElement('iframe'), home = null;
      f.className = 'tw-ver-frame';
      f.title = b.textContent + ': my homepage, live';
      f.width = W; f.height = H;
      f.setAttribute('tabindex', '-1');
      f.setAttribute('aria-hidden', 'true');
      f.setAttribute('scrolling', 'no');
      f.addEventListener('load', function(){
        if(my !== token) return;
        var w, d;
        try { w = f.contentWindow; d = f.contentDocument; } catch(e){}
        if(!w || !d || !d.documentElement){ fail(); return; }
        var here = String(w.location.href).split('#')[0];
        if(here === 'about:blank') return;
        /* a second page in the same frame: something navigated after all. Stills only */
        if(home && here !== home){ fail(); return; }
        home = here;
        hush(w, d);
        var t0 = performance.now(), kind = b.getAttribute('data-ready');
        (function wait(){
          if(my !== token) return;
          if(!ready(kind, w, d) && performance.now() - t0 < WAIT){ setTimeout(wait, 100); return; }
          raf(function(){ raf(function(){
            if(my !== token) return;
            stage.classList.add('is-live');
            setState('run');
          }); });
        })();
      });
      f.src = b.getAttribute('data-src');
      stage.insertBefore(f, poster);
      frame = f;
      setState('load');
    }
    /* once it's close: every version's still in the cache, so a switch shows its own at once */
    var warmed = false;
    function warm(){
      if(warmed) return; warmed = true;
      poster.removeAttribute('loading');
      tabs.forEach(function(t){
        var base = t.getAttribute('data-poster'), im = new Image();
        im.sizes = poster.getAttribute('sizes');
        im.srcset = base + '-720.webp 720w, ' + base + '-1280.webp 1280w';
        im.src = base + '-1280.webp';
      });
    }
    /* what the window should hold now: the frame (close, and live here) or the still */
    function sync(){
      caption();
      if(near) warm();
      if(live() && near){ if(!frame) load(); }
      else { unload(); setState('still'); }
    }

    function select(id){
      var b = byId[id];
      if(!b || id === cur) return;
      cur = id;
      tabs.forEach(function(t){ t.setAttribute('aria-pressed', String(t === b)); });
      picks.forEach(function(p){
        var on = p.getAttribute('data-ver') === id, item = p.closest ? p.closest('.tw-evo-item') : null;
        p.setAttribute('aria-pressed', String(on));
        if(item) item.classList.toggle('is-on', on);
      });
      var base = b.getAttribute('data-poster');
      poster.setAttribute('srcset', base + '-720.webp 720w, ' + base + '-1280.webp 1280w');
      poster.setAttribute('src', base + '-1280.webp');
      stage.setAttribute('aria-label', b.getAttribute('data-alt'));
      addr.textContent = b.getAttribute('data-addr');
      unload();
      sync();
    }
    tabs.forEach(function(b){ b.addEventListener('click', function(){ select(b.getAttribute('data-ver')); }); });
    picks.forEach(function(p){
      p.addEventListener('click', function(){
        select(p.getAttribute('data-ver'));
        /* bring the window into view if it isn't */
        var r = win.getBoundingClientRect();
        if(r.top < 64 || r.bottom > window.innerHeight)
          win.scrollIntoView({ block:'center', behavior: reduce ? 'auto' : 'smooth' });
      });
    });

    var first = tabs.filter(function(t){ return t.getAttribute('aria-pressed') === 'true'; })[0] || tabs[tabs.length - 1];
    tabs.forEach(function(t){ t.setAttribute('aria-pressed', 'false'); });
    select(first.getAttribute('data-ver'));
    if(liveMq.addEventListener) liveMq.addEventListener('change', sync); else if(liveMq.addListener) liveMq.addListener(sync);

    /* close (3/4 of a screen): load. Far (two screens): let it go */
    if(!('IntersectionObserver' in window)){ near = true; sync(); return; }
    new IntersectionObserver(function(es){
      if(es[es.length - 1].isIntersecting && !near){ near = true; sync(); }
    }, { rootMargin:'75% 0px' }).observe(win);
    new IntersectionObserver(function(es){
      if(!es[es.length - 1].isIntersecting && near){ near = false; sync(); }
    }, { rootMargin:'200% 0px' }).observe(win);
  })();
})();
