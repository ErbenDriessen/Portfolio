/* =============================================================
   more-projects.js — expandable grid of smaller work, loaded LIVE
   from Supabase (window.sbProjects.list()), with a type filter + sort.
   The three hero case studies stay hand-built above.
   ============================================================= */
(function(){
  var CAT_LABELS={web:'Web',mobile:'Mobile',python:'Python',game:'Game',tool:'Tool',data:'Data',other:'Other'};
  function init(){
    var grid=document.getElementById('moreGrid');
    if(!grid) return;
    var section=document.getElementById('moreProjects');
    var toggle=document.getElementById('moreToggle');
    var panel=document.getElementById('morePanel');
    var filterEl=document.getElementById('moreFilter');
    var cntEl=document.querySelector('#moreToggle .mt-count');

    var items=[], current='new', activeCat='all';
    var sorts={
      'new':  function(a,b){ return (+b.year||0)-(+a.year||0) || a.title.localeCompare(b.title); },
      'old':  function(a,b){ return (+a.year||0)-(+b.year||0) || a.title.localeCompare(b.title); },
      'az':   function(a,b){ return a.title.localeCompare(b.title); }
    };

    function card(p){
      var tags=(p.stack||[]).map(function(s){return '<span>'+s+'</span>';}).join('')
        + (p.year?'<span class="yr">'+p.year+'</span>':'');
      var inner='<div class="mini-thumb"><img src="'+(p.image||'')+'" alt="'+(p.title||'')+'" loading="lazy"></div>'
        +'<div class="mini-body"><div class="mini-tags">'+tags+'</div>'
        +'<h4>'+(p.title||'Untitled')+'</h4>'
        +(p.desc?'<p class="mini-desc">'+p.desc+'</p>':'')
        +(p.link?'<span class="mini-more">'+(p.linkLabel||'View')+' <span class="arr">→</span></span>':'')
        +'</div>';
      return p.link
        ? '<a class="mini-card" href="'+p.link+'" target="_blank" rel="noopener" aria-label="'+(p.title||'')+'">'+inner+'</a>'
        : '<div class="mini-card no-link">'+inner+'</div>';
    }
    function render(){
      var list=items.filter(function(p){ return activeCat==='all' || (p.category||'other')===activeCat; });
      list.sort(sorts[current]);
      grid.innerHTML=list.length ? list.map(card).join('')
        : '<p class="more-empty">Nothing in this category yet.</p>';
      if(panel && panel.classList.contains('open')) panel.style.maxHeight=panel.scrollHeight+'px';
    }
    function buildFilter(){
      if(!filterEl) return;
      var cats=[]; items.forEach(function(p){ var c=p.category||'other'; if(cats.indexOf(c)<0) cats.push(c); });
      cats.sort();
      var chips='<span class="mf-label">type</span>'
        +'<button class="mf-btn on" data-cat="all">All <span class="mf-n">'+items.length+'</span></button>';
      cats.forEach(function(c){
        var n=items.filter(function(p){return (p.category||'other')===c;}).length;
        chips+='<button class="mf-btn" data-cat="'+c+'">'+(CAT_LABELS[c]||c)+' <span class="mf-n">'+n+'</span></button>';
      });
      filterEl.innerHTML=chips;
      [].forEach.call(filterEl.querySelectorAll('.mf-btn'), function(b){
        b.addEventListener('click', function(){
          activeCat=b.getAttribute('data-cat');
          [].forEach.call(filterEl.querySelectorAll('.mf-btn'), function(x){ x.classList.toggle('on', x===b); });
          render();
        });
      });
    }

    [].forEach.call(document.querySelectorAll('.ms-btn'), function(b){
      b.addEventListener('click', function(){
        current=b.getAttribute('data-sort');
        [].forEach.call(document.querySelectorAll('.ms-btn'), function(x){ x.classList.toggle('on', x===b); });
        render();
      });
    });
    if(toggle && panel){
      toggle.addEventListener('click', function(){
        var open=panel.classList.toggle('open');
        toggle.setAttribute('aria-expanded', open?'true':'false');
        toggle.classList.toggle('open', open);
        if(open){ panel.hidden=false; panel.style.maxHeight=panel.scrollHeight+'px'; }
        else { panel.style.maxHeight=panel.scrollHeight+'px'; requestAnimationFrame(function(){ panel.style.maxHeight='0px'; }); }
      });
      panel.addEventListener('transitionend', function(){
        if(!panel.classList.contains('open')) panel.hidden=true; else panel.style.maxHeight='none';
      });
    }

    function waitForSb(tries){
      if(window.sbProjects && window.sb){ load(); }
      else if(tries>0){ setTimeout(function(){ waitForSb(tries-1); }, 200); }
      else { hideSection(); }
    }
    function hideSection(){ if(section) section.style.display='none'; }
    async function load(){
      try{ var list=await window.sbProjects.list(); items=Array.isArray(list)?list:[]; }
      catch(e){ items=[]; }
      if(!items.length){ hideSection(); return; }
      if(cntEl) cntEl.textContent=items.length;
      buildFilter(); render();
    }
    waitForSb(25);
  }
  if(document.readyState!=='loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
