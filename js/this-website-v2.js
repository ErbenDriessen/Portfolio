// =============================================================
// this-website-v2.js: the "This website" case study (v2).
//   1. the plate strip: prev / next arrows that follow the scroll
//   2. the before / after sliders: drag, or the keyboard (a range input)
//   3. the live signature: the homepage's ED, loaded when it gets close
//      and written by the same pen (createPen, below: the pen engine
//      from v2/js/signature-scroll.js, factored out so it takes any
//      root, order and dynamics), with Replay and a drag scrubber
//   4. copy the email address (as on the homepage)
// Everything no-ops without its markup. Reduced motion: no hint glide,
// no autoplay (the signature shows finished; Replay still works).
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

  /* ================= 4. copy the email address ================= */
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
})();
