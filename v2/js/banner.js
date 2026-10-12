// =============================================================
// banner.js — the interactive split-portrait banner.
// Shared by index.html and banner.html: nav scroll state,
// footer year, reveal-on-scroll, the seam that follows the
// cursor across the portrait, and the nav ink that follows it.
// (The live portrait itself is js/depth-banner.js; it reads --t.)
// =============================================================
(function(){
  /* ---------------- nav scroll state ---------------- */
  const nav = document.getElementById('nav');
  const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 40);
  window.addEventListener('scroll', onScroll, {passive:true}); onScroll();
  document.getElementById('year').textContent = new Date().getFullYear();

  /* the availability pill pulses only while it's on screen (portfolio.css:
     #availability.pulse-off; the menu's copy of it is shown on demand) */
  const pill = document.getElementById('availability');
  if(pill && 'IntersectionObserver' in window){
    new IntersectionObserver(es => pill.classList.toggle('pulse-off', !es[es.length - 1].isIntersecting)).observe(pill);
  }

  /* ---------------- reveal on scroll ---------------- */
  const io = new IntersectionObserver((entries)=>{
    entries.forEach(e=>{ if(e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target); } });
  }, {threshold:.06});
  document.querySelectorAll('.reveal').forEach(el=>io.observe(el));

  /* ---------------- interactive split portrait ---------------- */
  const hero = document.getElementById('top');

  /* The head is one layer in front of the split: the seam (--seam, set here)
     runs behind him. The part of his face on the backend side of it takes the
     backend's darker grade, eased in over ~5% of the portrait's width around
     the seam, so he steps into the dark as it moves: js/depth-banner.js draws
     that live at the seam's x (see __seamSync / __seamKick below),
     portfolio.css (.portrait-shade) on the static img. */
  const REST = 0.5, DAMP = 12;
  let current = REST, target = REST, raf = null, last = 0;

  /* phones + portrait tablets: the centred lockup (portfolio.css uses the same query) */
  const mqMobile = window.matchMedia('(max-width:640px), (max-width:1023px) and (orientation:portrait)');
  const mqReduce = window.matchMedia('(prefers-reduced-motion:reduce)');
  const enabled  = () => !mqReduce.matches;   /* live effect on all sizes (mouse + touch); off only for reduced-motion */
  const clamp = (v,a,b)=>v<a?a:v>b?b:v;
  let userTouched = false;

  /* nav ink follows the seam per pixel, like the intro line: the part of the
     brand and of each text link that sits over the VISIBLE lavender half of the
     banner (left of the seam, inside the hero's on-screen rect) gets dark ink,
     the rest stays light (--ink-box, portfolio.css). Only while the nav is
     see-through: not .scrolled, or the zoom-out scene is pinned (body.zo-pinned,
     set by signature-scroll.js). The seam comes from the hero's on-screen rect,
     so it stays right while the zoom-out scales it, and the card's top edge
     splits the ink too. window.__navInk() re-reads that rect + the nav state:
     call it from scroll code that moves/scales the hero or changes when the nav
     goes solid. The item boxes are cached, so a frame does no layout reads. */
  const navInk = [nav.querySelector('.brand'), ...nav.querySelectorAll('.nav-links a.label-hide')];
  let inkBoxes = [], inkLast = [], heroBox = null;
  const px = v => v.toFixed(1) + 'px';
  function paintInk(t){
    if(!heroBox) return;
    const clear = !nav.classList.contains('scrolled') || document.body.classList.contains('zo-pinned');
    const seamX = heroBox.left + (1 - t) * heroBox.width;
    navInk.forEach((el,i)=>{
      const b = inkBoxes[i];   /* hidden links (≤640px) measure 0×0, so never overlap */
      const l = Math.max(b.left, heroBox.left), r = Math.min(b.right, seamX),
            top = Math.max(b.top, heroBox.top), bot = Math.min(b.bottom, heroBox.bottom);
      const v = clear && r > l && bot > top ? px(l - b.left) + ' ' + px(top - b.top) + ' / ' + px(r - l) + ' ' + px(bot - top) : '';
      if(v === inkLast[i]) return;
      inkLast[i] = v;
      if(v) el.style.setProperty('--ink-box', v); else el.style.removeProperty('--ink-box');
      /* wholly on one side: plain text instead of the (lighter) clip, see portfolio.css */
      const full = !!v && l === b.left && r === b.right && top === b.top && bot === b.bottom;
      el.classList.toggle('ink-flat', !v || full);
      el.classList.toggle('ink-dark', full);
    });
  }
  function updateInk(){ heroBox = hero.getBoundingClientRect(); paintInk(clamp(current,0,1)); }
  function measureInk(){
    inkBoxes = navInk.map(el=>el.getBoundingClientRect());
    updateInk();
  }
  window.__navInk = updateInk;
  window.addEventListener('scroll', updateInk, {passive:true});   /* after onScroll, so .scrolled is current */
  window.addEventListener('resize', measureInk);
  measureInk();
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(measureInk);   /* brand width changes with the webfont */

  function render(){
    const t = clamp(current,0,1);
    hero.style.setProperty('--seam', ((1 - t) * 100) + '%');
    hero.style.setProperty('--t', t);
    paintInk(t);
  }
  /* one glide step per frame (ts = the frame's timestamp, the same for every
     rAF callback in it), whoever asks for it first. The last one lands on the
     target in the same step, so whoever asked sees the final seam too */
  let stepped = -1;
  function step(ts){
    if(ts === stepped) return;
    stepped = ts;
    /* time-based damping: 1/DAMP per 60fps frame, the same glide at 144Hz */
    const dt = last ? Math.min(ts - last, 64) : 16.7; last = ts;
    current += (target - current) * (1 - Math.pow(1 - 1/DAMP, dt/16.7));
    if(Math.abs(target - current) <= 0.0008) current = target;
    render();
  }
  function frame(ts){
    step(ts);
    if(current !== target){ raf = requestAnimationFrame(frame); }
    else { raf = null; last = 0; }
  }
  /* starting a glide: the live portrait queues its frame alongside (it draws
     the shade at the seam's x itself), so it's there from the glide's first frame */
  function kick(){ if(!raf){ raf = requestAnimationFrame(frame); if(window.__seamKick) window.__seamKick(); } }
  /* the live portrait draws the shade at the seam's x in its own frame: it
     calls this first, so it draws this frame's seam whether its callback runs
     before or after ours. true: the seam is still gliding */
  window.__seamSync = ts => { if(raf) step(ts); return raf !== null && current !== target; };

  function onMove(e){
    if(!enabled()) return;
    /* the hero's on-screen rect as updateInk last read it (every scroll, scrubbed
       zoom frame and resize): a drag doesn't force a layout on each move */
    const r = heroBox || hero.getBoundingClientRect();
    target = clamp((e.clientX - r.left) / r.width, 0, 1);
    if(!hero.classList.contains('touched')) hero.classList.add('touched');
    kick();
  }
  /* a tap holds its side for a moment before easing back (a touch's pointerup
     comes before a single frame has run, so releasing at once did nothing).
     pointercancel = the finger started a scroll: release at once, or every
     scroll would swing the seam toward the thumb and park it there. */
  let release = null;
  function onDown(e){ userTouched = true; clearTimeout(release); onMove(e); }
  function onLeave(){ if(!enabled()) return; target = REST; kick(); }
  function onUp(e){
    if(e.pointerType === 'mouse'){ onLeave(); return; }
    clearTimeout(release); release = setTimeout(onLeave, 1600);
  }

  hero.addEventListener('pointermove', onMove, {passive:true});
  hero.addEventListener('pointerdown', onDown, {passive:true});
  hero.addEventListener('pointerleave', e => { if(e.pointerType === 'mouse') onLeave(); });
  hero.addEventListener('pointerup',   onUp);
  hero.addEventListener('pointercancel', () => { clearTimeout(release); onLeave(); });
  /* keyboard focus on a label leans the split to that side, like hovering it */
  hero.addEventListener('focusin', function(e){
    if(!enabled()) return;
    target = e.target.closest('.label.front') ? .2 : e.target.closest('.label.back') ? .8 : REST;
    kick();
  });
  hero.addEventListener('focusout', onLeave);

  /* the scroll cue's loop stops at the first scroll (portfolio.css .cue-still) */
  const cueStill = () => { if(window.scrollY > 4){ hero.classList.add('cue-still'); window.removeEventListener('scroll', cueStill); } };
  window.addEventListener('scroll', cueStill, {passive:true});

  /* one-time intro sweep — auto-demonstrates the seam where there's no cursor.
     With the live portrait (js/depth-banner.js) it starts when his face is up
     ('depth:ready') and he looks along with the seam: at the frontend (a
     smile), at the backend (a smile), back at you (window.__heroGaze). Without
     it (no WebGL, pages without the live portrait) on the old timers. Then the
     tap hint shows once, for 3s (.hinting). A touch ends all of it. */
  function introSweep(live){
    if(mqReduce.matches || userTouched) return;
    const at = live ? [[0.28,'fe',250],[0.72,'be',1750],[0.50,null,3250]]
                    : [[0.28,null,1500],[0.72,null,2300],[0.50,null,3150]];
    at.forEach(function(s){
      setTimeout(function(){
        if(userTouched) return;
        target = s[0]; kick();
        if(live && window.__heroGaze) window.__heroGaze(s[1]);
      }, s[2]);
    });
    setTimeout(function(){
      if(userTouched) return;
      hero.classList.add('hinting');
      setTimeout(function(){ hero.classList.remove('hinting'); }, 3000);
    }, at[2][2] + 700);
  }

  function applyMode(){
    if(enabled()){ kick(); }
    else { if(raf){ cancelAnimationFrame(raf); raf=null; } last=0; current=target=REST; render(); }
  }
  mqReduce.addEventListener('change', applyMode);
  render(); applyMode();
  if(mqMobile.matches || matchMedia('(hover:none)').matches){
    /* depth-banner.js (a later script) flags a live portrait on its way
       (window.__depthState): by DOMContentLoaded it has run, so wait for its
       face or its give-up */
    const decide = function(){
      const s = window.__depthState;   /* 'pending' | 'ready' | 'fail' | undefined (none on this page) */
      if(s !== 'pending'){ introSweep(s === 'ready'); return; }
      let done = false;
      const go = function(live){ if(!done){ done = true; introSweep(live); } };
      hero.addEventListener('depth:ready', function(){ go(true); }, {once:true});
      hero.addEventListener('depth:fail', function(){ go(false); }, {once:true});
    };
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', decide, {once:true});
    else decide();
  }

  /* When embedded as the preview (banner.html#gaze on the This Website case
     study), sweep the split ourselves so it oscillates left↔right — no
     dependency on the parent page scripting into this iframe. */
  if(location.hash === '#gaze' && !mqReduce.matches){
    var gazeStart = null;
    function gazeLoop(ts){
      if(gazeStart === null) gazeStart = ts;
      current = target = 0.5 + 0.5*Math.sin((ts - gazeStart)/1000 * 0.7);
      render();
      requestAnimationFrame(gazeLoop);
    }
    requestAnimationFrame(gazeLoop);
  }
})();
