/* =============================================================
   site-ui.js — two small pieces of the page chrome:
   1. the phone menu (≤640px): "menu" in the nav opens a full-screen
      frosted sheet (#menu) under the nav bar, with the four section
      links, the availability pill and the email. Focus stays inside
      (nav bar + sheet), Esc / "close" / a link closes it, the page
      behind can't scroll and is inert meanwhile.
   2. the copy-email button in Contact ("copy" → "copied ✓").
   ============================================================= */
(function(){
  /* ---------------- 1. phone menu ---------------- */
  var nav=document.getElementById('nav');
  var btn=document.getElementById('menuBtn');
  var menu=document.getElementById('menu');
  if(nav && btn && menu){
    var root=document.documentElement;
    var mq=window.matchMedia('(max-width:640px)');
    var behind=[document.querySelector('.skip'), document.getElementById('heroTrack'),
      document.getElementById('main'), document.querySelector('.footer')].filter(Boolean);
    var isOpen=false;

    /* the availability pill has one source: the About section's (EDIT it there) */
    var pill=document.getElementById('availability'), slot=menu.querySelector('[data-pill]');
    if(pill && slot){ var c=pill.cloneNode(true); c.removeAttribute('id'); slot.appendChild(c); }

    function focusables(){
      /* the visible nav items (brand, menu, get in touch), then the sheet's links */
      return [].slice.call(nav.querySelectorAll('a[href], button')).concat([].slice.call(menu.querySelectorAll('a[href], button')))
        .filter(function(el){ return el.getClientRects().length > 0; });
    }
    function setBehind(on){
      behind.forEach(function(el){ if(on) el.setAttribute('inert',''); else el.removeAttribute('inert'); });
    }
    function open(){
      if(isOpen) return; isOpen=true;
      menu.classList.add('open');
      root.classList.add('menu-open');
      btn.setAttribute('aria-expanded','true');
      setBehind(true);
      if(window.__lenis) window.__lenis.stop();
      document.addEventListener('keydown', onKey);
      var first=menu.querySelector('.menu-links a');
      if(first) first.focus({ preventScroll:true });
    }
    function close(returnFocus){
      if(!isOpen) return; isOpen=false;
      menu.classList.remove('open');
      root.classList.remove('menu-open');
      btn.setAttribute('aria-expanded','false');
      setBehind(false);
      if(window.__lenis) window.__lenis.start();
      document.removeEventListener('keydown', onKey);
      if(returnFocus) btn.focus({ preventScroll:true });
    }
    function onKey(e){
      if(e.key==='Escape' || e.key==='Esc'){ e.preventDefault(); close(true); return; }
      if(e.key!=='Tab') return;
      var f=focusables(); if(!f.length) return;
      var i=f.indexOf(document.activeElement);
      if(e.shiftKey && (i<=0)){ e.preventDefault(); f[f.length-1].focus(); }
      else if(!e.shiftKey && (i===-1 || i===f.length-1)){ e.preventDefault(); f[0].focus(); }
    }
    btn.addEventListener('click', function(){ if(isOpen) close(true); else open(); });
    /* a link in the sheet (or the nav's brand / get in touch while it's open): close
       first, synchronously, so the page can scroll again before the jump happens */
    function onLink(e){
      if(!isOpen) return;
      var a=e.target.closest && e.target.closest('a[href]');
      if(a) close(false);
    }
    menu.addEventListener('click', onLink);
    nav.addEventListener('click', onLink);
    /* rotated / resized past the phone layout: the sheet has no place there */
    var onMq=function(){ if(!mq.matches) close(false); };
    if(mq.addEventListener) mq.addEventListener('change', onMq); else if(mq.addListener) mq.addListener(onMq);
  }

  /* ---------------- 2. copy the email address ---------------- */
  var status=document.getElementById('copyStatus');
  function legacyCopy(text){
    var ta=document.createElement('textarea');
    ta.value=text; ta.setAttribute('readonly','');
    ta.style.cssText='position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;';
    document.body.appendChild(ta); ta.select();
    var ok=false; try{ ok=document.execCommand('copy'); }catch(e){}
    ta.remove(); return ok;
  }
  [].forEach.call(document.querySelectorAll('[data-copy]'), function(b){
    var t=null;
    function done(ok){
      b.classList.toggle('is-copied', ok);
      if(status) status.textContent = ok ? 'Email address copied' : 'Copy failed: the address is erben.l.driessen@gmail.com';
      clearTimeout(t);
      t=setTimeout(function(){ b.classList.remove('is-copied'); if(status) status.textContent=''; }, 2000);
    }
    b.addEventListener('click', function(){
      var text=b.getAttribute('data-copy');
      if(navigator.clipboard && window.isSecureContext){
        navigator.clipboard.writeText(text).then(function(){ done(true); }, function(){ done(legacyCopy(text)); });
      } else done(legacyCopy(text));
    });
  });
})();
