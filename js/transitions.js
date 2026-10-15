/* =============================================================
   transitions.js: the page-transition curtain, on every page.
   Out: a click on a link to one of the site's pages (PAGES below) slides a
   panel in that page's colour up over this one, with its name, and then
   navigates. Before it goes, it leaves the panel's look in sessionStorage
   ('ed:pt'); the inline snippet in the new page's <head> reads it and starts
   that page covered, before its first paint (html.pt-in). In: once the page
   is ready (or after CAP), the panel carries on upward, off screen.
   Plain links only: not with a modifier key or another button, not for
   target=_blank, downloads, mailto/tel, other sites, links within the same
   page, or pages outside PAGES (the PlanetPod dashboard, admin...). Off with
   prefers-reduced-motion and inside a frame.
   case-study.js's "All work" goes back in history instead of loading the
   homepage again: it calls window.__pt.go(href, navigate) to get the same
   curtain first.
   Back / forward: a page restored from the bfcache never stays covered.
   ============================================================= */
(function(){
  if(window.top !== window) return;
  var h = document.documentElement, ed = window.__ed || { open:function(){} };

  /* the pages, by the last part of their path: the curtain's colour, ink, name and label */
  var PAGES = {
    'home':         { bg:'#0D1117', fg:'#e8edf3', n:'Erben Driessen', l:'portfolio' },
    'slaapcampus':  { bg:'#17132f', fg:'#d9cffb', n:'SlaapCampus',    l:'case study' },
    'powerplant':   { bg:'#0f1a14', fg:'#B6E86A', n:'PowerPlan(t)',   l:'case study' },
    'planetpod':    { bg:'#0e151a', fg:'#5BD6D8', n:'PlanetPod',      l:'case study' },
    'this-website': { bg:'#0f1426', fg:'#86B8FF', n:'This website',   l:'case study' }
  };
  /* TUNE (ms): COVER = the slide up over this page; then the browser navigates.
     The new page: covered at least HOLD after its first paint, at most CAP, then
     LEAVE to slide off. STUCK: still here that long after navigating (the
     visitor stopped it, or the server is that slow): uncover again. Under the
     head snippet's 8 s limit, so a page that does still come arrives covered.
     NOWHERE: still here that long after a step back in history ("All work"):
     there was no such entry, so load the page instead */
  var COVER = 600, HOLD = 150, CAP = 2500, LEAVE = 700, STUCK = 7000, NOWHERE = 1000, KEY = 'ed:pt';

  var reduce = window.matchMedia('(prefers-reduced-motion:reduce)');
  function pageKey(path){ return path.replace(/(\/index)?(\.html)?$/, '').split('/').pop() || 'home'; }
  var here = pageKey(location.pathname);

  var pt = document.querySelector('.pt');
  if(!pt){
    pt = document.createElement('div');
    pt.className = 'pt';
    pt.setAttribute('aria-hidden', 'true');
    pt.innerHTML = '<span class="pt-name"></span><span class="pt-kind"></span>';
    document.body.insertBefore(pt, document.body.firstChild);
  }

  var timers = [], busy = false, covering = false, sent = false, quiet = false, stepping = false;
  function later(fn, ms){ timers.push(setTimeout(fn, ms)); }
  function clearTimers(){ timers.forEach(clearTimeout); timers = []; }
  function css(el, c){
    el.style.setProperty('--pt-bg', c.bg); el.style.setProperty('--pt-fg', c.fg);
    el.style.setProperty('--pt-name', JSON.stringify(c.n)); el.style.setProperty('--pt-kind', JSON.stringify(c.l));
  }
  var VARS = ['--pt-bg', '--pt-fg', '--pt-name', '--pt-kind'];
  function uncss(el){ VARS.concat('background-color').forEach(function(p){ el.style.removeProperty(p); }); }
  function save(k){
    var c = PAGES[k];
    sessionStorage.setItem(KEY, JSON.stringify({ k:k, t:Date.now(), bg:c.bg, fg:c.fg, n:c.n, l:c.l }));
  }
  function forget(){ try{ sessionStorage.removeItem(KEY); }catch(e){} unmark(); }
  /* "All work" steps back in history instead of loading: the page it lands on is
     often restored from the bfcache, and Firefox hands a restored page the
     sessionStorage it had when it was hidden, so it can't see KEY. A cookie is
     always read fresh: a short-lived marker that only says which page the curtain
     is going to (no personal data, gone after 15 s) */
  function mark(k){ document.cookie = 'ed_pt=' + k + '_' + Date.now() + '; max-age=15; path=/; SameSite=Lax' + (location.protocol === 'https:' ? '; Secure' : ''); }
  function unmark(){ document.cookie = 'ed_pt=; max-age=0; path=/; SameSite=Lax' + (location.protocol === 'https:' ? '; Secure' : ''); }
  /* our own page loads: a load that cuts a pending one short is no stop (below) */
  function load(href){ quiet = true; try{ location.href = href; }finally{ quiet = false; } }
  /* everything back to rest at once, no animation */
  function reset(){
    clearTimers(); busy = covering = sent = false;
    if(onScreen){ onScreen.io.disconnect(); onScreen = null; }
    pt.classList.remove('is-cover', 'is-leave');
    h.classList.remove('pt-in');
    uncss(pt); uncss(h);
    ed.open();
  }

  /* ---------------- out ----------------
     go(href[, navigate]): cover, then navigate (default: load href).
     false = no curtain here (reduced motion, not one of PAGES, no
     sessionStorage): the caller navigates as usual */
  function go(href, navigate){
    if(busy) return true;
    if(reduce.matches) return false;
    var u; try{ u = new URL(href, location.href); }catch(e){ return false; }
    var k = pageKey(u.pathname), c = PAGES[k];
    if(!c || u.origin !== location.origin) return false;
    try{ save(k); }catch(e){ return false; }
    busy = true;
    clearTimers();
    /* (still covered on arrival: that cover makes way for this one) */
    if(h.classList.contains('pt-in')){ h.classList.remove('pt-in'); uncss(h); ed.open(); }
    if(onScreen){ onScreen.io.disconnect(); onScreen = null; }
    pt.classList.remove('is-leave');
    css(pt, c);
    void pt.offsetWidth;   /* start from below, even right after a leave */
    pt.classList.add('is-cover');
    covering = true;
    later(function(){
      covering = false; sent = true;
      try{ save(k); }catch(e){}   /* fresh timestamp for the new page */
      if(navigate){
        stepping = false;
        mark(k);
        navigate();
        /* a step back to an entry that isn't there does nothing, silently; a real
           one hides this page first (pagehide clears this timer), and where the
           Navigation API shows it starting (stepping, below) it may take its time */
        later(function(){ if(!stepping) load(u.href); }, NOWHERE);
      }
      else load(u.href);
      /* still here: the navigation was stopped, or went nowhere. Uncover; the key
         stays (the new page's head snippet lets it expire), so a page that does
         still come arrives covered */
      later(leave, STUCK);
    }, COVER);
    return true;
  }

  /* the panel on its way up and off; then at rest */
  function leave(){
    clearTimers();
    covering = sent = false;
    if(!pt.classList.contains('is-cover') && !h.classList.contains('pt-in')){ reset(); return; }
    var fromHead = h.classList.contains('pt-in');
    if(fromHead) VARS.forEach(function(p){ pt.style.setProperty(p, h.style.getPropertyValue(p)); });   /* the panel takes its look over from <html> */
    pt.classList.add('is-leave');
    pt.classList.remove('is-cover');
    h.classList.remove('pt-in');
    h.style.removeProperty('background-color');
    ed.open();
    later(function(){
      busy = false;
      pt.classList.remove('is-leave');
      uncss(pt); uncss(h);
    }, LEAVE + 50);
  }

  /* on window, in the bubble phase: after every page script's own handlers
     (the homepage's in-page scrolling, case-study.js's "All work"), which
     prevent the default when they take a link over */
  window.addEventListener('click', function(e){
    if(e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if(!a || typeof a.href !== 'string') return;
    if((a.target && a.target !== '_self') || a.hasAttribute('download')) return;
    if(a.protocol !== 'http:' && a.protocol !== 'https:') return;
    if(a.origin !== location.origin) return;
    var k = pageKey(a.pathname);
    if(k === here || !PAGES[k]) return;   /* this page (#anchors), or not one of the site's pages */
    if(busy){ e.preventDefault(); return; }
    if(go(a.href)) e.preventDefault();
  });

  /* ---------------- in ----------------
     Ready = what the first screen shows has loaded: the document parsed, the
     fonts in, every image (and same-origin frame) in the viewport done.
     A #hash waits for the whole load, so the jump to it has happened. */
  function frameDone(f){
    try{ var d = f.contentDocument; return !!d && d.readyState === 'complete' && d.URL !== 'about:blank'; }
    catch(e){ return true; }
  }
  /* what's on the first screen: an IntersectionObserver (no layout reads of our own) */
  var onScreen = null;
  function watchScreen(){
    if(onScreen || !('IntersectionObserver' in window)) return;
    onScreen = { seen:false, set:[] };
    var io = new IntersectionObserver(function(es){
      onScreen.seen = true;
      es.forEach(function(e){
        var i = onScreen.set.indexOf(e.target);
        if(e.isIntersecting && i < 0) onScreen.set.push(e.target);
        else if(!e.isIntersecting && i >= 0) onScreen.set.splice(i, 1);
      });
    });
    onScreen.io = io;
    [].forEach.call(document.querySelectorAll('img, iframe'), function(el){ io.observe(el); });
  }
  function ready(){
    if(document.readyState === 'complete') return true;
    if(document.readyState === 'loading' || location.hash) return false;
    if(document.fonts && document.fonts.status !== 'loaded') return false;
    if(!onScreen || !onScreen.seen) return false;
    return onScreen.set.every(function(el){ return el.tagName === 'IMG' ? el.complete : frameDone(el); });
  }
  function reveal(){
    var t0 = ed.t0 || 0, done = false;
    watchScreen();
    function out(){
      if(done) return; done = true;
      if(onScreen){ onScreen.io.disconnect(); onScreen = null; }
      requestAnimationFrame(function(){ leave(); });
    }
    (function poll(){
      if(done) return;
      var since = performance.now() - t0;
      if(since >= CAP || (since >= HOLD && ready())){ out(); return; }
      later(poll, since < HOLD ? HOLD - since : 50);
    })();
  }
  if(h.classList.contains('pt-in')){
    if(reduce.matches) reset(); else reveal();
  }

  /* ---------------- back / forward ---------------- */
  /* back / forward within this page (a #hash entry) while it covers, before
     it navigates: the visitor changed their mind, so stay and uncover */
  window.addEventListener('popstate', function(){ if(covering){ forget(); leave(); } });
  /* the navigation under way was stopped: Esc, or the stop button (that one only the
     Navigation API reports). Uncover at once; the key stays, as above */
  window.addEventListener('keydown', function(e){ if(sent && e.key === 'Escape') leave(); });
  if(window.navigation && navigation.addEventListener){
    navigation.addEventListener('navigateerror', function(){ if(sent && !quiet) leave(); });
    navigation.addEventListener('navigate', function(e){
      if(sent && e.navigationType === 'traverse' && !(e.destination && e.destination.sameDocument)) stepping = true;
    });
  }
  window.addEventListener('pagehide', function(){ clearTimers(); });
  window.addEventListener('pageshow', function(e){
    if(!e.persisted) return;
    /* restored from the bfcache, maybe still covered as it was left. Came here
       through the curtain ("All work" stepping back): cover in this page's own
       colour and lift it. The browser's own Back / Forward: no curtain, the page
       just shows (only the second half could play, which reads as a glitch).
       The cookie marker decides (see mark()); Chromium also sees the fresh KEY */
    var m = /(?:^|;\s*)ed_pt=([a-z-]+)_(\d+)/.exec(document.cookie || '');
    var c = null;
    try{
      c = JSON.parse(sessionStorage.getItem(KEY) || 'null');
      sessionStorage.removeItem(KEY);
    }catch(err){}
    unmark();
    reset();
    var viaCurtain = (m && m[1] === here && Date.now() - +m[2] < 8000) || (c && c.k === here && Date.now() - c.t < 8000);
    if(viaCurtain && PAGES[here] && !reduce.matches){
      css(h, PAGES[here]);
      h.classList.add('pt-in');
      ed.t0 = performance.now();
      busy = true;
      reveal();
    }
  });

  window.__pt = { go:go };
})();
