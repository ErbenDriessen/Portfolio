// =============================================================
// case-study.js — shared behaviour for every case-study page
// (powerplant, this-website, planetpod, case-study-template):
// nav scroll state, footer year, reveal-on-scroll, fitting the
// live iframes onto the angled laptop / phone mockups, the smart
// "All work" back link, and pausing media while it's offscreen.
// All steps no-op gracefully when their elements are absent.
// =============================================================
(function(){
  /* ---------------- nav scroll state ---------------- */
  var nav = document.getElementById('ppnav');
  if (nav){
    var onScroll = function(){ nav.classList.toggle('scrolled', window.scrollY > 30); };
    window.addEventListener('scroll', onScroll, {passive:true}); onScroll();
  }
  var yearEl = document.getElementById('ppyear');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---------------- smart back ("← All work") ----------------
     The links point at ./#work. When the reader came from the homepage
     (same origin, path / or /index.html or /v2/ or /v2/index.html), go
     back in history instead, so they land on the exact spot they left.
     Jumps to in-page anchors add history entries, so we count them
     (csDepth in history.state) and step back past all of them. */
  /* /v2/ stays in the list for old bookmarks (it redirects to /) */
  var HOME = ['/', '/index.html', '/v2/', '/v2/index.html'];
  function fromHome(){
    try{
      if(!document.referrer) return false;
      var r = new URL(document.referrer);
      return r.origin === location.origin && HOME.indexOf(r.pathname) >= 0;
    }catch(e){ return false; }
  }
  var depth = 0;
  try{
    if(history.state && typeof history.state.csDepth === 'number') depth = history.state.csDepth;
    else history.replaceState({csDepth:0}, '');
  }catch(e){}
  window.addEventListener('hashchange', function(){
    try{
      if(history.state && typeof history.state.csDepth === 'number'){ depth = history.state.csDepth; }
      else { depth = depth + 1; history.replaceState({csDepth:depth}, ''); }
    }catch(e){}
  });
  document.addEventListener('click', function(e){
    var a = e.target.closest && e.target.closest('a[data-back]');
    if(!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if(!fromHome() || history.length < depth + 2) return;   // opened in a new tab etc.: follow the link
    e.preventDefault();
    history.go(-(depth + 1));
  });

  /* ---------------- reveal on scroll (bounding-rect, robust) ---------------- */
  var els = [].slice.call(document.querySelectorAll('.rev-in'));
  function check(){
    for (var i=0;i<els.length;i++){ var el=els[i];
      if(!el.classList.contains('vis')){
        var r=el.getBoundingClientRect();
        if(r.top < window.innerHeight*0.92 && r.bottom > 0) el.classList.add('vis');
      }
    }
  }
  window.addEventListener('scroll', check, {passive:true});
  window.addEventListener('resize', check);
  check(); requestAnimationFrame(check); setTimeout(check, 250);

  /* ---------- fit live iframes into their mockups ---------- */
  /* glass-quad corners of media/laptop-frame.png as fractions of its W×H.
     The screen is an orthographic projection of a flat rectangle, so the
     quad is a parallelogram → an affine transform maps the iframe exactly. */
  var GLASS={ tl:[0.3148,0.0870], tr:[0.9307,0.1767], bl:[0.2757,0.6529] };
  function fitLaptops(){
    document.querySelectorAll('.lapimg').forEach(function(el){
      var img=el.querySelector('.lapimg-frame'); if(!img) return;
      var W=img.clientWidth, H=img.clientHeight; if(!W||!H) return;
      var tl=[GLASS.tl[0]*W, GLASS.tl[1]*H],
          tr=[GLASS.tr[0]*W, GLASS.tr[1]*H],
          bl=[GLASS.bl[0]*W, GLASS.bl[1]*H];
      var a=(tr[0]-tl[0])/1280, b=(tr[1]-tl[1])/1280,
          c=(bl[0]-tl[0])/800,  d=(bl[1]-tl[1])/800,
          e=tl[0], f=tl[1];
      var m='matrix('+a+','+b+','+c+','+d+','+e+','+f+')';
      el.querySelectorAll('iframe,.lapimg-glare').forEach(function(n){ n.style.transform=m; n.classList.add('fitted'); });
    });
    document.querySelectorAll('.device.live .screen').forEach(function(sc){
      var f=sc.querySelector('iframe'); if(!f) return;
      sc.style.setProperty('--ph-scale', (sc.clientWidth/430).toFixed(4));
      f.classList.add('fitted');
    });
  }
  window.addEventListener('resize', fitLaptops);
  if(window.ResizeObserver){
    var ro=new ResizeObserver(fitLaptops);
    document.querySelectorAll('.lapimg, .device.live .screen').forEach(function(el){ ro.observe(el); });
  }
  // re-fit once the frame image has its real dimensions
  document.querySelectorAll('.lapimg-frame').forEach(function(img){
    if(img.complete) return; img.addEventListener('load', fitLaptops);
  });
  fitLaptops(); setTimeout(fitLaptops, 200);

  // safety net: never leave a preview hidden, even if fitting is delayed or fails
  setTimeout(function(){
    document.querySelectorAll('.lapimg-screen iframe, .device.live .screen iframe')
      .forEach(function(f){ f.classList.add('fitted'); });
  }, 1200);

  /* ---------- pause what's offscreen ----------
     Videos pause and resume (only if they were meant to autoplay).
     Live iframes get a "paused" class, on the iframe and on the embedded
     page's <html> (same origin), which stops its CSS animations and its
     update loop until it scrolls back into view. */
  if(!('IntersectionObserver' in window)) return;
  function setFramePaused(f, paused){
    f.classList.toggle('paused', paused);
    try{ var d=f.contentDocument; if(d && d.documentElement) d.documentElement.classList.toggle('paused', paused); }catch(e){}
  }
  var io = new IntersectionObserver(function(entries){
    entries.forEach(function(en){
      var el = en.target, on = en.isIntersecting;
      if(el.tagName === 'VIDEO'){
        if(!on){ if(!el.paused) el.pause(); }
        else if(el.autoplay && el.paused){ var p = el.play(); if(p && p.catch) p.catch(function(){}); }
      } else {
        setFramePaused(el, !on);
      }
    });
  }, { rootMargin:'120px 0px' });
  document.querySelectorAll('video').forEach(function(v){ io.observe(v); });
  document.querySelectorAll('.lapimg-screen iframe, .device.live .screen iframe').forEach(function(f){
    io.observe(f);
    // a (lazy) iframe gets a fresh document when it loads: carry the state over
    f.addEventListener('load', function(){ setFramePaused(f, f.classList.contains('paused')); });
  });
})();
