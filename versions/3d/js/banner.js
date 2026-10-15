// =============================================================
// banner.js — the interactive split-portrait banner.
// Shared by index.html and banner.html: nav scroll state,
// footer year, reveal-on-scroll, and the gaze that follows
// the cursor across the seam.
// =============================================================
(function(){
  /* ---------------- nav scroll state ---------------- */
  const nav = document.getElementById('nav');
  const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 40);
  window.addEventListener('scroll', onScroll, {passive:true}); onScroll();
  document.getElementById('year').textContent = new Date().getFullYear();

  /* ---------------- reveal on scroll ---------------- */
  const io = new IntersectionObserver((entries)=>{
    entries.forEach(e=>{ if(e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target); } });
  }, {threshold:.06});
  document.querySelectorAll('.reveal').forEach(el=>io.observe(el));

  /* ---------------- interactive split portrait ---------------- */
  const hero = document.getElementById('top');
  const REST = 0.5, DAMP = 12;
  let current = REST, target = REST, raf = null;

  const mqMobile = window.matchMedia('(max-width:640px)');
  const mqReduce = window.matchMedia('(prefers-reduced-motion:reduce)');
  const enabled  = () => !mqReduce.matches;   /* live effect on all sizes (mouse + touch); off only for reduced-motion */
  const clamp = (v,a,b)=>v<a?a:v>b?b:v;
  let userTouched = false;

  function render(){
    const t = clamp(current,0,1);
    hero.style.setProperty('--seam', ((1 - t) * 100) + '%');
    hero.style.setProperty('--t', t);
  }
  function frame(){
    current += (target - current) / DAMP;
    render();
    if (Math.abs(target - current) > 0.0008){ raf = requestAnimationFrame(frame); }
    else { current = target; render(); raf = null; }
  }
  function kick(){ if(!raf) raf = requestAnimationFrame(frame); }

  function onMove(e){
    if(!enabled()) return;
    const r = hero.getBoundingClientRect();
    target = clamp((e.clientX - r.left) / r.width, 0, 1);
    if(!hero.classList.contains('touched')) hero.classList.add('touched');
    kick();
  }
  function onDown(e){ userTouched = true; onMove(e); }
  function onLeave(){ if(!enabled()) return; target = REST; kick(); }

  hero.addEventListener('pointermove', onMove, {passive:true});
  hero.addEventListener('pointerdown', onDown, {passive:true});
  hero.addEventListener('pointerleave', onLeave);
  hero.addEventListener('pointerup',   onLeave);
  hero.addEventListener('pointercancel', onLeave);

  /* one-time intro sweep — auto-demonstrates the gaze-follow effect where there's no cursor */
  function introSweep(){
    if(mqReduce.matches) return;
    [[0.28,1500],[0.72,2300],[0.50,3150]].forEach(function(s){
      setTimeout(function(){ if(!userTouched){ target=s[0]; kick(); } }, s[1]);
    });
  }

  function applyMode(){
    if(enabled()){ kick(); }
    else { if(raf){ cancelAnimationFrame(raf); raf=null; } current=target=REST; render(); }
  }
  mqReduce.addEventListener('change', applyMode);
  render(); applyMode();
  if(mqMobile.matches) introSweep();

  /* When embedded as the gaze preview (banner.html#gaze on the This Website
     case study), sweep the split ourselves so the eyes oscillate left↔right —
     no dependency on the parent page scripting into this iframe. */
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
