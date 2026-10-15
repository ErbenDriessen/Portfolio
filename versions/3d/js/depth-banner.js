// =============================================================
// depth-banner.js — depth-parallax portrait with live eyes.
// Renders the cutout through a WebGL displacement shader (the
// depth map turns cursor movement into a subtle head turn) and
// composites cursor-tracking irises clipped by the eyelid mask.
// Falls back to the static img.portrait when WebGL is missing
// or prefers-reduced-motion is set.
// =============================================================
(function(){
  const hero = document.getElementById('top');
  if(!hero || matchMedia('(prefers-reduced-motion:reduce)').matches) return;

  /* ---- baked asset geometry (from the asset pipeline) ---- */
  const IMG = { w:2021, h:1696, aspect:2021/1696 };
  const EYES = [                     // normalized to the portrait image
    { cx:.4240, cy:.3567 },
    { cx:.5561, cy:.3555 }           // nudged ~4px toward the nose so the pupils read parallel
  ];
  const IRIS_D    = .0225;           // sprite diameter, fraction of image width
  const EYE_DEPTH = .816;            // depth-map value at the eye centres
  const FOCUS     = .82;             // depth plane that stays still
  const PAR_MAX   = { x:.020, y:.011 };   // head parallax, UV units
  const GAZE_MAX  = { x:.0075, y:.0035 }; // iris travel, UV units
  /* specular catchlight matching the real one: upper-left of the pupil,
     anchored to the eyeball so the iris slides underneath it */
  const CATCH     = { dx:-.0035, dy:-.0047, r:.0021 };

  const SRC = {
    img:  'img/me-depth.webp',       // eyeball layer: blank-eyed portrait (natural sclera)
    depth:'img/me-depth-map.webp',
    mask: 'img/me-eye-mask.webp',
    iris: 'img/me-iris.png',
    face: 'img/me-face.webp'         // top layer: portrait with transparent eye openings
  };

  const VERT = `
    attribute vec2 aPos; varying vec2 vUv;
    void main(){ vUv = vec2(aPos.x*.5+.5, .5-aPos.y*.5); gl_Position = vec4(aPos,0.,1.); }`;

  const FRAG = `
    precision mediump float;
    varying vec2 vUv;
    uniform sampler2D uImg, uDepth, uMask, uIris, uFace;
    uniform vec2 uPar, uGaze;
    uniform vec4 uEye0, uEye1;      // xy centre, zw iris size in UV
    uniform vec4 uCatch;            // xy offset, z radius (x-UV units), w aspect W/H
    uniform vec2 uSideI;            // x = warm (frontend) intensity, y = green (backend)
    uniform float uFocus, uEyeDepth;

    const vec3 WARM  = vec3(1.0, 0.910, 0.804);
    const vec3 GREEN = vec3(0.176, 1.0, 0.588);

    vec4 iris(vec4 base, vec2 uv, vec4 eye, float m){
      vec2 p = (uv - (eye.xy + uGaze)) / eye.zw + .5;
      vec4 ir = texture2D(uIris, clamp(p, 0., 1.));
      float inside = step(0., p.x) * step(p.x, 1.) * step(0., p.y) * step(p.y, 1.);
      float a = ir.a * m * inside;
      base = vec4(ir.rgb * m * inside + base.rgb * (1. - a), a + base.a * (1. - a));
      // catchlight: fixed to the eyeball (no uGaze), clipped by the eyelids
      vec2 dc = uv - (eye.xy + uCatch.xy);
      float d = length(vec2(dc.x, dc.y / uCatch.w));
      float ca = smoothstep(uCatch.z * 1.8, uCatch.z * .5, d) * .85 * m;
      return vec4(vec3(.96, .95, .97) * ca + base.rgb * (1. - ca), ca + base.a * (1. - ca));
    }

    void main(){
      float d  = texture2D(uDepth, vUv).r;
      vec2 uv  = vUv - uPar * (d - uFocus);
      d        = texture2D(uDepth, uv).r;          // one refinement tap
      uv       = vUv - uPar * (d - uFocus);
      float m  = texture2D(uMask, uv).r;
      // eyeball stack, only inside the eye openings: sclera -> iris -> catchlight
      vec4 eye = texture2D(uImg, uv);
      vec4 col = vec4(eye.rgb * m, eye.a * m);
      col = iris(col, uv, uEye0, m);
      col = iris(col, uv, uEye1, m);
      // the face (with transparent eye holes) covers everything else
      vec4 face = texture2D(uFace, uv);
      vec3 rgb = face.rgb + col.rgb * (1. - face.a);
      float cover = face.a + col.a * (1. - face.a);
      // dynamic side lighting: warm from the frontend side, green from the backend
      // side, intensities driven by the seam. normal derived from the depth map.
      float e = 0.002;
      float dl = texture2D(uDepth, uv - vec2(e, 0.)).r;
      float dr = texture2D(uDepth, uv + vec2(e, 0.)).r;
      float du = texture2D(uDepth, uv - vec2(0., e)).r;
      float dd = texture2D(uDepth, uv + vec2(0., e)).r;
      vec3 nrm = normalize(vec3((dl - dr) * 12., (du - dd) * 12., 1.));
      // wrap-lit rim (soft terminator) blended with a broad horizontal ramp so the
      // colour falls across the side of the face, not just the silhouette edge.
      float rimW = pow(max(0., dot(nrm, vec3(-0.958, 0.121, 0.259)) * .8 + .2), 1.5);
      float rimG = pow(max(0., dot(nrm, vec3( 0.958, 0.121, 0.259)) * .8 + .2), 1.5);
      float warm  = rimW * .7 + clamp((.56 - uv.x) / .24, 0., 1.) * .3;
      float green = rimG * .7 + clamp((uv.x - .44) / .24, 0., 1.) * .3;
      rgb += (WARM * warm * uSideI.x + GREEN * green * uSideI.y) * cover;
      gl_FragColor = vec4(rgb, cover);
    }`;

  /* ---------------- image loading ---------------- */
  const load = src => new Promise((res, rej) => {
    const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src;
  });

  /* ---------------- per-panel GL context ---------------- */
  function makeView(canvas, imgs){
    const gl = canvas.getContext('webgl', { alpha:true, premultipliedAlpha:true, antialias:false });
    if(!gl) return null;

    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw gl.getShaderInfoLog(s);
      return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if(!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw gl.getProgramInfoLog(prog);
    gl.useProgram(prog);

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    ['uImg','uDepth','uMask','uIris','uFace'].forEach((name, unit) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imgs[unit]);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.uniform1i(gl.getUniformLocation(prog, name), unit);
    });

    const irisW = IRIS_D, irisH = IRIS_D * IMG.aspect;
    gl.uniform4f(gl.getUniformLocation(prog,'uEye0'), EYES[0].cx, EYES[0].cy, irisW, irisH);
    gl.uniform4f(gl.getUniformLocation(prog,'uEye1'), EYES[1].cx, EYES[1].cy, irisW, irisH);
    gl.uniform1f(gl.getUniformLocation(prog,'uFocus'), FOCUS);
    gl.uniform1f(gl.getUniformLocation(prog,'uEyeDepth'), EYE_DEPTH);
    gl.uniform4f(gl.getUniformLocation(prog,'uCatch'), CATCH.dx, CATCH.dy, CATCH.r, IMG.aspect);

    return {
      canvas, gl,
      uPar: gl.getUniformLocation(prog,'uPar'),
      uGaze: gl.getUniformLocation(prog,'uGaze'),
      uSideI: gl.getUniformLocation(prog,'uSideI')
    };
  }

  function draw(view, par, gaze, side){
    const { gl, canvas } = view;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(view.uPar, par.x, par.y);
    gl.uniform2f(view.uGaze, gaze.x, gaze.y);
    gl.uniform2f(view.uSideI, side.warm, side.green);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /* ---------------- boot ---------------- */
  Promise.all([load(SRC.img), load(SRC.depth), load(SRC.mask), load(SRC.iris), load(SRC.face)]).then(imgs => {
    const views = [];
    hero.querySelectorAll('.panel img.portrait').forEach(img => {
      const canvas = document.createElement('canvas');
      canvas.className = 'portrait depth-canvas';
      canvas.setAttribute('aria-hidden', 'true');
      canvas.style.aspectRatio = IMG.w + ' / ' + IMG.h;
      img.insertAdjacentElement('afterend', canvas);
      const v = makeView(canvas, imgs);
      if(v) views.push(v);
    });
    if(!views.length) return;

    /* backing-store size follows layout size */
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const resize = () => views.forEach(v => {
      const r = v.canvas.getBoundingClientRect();
      const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
      if(v.canvas.width !== w || v.canvas.height !== h){ v.canvas.width = w; v.canvas.height = h; }
    });
    new ResizeObserver(() => { resize(); kick(); }).observe(views[0].canvas);
    resize();

    /* damped cursor state — eyes react quicker than the head */
    const par  = {x:0, y:0}, gaze = {x:0, y:0};
    const tPar = {x:0, y:0}, tGaze = {x:0, y:0};
    const side = {warm:0.5, green:0.5};
    let sideT = 0.5, raf = null, idleT0 = null;

    /* seam position (0 = frontend shown, 1 = backend), written by banner.js */
    function seamT(){
      const v = parseFloat(hero.style.getPropertyValue('--t'));
      return isNaN(v) ? 0.5 : v;
    }

    function frame(ts){
      par.x  += (tPar.x  - par.x ) / 9;  par.y  += (tPar.y  - par.y ) / 9;
      gaze.x += (tGaze.x - gaze.x) / 4;  gaze.y += (tGaze.y - gaze.y) / 4;
      const st = seamT();
      sideT += (st - sideT) / 6;
      side.warm  = 0.28 * (1 - sideT) + 0.03;
      side.green = 0.30 * sideT + 0.02;
      views.forEach(v => draw(v, par, gaze, side));
      const busy = Math.abs(tPar.x-par.x) + Math.abs(tPar.y-par.y) +
                   Math.abs(tGaze.x-gaze.x) + Math.abs(tGaze.y-gaze.y) +
                   Math.abs(st - sideT) > 1e-5;
      raf = (busy || drifting) ? requestAnimationFrame(tick) : null;
    }
    let drifting = false;
    function tick(ts){
      if(drifting){
        if(idleT0 === null) idleT0 = ts;
        const t = (ts - idleT0) / 1000;
        setTarget(Math.sin(t * .5) * .55, Math.sin(t * .33 + 1.2) * .3);
      }
      frame(ts);
    }
    function kick(){ if(!raf) raf = requestAnimationFrame(tick); }

    /* nx, ny in [-1,1] */
    function setTarget(nx, ny){
      tPar.x  = nx * PAR_MAX.x;  tPar.y  = ny * PAR_MAX.y;
      tGaze.x = nx * GAZE_MAX.x; tGaze.y = ny * GAZE_MAX.y;
    }
    function onMove(e){
      drifting = false;
      const r = hero.getBoundingClientRect();
      const nx = Math.max(-1, Math.min(1, (e.clientX - r.left) / r.width  * 2 - 1));
      const ny = Math.max(-1, Math.min(1, (e.clientY - r.top ) / r.height * 2 - 1));
      setTarget(nx, ny);
      kick();
    }
    function onLeave(){ setTarget(0, 0); kick(); }

    hero.addEventListener('pointermove', onMove, {passive:true});
    hero.addEventListener('pointerdown', onMove, {passive:true});
    hero.addEventListener('pointerleave', onLeave);

    /* no cursor (touch) or the case-study #gaze embed: drift on our own */
    if(matchMedia('(hover:none)').matches || location.hash === '#gaze'){
      drifting = true;
    }

    hero.classList.add('depth-on');
    kick();
  }).catch(() => { /* fallback img stays visible */ });
})();
