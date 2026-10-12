// =============================================================
// depth-banner.js — the live portrait in the split hero.
// One WebGL pass renders the cutout with:
//  - a head turn: the depth map turns gaze into parallax. With
//    LAYERS the head is two layers, each on its own depth: the
//    loose side hair over the head/neck/ears it hung in front of
//  - real eyes: sclera + his own iris under the eyelids, lit by
//    the photo's light map, the photo's own corneal catchlight,
//    and upper lids that ride along with vertical gaze
//  - real blinks: the open lid slides down over the eye while
//    his own closed lids (registered from a closed-eyes edit of
//    the photo) are revealed behind it, lined up with it; their
//    lashes come in under the lid edge just before it shuts
//  - a subtle closed-mouth smile that follows his gaze: straight
//    face while he looks ahead (at you), and the further he looks
//    sideways at the frontend or the backend, the more he smiles.
//    Eased along a flow field (the mouth corners move, nothing
//    cross-fades)
//  - the panels' light on him: a soft lavender-pink from the
//    frontend side, green from the backend side, falling on the
//    planes turned to each (that side's cheek, jaw, temple and
//    hair; normals from the depth map, bent round toward his
//    outline by the blurred cutout alpha) and fading toward the
//    middle of his face. A little of both always; the side the
//    seam (--t from banner.js) moves to comes up, the other one
//    fades. LIGHT sets how strong (0 = the photo's own light only)
// Each eye aims at the cursor from its own spot on screen, as if
// the cursor hovered ~27cm in front of him (the viewer sits
// ~60cm away): they converge on it when it's near the face, and
// the head takes part of a big look sideways.
// No cursor = he looks at you.
// One canvas, in the head layer (.portrait-head) in front of the
// split: the seam runs behind him. The part of him on the backend
// side of the seam takes the backend's darker grade, eased in
// around the seam's x (drawn here, so it moves with it), under
// the panels' light (see SHADE).
// Pages still on the old markup (a portrait img in each panel:
// eyes.html) keep the old split: the frame drawn once and
// mirrored into the back panel. Renders only while something
// moves; paused offscreen / in a hidden tab.
// Falls back to the static img.portrait without WebGL or with
// prefers-reduced-motion: he looks ahead there, so straight face.
// =============================================================
(function(){
  const hero = document.getElementById('top');
  if(!hero || matchMedia('(prefers-reduced-motion:reduce)').matches) return;
  /* the head layer (one img) or, the old markup, an img in each panel */
  const headLayer = hero.querySelector('.portrait-head');
  const fallback = headLayer ? headLayer.querySelectorAll('img.portrait') : hero.querySelectorAll('.panel img.portrait');
  if(fallback.length !== (headLayer ? 1 : 2)) return;

  /* ---------------- portrait geometry ----------------
     image px of the 2021x1696 cutout, measured by the asset pipeline.
     Eye-local coords: px relative to the iris centre at rest (y down).
     up / lo: upper + lower lid line, y = poly(x / 50), degree 6 fits of the
     measured lid curves (max error .3px); span: the two eye corners (x). */
  const IMG = { w:2021, h:1696 };
  /* glint: the photo's catchlight centre; its 32px cut (catchlights atlas)
     starts at round(c + glint) - 16 */
  const EYES = [
    { c:[859.09, 603.44], r:23.65, glint:[-6.63, -3.73], span:[-42.59, 43.91],     // image-left (his right)
      up:[-12.3609, -2.4313, 33.3344, 7.3602, -29.5897, -7.1698, 34.6533],
      lo:[ 24.9757, -0.0445, -15.7914, -3.9652, -1.5869,  7.2622, -5.0447] },
    { c:[1119.88, 599.66], r:23.34, glint:[-10.57, -3.51], span:[-43.38, 48.12],   // image-right (his left)
      up:[-11.9209, -6.6911, 35.0157, 14.4526, -40.1899, -15.1881, 37.1538],
      lo:[ 24.1509, -0.7349, -20.3631, -0.6882, 10.2235,  2.6198, -7.0921] }
  ];
  const BOX = [780, 545, 430, 125];        // the eyes-sclera / eyes-maps crops (x, y, w, h)

  /* ---------------- feel ---------------- */
  const EYEBALL_R  = 48.2;                 // iris travel radius, image px
  const GAZE_MAX   = { x:16, up:10.5, down:8.5 };  // natural max iris travel, image px
  const LID_FOLLOW = .75;                  // upper lid rides along with vertical gaze
  const VIEW_DIST  = 600 / 63;             // the viewer: 60cm away, in interocular units (63mm)
  const NEAR       = .45;                  // the cursor's plane, as a share of that distance
  const FOCUS      = .83;                  // depth plane that stays put
  const PAR_MAX    = { x:.072, y:.034 };   // head parallax at a full turn, uv
  const HEAD_FULL  = .45;                  // look angle (rad) that gives the full head turn
  const HEAD_RAD   = 2.2;                  // head turn (rad) per uv of parallax (the eyes take the rest)
  const EYE_W = 38, HEAD_W = 5.2;          // spring stiffness: eyes snap, the head follows
  const CURSOR_REST = 6500;                // a parked cursor: he looks back at you after this (ms)
  const TOUCH_DIST = .3;                   // a finger: as if this share of the cursor's distance away (see aim)
  const IDLE_FPS   = 30;                   // phones + tablets: his idle life (no finger, no glide) at this rate
  const GLINT_CELL = 32;                   // catchlights atlas: one 32px cell per eye
  const SETTLE     = .12;                  // motion under this many device px is done: stop rendering
  /* blink: b is the lid's travel (0 open .. 1 shut). The closed lashes take over
     from the open lid over b .9-.96, a stretch a real lid crosses in well under a
     frame: from SEAL on it's drawn shut, so that swap never shows half-faded */
  const SEAL       = .88;
  const BLINK      = { close:[90, 110], hold:[30, 45], open:[140, 175] };  // ms ranges
  /* the smile follows how far sideways he turns (head turn / PAR_MAX.x):
     none below the first value (looking ahead, the cursor on his face), full
     from the second on (out over the frontend or backend side).
     SMILE_W: its spring, slower than the eyes so it doesn't twitch */
  const SMILE_GAZE = [.35, .75], SMILE_W = 7;
  /* LIGHT: the two panels light him (0 off .. 1): a soft lavender-pink from
     the frontend side, green from the backend side, on the planes turned to
     each. Always a little of both (the panels are always there: LIGHT_BASE
     of it); as the seam moves over to one side (its panel grows), that light
     comes up to full and the other one fades (by LIGHT_FADE of its base) */
  const LIGHTS     = { subtle:.35, clear:.6, dramatic:1 };
  const LIGHT      = LIGHTS.dramatic;
  const LIGHT_BASE = .4, LIGHT_FADE = .75;
  /* LAYERS: true = the loose side hair as its own layer over the head (the
     neck and ears behind it painted in), each on its own depth, so the hair
     slides over the neck instead of shearing it, and the cheek/ear edges stay
     clean on a big look sideways (no fold line, no smeared jaw). Costs one
     more texture (8 units) and ~30% more GPU time per frame.
     false = the single cutout on one depth map (side hair hung smoothly off
     the head): the previous engine, pixel for pixel */
  const LAYERS     = true;
  const HAIR_Y     = 272;                  // the hair layer's texture: image rows HAIR_Y .. HAIR_Y + 1024 (all its hair)
  /* SHADE (the head layer only): the backend's darker grade on the part of him
     on the backend side of the seam, as the old split portrait had it (its back
     panel's css filter), drawn here at the seam's x so it moves with it. Eased
     in over SHADE_SOFT of the canvas's width, centred on the seam: he steps
     from the frontend's light into the dark. The panels' light goes on after
     it, so the green sits on top of the dark side.
     The canvas has the css front grade on it (portfolio.css .portrait-head
     .portrait), so the shader applies front^-1(back(x)): the css front grade then
     makes it the back grade. GRADE: the css filters' values, keep in step.
     The static img does the same in css (.portrait-shade, portfolio.css) */
  const SHADE = !!headLayer;
  const SHADE_SOFT = .05;                  // the falloff's width, share of the canvas width (portfolio.css --shade-w)
  const GRADE = { front:[1.12, .97, 1.04], back:[.9, .84, 1.08] };   // css saturate(), brightness(), contrast()

  const SRC = {
    face:  LAYERS ? '/img/me-v2-layer-back-2.webp' // the head, neck + ears without the loose side hair (same face, same eye openings; the photo's pale rim along the neckline toned to the skin)
                  : '/img/me-v2-face-c.webp',      // decontaminated cutout (matte choked), eye openings cut out
    hair:  '/img/me-v2-layer-hair.webp', // LAYERS: just the loose side hair (over face = the cutout)
    smile: '/img/me-v2-smile-face-2.webp', // the same cutout with his subtle smile (same alpha, same eye openings; the moustache's fine detail is the photo's own, carried along the smile flow)
    smileFlow:'/img/me-v2-smile-flow.png', // half res: RG neutral -> smile flow (image px, ±20), B where the smile is
    /* LAYERS, half res: R the head (its right neck/collar crease eased: no bulge on a
       look down-left), G the side hair, B the turn's symmetry correction (128 = none).
       The depth map read the photo's side light as shape: his lit side (image-left)
       lay deeper than his shaded side, so a look toward the frontend squeezed his face
       narrower (pointier jaw and chin) and a look toward the backend widened it. The
       turn uses R/G less B: his face, jaw, chin and neck mirror-averaged about his
       facial midline (fit through the eyes, nose and philtrum), the hair round them
       evened out broadly, and from his temples out to his outline (rows ~400-950)
       eased row by row so both sides of his outline sit at the same depth: his whole
       head keeps its width on a look either way (its silhouette and layering stay as
       they were). The light keeps reading R/G as they are, so the rest pose is
       unchanged */
    depth: LAYERS ? '/img/me-v2-layer-depth-rg4.webp'
                  : '/img/me-v2-depth-half-2.webp',   // depth, half res: side hair + ears hung smoothly off the head (no tear at the neck), rigid silhouette
    sclera:'/img/me-v2-eyes-sclera.webp',// unlit sclera albedo, BOX crop
    maps:  '/img/me-v2-eyes-maps.webp',  // BOX crop: R opening mask, G eyeball light
    lids:  '/img/me-v2-blink-closed.webp', // BOX crop: his closed lids (straight alpha), registered to the photo
    lidFlow:'/img/me-v2-blink-flow.png', // BOX crop: R open-lid travel, G closed-lid counter travel, B reveal time
    iris:  '/img/me-v2-iris.webp',       // his iris, unlit, circle r = .46 of the sprite
    glint: '/img/me-v2-catchlights-soft.png' // the photo's own catchlights: same shape + spot, de-speckled (atlas, see EYES)
  };
  const GL_ATTRS = { alpha:true, premultipliedAlpha:true, antialias:false };

  const VERT = `
    attribute vec2 aPos; varying vec2 vUv;
    void main(){ vUv = vec2(aPos.x*.5+.5, .5-aPos.y*.5); gl_Position = vec4(aPos,0.,1.); }`;

  /* the face is sampled through the lid remaps; with an explicit LOD their
     steep stretches can't drive the mip level up and blur the lash line
     (EXT_shader_texture_lod, nearly universal; without it, a plain biased
     lookup) */
  const FRAG = `
    #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
    #else
    precision mediump float;
    #endif
    /* uFaceOff / uLodOff: the phone set's smaller textures (TEX_SETS): its face
       starts below the empty rows over his hair, and its level 0 is already
       uLodOff mip levels down. 0 for the full set */
    #ifdef HAS_LOD
    #define FACE(uv, lod)  texture2DLodEXT(uFace, (uv) + uFaceOff, (lod) + uLodOff)
    #define SMILE(uv, lod) texture2DLodEXT(uSmile, uv, (lod) + uLodOff)
    #define HAIR(uv, lod)  texture2DLodEXT(uHair, uv, (lod) + uLodOff)
    #define DEPTH(uv)      texture2DLodEXT(uDepth, uv, 0.)
    #else
    #define FACE(uv, lod)  texture2D(uFace, (uv) + uFaceOff, lod - uLod)
    #define SMILE(uv, lod) texture2D(uSmile, uv, lod - uLod)
    #define HAIR(uv, lod)  texture2D(uHair, uv, lod - uLod)
    #define DEPTH(uv)      texture2D(uDepth, uv)
    #endif
    /* the depth the turn moves by (SRC.depth): LAYERS, R/G less B's symmetry correction */
    #ifdef LAYERS
    #define TURN(t) ((t).rg - ((t).b - 128. / 255.))
    #else
    #define TURN(t) ((t).rg)
    #endif
    varying vec2 vUv;
    uniform sampler2D uFace, uSmile, uSmileFlow, uDepth, uBoxes, uIris, uGlint;
    #ifdef LAYERS
    uniform sampler2D uHair;           // the loose side hair (premultiplied), a band of image rows
    uniform vec4  uHairMap;            // image uv -> that band: xy scale, zw offset
    #endif
    uniform vec2  uFaceScale;          // image uv -> padded power-of-two face texture
    uniform vec2  uFaceOff;            // + this (face texture uv)
    uniform vec2  uSmileScale, uSmileOff;   // the same for the smile texture (the phone set's is a crop round the mouth)
    uniform vec2  uEdgeK;              // the light's alpha taps (EDGE, face uv) scaled to the face texture
    uniform float uLodOff;             // the texture set's level 0, in mip levels of the full set
    uniform vec4  uBox;                // eye crop in image px
    uniform vec2  uPar;                // head parallax, uv
    uniform float uFocus, uBlink;      // uBlink: the lid's travel, 0 open .. 1 shut
    uniform float uSmileT;             // 0 neutral .. 1 the smile
    uniform float uLod;                // face texture LOD
    uniform float uFine;               // LOD of the full-detail face samples
    uniform vec2  uSide;               // the panels' light: x frontend, y backend (LIGHT x base + seam)
    uniform vec4  uEyeA, uEyeB;        // xy iris centre px, z iris radius px
    uniform vec4  uGazeA, uGazeB;      // xy iris offset px, z lid shift px, w foreshortening
    uniform vec4  uSpanA, uSpanB;      // xy corner span, zw catchlight cut origin
    uniform vec4  uUpA0, uUpA1, uLoA0, uLoA1, uUpB0, uUpB1, uLoB0, uLoB1;
    #ifdef SHADE
    uniform float uSeam;               // the seam's x (canvas uv)
    #endif

    const vec2  IMG   = vec2(2021., 1696.);
    /* the panels' light (linear rgb): FE_L the frontend's lavender-pink (its
       violet + coral washes on paper), BE_L the backend's #00FF9C as light, a
       touch toward cyan. Their directions: from each side, a little above and
       in front of him. Strengths (x frontend, y backend) at LIGHT 1 with the
       seam over on that side: the frontend's is gentler, it comes from the
       side the photo's own key light already lights */
    const vec3  FE_L   = vec3(1.00, .50, 1.22);
    const vec3  BE_L   = vec3(.03, .85, .70);
    const vec3  FE_DIR = vec3(-.977, -.15, .15);
    const vec3  BE_DIR = vec3( .977, -.15, .15);
    const vec2  WRAP   = vec2(.2, .8);   // n.l: where the light starts round the curve, where it's full
    const float RELIEF = 8.;           // depth slope -> normal
    const vec2  EDGE   = vec2(.008, .022);  // the alpha taps' reach (uv; 16 / 44 image px): the outline, the planes
    const float WIDE_LOD = 5.5;        // the planes' alpha blur (~45 image px)
    const float BEND   = 1.5;          // how far that blur bends the planes' normal round toward his outline
    const vec2  NEAR   = vec2(.34, .48);   // canvas uv x: the frontend's light full / gone (mirrored: the backend's)
    const vec2  DIFFUSE = vec2(1.9, 5.), SHEEN = vec2(.65, 1.);
    const float SHEEN_SKIN = .114, SHEEN_HAIR = .72, HAIR_FE = .35;
    const float CAP    = .18;          // most luminance the light may add, x its strength
    const vec2  SHIRT_Y = vec2(1060., 1160.), NECK_Y = vec2(1000., 1100.);   // image px rows
    const float NECK   = .7;           // the light the neck loses, back under his jaw
    const float CREASE = 16.;          // lid skin between the crease and the lash line
    const float OPEN   = 37.;          // eye opening height at its widest
    const float LASH   = 3.;           // lash band: carried along 1:1, never stretched
    const float CORNER = 4.;           // the remap runs this far past the corners
    /* the lid travel field is a single backward tap, which makes the lid lag:
       this remap of b makes the lash line move evenly with it */
    const vec3  BW = vec3(.88364, -.79269, -.41985);

    float poly(vec4 a, vec4 b, float x){
      float s = x / 50.;
      return a.x + s*(a.y + s*(a.z + s*(a.w + s*(b.x + s*(b.y + s*b.z)))));
    }

    /* the eye crops (BOX), stacked in one texture: 0 sclera, 1 light maps,
       2 closed lids (premultiplied), 3 lid travel. Clamped to the cell, so it
       reads like CLAMP_TO_EDGE and no cell bleeds into the next */
    vec4 box(vec2 p, float cell){
      vec2 h = .5 / uBox.zw, q = clamp((p - uBox.xy) / uBox.zw, h, 1. - h);
      return texture2D(uBoxes, vec2(q.x, (q.y + cell) * .25));
    }

    /* the upper lid rides along with vertical gaze: a vertical remap of the lid
       skin. The lash line moves from its rest line yu to ye; the skin up to the
       crease stretches with it, the opening squeezes (or widens) below it; the
       lashes ride on the lid edge 1:1. Continuous at every boundary (both sides
       of the lash line read row yu), so no coverage blend is needed.
       x: source row offset, y: LOD bias + z: horizontal spread of the stretched
       skin (soft rather than streaky), w: the offset for the eye's light map */
    vec4 lid(vec2 p, vec2 span, vec4 u0, vec4 u1, vec4 l0, vec4 l1, float follow){
      if(max(span.x - p.x, p.x - span.y) >= CORNER) return vec4(0.);
      float x  = clamp(p.x, span.x, span.y);
      float yu = poly(u0, u1, x), yl = poly(l0, l1, x);
      float open = max(yl - yu, 0.);
      float yt = yu - CREASE;
      if(p.y <= yt || p.y >= yl) return vec4(0.);
      float ye = clamp(yu + follow * open / OPEN, yt + LASH + 2., yl);   // tapers to 0 at the corners
      if(p.y < ye){
        if(p.y >= ye - LASH) return vec4(yu - ye, 0., 0., 0.);
        float t = (p.y - yt) / max(ye - LASH - yt, .001);
        float str = max(log2((ye - LASH - yt) / max(yu - LASH - yt, 1.)), 0.) * smoothstep(.05, .35, t);
        return vec4(yt + t * (yu - LASH - yt) - p.y, str * .35, min(str, 1.6) * 2.2, 0.);
      }
      /* the opening: its two soft lid edges stay 1:1 (squeezed, they'd go hard
         and stair-step), the clear middle takes up the squeeze */
      float o = yl - ye, q = p.y - ye, mt = min(1., open * .5);
      float f = min(1., o / max(2. * mt, .001)), b;
      if(q < mt * f)          b = yu + q / f;
      else if(q > o - mt * f) b = yl - (o - q) / f;
      else                    b = yu + mt + (q - mt * f) * (open - 2. * mt) / max(o - 2. * mt * f, .001);
      return vec4(b - p.y, 0., 0., b - p.y);
    }

    /* the iris sprite (premultiplied) for one eye, foreshortened along the
       gaze as the eyeball turns. Sampled for every pixel, outside any branch:
       it's mipmapped, and mip selection needs the whole pixel quad. */
    vec4 iris(vec2 px, vec4 eye, vec4 gz){
      vec2 q = px - eye.xy - gz.xy;
      float g = length(gz.xy);
      vec2 dir = g > .001 ? gz.xy / g : vec2(0.);
      q += dir * dot(q, dir) * gz.w;
      return texture2D(uIris, .5 + q / eye.z * .46);
    }

    /* corneal catchlight: the photo's own, cut out (premultiplied), riding
       on the cornea at .45 of the iris travel. One atlas cell per eye; the
       cells have a clear border, so the clamp leaves nothing outside. */
    vec4 glint(vec2 px, vec4 eye, vec4 gz, vec4 span, float cell){
      vec2 q = clamp((px - eye.xy - span.zw - gz.xy * .45) / 32., 0., 1.);
      return texture2D(uGlint, vec2((q.x + cell) * .5, q.y));
    }

    /* adds light under a soft shoulder: below .75 it's plain addition, above
       it the increase eases off, so lit skin never clips. No light = no change. */
    vec3 shoulder(vec3 x){ vec3 d = max(x - .75, 0.); return min(x, .75) + d / (1. + d * 4.); }

    void main(){
      /* parallax: where this pixel's depth sends the lookup, plus one
         refinement tap. LAYERS: the head on depth R, the side hair on G */
      vec2 d0 = TURN(texture2D(uDepth, vUv));
      vec2 uv = vUv - uPar * (d0.r - uFocus);
      uv = vUv - uPar * (TURN(texture2D(uDepth, uv)).r - uFocus);
      #ifdef LAYERS
      vec2 uvH = vUv - uPar * (d0.g - uFocus);
      uvH = vUv - uPar * (TURN(texture2D(uDepth, uvH)).g - uFocus);
      #endif
      vec2 px = uv * IMG, fs = uFaceScale / IMG, fsS = uSmileScale / IMG;

      /* the smile: G moves a neutral feature to where it sits in the smile
         (image px, zero outside the mouth and cheeks). At t the neutral face is
         sampled t of the way back along it and the smile face the rest of the
         way forward, so both show every feature in the same place: it moves,
         it doesn't cross-fade. The smile layer only where the smile is (ws),
         so the rest stays the neutral cutout to the bit */
      vec3 sm = texture2D(uSmileFlow, uv).rgb;
      vec2 G  = (sm.rg * 255. - 128.) / 127. * 20.;
      float ws = uSmileT * clamp(sm.b * 64., 0., 1.);
      vec2 oN = -uSmileT * G, oS = (1. - uSmileT) * G;

      /* the nearer eye: the lid follow (gaze) and the blink. The follow eases off
         as the lid comes down; the blink happens in rest geometry (r: the follow
         undone), so the face, the closed lids and their travel field all go
         through the same remap and stay lined up whatever the gaze */
      bool rightEye = px.x > (uEyeA.x + uEyeB.x) * .5;
      vec4 E = rightEye ? uEyeB : uEyeA, Z = rightEye ? uGazeB : uGazeA, S = rightEye ? uSpanB : uSpanA;
      vec4 U0 = rightEye ? uUpB0 : uUpA0, U1 = rightEye ? uUpB1 : uUpA1;
      float b  = uBlink;
      float bw = b + b * (1. - b) * (BW.x + BW.y * b + BW.z * b * b);
      vec4 L = lid(px - E.xy, S.xy, U0, U1, rightEye ? uLoB0 : uLoA0, rightEye ? uLoB1 : uLoA1, Z.z * (1. - bw));
      vec2 r = px + vec2(0., L.x);
      /* lid travel: the open lid (its lashes with it) slides down by bw * D;
         the closed lids ride the other way by (1 - bw) * F, so their crease and
         lash line sit on the moving lid's; T: when each of their pixels shows */
      vec3 tv = box(r, 3.).rgb;
      float D = tv.r * 63.75 - 8., F = tv.g * 63.75, T = tv.b;
      vec2 s = r - vec2(0., bw * D);

      /* the face: the stretched lid skin blurred across (3 taps), the smile on
         top. With explicit LODs the extra taps are skipped where they'd all
         read the same texel (no stretch, no smile): most of the frame */
      vec2 sN = (s + oN) * fs, hA = vec2(L.z * fs.x, 0.);
      float lA = uFine + L.y;
      #ifdef HAS_LOD
      vec4 face = FACE(sN, lA);
      if(L.z > 0.) face = (FACE(sN - hA, lA) + face * 2. + FACE(sN + hA, lA)) * .25;
      if(ws > 0.) face = mix(face, SMILE((s + oS) * fsS + uSmileOff, lA), ws);
      #else
      vec4 face = (FACE(sN - hA, lA) + FACE(sN, lA) * 2. + FACE(sN + hA, lA)) * .25;
      face = mix(face, SMILE((s + oS) * fsS + uSmileOff, lA), ws);
      #endif
      #ifdef LAYERS
      /* the side hair over it all (it has none in the eyes or the mouth) */
      vec2 tH = uvH * uHairMap.xy + uHairMap.zw;
      vec4 hair = HAIR(tH, uFine);
      face = hair + face * (1. - hair.a);
      #endif

      /* the eyeball, under the face's eye openings: sclera, iris, the photo's
         light map (side light, lid shadow, occlusion; it follows the lid's
         gaze remap but not the blink), the closing lid's shadow, then the
         catchlight. Inside the eye crop the photo is opaque, so whatever the
         face leaves open there is eyeball. */
      vec4 irA = iris(px, uEyeA, uGazeA), irB = iris(px, uEyeB, uGazeB);
      vec4 gA = glint(px, uEyeA, uGazeA, uSpanA, 0.), gB = glint(px, uEyeB, uGazeB, uSpanB, 1.);
      vec2 mp  = px + vec2(0., L.w);
      vec2 bq  = (mp - uBox.xy) / uBox.zw;
      float mg = box(mp, 1.).g;                                 // eyeball light
      vec3 eye = box(px, 0.).rgb;
      /* a look sideways bares sclera from the side of the eyeball, which curves
         away from the light: darker toward the corner the eye turns from, a
         little pinker at the inner corner. None at rest (the photo's own) */
      float hx = (px.x - E.x - (S.x + S.y) * .5) / ((S.y - S.x) * .5);
      float occ = smoothstep(.2, 1., abs(hx)) * clamp(-sign(hx) * Z.x / 12., 0., 1.);
      eye *= (1. - .22 * occ) * mix(vec3(1.), vec3(1.04, .95, .93), occ * smoothstep(.1, .8, rightEye ? -hx : hx));
      eye = irA.rgb + eye * (1. - irA.a);
      eye = irB.rgb + eye * (1. - irB.a);
      /* the closing lid's contact shadow, fading down from its moving edge
         (s: the open face's row, below the lash line yu inside the opening) */
      float yu = E.y + poly(U0, U1, clamp(px.x - E.x, S.x, S.y));   // the open lash line
      float below = s.y - yu;
      float sh = exp(-max(below, 0.) / 7.) * smoothstep(0., .3, b);
      /* the strip of eyeball the closing lid leaves dims, and warms (light off
         the lids, the wet lid margin): never a flat cold grey band. Dims less
         with the gaze up, where that strip is lower sclera, not iris */
      float cb = smoothstep(.2, .8, b);
      eye *= mg * (1. - .55 * sh) * (1. - mix(.28, .15, clamp(-Z.y / 8., 0., 1.)) * cb) * mix(vec3(1.), vec3(1.03, .9, .8), cb);
      eye = gA.rgb + eye * (1. - gA.a);
      eye = gB.rgb + eye * (1. - gB.a);
      vec2 inBox = step(vec2(0.), bq) * step(bq, vec2(1.));
      float m = inBox.x * inBox.y * (1. - face.a);
      /* his closed lids over it all, each pixel revealed at its time T: the
         skin above the moving edge early (lined up with the open lid, a fold
         turning into a lid), behind the moving lash line, and his closed
         lashes last.
         Those lashes don't quite wait for the seal: from b ~.62 their strands
         fade in under the moving lash line (dm: how far below it), hanging
         from it, foreshortened (a lid still part open holds them pointing out
         at you: kf of their length), rooted at it (the closed lid's margin
         above them, 3 rows, is skipped), and at the seal they're the patch
         as it is. Below the moving lash line nothing else reads the patch yet
         (its reveal time hasn't come), so it's read stretched to match there */
      float dm = r.y - yu - bw * F;
      float kf = mix(.35, 1., smoothstep(.62, 1., b));
      float early = step(.5, T) * smoothstep(-.5, .5, dm) * smoothstep(.62, .86, b);
      float dc = dm * (1. / kf - 1.) + 3. * (1. - smoothstep(.88, .96, b));
      vec4 cl = box(r + vec2(0., (1. - bw) * F + (early > 0. ? dc : 0.)), 2.);
      /* they came out lighter than his open lids, most on the shadow side */
      cl.rgb *= mix(1., rightEye ? .88 : .94, smoothstep(.3, 1., cl.a));
      float w = .08 - .05 * T, rv = smoothstep(T - w, T + w, b);
      /* only the strands come early (dark, and no further down the patch than
         they reach): the lower lid around them is where it'll be at the seal,
         not yet where it shows */
      float cll = dot(cl.rgb, vec3(.3, .59, .11)) / max(cl.a, .001);
      rv = max(rv, early * .9 * (1. - smoothstep(.2, .38, cll)) * (1. - smoothstep(13., 17., dm + dc)));
      face = face * (1. - cl.a * rv) + cl * rv;
      m *= 1. - cl.a * rv;
      vec3 rgb = face.rgb + eye * m;
      float cover = face.a + m;
      vec3 base = rgb;                 // the unlit colour, ungraded: what the light reads

      #ifdef SHADE
      /* the backend's grade on the part of him on the backend side of the seam
         (right of it): kb 0 .. 1 across SHADE_SOFT of the canvas's width
         centred on the seam. The grade is css's saturate + brightness +
         contrast (sRGB, as Chrome does them) folded into one: SHADE_G = x
         scale, y offset, z saturation; premultiplied, so the offset goes by
         cover. Ahead of the light, so the light adds onto the darker side at
         its own strength */
      float kb = smoothstep(-.5 * SHADE_SOFT, .5 * SHADE_SOFT, vUv.x - uSeam);
      if(kb > 0.){
        vec3 y = vec3(dot(rgb, vec3(.213, .715, .072)));
        rgb = mix(rgb, SHADE_G.x * (y + SHADE_G.z * (rgb - y)) + SHADE_G.y * cover, kb);
      }
      #endif

      /* the panels' light on him (uSide; LIGHT 0 skips it all, a uniform; so
         does the empty canvas around him, ~half the frame: its texture reads
         are all explicit-LOD, so the branch is real). Two normals:
         nd, the planes: the head's broad shape from the depth map (both
         layers), bent round toward his outline over ~50 image px by a wide
         blur of the cutout alpha (the dilated depth map has no edge), so a
         side light wraps onto the cheek, jaw and temple and fades toward the
         middle of the face. It lights the planes and gives skin its sheen.
         nrm, the outline: the same depth slope plus a tight blur of the alpha:
         the hair's strands along his outline catch a little of the light.
         All alpha taps morphed like every face sample. The smile layer's
         alpha is the cutout's, and the smile only sits well inside it (its
         mask keeps clear of every edge), so the neutral taps stand for both */
      if(uSide.x + uSide.y > 0. && cover > .002){
        vec2 tN = (px + oN) * fs, ef = vec2(EDGE.x * uEdgeK.x, 0.), ew = vec2(EDGE.y * uEdgeK.x, 0.), efv = vec2(0., EDGE.x * uEdgeK.y);
        float l4 = uLod + 4., lw = max(WIDE_LOD, l4) + 1.;
        /* well inside him (his alpha blurred further than both edge blurs
           reach is still whole) there is no edge to find: most of him skips
           the taps */
        float al = 1., ar = 1., au = 1., ad = 1., wl = 1., wr = 1.;
        float ac = FACE(tN, lw).a;
        #ifdef LAYERS
        float hc = HAIR(tH, lw).a;
        ac = hc + ac * (1. - hc);
        #endif
        if(ac < .995){
          al = FACE(tN - ef, l4).a;    ar = FACE(tN + ef, l4).a;
          au = FACE(tN - efv, l4).a;   ad = FACE(tN + efv, l4).a;
          wl = FACE(tN - ew, WIDE_LOD).a; wr = FACE(tN + ew, WIDE_LOD).a;
          #ifdef LAYERS
          /* the side hair over its blurred alpha: the same image px, in the hair's band */
          vec2 eh = ef.x / fs.x * uHairMap.xy / IMG;
          float hl = HAIR(tH - vec2(eh.x, 0.), l4).a, hr = HAIR(tH + vec2(eh.x, 0.), l4).a;
          float hu = HAIR(tH - vec2(0., eh.y), l4).a, hd = HAIR(tH + vec2(0., eh.y), l4).a;
          al = hl + al * (1. - hl); ar = hr + ar * (1. - hr);
          au = hu + au * (1. - hu); ad = hd + ad * (1. - hd);
          float hwx = ew.x / fs.x * uHairMap.x / IMG.x;
          float hwl = HAIR(tH - vec2(hwx, 0.), WIDE_LOD).a, hwr = HAIR(tH + vec2(hwx, 0.), WIDE_LOD).a;
          wl = hwl + wl * (1. - hwl); wr = hwr + wr * (1. - hwr);
          #endif
        }
        /* the eye openings are holes in the cutout, not its silhouette: around
           them (as far as the blurred alpha reaches) the edge terms go, or a
           shut lid would catch a rim of light where the eyeball was */
        vec2 ea = (px - uEyeA.xy - vec2(3., 6.)) / vec2(75., 50.), eb = (px - uEyeB.xy - vec2(3., 6.)) / vec2(75., 50.);
        float ke = smoothstep(1., 1.35, min(length(ea), length(eb)));
        vec2 ga = vec2(al - ar, au - ad) * ke, gw = vec2((wl - wr) * ke, 0.);

        /* the broad shape: the depth map's slope over ~80 image px (the head's
           planes, not its pores; and wide enough that the 8-bit depth steps
           don't show as contour lines), of whichever layer shows */
        vec2 e = vec2(.02, 0.);
        #ifdef LAYERS
        vec2 dw = vec2(1. - hair.a, hair.a);
        #else
        vec2 dw = vec2(1., 0.);
        #endif
        float dl = dot(DEPTH(uv - e).rg, dw),    dr = dot(DEPTH(uv + e).rg, dw);
        float du = dot(DEPTH(uv - e.yx).rg, dw), dd = dot(DEPTH(uv + e.yx).rg, dw);
        vec2 gd = vec2(dl - dr, du - dd) * RELIEF;
        vec3 nd  = normalize(vec3(gd + gw * BEND, 1.));
        vec3 nrm = normalize(vec3(gd + ga * 2.4, 1.));
        float sil = clamp(length(ga) * 3., 0., 1.);

        /* two broad area lights, one each side, a little above and in front
           of him: a soft ramp over n.l, squared, so the planes turned to a
           side (cheek edge, jaw, temple, the side hair) take it, falling off
           smoothly toward the front of the face, which (nose included) gets
           next to none; and it falls off toward the far side (near). Planes
           turned down (under the jaw) are out of it. Plus a sheen in the
           light's own colour (skin's reflection is neutral) over the turned
           planes: on skin by the wide normal (a soft falloff, never a line
           along his jaw), on the hair along its outline */
        vec2 nl = vec2(dot(nd, FE_DIR), dot(nd, BE_DIR));
        vec2 near = vec2(smoothstep(NEAR.y, NEAR.x, uv.x), smoothstep(1. - NEAR.y, 1. - NEAR.x, uv.x));
        vec2 dif = smoothstep(WRAP.x, WRAP.y, nl) * near;
        dif *= dif * (1. - smoothstep(.15, .5, nd.y));
        vec2 fd = vec2(-nd.x, nd.x) / max(length(nd.xy), 1e-4), fc = vec2(-nrm.x, nrm.x) / max(length(nrm.xy), 1e-4);
        vec2 rimS = smoothstep(0., .9, 1. - nd.z)  * smoothstep(.1, .8, fd) * near;
        vec2 rimH = smoothstep(0., .9, 1. - nrm.z) * smoothstep(.1, .8, fc) * mix(near, vec2(1.), sil);

        /* lit in linear light, added (coloured light adds, it never paints
           over), then back through the same soft shoulder the old light used.
           The light it adds goes by the surface's albedo, estimated from the
           photo: skin takes it at a perceptual albedo (its shadow side, which
           the photo's key light never reached, is as pale as the lit side), a
           little desaturated so the green reads as light on skin, not as a
           sallow cast; the dark hair only at its own (tiny) linear value, so
           its blacks stay black and just the lighter strands catch it */
        float cv = max(cover, .001);
        vec3 c = base / cv, lin = c * c;
        float lum = dot(c, vec3(.3, .59, .11));
        float sk = smoothstep(.16, .45, lum);
        vec3 alb = mix(lin, c * .55, sk);
        alb = mix(alb, vec3(dot(alb, vec3(.3, .59, .11))), .3);
        /* the frontend is on the photo's own key-light side: on skin its light
           only reads where that light already reaches (none into the jaw's
           shadow), on the hair only on its lighter strands (a lavender coat
           over the whole mass reads as dyed hair) */
        float feA = mix(HAIR_FE * smoothstep(.08, .3, lum), smoothstep(.3, .55, lum), sk);
        /* the dark navy shirt below his collar takes none (a lit outline
           there reads as a stroke), and the neck, back under his jaw and in
           its shadow, less of either */
        float shirt = smoothstep(SHIRT_Y.x, SHIRT_Y.y, px.y) * (1. - sk);
        float keep  = (1. - shirt) * (1. - NECK * smoothstep(NECK_Y.x, NECK_Y.y, px.y));
        vec2  rim = mix(rimH, rimS, sk);
        float shn = mix(SHEEN_HAIR * mix(.15, .45, sil) * mix(.12, 1.6, smoothstep(.02, .25, lum)), SHEEN_SKIN, sk)
                  * smoothstep(.15, .75, cv);   // not the matte's soft fringe: no glow beside the hair
        vec3 fe = FE_L * uSide.x, be = BE_L * uSide.y;
        /* the frontend's panel is pale: on his outline its light would only
           read as a pale fringe, so it stays off the silhouette */
        float feS = SHEEN.x * (1. - .3 * sil);
        vec3 add = (alb * (fe * (DIFFUSE.x * dif.x * feA) + be * (DIFFUSE.y * dif.y))
                 + (fe * (feS * rim.x) + be * (SHEEN.y * rim.y)) * shn) * keep;
        /* skin the photo already lights brightly keeps its modelling: the soft
           shoulder would only flatten it to a pale wash */
        add *= 1. - .55 * smoothstep(.55, .95, lum);
        /* the eyeballs keep the photo's light: a faint, near-neutral tint at most */
        float em = m / cv;
        add = mix(add, vec3(dot(add, vec3(.3, .59, .11))) * .2, em);
        /* and a cap on the lift (luminance, by the light's strength): light
           on the turned planes, never a wash over him */
        vec3 lift = shoulder(sqrt(lin + add)) - shoulder(c);
        lift *= min(1., CAP * max(uSide.x, uSide.y) / max(dot(lift, vec3(.3, .59, .11)), 1e-4));
        rgb += lift * cv;
      }
      gl_FragColor = vec4(rgb, cover);
    }`;

  /* ---------------- helpers ---------------- */
  const load = src => new Promise((res, rej) => {
    const i = new Image(); i.decoding = 'async';
    i.onload = () => (i.decode ? i.decode().catch(() => {}) : Promise.resolve()).then(() => res(i));
    i.onerror = rej; i.src = src;
  });
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const rand  = (a, b) => a + Math.random() * (b - a);
  /* critically damped spring, exact step: snappy without overshoot */
  function spring(s, target, w, dt){
    const d = s.x - target, e = Math.exp(-w * dt), c = s.v + w * d;
    s.x = target + (d + c * dt) * e;
    s.v = (s.v - c * w * dt) * e;
  }
  /* soft limit: ~linear for small looks, then a long, smooth approach to 1,
     so a cursor far out still moves the eyes a little further */
  const soft = e => e / Math.sqrt(1 + e * e);
  const ease = u => u * u * (3 - 2 * u);

  /* ---------------- texture sets ----------------
     Where each big layer comes from: rect = the part of the 2021x1696 image
     it holds (x, y, w, h), size = its pixels, pot = the power-of-two texture
     it goes into (top left; the rest transparent, so it can be mipmapped).
     full: the files as they are (desktop, tablets).
     phone: a phone's canvas is at most ~.68 of the image's pixels (dpr capped
     at 2), so the face comes at .624 (1262x1024: from just above his hair
     down, in 2048x1024 instead of 2048²), and the smile and the side hair as
     crops of just where they show (the smile only ever round his mouth, the
     side hair only round his head), at the same scale. The same face at that
     size for about a third of the GPU memory (~62 -> ~23 MB of textures) and
     under half the download. uLodOff etc. map the shader's lookups onto them. */
  const TEX_SETS = {
    full: {
      face:  { rect:[0, 0, 2021, 1696],      size:[2021, 1696], pot:[2048, 2048] },
      smile: { rect:[0, 0, 2021, 1696],      size:[2021, 1696], pot:[2048, 2048] },
      hair:  { rect:[0, HAIR_Y, 2021, 1024], size:[2021, 1024], pot:[2048, 1024] }
    },
    phone: {
      face:  { src:'/img/me-v2-layer-back-2-m.webp', rect:[0, 56, 2021, 1640],   size:[1262, 1024], pot:[2048, 1024] },
      smile: { src:'/img/me-v2-smile-face-2-m.webp', rect:[688, 584, 612, 568],  size:[382, 355],   pot:[512, 512] },
      hair:  { src:'/img/me-v2-layer-hair-m.webp',   rect:[372, 440, 1248, 688], size:[779, 430],   pot:[1024, 512] }
    }
  };
  /* image px -> texture uv: k per image px, o the offset; lod: its level 0 in levels of the full set */
  function texMap(t){
    const sx = t.size[0] / t.rect[2], sy = t.size[1] / t.rect[3];
    return { k:[sx / t.pot[0], sy / t.pot[1]], o:[-t.rect[0] * sx / t.pot[0], -t.rect[1] * sy / t.pot[1]], lod:Math.log2(sx) };
  }
  /* the texture units, fixed (8: WebGL1's guaranteed minimum) */
  const UNITS = { uFace:0, uSmile:1, uHair:2, uSmileFlow:3, uDepth:4, uBoxes:5, uIris:6, uGlint:7 };

  /* ---------------- GL ----------------
     build() starts the shader compile + link and returns at once: the link runs
     in the background (KHR_parallel_shader_compile: asking whether it's done
     doesn't wait) while the textures go up, one per frame (tex); finish() then
     checks it and sets the uniforms. No single long task: a swipe that starts
     while the live portrait is loading doesn't freeze. */
  function build(canvas, SET){
    const gl = canvas.getContext('webgl', GL_ATTRS);
    if(!gl) return null;
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      return s;
    };
    const lod = gl.getExtension('EXT_shader_texture_lod')
      ? '#extension GL_EXT_shader_texture_lod : enable\n#define HAS_LOD\n' : '';
    const par = gl.getExtension('KHR_parallel_shader_compile');
    const prog = gl.createProgram();
    /* SHADE: front^-1(back(x)) as one grade. Each css grade is saturate(s) then
       brightness(b) then contrast(c): c*b*S(s)*x + (1 - c)/2, and saturate
       matrices compose by multiplying s, so front^-1(back(x)) =
       (cB*bB)/(cF*bF)*S(sB/sF)*x + (cF - cB)/2/(cF*bF) */
    const [sF, bF, cF] = GRADE.front, [sB, bB, cB] = GRADE.back;
    const shadeG = [cB * bB / (cF * bF), (cF - cB) / 2 / (cF * bF), sB / sF].map(v => v.toFixed(5)).join(', ');
    const vsh = sh(gl.VERTEX_SHADER, VERT);
    const fsh = sh(gl.FRAGMENT_SHADER, lod + (LAYERS ? '#define LAYERS\n' : '') +
      (SHADE ? '#define SHADE\n#define SHADE_G vec3(' + shadeG + ')\n#define SHADE_SOFT ' + SHADE_SOFT.toFixed(4) + '\n' : '') + FRAG);
    gl.attachShader(prog, vsh); gl.attachShader(prog, fsh);
    gl.linkProgram(prog);
    const linked = () => !par || gl.getProgramParameter(prog, par.COMPLETION_STATUS_KHR);

    /* color: premultiplied, browser colour handling; premul: premultiplied, bytes
       as they are (a 2d canvas of data + colour crops); neither: raw data.
       (An ImageBitmap was decoded with the same choices, see fetchTex.)
       pot: a power-of-two texture of that size, the image in its top left */
    const texs = {};
    function tex(name, src, opt){
      gl.activeTexture(gl.TEXTURE0 + UNITS[name]);
      if(!texs[name]) texs[name] = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texs[name]);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, !!(opt.color || opt.premul));
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, opt.color ? gl.BROWSER_DEFAULT_WEBGL : gl.NONE);
      const fmt = opt.lum ? gl.LUMINANCE : gl.RGBA;
      if(opt.pot){
        gl.texImage2D(gl.TEXTURE_2D, 0, fmt, opt.pot[0], opt.pot[1], 0, fmt, gl.UNSIGNED_BYTE, null);
        if(src) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, fmt, gl.UNSIGNED_BYTE, src);
      } else gl.texImage2D(gl.TEXTURE_2D, 0, fmt, fmt, gl.UNSIGNED_BYTE, src);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      if(opt.mip){ gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); }
      else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      if(src && src.close) src.close();   // an ImageBitmap: its copy is on the GPU now
    }

    function finish(){
      if(!gl.getProgramParameter(prog, gl.LINK_STATUS))
        throw (gl.getShaderInfoLog(vsh) || '') + (gl.getShaderInfoLog(fsh) || '') + (gl.getProgramInfoLog(prog) || '');
      gl.useProgram(prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, 'aPos');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

      const U = name => gl.getUniformLocation(prog, name);
      Object.keys(UNITS).forEach(n => { const u = U(n); if(u) gl.uniform1i(u, UNITS[n]); });
      const mF = texMap(SET.face), mS = texMap(SET.smile), mH = texMap(SET.hair);
      gl.uniform2f(U('uFaceScale'), IMG.w * mF.k[0], IMG.h * mF.k[1]);
      gl.uniform2f(U('uFaceOff'), mF.o[0], mF.o[1]);
      gl.uniform2f(U('uSmileScale'), IMG.w * mS.k[0], IMG.h * mS.k[1]);
      gl.uniform2f(U('uSmileOff'), mS.o[0], mS.o[1]);
      gl.uniform2f(U('uEdgeK'), 2048 * mF.k[0], 2048 * mF.k[1]);
      gl.uniform1f(U('uLodOff'), mF.lod);
      if(LAYERS) gl.uniform4f(U('uHairMap'), IMG.w * mH.k[0], IMG.h * mH.k[1], mH.o[0], mH.o[1]);
      gl.uniform4f(U('uBox'), BOX[0], BOX[1], BOX[2], BOX[3]);
      gl.uniform1f(U('uFocus'), FOCUS);
      EYES.forEach((E, i) => {
        const k = i ? 'B' : 'A';
        const cut = [0, 1].map(j => Math.round(E.c[j] + E.glint[j]) - GLINT_CELL / 2 - E.c[j]);
        gl.uniform4f(U('uEye' + k), E.c[0], E.c[1], E.r, 0);
        gl.uniform4f(U('uSpan' + k), E.span[0], E.span[1], cut[0], cut[1]);
        gl.uniform4f(U('uUp' + k + '0'), E.up[0], E.up[1], E.up[2], E.up[3]);
        gl.uniform4f(U('uUp' + k + '1'), E.up[4], E.up[5], E.up[6], 0);
        gl.uniform4f(U('uLo' + k + '0'), E.lo[0], E.lo[1], E.lo[2], E.lo[3]);
        gl.uniform4f(U('uLo' + k + '1'), E.lo[4], E.lo[5], E.lo[6], 0);
      });
      return { gl, tex, uPar:U('uPar'), uSide:U('uSide'), uBlink:U('uBlink'), uSmileT:U('uSmileT'), uLod:U('uLod'), uFine:U('uFine'),
               uSeam:U('uSeam'), uGaze:[U('uGazeA'), U('uGazeB')] };
    }
    return { gl, tex, linked, finish };
  }

  /* ---------------- boot ---------------- */
  /* start fetching once the static portrait (the LCP) is in */
  const first = fallback[0];
  /* no WebGL at all: nothing to load, the static portrait stays */
  const glCanvas = document.createElement('canvas');
  const KEYS = ['face', 'smile', 'smileFlow', 'depth', 'sclera', 'maps', 'lids', 'lidFlow', 'iris', 'glint'].concat(LAYERS ? ['hair'] : []);
  /* phones and tablets (no hover, a coarse pointer): see the backing store below */
  const coarse = matchMedia('(hover:none) and (pointer:coarse)').matches;
  const dpr = Math.min(devicePixelRatio || 1, coarse ? 2 : 3);
  /* the phone set where the canvas comes out at most ~.7 of the image's pixels
     (a phone, either way up: the portrait is at most 580px tall there) */
  /* (debug: #texset=full / #texset=phone forces one) */
  const forced = (location.hash.match(/texset=(full|phone)/) || [])[1];
  const SET = forced ? TEX_SETS[forced] : headLayer && coarse && Math.max(screen.width, screen.height) <= 1000 &&
              first.offsetHeight * dpr <= IMG.h * .7 ? TEX_SETS.phone : TEX_SETS.full;
  /* banner.js starts the intro sweep on 'depth:ready' (his face is up, the
     smile is in) and falls back to its timers on 'depth:fail' */
  window.__depthState = 'pending';
  const signal = ok => {
    if(window.__depthState !== 'pending') return;
    window.__depthState = ok ? 'ready' : 'fail';
    hero.dispatchEvent(new CustomEvent(ok ? 'depth:ready' : 'depth:fail'));
  };
  /* each file decoded off the main thread into an ImageBitmap where the browser
     can (with the colour + alpha handling tex() asks for: colour layers
     premultiplied, data raw, the eye crops as an img would draw), else an img */
  const KIND = { face:'color', smile:'color', hair:'color', iris:'color', glint:'color', smileFlow:'raw', depth:'raw' };
  const BITMAP = { color:{ premultiplyAlpha:'premultiply', colorSpaceConversion:'default' }, raw:{ premultiplyAlpha:'none', colorSpaceConversion:'none' } };
  function fetchTex(k){
    const t = SET[k], src = (t && t.src) || SRC[k];
    /* the full set's side hair: its band of rows of the full-size file */
    const crop = t && !t.src && (t.rect[1] || t.rect[3] !== IMG.h) ? t.rect : null;
    const viaImg = () => load(src).then(im => {
      if(!crop) return im;
      const c = document.createElement('canvas');
      c.width = crop[2]; c.height = crop[3];
      c.getContext('2d').drawImage(im, -crop[0], -crop[1]);
      return c;
    });
    if(typeof createImageBitmap !== 'function' || typeof fetch !== 'function') return viaImg();
    const o = BITMAP[KIND[k]] || {};
    return fetch(src).then(r => { if(!r.ok) throw r.status; return r.blob(); })
      .then(b => crop ? createImageBitmap(b, crop[0], crop[1], crop[2], crop[3], o) : createImageBitmap(b, o))
      .catch(viaImg);
  }
  const start = () => {
    if(!glCanvas.getContext('webgl', GL_ATTRS)) return Promise.reject();
    return Promise.all(KEYS.map(fetchTex));
  };
  const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));
  let canvases = [];
  (first.complete ? start() : new Promise(r => first.addEventListener('load', r, { once:true })).then(start))
  .then(async list => {
    const imgs = {};
    KEYS.forEach((k, i) => { imgs[k] = list[i]; });
    const b = build(glCanvas, SET);
    if(!b) throw 0;
    /* one upload per frame; the smile goes up last, after the first frame (it's
       only needed once he looks sideways: draw() holds it at 0 till then) */
    const steps = [
      () => b.tex('uFace', imgs.face, { color:true, mip:true, pot:SET.face.pot }),
      LAYERS && (() => b.tex('uHair', imgs.hair, { color:true, mip:true, pot:SET.hair.pot })),
      () => { b.tex('uSmileFlow', imgs.smileFlow, {}); b.tex('uDepth', imgs.depth, { lum:!LAYERS }); },
      /* the four eye crops share the BOX: one texture, stacked (so with LAYERS
         it's 8 texture units, WebGL1's guaranteed minimum). Through a 2d canvas the closed lids
         come out premultiplied, as the shader composites them; the rest is
         opaque, its bytes untouched */
      () => {
        const crops = document.createElement('canvas');
        crops.width = BOX[2]; crops.height = BOX[3] * 4;
        const c2 = crops.getContext('2d');
        [imgs.sclera, imgs.maps, imgs.lids, imgs.lidFlow].forEach((im, i) => { c2.drawImage(im, 0, i * BOX[3]); if(im.close) im.close(); });
        b.tex('uBoxes', crops, { premul:true });
        crops.width = crops.height = 0;
      },
      () => {
        b.tex('uIris',  imgs.iris,  { color:true, mip:true });
        b.tex('uGlint', imgs.glint, { color:true });
        b.tex('uSmile', null, { color:true, mip:true, pot:[1, 1] });   // transparent till the smile's file goes up
      }
    ].filter(Boolean);
    for(const step of steps){ step(); await nextFrame(); }
    while(!b.linked()) await nextFrame();

    let view;
    try { view = b.finish(); } catch(err){ view = null; }
    /* the GL canvas goes in after the img (or after its <picture>): in the
       head layer. The old markup: in the front panel, a 2d mirror in the back */
    canvases = [...fallback].map((img, i) => {
      const c = i ? document.createElement('canvas') : glCanvas;
      c.className = 'portrait portrait-live';
      c.setAttribute('aria-hidden', 'true');
      (img.parentElement.tagName === 'PICTURE' ? img.parentElement : img).insertAdjacentElement('afterend', c);
      return c;
    });
    const mirror = canvases[1] || null;
    const ctx = view && mirror ? mirror.getContext('2d') : null;
    if(!view || (mirror && !ctx)){ canvases.forEach(c => c.remove()); signal(false); return; }
    const gl = view.gl;
    let smileReady = false;

    /* backing store = layout size x dpr (pre-transform: the zoom-out scale
       mustn't shrink it), never more than the image's own pixels.
       Phones and tablets (no hover, a coarse pointer) stop at 2x: on a 3x
       phone the portrait would take all 3.4 Mpx of the image, every frame of
       a touch look, on a GPU a few times slower than a laptop's, for detail
       that screen barely shows at arm's length.
       At a fractional dpr (Windows 125% / 150%) a frame that isn't exactly
       on the device pixel grid gets resampled once more by the browser and
       goes soft next to the img: the size comes from the browser's own
       device-pixel box where it has one, and both canvases are nudged
       (< 1 device px) onto whole device pixels. */
    /* (dpr: set at boot, above) */
    let devBox = null, nudge = [0, 0];
    /* the canvas's on-screen rect, cached (canvasRect, below). Declared up here:
       snap() clears it, and snap() already runs at boot on fractional dprs */
    let rectC = null;
    /* layout widths in css px (before the zoom-out's scale), for the seam's x
       in the shader (the shade): the canvas's box and the hero's */
    let boxW = 0, heroW = hero.clientWidth;
    function resize(){
      const cs = getComputedStyle(glCanvas);
      boxW = parseFloat(cs.width); const boxH = parseFloat(cs.height);
      const w = Math.min(IMG.w, devBox ? devBox[0] : Math.round(boxW * dpr));
      const h = Math.min(IMG.h, devBox ? devBox[1] : Math.round(boxH * dpr));
      if(w < 2 || h < 2 || (glCanvas.width === w && glCanvas.height === h)) return false;
      glCanvas.width = w; glCanvas.height = h;
      if(mirror){ mirror.width = w; mirror.height = h; }
      measureCut();
      return true;
    }
    /* only the part of the canvas its panel shows gets drawn: on a phone the
       portrait is wider than the screen, and ~40% of it sits outside the hero.
       Measured as a share of the canvas, against the panel that clips it, so
       the zoom-out (a scale on an ancestor of both) can't change it.
       cut: [x, y, w, h] in backing-store px from the top left; null = all */
    let cut = null;
    function measureCut(){
      const c = glCanvas.getBoundingClientRect(), p = glCanvas.parentElement.getBoundingClientRect();
      const W = glCanvas.width, H = glCanvas.height;
      if(c.width < 1 || c.height < 1) return false;
      const x0 = clamp(Math.floor((p.left   - c.left) / c.width  * W) - 2, 0, W - 1);
      const x1 = clamp(Math.ceil ((p.right  - c.left) / c.width  * W) + 2, x0 + 1, W);
      const y0 = clamp(Math.floor((p.top    - c.top)  / c.height * H) - 2, 0, H - 1);
      const y1 = clamp(Math.ceil ((p.bottom - c.top)  / c.height * H) + 2, y0 + 1, H);
      const n = x0 > 0 || y0 > 0 || x1 < W || y1 < H ? [x0, y0, x1 - x0, y1 - y0] : null;
      if(String(n) === String(cut)) return false;
      cut = n;
      return true;
    }
    function snap(){
      const r = glCanvas.getBoundingClientRect();
      if(Math.abs(r.width - parseFloat(getComputedStyle(glCanvas).width)) > .01) return;  // mid zoom-out: not now
      const x = (r.left - nudge[0]) * dpr, y = (r.top + scrollY - nudge[1]) * dpr;
      const n = [(Math.round(x) - x) / dpr, (Math.round(y) - y) / dpr];
      if(Math.abs(n[0] - nudge[0]) < 1e-3 && Math.abs(n[1] - nudge[1]) < 1e-3) return;
      nudge = n; rectC = null;
      canvases.forEach(c => { c.style.translate = 'calc(-50% + ' + n[0].toFixed(4) + 'px) ' + n[1].toFixed(4) + 'px'; });
    }
    resize();
    if(dpr % 1) snap();

    /* ---------------- motion state ---------------- */
    const eyes = EYES.map(() => ({ x:{x:0, v:0}, y:{x:0, v:0}, tx:0, ty:0 }));
    const head = { x:{x:0, v:0}, y:{x:0, v:0}, tx:0, ty:0 };
    const fix = { x:0, y:0 };              // fixational micro-saccade offset
    const glance = { x:0, y:0 };           // idle glance away from the viewer
    let mode = 'viewer';                    // 'viewer' | 'point'
    let pt = { x:0, y:0 }, pointerType = 'mouse', lastMove = 0, scrollUntil = 0, release = null;
    let prevTx = 0, prevTy = 0;
    let blinkT0 = -1, blinkC = 0, blinkH = 0, blinkO = 0, blinkShut = false, lastBlink = 0, blinkHold = null;
    const smile = { x:0, v:0 };
    let smileHold = null;
    let sideT = .5, raf = null, last = 0, visible = true, timers = {}, dbg = null, light = LIGHT;

    function seamT(){
      const v = parseFloat(hero.style.getPropertyValue('--t'));
      return isNaN(v) ? .5 : v;
    }

    /* where each eye has to point: its own direction to the cursor, less the
       turn the head has made so far (so the eyes ease back as the head comes
       round), less its direction to the viewer (who sits straight in front
       of the face, so the photo's own gaze = looking at you). The cursor
       counts as nearer than the viewer, so near the face the eyes converge
       on it and look AT it, not through it. */
    /* the canvas's on-screen rect, read once and kept until a scroll, a resize
       or a nudge moves it (a drag doesn't re-measure it every frame) */
    const canvasRect = () => rectC || (rectC = glCanvas.getBoundingClientRect());
    function aim(){
      const r = canvasRect();
      const k = r.width / IMG.w;
      const Z = VIEW_DIST * (EYES[1].c[0] - EYES[0].c[0]) * k, Zc = Z * NEAR;
      const mx = r.left + (EYES[0].c[0] + EYES[1].c[0]) / 2 * k;
      const my = r.top  + (EYES[0].c[1] + EYES[1].c[1]) / 2 * k;
      /* a finger (or the intro sweep) counts as TOUCH_DIST of the cursor's
         distance away: its offset from his face scaled up, so a tap at the edge
         of a phone turns his head as far as the desktop's edge does (and he
         smiles); on his face it's the same point, so he converges the same */
      const near = pointerType === 'touch' || pointerType === 'sweep';
      const p = near ? { x:mx + (pt.x - mx) / TOUCH_DIST, y:my + (pt.y - my) / TOUCH_DIST } : pt;
      /* the head turns toward it: slower, smaller, saturating */
      const ax = Math.atan2(p.x - mx, Z), ay = Math.atan2(p.y - my, Math.hypot(p.x - mx, Z));
      head.tx = PAR_MAX.x * Math.tanh(ax / HEAD_FULL);
      head.ty = PAR_MAX.y * Math.tanh(ay / HEAD_FULL);
      const hx = head.x.x * HEAD_RAD, hy = head.y.x * HEAD_RAD;
      EYES.forEach((E, i) => {
        const ex = r.left + E.c[0] * k, ey = r.top + E.c[1] * k;
        const dx = p.x - ex, dy = p.y - ey;
        let ox = EYEBALL_R * (Math.sin(Math.atan2(dx, Zc) - hx) - Math.sin(Math.atan2(mx - ex, Z)));
        let oy = EYEBALL_R *  Math.sin(Math.atan2(dy, Math.hypot(dx, Zc)) - hy);
        const lim = Math.hypot(ox / GAZE_MAX.x, oy / (oy < 0 ? GAZE_MAX.up : GAZE_MAX.down));
        if(lim > 1e-6){ const s = soft(lim) / lim; ox *= s; oy *= s; }
        eyes[i].tx = ox; eyes[i].ty = oy;
      });
    }
    function aimViewer(){
      eyes.forEach(e => { e.tx = glance.x; e.ty = glance.y; });
      head.tx = PAR_MAX.x * .3 * glance.x / GAZE_MAX.x;
      head.ty = PAR_MAX.y * .3 * glance.y / GAZE_MAX.up;
    }

    /* blink: the lid accelerates down (fastest as it meets the lower lid), a
       beat shut, then a quick lift and a slow settle. From SEAL on it's drawn
       shut, and a blink always gets at least one shut frame, however slow the
       frames come */
    function blinkAmount(now){
      if(blinkHold !== null) return blinkHold;
      if(blinkT0 < 0) return 0;
      const t = now - blinkT0, up = blinkC + blinkH, end = up + blinkO;
      if(t >= blinkC && t < end && !blinkShut) return 1;
      if(t >= end){ blinkT0 = -1; return 0; }
      let u = t < blinkC ? t / blinkC : t < up ? 1 : 1 - (t - up) / blinkO;
      u *= u;
      return u >= SEAL ? 1 : u;
    }
    function blink(now){
      now = now || performance.now();
      if(blinkT0 >= 0 || now - lastBlink < 300) return;
      blinkT0 = now; lastBlink = now; blinkShut = false;
      blinkC = rand(...BLINK.close); blinkH = rand(...BLINK.hold); blinkO = rand(...BLINK.open);
      if(Math.random() < .12) later('double', () => blink(), blinkC + blinkH + blinkO + rand(90, 160));
      kick();
    }
    /* the smile: straight face looking ahead, smiling as he looks sideways at
       the frontend or backend. Only when he follows the cursor or a finger;
       his idle glances away stay straight-faced */
    function smileTarget(){
      if(mode !== 'point') return 0;
      /* the head's turn toward the point, not the eyes: near the face the eyes
         converge hard on the cursor, the head only turns once it's out over a side */
      const g = Math.abs(head.tx) / PAR_MAX.x;
      const u = clamp((g - SMILE_GAZE[0]) / (SMILE_GAZE[1] - SMILE_GAZE[0]), 0, 1);
      return u * u * (3 - 2 * u);
    }
    function smileAmount(){
      return smileHold !== null ? smileHold : clamp(smile.x, 0, 1);
    }

    function frame(ts){
      raf = null;
      if(!visible) return;
      /* the shade is drawn at banner.js's seam of this very frame; it says
         whether that seam is still gliding (then so is the shade) */
      const gliding = SHADE && window.__seamSync ? window.__seamSync(ts) : false;
      /* phones + tablets: his idle life (blinks, glances, the eyes' tiny hops)
         at IDLE_FPS. A finger, the intro sweep or a gliding seam: every frame */
      if(coarse && mode === 'viewer' && !gliding && last && ts - last < 1000 / IDLE_FPS - 4){ raf = requestAnimationFrame(frame); return; }
      const dt = last ? Math.min((ts - last) / 1000, 1 / 20) : 1 / 60; last = ts;
      const now = performance.now();

      if(mode === 'point') aim(); else aimViewer();
      /* a big sudden jump of the target (not a cursor sweep) often comes with a blink */
      const jump = Math.hypot(eyes[0].tx - prevTx, eyes[0].ty - prevTy);
      prevTx = eyes[0].tx; prevTy = eyes[0].ty;
      if(jump > 8 && now - lastBlink > 1500 && Math.random() < .5) blink(now);

      eyes.forEach(e => {
        spring(e.x, e.tx + fix.x, EYE_W, dt);
        spring(e.y, e.ty + fix.y, EYE_W, dt);
      });
      spring(head.x, head.tx, HEAD_W, dt);
      spring(head.y, head.ty, HEAD_W, dt);
      const st = seamT();
      sideT += (st - sideT) * (1 - Math.pow(1 - 1/6, dt * 60));
      const b = blinkAmount(now);
      const sT = smileTarget();
      spring(smile, sT, SMILE_W, dt);

      draw(b, smileAmount());

      /* keep going while anything still moves by a visible amount: settle
         thresholds are ~1/8 of a device pixel on screen (eyes in image px,
         the head in uv at the farthest depth) */
      const k = glCanvas.width / IMG.w, eE = SETTLE / k, eH = SETTLE / (k * IMG.w * FOCUS);
      const busy = eyes.some(e => Math.abs(e.x.x - e.tx - fix.x) + Math.abs(e.y.x - e.ty - fix.y) > eE ||
                                  Math.abs(e.x.v) + Math.abs(e.y.v) > eE * EYE_W) ||
                   Math.abs(head.x.x - head.tx) + Math.abs(head.y.x - head.ty) > eH ||
                   Math.abs(head.x.v) + Math.abs(head.y.v) > eH * HEAD_W ||
                   Math.abs(st - sideT) > 1e-3 || gliding || blinkT0 >= 0 || now < scrollUntil ||
                   Math.abs(smile.x - sT) + Math.abs(smile.v) / SMILE_W > 2e-3;
      /* blink() above may have queued a frame already: never a second chain */
      if(busy){ if(!raf) raf = requestAnimationFrame(frame); }
      else if(!raf) last = 0;
    }
    function draw(b, s){
      gl.viewport(0, 0, glCanvas.width, glCanvas.height);
      const px = IMG.w / glCanvas.width;
      const lod = Math.log2(px);
      gl.uniform1f(view.uLod, lod);
      /* the full-detail samples sit a bit under the nominal LOD (crisper hair,
         lashes); and while the half-size mip is still smaller than the canvas
         (px < 2: the fractional dprs), blending it in only blurs, so they stay
         near the full-res level there */
      gl.uniform1f(view.uFine, (px < 2 ? Math.min(lod, .55) : lod) - .3);
      gl.uniform2f(view.uPar, head.x.x, head.y.x);
      /* the panels' light: the base from both, and the side the seam moves
         over to brightens while the other dims (sideT is eased already; this
         eases it in and out once more) */
      const u = clamp((sideT - .5) / .3, -1, 1), be = ease(Math.max(u, 0)), fe = ease(Math.max(-u, 0));
      gl.uniform2f(view.uSide, light * (LIGHT_BASE + (1 - LIGHT_BASE) * fe - LIGHT_BASE * LIGHT_FADE * be),
                               light * (LIGHT_BASE + (1 - LIGHT_BASE) * be - LIGHT_BASE * LIGHT_FADE * fe));
      gl.uniform1f(view.uBlink, b);
      gl.uniform1f(view.uSmileT, smileReady ? s : 0);
      eyes.forEach((e, i) => {
        const g = Math.hypot(e.x.x, e.y.x) / EYEBALL_R;
        const fs = 1 / Math.sqrt(1 - Math.min(g * g, .8)) - 1;
        gl.uniform4f(view.uGaze[i], e.x.x, e.y.x, LID_FOLLOW * e.y.x, fs);
      });
      /* the seam's x (--t: the css .divider sits at (1 - t) of the hero's
         width) in canvas uv; the canvas: centred on the hero, plus the nudge */
      if(SHADE && boxW > 0){
        const x0 = (heroW - boxW) / 2 + nudge[0];
        gl.uniform1f(view.uSeam, ((1 - seamT()) * heroW - x0) / boxW);
      }
      if(cut){ gl.enable(gl.SCISSOR_TEST); gl.scissor(cut[0], glCanvas.height - cut[1] - cut[3], cut[2], cut[3]); }
      else gl.disable(gl.SCISSOR_TEST);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if(ctx){
        ctx.globalCompositeOperation = 'copy';
        if(cut) ctx.drawImage(glCanvas, cut[0], cut[1], cut[2], cut[3], cut[0], cut[1], cut[2], cut[3]);
        else ctx.drawImage(glCanvas, 0, 0);
      }
      if(b >= 1) blinkShut = true;
      if(dbg && dbg.onDraw) dbg.onDraw(b, s);
    }
    function kick(){ if(!raf && visible) raf = requestAnimationFrame(frame); }

    /* ---------------- life: blinks, micro-saccades, glances ---------------- */
    function later(name, fn, ms){ clearTimeout(timers[name]); timers[name] = setTimeout(fn, ms); }
    function nextBlink(){
      later('blink', () => { blink(); nextBlink(); }, rand(2600, 6800));
    }
    /* fixation is never dead still: tiny hops; looking at you they alternate
       between your two eyes */
    function nextMicro(){
      later('micro', () => {
        let x, y;
        if(mode === 'viewer' && !glance.x && !glance.y){
          x = (fix.x > 0 ? -1 : 1) * rand(.9, 1.5); y = rand(-.5, .5);
        } else { x = rand(-.7, .7); y = rand(-.5, .5); }
        /* a hop under ~.7 device px can't be seen (1x screens): skip it
           rather than redraw the frame for nothing */
        if(Math.hypot(x - fix.x, y - fix.y) * glCanvas.width / IMG.w >= .7){ fix.x = x; fix.y = y; kick(); }
        nextMicro();
      }, rand(700, 2300));
    }
    /* no cursor (touch, parked, or it left the window): now and then he
       glances away and comes back */
    function nextGlance(){
      later('glance', () => {
        if(mode === 'viewer'){
          const side = Math.random() < .5 ? -1 : 1;
          glance.x = side * rand(5, 11); glance.y = rand(-4, 3);
          if(Math.random() < .35) blink();
          kick();
          later('glanceBack', () => { glance.x = glance.y = 0; kick(); }, rand(600, 1500));
        }
        nextGlance();
      }, rand(3500, 8500));
    }
    /* a parked cursor: after a while he looks back at you */
    function nextRest(){
      later('rest', () => {
        if(mode === 'point' && pointerType === 'mouse' && performance.now() - lastMove > CURSOR_REST){
          mode = 'viewer'; kick();
        }
        nextRest();
      }, 1000);
    }
    function life(on){
      Object.keys(timers).forEach(k => clearTimeout(timers[k]));
      if(on){ nextBlink(); nextMicro(); nextGlance(); nextRest(); }
    }

    /* ---------------- input ---------------- */
    function lookAt(x, y, type){
      clearTimeout(release);
      pointerType = type; pt.x = x; pt.y = y;
      lastMove = performance.now();
      if(mode !== 'point'){ mode = 'point'; glance.x = glance.y = 0; }
      kick();
    }
    function lookAtViewer(){ mode = 'viewer'; kick(); }
    /* the intro sweep (banner.js): he looks out over the frontend ('fe') or
       the backend ('be') side, at eye height, as a finger near that edge would
       make him (so he smiles), or back at you (null). A real touch takes over */
    window.__heroGaze = side => {
      if(pointerType === 'touch' && mode === 'point') return;
      if(!side){ if(pointerType === 'sweep') lookAtViewer(); return; }
      const r = canvasRect(), h = heroBox || (heroBox = hero.getBoundingClientRect());
      const y = r.top + (EYES[0].c[1] + EYES[1].c[1]) / 2 * r.height / IMG.h;
      lookAt(side === 'fe' ? h.left + h.width * .06 : h.right - h.width * .06, y, 'sweep');
    };
    let heroBox = null;
    addEventListener('scroll', () => { heroBox = null; }, { passive:true });
    addEventListener('resize', () => { heroBox = null; });
    window.addEventListener('pointermove', e => {
      if(e.pointerType === 'mouse' || e.pointerType === 'pen') lookAt(e.clientX, e.clientY, e.pointerType);
    }, { passive:true });
    /* the cursor left the window (out to nowhere), or the window lost focus */
    document.addEventListener('mouseout', e => { if(!e.relatedTarget) lookAtViewer(); });
    window.addEventListener('blur', lookAtViewer);
    /* touch: the eyes follow the finger while it's down on the banner, then
       hold a moment and come back to you */
    hero.addEventListener('pointerdown', e => { if(e.pointerType === 'touch') lookAt(e.clientX, e.clientY, 'touch'); }, { passive:true });
    hero.addEventListener('pointermove', e => { if(e.pointerType === 'touch') lookAt(e.clientX, e.clientY, 'touch'); }, { passive:true });
    hero.addEventListener('pointerup', e => {
      if(e.pointerType === 'touch'){ clearTimeout(release); release = setTimeout(lookAtViewer, 1400); }
    });
    hero.addEventListener('pointercancel', e => { if(e.pointerType === 'touch') lookAtViewer(); });
    /* the face moves under a still cursor while the page scrolls / the card zooms */
    window.addEventListener('scroll', () => {
      rectC = null;
      if(mode !== 'point') return;
      scrollUntil = performance.now() + 1200;    // the scrubbed zoom trails the scroll
      if(pointerType === 'mouse') lastMove = performance.now();   // wheeling counts as moving: he keeps looking at it
      kick();
    }, { passive:true });
    /* the panels' light follows --t, which banner.js writes on the hero */
    new MutationObserver(kick).observe(hero, { attributes:true, attributeFilter:['style'] });
    /* and the seam's x (the shade): banner.js calls this as it starts a glide,
       so the first frame of it is drawn here too, not a frame late (the
       observer above only hears of it once banner.js's frame has run) */
    if(SHADE) window.__seamKick = kick;
    /* resizing clears the canvas: redraw at once, before the frame paints */
    const ro = new ResizeObserver(es => {
      /* trusted only when it agrees with layout x dpr (emulated dprs report css px) */
      const d = es[0].devicePixelContentBoxSize, c = es[0].contentBoxSize;
      devBox = d && d[0] && c && c[0] && Math.abs(d[0].inlineSize - c[0].inlineSize * dpr) < 1.5 &&
               Math.abs(d[0].blockSize - c[0].blockSize * dpr) < 1.5 ? [d[0].inlineSize, d[0].blockSize] : null;
      rectC = null;
      if(dpr % 1) snap();
      if(resize()) redraw();
      kick();
    });
    addEventListener('resize', () => { rectC = null; });
    try { ro.observe(glCanvas, { box:'device-pixel-content-box' }); } catch(err){ ro.observe(glCanvas); }
    if(dpr % 1) addEventListener('resize', snap);
    /* the panel can change size without the canvas (a narrower window): a part
       of the canvas that comes into view has never been drawn, so at once */
    function redraw(){ const now = performance.now(); draw(blinkAmount(now), smileAmount(now)); }
    new ResizeObserver(() => {
      rectC = null;
      const hw = hero.clientWidth, moved = hw !== heroW;
      heroW = hw;
      if(measureCut() || (SHADE && moved)) redraw();
    }).observe(glCanvas.parentElement);

    /* pause offscreen and in background tabs */
    let lost = false;
    function setVisible(v){
      v = v && !document.hidden && !lost;
      if(v === visible) return;
      visible = v; last = 0;
      if(v){ life(true); kick(); } else { life(false); if(raf){ cancelAnimationFrame(raf); raf = null; } }
    }
    let inView = true;
    new IntersectionObserver(es => { inView = es[0].isIntersecting; setVisible(inView); }).observe(hero);
    document.addEventListener('visibilitychange', () => setVisible(inView));

    /* a lost context (GPU reset): back to the static img for good */
    glCanvas.addEventListener('webglcontextlost', () => {
      lost = true; setVisible(false); hero.classList.remove('depth-on');
      canvases.forEach(c => c.remove());
      signal(false);
    });

    /* debug (#eyedebug): freeze a blink amount (raw b, no SEAL) or a smile t,
       or try another LIGHT (null lets go), blink now, aim at a point;
       onDraw(b, t) sees every frame */
    if(location.hash.indexOf('eyedebug') >= 0){
      dbg = window.__eyes = {
        blink(v){ blinkHold = v == null ? null : v; kick(); },
        smile(v){ smileHold = v == null ? null : v; kick(); },
        light(v){ light = v == null ? LIGHT : v; kick(); },
        blinkNow(){ blink(); },
        onDraw: null,
        lookAt(x, y){ lookAt(x, y, 'mouse'); },
        viewer: lookAtViewer,
        state: () => ({ mode, eyes:eyes.map(e => [e.x.x, e.y.x]), head:[head.x.x, head.y.x],
                        blink:blinkAmount(performance.now()), smile:smileAmount(performance.now()) })
      };
    }

    /* first frame (neutral, like the img: only the panels' light is new, and
       the fade brings it up), then swap it in for the static img (css fades
       it over) once the img's entrance animation is done, so nothing jumps */
    draw(0, 0);
    const entrance = first.getAnimations ? first.getAnimations().map(a => a.finished.catch(() => {})) : [];
    Promise.all(entrance).then(() => requestAnimationFrame(() => {
      hero.classList.add('depth-on');
      if(visible){ life(true); kick(); }
      /* the smile's texture, a frame later; then banner.js may start the sweep */
      requestAnimationFrame(() => {
        if(lost) return;
        view.tex('uSmile', imgs.smile, { color:true, mip:true, pot:SET.smile.pot });
        imgs.smile = null; smileReady = true;
        kick();
        signal(true);
      });
    }));
  }).catch(() => {   /* the static portrait stays */
    canvases.forEach(c => c.remove());
    hero.classList.remove('depth-on');
    signal(false);
  });
})();
