// =============================================================
// case-study.js — shared behaviour for every case-study page
// (powerplant, this-website, planetpod, case-study-template):
// nav scroll state, footer year, reveal-on-scroll, and fitting
// the live iframes onto the angled laptop / phone mockups.
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
})();
