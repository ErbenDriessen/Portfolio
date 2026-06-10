// =============================================================
// this-website.js — This Website case study only.
// Drives the live laptop/phone previews: the banner iframe's
// gaze sweeps side to side, and the signature iframe loops its
// zoom-out + write-on via the scrubber the page exposes.
// (Shared boilerplate — nav, year, reveal, mockup fit — lives
//  in case-study.js, loaded before this file.)
// =============================================================
(function(){
  var reduce = window.matchMedia('(prefers-reduced-motion:reduce)').matches;

  /* ---------- drive the live previews once each iframe is ready ---------- */
  function whenReady(frame, cb){
    function go(){ try{ var d=frame.contentDocument; if(d && d.getElementById('top')) return cb(frame); }catch(e){} setTimeout(go, 120); }
    if(frame.contentDocument && frame.contentDocument.readyState==='complete'){ go(); }
    else frame.addEventListener('load', go);
    go();
  }

  /* signature: loop the v2 zoom-out + write-on via its exposed scrubber */
  function driveSignature(frame){
    var win=frame.contentWindow;
    function ready(){ return typeof win.__zoScrub==='function'; }
    function start(){
      if(reduce){ try{ win.__zoScrub(1); }catch(e){} return; }
      var start=null, DUR=5200, HOLD=900;
      function loop(ts){
        if(start===null) start=ts;
        var e=(ts-start);
        var cycle=DUR*2+HOLD;
        var p=e % cycle;
        var v;
        if(p<DUR) v=p/DUR;                       // write on
        else if(p<DUR+HOLD) v=1;                 // hold full
        else v=1-((p-DUR-HOLD)/DUR);             // unwrite
        try{ win.__zoScrub(Math.max(0,Math.min(1,v))); }catch(e){}
        requestAnimationFrame(loop);
      }
      requestAnimationFrame(loop);
    }
    var tries=0;
    (function wait(){ if(ready()) start(); else if(tries++<80) setTimeout(wait,150); })();
  }

  // The gaze preview self-animates inside banner.html (#gaze); the phone
  // preview is a static responsive layout. Only the signature needs driving.
  document.querySelectorAll('iframe[data-live="signature"]').forEach(function(f){
    whenReady(f, function(){ driveSignature(f); });
  });
})();
