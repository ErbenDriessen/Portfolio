/* =============================================================
   more-projects.js — the smaller work, loaded LIVE from Supabase
   (the `projects` table, managed in the admin).
   The three case studies stay hand-built above it.

   Data: one plain fetch of the table's REST endpoint (read only).
   No Supabase SDK needed; on pages that still load
   ../js/supabase-client.js its URL + key are used.

   Two layouts, picked by the markup:
   - index.html  ("Also built", #moreAll present): always visible.
     All items while there are 6 or fewer, else the first 3 + a
     "Show all n" button. Fetched once the section gets close.
     Phones show them as compact rows (portfolio.css).
   - photo / eyes / concept pages (#moreToggle present): the older
     accordion with a type filter + sort, as before.
   ============================================================= */
(function(){
  /* the public (publishable) project URL + key: the same values as ../js/supabase-client.js */
  var SB_URL = window.SB_URL || 'https://lfqbnshntboveuzwxpid.supabase.co';
  var SB_KEY = window.SB_KEY || 'sb_publishable_9TxzTIPcICGU4ozWTPijIA_J2H1mBJX';
  var SHOW_ALL_ABOVE = 6, FIRST = 3;

  var CAT_LABELS={web:'Web',mobile:'Mobile',python:'Python',game:'Game',tool:'Tool',data:'Data',other:'Other'};
  /* stack tags as typed in the admin ('Html', 'js') → the casing the case studies use */
  var LBL={html:'HTML',css:'CSS',js:'JS',javascript:'JavaScript',ts:'TS',typescript:'TypeScript',php:'PHP',sql:'SQL',
    python:'Python',react:'React','react native':'React Native',expo:'Expo',node:'Node',nodejs:'Node.js',java:'Java',
    gsap:'GSAP',supabase:'Supabase',grafana:'Grafana',mysql:'MySQL',docker:'Docker',git:'Git'};
  /* unknown and all-lowercase ('flask') → capitalised; anything typed with capitals is kept as is */
  function tagLabel(s){ s=String(s); var k=s.toLowerCase(); return LBL[k] || (s===k ? s.charAt(0).toUpperCase()+s.slice(1) : s); }
  /* DB strings go into innerHTML: escape them */
  function safe(u){ return /^https?:\/\//i.test(String(u||'')) ? String(u) : ''; }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }

  /* a DB row → the shape the cards use (as dbRowToProject in supabase-client.js) */
  var GH=/github\.com/i;
  function fromRow(r){
    return { id:r.id, title:r.title, stack:Array.isArray(r.stack)?r.stack:[], desc:r.description||'',
      image:r.image_url||'', year:r.year||'',
      /* two links: the live site and the code (rows from before the two columns
         only have `link`: a GitHub link is the code, anything else the live site) */
      live:r.live_url || (r.link && !GH.test(r.link) ? r.link : null),
      repo:r.repo_url || (r.link && GH.test(r.link) ? r.link : null),
      category:r.category||'other' };
  }
  function fetchProjects(){
    /* select=*: works with and without the live_url/repo_url columns */
    var url=SB_URL+'/rest/v1/projects?select=*'
      +'&order=sort_order.desc,created_at.desc';
    return fetch(url, { headers:{ apikey:SB_KEY, Accept:'application/json' } })
      .then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
      .then(function(rows){ return Array.isArray(rows) ? rows.map(fromRow) : []; });
  }

  /* images in the project's own storage are full-size PNGs: ask Supabase's image
     endpoint for a resized copy (webp where the browser takes it; resize=contain keeps
     the whole picture: the default 'cover' would keep the full height and crop the width). If that ever
     fails, the img falls back to the original file (see fallback() below). */
  var STORE=/^(https:\/\/[a-z0-9]+\.supabase\.co)\/storage\/v1\/object\/public\/([^?#]+)$/i;
  function sized(u, w){ var m=STORE.exec(u); return m ? m[1]+'/storage/v1/render/image/public/'+m[2]+'?width='+w+'&resize=contain&quality=75' : ''; }
  function fallback(root){
    [].forEach.call(root.querySelectorAll('img[data-orig]'), function(img){
      img.addEventListener('error', function(){
        var o=img.getAttribute('data-orig'); if(!o || img.src===o) return;
        img.removeAttribute('srcset'); img.removeAttribute('data-orig'); img.src=o;
      });
    });
  }

  var sorts={
    'new':  function(a,b){ return (+b.year||0)-(+a.year||0) || a.title.localeCompare(b.title); },
    'old':  function(a,b){ return (+a.year||0)-(+b.year||0) || a.title.localeCompare(b.title); },
    'az':   function(a,b){ return a.title.localeCompare(b.title); }
  };

  function card(p){
    var tags=(p.stack||[]).map(function(s){return '<span>'+esc(tagLabel(s))+'</span>';}).join('')
      + (p.year?'<span class="yr">'+esc(p.year)+'</span>':'');
    /* no image (or the client's placeholder path, which doesn't exist) → the title's
       initials (first + last word) as a ghosted glyph, so the box reads as intended */
    var img=p.image && p.image!=='assets/proj-portfolio.png' ? p.image : '';
    var words=String(p.title||'').split(/\s+/).filter(Boolean);
    var initials=words.length ? (words[0].charAt(0)+(words.length>1?words[words.length-1].charAt(0):'')).toUpperCase() : '';
    var s1=img && sized(img,400), s2=img && sized(img,800);
    /* alt="": the h4 right below already names the project */
    var pic=img ? '<img src="'+esc(s2||img)+'"'+(s1?' srcset="'+esc(s1)+' 400w, '+esc(s2)+' 800w" sizes="(max-width:760px) 120px, 400px" data-orig="'+esc(img)+'"':'')
        +' alt="" width="640" height="400" loading="lazy" decoding="async">'
      : '<span class="mini-glyph" aria-hidden="true">'+esc(initials)+'</span>';
    var live=safe(p.live), repo=safe(p.repo);
    var head='<div class="mini-thumb">'+pic+'</div>'
      +'<div class="mini-body"><div class="mini-tags">'+tags+'</div>'
      +'<h4>'+esc(p.title||'Untitled')+'</h4>'
      +(p.desc?'<p class="mini-desc">'+esc(p.desc)+'</p>':'');
    var arr=' <span class="arr" aria-hidden="true">→</span>';
    /* both links: the card itself opens the live site (its link stretches over
       the card), and "Code on GitHub" sits on top as its own link */
    if(live && repo) return '<div class="mini-card two-links">'+head
      +'<span class="mini-links">'
      +'<a class="mini-more mini-main" href="'+esc(live)+'" target="_blank" rel="noopener" aria-label="'+esc(p.title+': visit site')+'">Visit site'+arr+'</a>'
      +'<a class="mini-more mini-code" href="'+esc(repo)+'" target="_blank" rel="noopener" aria-label="'+esc(p.title+': code on GitHub')+'">Code on GitHub'+arr+'</a>'
      +'</span></div></div>';
    var one=live || repo, label=live ? 'Visit site' : 'Code on GitHub';
    return one
      ? '<a class="mini-card" href="'+esc(one)+'" target="_blank" rel="noopener" aria-label="'+esc(p.title+': '+label.toLowerCase())+'">'+head
        +'<span class="mini-more">'+label+arr+'</span></div></a>'
      : '<div class="mini-card no-link">'+head+'</div></div>';
  }

  /* ---------------- index.html: "Also built", always visible ---------------- */
  function initAlso(section, grid, allBtn){
    var started=false;
    function hide(){ section.hidden=true; section.classList.remove('is-loading'); }
    function show(items){
      items.sort(sorts['new']);
      var many=items.length>SHOW_ALL_ABOVE;
      grid.innerHTML=items.map(function(p,i){
        var h=card(p);
        /* above the limit: the rest is in the DOM but hidden until "Show all" */
        return many && i>=FIRST ? h.replace(/^<(a|div) class="mini-card/, '<$1 hidden class="mini-card') : h;
      }).join('');
      fallback(grid);
      section.classList.remove('is-loading');
      if(many){
        allBtn.querySelector('.also-n').textContent=items.length;
        allBtn.hidden=false;
        allBtn.addEventListener('click', function(){
          var rest=grid.querySelectorAll('.mini-card[hidden]');
          [].forEach.call(rest, function(el){ el.hidden=false; });
          allBtn.hidden=true;
          /* keyboard users land on the first newly shown project */
          var f=rest[0] && (rest[0].matches('a') ? rest[0] : rest[0].querySelector('a')); if(f) f.focus({ preventScroll:true });
        });
      }
    }
    function load(){
      if(started) return; started=true;
      fetchProjects().then(function(items){ if(items.length) show(items); else hide(); })
        .catch(function(){ hide(); });
    }
    /* fetch once the work section gets within about a screen of the viewport */
    var near=document.getElementById('work') || section;
    if('IntersectionObserver' in window){
      var io=new IntersectionObserver(function(es){
        if(es.some(function(e){ return e.isIntersecting; })){ io.disconnect(); load(); }
      }, { rootMargin:'0px 0px 100% 0px' });
      io.observe(near);
    } else load();
  }

  /* ---------------- the older accordion (photo / eyes / concept pages) ---------------- */
  function initAccordion(section, grid){
    var toggle=document.getElementById('moreToggle');
    var panel=document.getElementById('morePanel');
    var filterEl=document.getElementById('moreFilter');
    var sortEl=document.querySelector('.more-sort');
    var ctlEl=document.getElementById('moreControls');
    var cntEl=document.querySelector('#moreToggle .mt-count');
    var items=[], current='new', activeCat='all';

    function render(){
      var list=items.filter(function(p){ return activeCat==='all' || (p.category||'other')===activeCat; });
      list.sort(sorts[current]);
      grid.innerHTML=list.length ? list.map(card).join('')
        : '<p class="more-empty" role="status">Nothing in this category yet.</p>';
      fallback(grid);
      if(panel && panel.classList.contains('open')) panel.style.maxHeight=panel.scrollHeight+'px';
    }
    function buildFilter(){
      if(!filterEl) return;
      var cats=[]; items.forEach(function(p){ var c=p.category||'other'; if(cats.indexOf(c)<0) cats.push(c); });
      cats.sort();
      /* one type = nothing to filter */
      filterEl.hidden=cats.length<2;
      if(filterEl.hidden) return;
      var chips='<span class="mf-label">type</span>'
        +'<button class="mf-btn on" data-cat="all" aria-pressed="true">All <span class="mf-n">'+items.length+'</span></button>';
      cats.forEach(function(c){
        var n=items.filter(function(p){return (p.category||'other')===c;}).length;
        chips+='<button class="mf-btn" data-cat="'+esc(c)+'" aria-pressed="false">'+esc(CAT_LABELS[c]||c)+' <span class="mf-n">'+n+'</span></button>';
      });
      filterEl.innerHTML=chips;
      [].forEach.call(filterEl.querySelectorAll('.mf-btn'), function(b){
        b.addEventListener('click', function(){
          activeCat=b.getAttribute('data-cat');
          [].forEach.call(filterEl.querySelectorAll('.mf-btn'), function(x){ x.classList.toggle('on', x===b); x.setAttribute('aria-pressed', x===b?'true':'false'); });
          render();
        });
      });
    }

    [].forEach.call(document.querySelectorAll('.ms-btn'), function(b){
      b.addEventListener('click', function(){
        current=b.getAttribute('data-sort');
        [].forEach.call(document.querySelectorAll('.ms-btn'), function(x){ x.classList.toggle('on', x===b); x.setAttribute('aria-pressed', x===b?'true':'false'); });
        render();
      });
    });
    if(toggle && panel){
      toggle.addEventListener('click', function(){
        var open=panel.classList.toggle('open');
        toggle.setAttribute('aria-expanded', open?'true':'false');
        toggle.classList.toggle('open', open);
        if(open){ panel.hidden=false; panel.style.maxHeight=panel.scrollHeight+'px'; }
        else {
          /* flush the px height first: going straight from 'none' to 0 snaps shut
             with no transitionend, so the panel would never get hidden again */
          panel.style.maxHeight=panel.scrollHeight+'px'; void panel.offsetHeight;
          requestAnimationFrame(function(){ panel.style.maxHeight='0px'; });
        }
      });
      panel.addEventListener('transitionend', function(){
        if(!panel.classList.contains('open')) panel.hidden=true; else panel.style.maxHeight='none';
      });
    }

    function hideSection(){ if(section) section.style.display='none'; }
    fetchProjects().then(function(list){
      items=list;
      if(!items.length){ hideSection(); return; }
      if(cntEl) cntEl.textContent=items.length;
      buildFilter();
      /* sorting only changes the order across two or more years (within one year,
         newest/oldest/A–Z all fall back to the title); with neither control
         the panel opens straight onto the cards */
      var yrs={}; items.forEach(function(p){ yrs[p.year]=1; });
      if(sortEl) sortEl.hidden=Object.keys(yrs).length<2;
      if(ctlEl) ctlEl.hidden=(!filterEl || filterEl.hidden) && (!sortEl || sortEl.hidden);
      render();
    }).catch(function(){ hideSection(); });
  }

  function init(){
    var grid=document.getElementById('moreGrid');
    var section=document.getElementById('moreProjects');
    if(!grid || !section || !window.fetch) return;
    var allBtn=document.getElementById('moreAll');
    if(allBtn) initAlso(section, grid, allBtn);
    else initAccordion(section, grid);
  }
  if(document.readyState!=='loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
