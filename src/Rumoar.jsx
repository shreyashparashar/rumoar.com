import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";

/* ============================================================================
   RUMOAR — v3
   ----------------------------------------------------------------------------
   §0  MEDIA ENGINE   host-agnostic resolver (Supabase Storage / CDN / local)
   §1  MANIFEST       every image + video slot in the site, in one object
   §2  DATA           eras · brands · looks · copy
   §3  SYSTEM         tokens, grid, type, glass, motion tiers
   §4  MOTION         one rAF loop · frame-rate-independent damping ·
                      imperative transforms (zero React re-renders per frame)
   §5  PRIMITIVES     Media (img/video/canvas-sequence) · Reveal · Lines · Magnetic
   §6  SITE           Intro · Nav · Hero · Timeline · Film · Market · Matrix ·
                      Dive · WhiteSpace · RumoarAct · Threshold
   §7  LAB            separate route, separate atmosphere
   §8  APP

   THE THREE DECISIONS THAT MAKE IT FEEL LIKE APPLE:
   1. Nothing scroll-linked touches React state. Values are written straight to
      element.style inside one rAF loop — no reconciliation, no dropped frames
      on 120Hz ProMotion.
   2. Every scroll value is damped with `1 - e^(-λΔt)`, which is frame-rate
      independent, so 60Hz and 120Hz feel identical rather than twice as fast.
   3. The film is a scroll-scrubbed video, not a 200-image flipbook. Apple moved
      off image sequences for exactly this reason: one compressed file, GPU
      decode, a fraction of the payload. Sequences remain supported on canvas
      for when you need true per-frame control.
========================================================================== */

/* ==========================================================================
   §0  MEDIA ENGINE
   --------------------------------------------------------------------------
   Point MEDIA at wherever your files live. Three options, priority order:

   A) SUPABASE STORAGE (recommended — fill in two fields and you're done)
        supabase: { ref: "abcdefgh1234", bucket: "rumoar-media" }
      Public URL becomes
        https://<ref>.supabase.co/storage/v1/object/public/<bucket>/<path>
      With `transform: true` (Supabase Pro) images route through
        /storage/v1/render/image/public/...?width=&quality=&resize=cover
      which auto-serves WebP and lets srcset request real sizes.
      Transforms apply to images only — video always uses the object URL,
      which supports HTTP range requests, so scrubbing seeks properly.

   B) ANY CDN — base: "https://cdn.yoursite.com/"
   C) LOCAL   — leave supabase.ref empty; paths resolve against /public/assets
========================================================================== */
const MEDIA = {
  supabase: { ref: "", bucket: "rumoar-media" },   // ← paste your project ref
  base: "/assets/",                                 // used when supabase.ref is empty
  transform: false,                                 // true on Supabase Pro
  widths: [640, 1024, 1600, 2400],
  quality: 82,
};

const isAbs = (p) => /^(https?:)?\/\//.test(p || "");

function url(path) {
  if (!path) return null;
  if (isAbs(path)) return path;
  const { ref, bucket } = MEDIA.supabase;
  if (ref) return `https://${ref}.supabase.co/storage/v1/object/public/${bucket}/${path}`;
  return `${MEDIA.base}${path}`;
}

function imgUrl(path, w) {
  const { ref, bucket } = MEDIA.supabase;
  if (path && !isAbs(path) && ref && MEDIA.transform && w) {
    return `https://${ref}.supabase.co/storage/v1/render/image/public/${bucket}/${path}` +
      `?width=${w}&quality=${MEDIA.quality}&resize=cover`;
  }
  return url(path);
}

function srcSet(path) {
  if (!path || isAbs(path) || !MEDIA.supabase.ref || !MEDIA.transform) return undefined;
  return MEDIA.widths.map((w) => `${imgUrl(path, w)} ${w}w`).join(", ");
}

/* Asset descriptors -------------------------------------------------------
   img(path, alt, focus, fit)             still image
   vid(path, { poster, scrub, loop })     video — scrub:true = scroll-driven
   seq(prefix, count, { pad, ext })       numbered frames drawn to <canvas>
   Any slot accepts any of the three; <Media> detects and adapts.
------------------------------------------------------------------------- */
const img = (path, alt = "", focus = "50% 50%", fit = "cover") =>
  ({ kind: "image", path, alt, focus, fit });

const vid = (path, o = {}) => ({
  kind: "video", path, alt: o.alt || "", focus: o.focus || "50% 50%", fit: o.fit || "cover",
  poster: o.poster || null, scrub: !!o.scrub, loop: o.loop !== false,
});

const seq = (prefix, count, o = {}) => ({
  kind: "sequence", prefix, count, pad: o.pad ?? 4, ext: o.ext || "jpg",
  alt: o.alt || "", fit: o.fit || "cover",
});

/* ==========================================================================
   §1  MANIFEST — the only block you edit when media arrives
   Bucket layout mirrors these paths exactly:
     hero/ timeline/ film/ editorial/ brands/ lab/looks/ lab/thumbs/ lab/character/
========================================================================== */
const M = {
  hero: {
    /* Swap the line below for whatever you upload:
       full-page video   vid("hero/hero.mp4", { poster: "hero/poster.jpg" })
       scrubbed video    vid("hero/hero.mp4", { poster: "...", scrub: true })
       still photograph  img("hero/plate.jpg", "…", "62% 38%")               */
    plate: img("hero/poster.jpg", "RUMOAR hero", "62% 38%"),
    figure: img("hero/figure.png", "Hero cutout figure", "50% 100%", "contain"),
  },

  timeline: {
    1900: img("timeline/1900.jpg", "1900 — the man", "50% 26%"),
    1970: img("timeline/1970.jpg", "1970 — the man", "50% 26%"),
    2000: img("timeline/2000.jpg", "2000 — the man", "50% 26%"),
    2010: img("timeline/2010.jpg", "2010 — the man", "50% 26%"),
    2020: img("timeline/2020.jpg", "2020 — the man", "50% 26%"),
    2026: img("timeline/2026.jpg", "2026 — the man", "50% 26%"),
  },

  /* The scroll-scrubbed film. Video preferred; for per-frame control use:
       film: seq("film/frame-", 120, { pad: 4, ext: "jpg" })                 */
  film: vid("film/film.mp4", { poster: "film/poster.jpg", scrub: true, alt: "The week" }),

  editorial: {
    silence1: img("editorial/silence-01.jpg", "After the timeline", "50% 42%"),
    silence2: img("editorial/silence-02.jpg", "Before the white space", "50% 44%"),
    reveal: img("editorial/reveal.jpg", "RUMOAR reveal", "58% 30%"),
    threshold: img("editorial/threshold.jpg", "Threshold", "50% 38%"),
  },

  brands: {
    "van-heusen": img("brands/van-heusen.jpg"), "louis-philippe": img("brands/louis-philippe.jpg"),
    "allen-solly": img("brands/allen-solly.jpg"), "us-polo": img("brands/us-polo.jpg"),
    "rare-rabbit": img("brands/rare-rabbit.jpg"), "snitch": img("brands/snitch.jpg"),
    "rumoar": img("brands/rumoar.jpg"),
  },

  lab: {
    base: img("lab/character/base.png", "Base figure", "50% 100%", "contain"),
    /* ARCHITECTURE B — one pre-composed styled figure per look */
    looks: {
      corporate: img("lab/looks/corporate.png", "", "50% 100%", "contain"),
      casual: img("lab/looks/casual.png", "", "50% 100%", "contain"),
      oldmoney: img("lab/looks/oldmoney.png", "", "50% 100%", "contain"),
      european: img("lab/looks/european.png", "", "50% 100%", "contain"),
      trend: img("lab/looks/trend.png", "", "50% 100%", "contain"),
      rumoar: img("lab/looks/rumoar.png", "", "50% 100%", "contain"),
    },
    thumbs: {
      corporate: img("lab/thumbs/corporate.jpg", "", "50% 28%"),
      casual: img("lab/thumbs/casual.jpg", "", "50% 28%"),
      oldmoney: img("lab/thumbs/oldmoney.jpg", "", "50% 28%"),
      european: img("lab/thumbs/european.jpg", "", "50% 28%"),
      trend: img("lab/thumbs/trend.jpg", "", "50% 28%"),
      rumoar: img("lab/thumbs/rumoar.jpg", "", "50% 28%"),
    },
    /* ARCHITECTURE A — transparent layers stacked over `base`.
       Fill any of these in and they take priority over `looks` above.       */
    layers: {
      corporate: { bottom: null, top: null, outer: null },
      casual: { bottom: null, top: null, outer: null },
      oldmoney: { bottom: null, top: null, outer: null },
      european: { bottom: null, top: null, outer: null },
      trend: { bottom: null, top: null, outer: null },
      rumoar: { bottom: null, top: null, outer: null },
    },
  },
};

/* ==========================================================================
   §2  DATA   —  [BRACKETED] = placeholder. No invented statistics.
========================================================================== */
const eraData = [
  { year: 1900, tag: "Necessity", era: "Colonial India",
    style: "Handwoven cotton. Dhoti, kurta, angarkha. Tailoring for the few.",
    read: "Clothing is survival infrastructure",
    needs: ["ROTI", "KAPDA", "MAKAAN"],
    note: "Clothing sits third in a list of three. Bought to last, not to say anything.",
    drivers: ["Affordability", "Durability", "Occupation", "Climate"],
    eq: ["Clothing", "Conformity"],
    identity: "Dress is assigned, not chosen. Caste, region, trade and faith are legible on the body before a man speaks. Deviation is risk, not expression.",
    signals: ["Region", "Trade", "Community", "Means"], stat: "[RESEARCH — 1900]" },
  { year: 1970, tag: "Provision", era: "Licence-era India",
    style: "Terrycot bush shirts. Safari suits. One good set, kept for occasions.",
    read: "One wardrobe, many years",
    needs: ["WORK", "FAMILY", "RESPECT"],
    note: "The wardrobe is small and permanent. An everyday self and a formal self. Nothing between them.",
    drivers: ["Employment", "Marriage", "Thrift", "Repair"],
    eq: ["Clothing", "Standing"],
    identity: "Clothing begins to signal arrival — a government job, a first salary, a stitched suit. Identity is still collective, but the individual starts to show through it.",
    signals: ["Occupation", "Income", "Seniority", "Household"], stat: "[RESEARCH — 1970]" },
  { year: 2000, tag: "Access", era: "Post-liberalisation",
    style: "Branded formals. The first pair of denim that cost something.",
    read: "The brand arrives",
    needs: ["CAREER", "STATUS", "OCCASION"],
    note: "Malls, brands and EMI arrive together. For the first time a man can buy his way into a category.",
    drivers: ["Dress codes", "Brand access", "Aspiration", "Comparison"],
    eq: ["Clothing", "Status"],
    identity: "The logo does the talking. Men do not choose a style, they choose a tier. Wardrobes are organised by price, not by person.",
    signals: ["Brand", "Price", "Category", "Grade"], stat: "[RESEARCH — 2000]" },
  { year: 2010, tag: "Supply", era: "E-commerce",
    style: "Slim fit everything. Chinos. The decade of the checked shirt.",
    read: "Infinite catalogue, single silhouette",
    needs: ["CHOICE", "SPEED", "PRICE"],
    note: "Supply explodes. A man can buy anything — which is not the same as knowing what to buy.",
    drivers: ["Discounting", "Delivery", "Trend cycles", "Feeds"],
    eq: ["Clothing", "Personality"],
    identity: "Style becomes a stated trait. I'm a casual guy. I'm a sneaker guy. But it is claimed, not constructed. The wardrobe is a pile, not a system.",
    signals: ["Trend", "Fit", "Subculture", "Feed"], stat: "[RESEARCH — 2010]" },
  { year: 2020, tag: "Fragmentation", era: "Hybrid life",
    style: "The collapse of smart-casual. Office, flight and dinner blur into one.",
    read: "One man, several selves, one closet",
    needs: ["VERSATILITY", "COMFORT", "SELF"],
    note: "Occasions stop being separate. The same man works, travels, celebrates and rests inside one week.",
    drivers: ["Remote work", "Travel", "Social feeds", "Comfort"],
    eq: ["Clothing", "Identity"],
    identity: "Men begin to dress as a version of themselves rather than a member of a category. The vocabulary exists. The method does not.",
    signals: ["Context", "Mood", "Self-image", "Audience"], stat: "[RESEARCH — 2020]" },
  { year: 2026, tag: "System", era: "Now",
    style: "[ERA DESCRIPTION — to be written with the brand team]",
    read: "Identity needs an operating system",
    needs: ["COHERENCE", "RANGE", "INTENT"],
    note: "The problem is no longer access. It is coherence — making forty garments behave like one point of view.",
    drivers: ["Decision fatigue", "Multiple roles", "Repeat wear", "Longevity"],
    eq: ["Clothing", "Identity system"],
    identity: "The next wardrobe is not a set of purchases. It is a set of rules a man carries between rooms, seasons and versions of himself.",
    signals: ["Rules", "Range", "Continuity", "Evolution"], stat: "[RESEARCH — 2026]" },
];

const axes = { x: { low: "GENERIC", high: "IDENTITY-LED" }, y: { low: "TRADITIONAL", high: "EVOLVING" } };

const brandData = [
  { id: "van-heusen", name: "Van Heusen", x: 22, y: 26,
    audience: "The corporate man, 28–45", style: "Formal, boardroom-led", occasion: "Office, ceremony",
    price: "Mid-premium", personalization: "Low", identity: "Role-based",
    serve: "A man whose day has one setting, and whose clothes are judged inside it.",
    solve: "Dressing correctly for a workplace that still keeps a dress code.",
    position: "Authority through formality. The suit as professional equipment.",
    stops: "At the office door. It has little to say about the same man on Saturday.",
    open: "A role can be equipped. A person has to be built." },
  { id: "louis-philippe", name: "Louis Philippe", x: 28, y: 21,
    audience: "The senior professional, 35–55", style: "Elevated formal, heritage-coded", occasion: "Office, occasion",
    price: "Premium", personalization: "Low", identity: "Status-based",
    serve: "A man who has arrived and needs the wardrobe to confirm it.",
    solve: "Looking established — fabric, finish and formality as proof of seniority.",
    position: "Heritage and rank. Quality as a legible social signal.",
    stops: "At hierarchy. Its language is seniority, not self-definition.",
    open: "Status is a fixed coordinate. Identity moves." },
  { id: "allen-solly", name: "Allen Solly", x: 41, y: 46,
    audience: "The office-casual man, 25–40", style: "Friday dressing, smart casual", occasion: "Work-adjacent",
    price: "Mid", personalization: "Low", identity: "Mood-based",
    serve: "A man who wants to look relaxed without looking careless.",
    solve: "The gap between the suit and the tee. It gave Indian offices permission to loosen.",
    position: "Ease inside professionalism. A register, offered ready-made.",
    stops: "At the register. It supplies a mood, not a wardrobe logic.",
    open: "A mood can be borrowed. A point of view has to be constructed." },
  { id: "us-polo", name: "U.S. Polo Assn.", x: 31, y: 39,
    audience: "The everyday man, 20–40", style: "Sport-casual, dependable", occasion: "Weekend, everyday",
    price: "Accessible", personalization: "Low", identity: "Category-based",
    serve: "A man who does not want to think about clothes — and shouldn't have to.",
    solve: "A reliable default. Easy, safe, endlessly repeatable.",
    position: "Familiarity at scale. The wardrobe as low-risk utility.",
    stops: "At the default. Everyone wearing it arrives at the same place.",
    open: "Safety scales beautifully. It simply doesn't distinguish." },
  { id: "rare-rabbit", name: "Rare Rabbit", x: 58, y: 72,
    audience: "The young professional, 24–35", style: "Contemporary, design-forward", occasion: "Work into evening",
    price: "Premium contemporary", personalization: "Low–moderate", identity: "Taste-based",
    serve: "A man who already knows what he likes and wants better executions of it.",
    solve: "Taste. Silhouette, restraint and a modern eye at a reachable price.",
    position: "Design credibility. The garment as the unit of value.",
    stops: "At the garment. Excellent pieces, assembly left to the customer.",
    open: "Taste without a system still produces a closet of unrelated good things." },
  { id: "snitch", name: "Snitch", x: 44, y: 83,
    audience: "The trend-native man, 18–28", style: "Fast contemporary", occasion: "Social, evening",
    price: "Accessible", personalization: "Low", identity: "Trend-based",
    serve: "A man dressing for a feed as much as for a room.",
    solve: "Speed. Whatever is current, immediately, affordably.",
    position: "Cultural currency, refreshed weekly.",
    stops: "At the cycle. Relevance expires on schedule.",
    open: "A wardrobe built on cycles cannot compound into a self." },
  { id: "rumoar", name: "RUMOAR", x: 85, y: 88, isBrand: true,
    audience: "The man who is several men in one week", style: "Identity system", occasion: "Full range",
    price: "[TO BE DEFINED]", personalization: "High", identity: "System-based",
    serve: "A man moving between roles who wants one recognisable point of view in all of them.",
    solve: "Coherence. Not what to wear — who you are across everything you wear.",
    position: "[POSITIONING — brand team]", stops: "[TO BE DEFINED]",
    open: "The wardrobe organised around the person, not the occasion." },
];

const whiteSpace = { x: 62, y: 58, w: 36, h: 40 };

const lookData = [
  { id: "corporate", name: "Corporate Safe", house: "Legacy formalwear", tone: "#2F3440",
    reads: "The job, not the man", look: "Institutional formal",
    traits: ["Correct", "Anonymous", "Room-appropriate", "Time-stamped"],
    occasions: ["Office", "Ceremony"], metrics: { formality: 9, versatility: 3, distinction: 2, range: 2 },
    note: "Nobody will question this. Nobody will remember it either." },
  { id: "casual", name: "Generic Casual", house: "Sport-casual", tone: "#3E566E",
    reads: "Everyone's version of safe", look: "Weekend default",
    traits: ["Easy", "Familiar", "Neutral", "Repeatable"],
    occasions: ["Weekend", "Errands"], metrics: { formality: 4, versatility: 5, distinction: 2, range: 3 },
    note: "A default is a decision you outsourced." },
  { id: "oldmoney", name: "Old Money", house: "Heritage", tone: "#4B4636",
    reads: "Inherited, not chosen", look: "Quiet wealth",
    traits: ["Composed", "Coded", "Borrowed", "Static"],
    occasions: ["Club", "Occasion"], metrics: { formality: 7, versatility: 5, distinction: 5, range: 4 },
    note: "A costume for a life someone else lived." },
  { id: "european", name: "European Minimal", house: "Continental", tone: "#494944",
    reads: "Considered, but unrepeatable", look: "Reduced palette",
    traits: ["Restrained", "Current", "Isolated", "Fragile"],
    occasions: ["Dinner", "Travel"], metrics: { formality: 6, versatility: 6, distinction: 6, range: 4 },
    note: "Great pieces. Still assembled fresh every morning." },
  { id: "trend", name: "Feed Native", house: "Fast contemporary", tone: "#57495D",
    reads: "Dated the moment the cycle turns", look: "Timely",
    traits: ["Loud", "Current", "Perishable", "Borrowed"],
    occasions: ["Social", "Evening"], metrics: { formality: 3, versatility: 4, distinction: 7, range: 3 },
    note: "Relevance with an expiry date printed on it." },
  { id: "rumoar", name: "RUMOAR", house: "Identity system", tone: "#16181A", isBrand: true,
    reads: "Quiet confidence", look: "Modern European, relaxed structure",
    traits: ["Relaxed structure", "Minimal palette", "Controlled proportion", "High versatility"],
    occasions: ["Work", "Dinner", "Travel", "Social"], metrics: { formality: 6, versatility: 9, distinction: 8, range: 9 },
    note: "Nine pieces. Twenty-eight coherent outfits. One recognisable man." },
];

const filmCopy = [
  "He dresses for the office.",
  "Then for the flight.",
  "Then for the dinner.",
  "Then for the wedding.",
  "Then for the version of himself he hasn't met yet.",
  "One wardrobe. Several men.",
];

/* Roles a man moves between in a week. Each carries a rough position in the
   same field as the brands. These are editorial weightings, not measurements —
   the point is the shape of the answer, not a score. */
const roleData = [
  { id: "office", label: "In an office", x: 24, y: 30 },
  { id: "founder", label: "Running something", x: 58, y: 68 },
  { id: "remote", label: "Working from home", x: 38, y: 62 },
  { id: "travel", label: "On a plane often", x: 62, y: 66 },
  { id: "wedding", label: "At weddings", x: 30, y: 24 },
  { id: "dinner", label: "Out most evenings", x: 66, y: 74 },
  { id: "creative", label: "In a creative room", x: 74, y: 82 },
  { id: "gym", label: "Training daily", x: 44, y: 58 },
  { id: "family", label: "With family", x: 28, y: 36 },
  { id: "dating", label: "Meeting new people", x: 70, y: 70 },
];

/* Nine pieces. The claim in the copy is "forty outfits" — this component
   computes the real number instead of asserting it, and shows how fast it
   collapses when the pieces stop relating to each other. */
const wardrobe = [
  { id: "w1", name: "Oxford shirt", cat: "top", tone: "neutral", formality: 6 },
  { id: "w2", name: "Crew knit", cat: "top", tone: "neutral", formality: 5 },
  { id: "w3", name: "Camp collar", cat: "top", tone: "neutral", formality: 4 },
  { id: "w4", name: "Graphic tee", cat: "top", tone: "loud", formality: 2 },
  { id: "w5", name: "Wool trouser", cat: "bottom", tone: "neutral", formality: 7 },
  { id: "w6", name: "Straight denim", cat: "bottom", tone: "neutral", formality: 3 },
  { id: "w7", name: "Pleated chino", cat: "bottom", tone: "neutral", formality: 5 },
  { id: "w8", name: "Unstructured blazer", cat: "outer", tone: "neutral", formality: 7 },
  { id: "w9", name: "Overshirt", cat: "outer", tone: "neutral", formality: 4 },
];

const CHAPTERS = [
  { id: "man", label: "The Man" },
  { id: "evolution", label: "The Evolution" },
  { id: "market", label: "The Market" },
  { id: "whitespace", label: "White Space" },
  { id: "rumoar", label: "RUMOAR" },
  { id: "lab", label: "The Lab" },
];

/* ==========================================================================
   §3  SYSTEM
========================================================================== */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@200;300;400;500;600&family=Montserrat:wght@300;400;500;600&display=swap');

.ru{
  --paper:#FFF; --paper-2:#FAFAF8; --paper-3:#F1F0ED;
  --ink:#0C0C0B; --ink-2:#56564F; --ink-3:#9C9C94; --line:#E8E6E1;
  --mark:#1B2A3B;
  --glass:rgba(255,255,255,.55); --gl-hi:rgba(255,255,255,.8); --gl-edge:rgba(12,12,11,.06);
  --micro:180ms; --ui:420ms; --content:820ms; --cine:1400ms;
  --ez:cubic-bezier(.22,.68,.16,1); --ez-out:cubic-bezier(.16,1,.3,1);
  --gut:clamp(14px,1.8vw,26px); --marg:clamp(20px,6vw,116px);
  font-family:'Poppins',-apple-system,system-ui,sans-serif;color:var(--ink);background:var(--paper);
  -webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;overflow-x:clip;
  scrollbar-gutter:stable;
}
/* keyboard entry point — visible only when focused */
.ru .skip{position:fixed;top:10px;left:10px;z-index:500;padding:12px 18px;border-radius:100px;
  background:var(--ink);color:#fff;font-family:'Montserrat',sans-serif;font-size:.62rem;
  letter-spacing:.2em;text-transform:uppercase;transform:translateY(-160%);
  transition:transform var(--ui) var(--ez)}
.ru .skip:focus-visible{transform:none}
.ru *,.ru *::before,.ru *::after{box-sizing:border-box}
.ru p{margin:0}.ru h1,.ru h2,.ru h3{margin:0;font-weight:200;letter-spacing:-.05em;line-height:.94}
.ru button{font-family:inherit;border:0;background:none;color:inherit;cursor:pointer;padding:0}
.ru :focus-visible{outline:2px solid var(--mark);outline-offset:4px;border-radius:2px}
.ru img,.ru video,.ru canvas{display:block}
.ru ::selection{background:var(--ink);color:#fff}

.ru .g{display:grid;grid-template-columns:repeat(12,1fr);gap:var(--gut);
  padding-inline:var(--marg);max-width:1720px;margin-inline:auto}
.ru .full{padding-inline:var(--marg);max-width:1720px;margin-inline:auto}

.ru .mega{font-size:clamp(3rem,9.6vw,11rem);line-height:.88;letter-spacing:-.06em;font-weight:200;
  text-wrap:balance}
.ru .big{font-size:clamp(2.1rem,5.4vw,5.2rem);line-height:.98;letter-spacing:-.052em;text-wrap:balance}
.ru .mid{font-size:clamp(1.45rem,2.8vw,2.8rem);line-height:1.08;letter-spacing:-.042em;font-weight:300;
  text-wrap:balance}
.ru .h3{font-size:clamp(1rem,1.4vw,1.35rem);font-weight:400;letter-spacing:-.02em;line-height:1.32}
.ru .body{font-size:clamp(.93rem,1vw,1.05rem);line-height:1.7;color:var(--ink-2);font-weight:300;
  text-wrap:pretty}
.ru .lede{font-size:clamp(1rem,1.3vw,1.24rem);line-height:1.55;color:var(--ink-2);font-weight:300}
.ru .lb{font-family:'Montserrat',sans-serif;font-size:.6rem;letter-spacing:.3em;text-transform:uppercase;
  color:var(--ink-3);font-weight:500}
.ru .num{font-variant-numeric:tabular-nums}
.ru .dim{color:var(--ink-3)}
.ru .rule{height:1px;background:var(--line)}

.ru .glass{background:var(--glass);backdrop-filter:blur(30px) saturate(1.8);
  -webkit-backdrop-filter:blur(30px) saturate(1.8);border:.5px solid var(--gl-edge);
  box-shadow:inset 0 .5px 0 var(--gl-hi),0 24px 64px -36px rgba(12,12,11,.5)}

.ru .lm{display:block;overflow:hidden}
.ru .lm>span{display:block;transform:translateY(105%);transition:transform 1.25s var(--ez-out)}
.ru .in .lm>span{transform:none}
.ru .rv{opacity:0;transform:translateY(24px)}
.ru .rv.in{opacity:1;transform:none;transition:opacity var(--content) var(--ez),transform var(--cine) var(--ez-out)}

.ru .m{position:relative;overflow:hidden;width:100%;height:100%;background:var(--paper-3)}
.ru .m>img,.ru .m>video,.ru .m>canvas{width:100%;height:100%}
.ru .ph{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:flex-end;gap:4px;
  padding:clamp(10px,1.1vw,16px);
  background:repeating-linear-gradient(-45deg,rgba(12,12,11,.02) 0 1px,transparent 1px 11px),var(--paper-3);
  box-shadow:inset 0 0 0 1px rgba(12,12,11,.06)}
.ru .ph b{font-family:'Montserrat',sans-serif;font-size:.52rem;letter-spacing:.24em;color:var(--ink-3);font-weight:600}
.ru .ph span{font-family:'Montserrat',sans-serif;font-size:.6rem;color:var(--ink-2);word-break:break-all}

.ru .intro{position:fixed;inset:0;z-index:400;background:#fff;display:grid;place-items:center;
  transition:opacity 900ms var(--ez),visibility 900ms}
.ru .intro.gone{opacity:0;visibility:hidden}
.ru .im{font-family:'Montserrat',sans-serif;font-weight:600;font-size:clamp(.9rem,1.6vw,1.15rem);
  letter-spacing:1.1em;text-indent:1.1em;opacity:0;animation:imk 1900ms var(--ez-out) forwards}
@keyframes imk{0%{letter-spacing:1.1em;opacity:0}30%{opacity:1}100%{letter-spacing:.42em;opacity:1}}
.ru .ibar{position:absolute;bottom:0;left:0;height:1px;background:var(--ink);width:0}

.ru .prog{position:fixed;top:0;left:0;height:1px;background:var(--ink);z-index:200;width:100%;
  transform:scaleX(0);transform-origin:left}
.ru .nav{position:fixed;top:0;left:0;right:0;z-index:150;display:flex;justify-content:center;
  padding:clamp(14px,2vw,24px) var(--marg);pointer-events:none}
.ru .navin{pointer-events:auto;display:flex;align-items:center;gap:clamp(12px,2vw,34px);width:100%;
  max-width:1720px;padding:10px 0;border-radius:0;background:transparent;border:.5px solid transparent;
  transition:max-width var(--content) var(--ez),padding var(--content) var(--ez),
    border-radius var(--content) var(--ez),background var(--content) var(--ez),
    border-color var(--content) var(--ez),box-shadow var(--content) var(--ez)}
.ru .nav.pill .navin{max-width:900px;padding:8px 8px 8px 24px;border-radius:100px;background:var(--glass);
  backdrop-filter:blur(30px) saturate(1.8);-webkit-backdrop-filter:blur(30px) saturate(1.8);
  border-color:var(--gl-edge);box-shadow:inset 0 .5px 0 var(--gl-hi),0 20px 54px -34px rgba(12,12,11,.55)}
.ru .wm{font-family:'Montserrat',sans-serif;font-weight:600;letter-spacing:.42em;font-size:.76rem;
  margin-right:auto;white-space:nowrap}
.ru .nl{font-family:'Montserrat',sans-serif;font-size:.61rem;letter-spacing:.2em;text-transform:uppercase;
  color:var(--ink-3);position:relative;padding:5px 0;transition:color var(--micro) var(--ez);white-space:nowrap}
.ru .nl::after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:1px;background:var(--ink);
  transform:scaleX(0);transform-origin:right;transition:transform var(--ui) var(--ez)}
.ru .nl:hover{color:var(--ink)}
.ru .nl:hover::after,.ru .nl.on::after{transform:scaleX(1);transform-origin:left}
.ru .nl.on{color:var(--ink)}
.ru .cta{font-family:'Montserrat',sans-serif;font-size:.6rem;letter-spacing:.2em;text-transform:uppercase;
  border:.5px solid var(--ink);border-radius:100px;padding:10px 20px;white-space:nowrap;position:relative;
  overflow:hidden;isolation:isolate;color:var(--ink);transition:color var(--ui) var(--ez)}
.ru .cta::before{content:"";position:absolute;inset:0;background:var(--ink);z-index:-1;
  transform:translateY(101%);transition:transform var(--ui) var(--ez)}
.ru .cta:hover{color:#fff}
.ru .cta:hover::before{transform:none}

.ru .hero{height:100svh;min-height:600px;position:relative;overflow:hidden}
.ru .plate{position:absolute;inset:-8% -5%;will-change:transform}
.ru .cut{position:absolute;right:-3%;bottom:0;width:min(50vw,720px);height:86%;will-change:transform}
.ru .hwash{position:absolute;inset:0;pointer-events:none;
  background:linear-gradient(96deg,#fff 0%,rgba(255,255,255,.9) 32%,rgba(255,255,255,.38) 60%,rgba(255,255,255,.04) 100%)}

.ru .rail{position:relative;border-radius:100px;padding:9px clamp(12px,1.6vw,22px);display:flex;
  align-items:center;gap:clamp(4px,2vw,40px);overflow-x:auto;scrollbar-width:none;scroll-snap-type:x proximity}
.ru .rail::-webkit-scrollbar{display:none}
.ru .knob{position:absolute;top:5px;bottom:5px;border-radius:100px;background:rgba(12,12,11,.05);
  transition:left var(--content) var(--ez),width var(--content) var(--ez);pointer-events:none}
.ru .tick{position:relative;z-index:2;padding:9px clamp(9px,1.2vw,16px);border-radius:100px;display:flex;
  flex-direction:column;align-items:center;gap:2px;scroll-snap-align:center;
  transition:transform var(--content) var(--ez-out)}
.ru .tick .y{font-size:clamp(.92rem,1.3vw,1.16rem);font-weight:300;letter-spacing:-.02em;color:var(--ink-3);
  transition:color var(--ui) var(--ez)}
.ru .tick .t{font-family:'Montserrat',sans-serif;font-size:.48rem;letter-spacing:.22em;text-transform:uppercase;
  color:var(--ink-3);opacity:0;transition:opacity var(--ui) var(--ez)}
.ru .tick:hover .y{color:var(--ink-2)}
.ru .tick.on{transform:scale(1.16)}
.ru .tick.on .y{color:var(--ink);font-weight:500}
.ru .tick.on .t{opacity:1}
.ru .conn{flex:1;height:1px;background:var(--line);min-width:8px}
.ru .era{transition:opacity var(--content) var(--ez),transform var(--content) var(--ez-out),
  filter var(--content) var(--ez)}
.ru .era.out{opacity:0}
.ru .era.out .zl{transform:translateX(-18px)}
.ru .era.out .zr{transform:translateX(18px)}
.ru .era.out .zc{transform:scale(1.04);filter:blur(16px)}
.ru .need{font-size:clamp(1.6rem,3.1vw,3.2rem);line-height:1.02;letter-spacing:-.055em;font-weight:200}
.ru .kv{display:flex;justify-content:space-between;gap:18px;padding:11px 0;border-top:.5px solid var(--line);
  font-size:.8rem;font-weight:300;color:var(--ink-2)}

.ru .fstage{position:sticky;top:0;height:100svh;overflow:hidden}

.ru .plotbox{transition:transform var(--content) var(--ez),filter var(--content) var(--ez),
  opacity var(--content) var(--ez)}
.ru .plotbox.back{transform:scale(.9) translateX(-13%);filter:blur(2px);opacity:.45}
.ru .pt{cursor:pointer;transition:r var(--ui) var(--ez-out),opacity var(--content) var(--ez)}
.ru .ptl{font-family:'Montserrat',sans-serif;font-size:15px;letter-spacing:.14em;fill:#56564F;
  pointer-events:none;transition:opacity var(--ui) var(--ez)}
.ru .ax{font-family:'Montserrat',sans-serif;font-size:13px;letter-spacing:.26em;fill:#9C9C94}
.ru .youring{transform-origin:center;transform-box:fill-box;animation:youpulse 3.4s var(--ez) infinite}
@keyframes youpulse{0%{transform:scale(.72);opacity:.6}70%{transform:scale(1.12);opacity:0}100%{opacity:0}}
@media(max-width:640px){
  .ru .ptl{font-size:19px}
  .ru .ax{font-size:16px;letter-spacing:.18em}
}

.ru .row{display:grid;grid-template-columns:1.1fr 1.6fr 1fr 40px;gap:var(--gut);align-items:baseline;
  padding:26px 0;border-top:.5px solid var(--line);cursor:pointer;position:relative;
  transition:background var(--ui) var(--ez)}
.ru .plus{justify-self:end;width:13px;height:13px;position:relative;opacity:.35;
  transition:opacity var(--ui) var(--ez),transform var(--content) var(--ez-out)}
.ru .plus::before,.ru .plus::after{content:"";position:absolute;inset:50% 0 auto 0;height:1px;
  background:var(--ink);transition:transform var(--content) var(--ez-out)}
.ru .plus::after{transform:rotate(90deg)}
.ru .row:hover .plus{opacity:1}
.ru .row.on .plus{opacity:1;transform:rotate(90deg)}
.ru .row.on .plus::after{transform:rotate(90deg) scaleX(0)}
.ru .row::before{content:"";position:absolute;left:0;top:0;height:1px;background:var(--ink);width:0;
  transition:width var(--content) var(--ez-out)}
.ru .row:hover::before,.ru .row.on::before{width:100%}
.ru .row.on{background:linear-gradient(90deg,rgba(27,42,59,.045),transparent 68%)}
.ru .rx{overflow:hidden;max-height:0;opacity:0;
  transition:max-height var(--content) var(--ez),opacity var(--ui) var(--ez)}
.ru .rx.open{max-height:600px;opacity:1}
/* "max-height" guessing clips longer copy. Where the browser can interpolate
   to "auto", animate the real height instead and drop the guess entirely. */
@supports (interpolate-size: allow-keywords){
  .ru{interpolate-size:allow-keywords}
  .ru .rx{max-height:none;height:0}
  .ru .rx.open{max-height:none;height:auto}
  .ru .rx{transition:height var(--content) var(--ez),opacity var(--ui) var(--ez)}
}

.ru .dive{position:fixed;z-index:160;top:0;right:0;bottom:0;width:min(560px,94vw);transform:translateX(101%);
  transition:transform var(--content) var(--ez-out);display:flex;flex-direction:column;overflow:auto;
  padding:clamp(70px,9vh,110px) clamp(22px,3vw,46px) 48px}
.ru .dive.open{transform:none}

/* ——— 01 · PLOT YOURSELF ——— */
.ru .chip{font-family:'Montserrat',sans-serif;font-size:.62rem;letter-spacing:.16em;text-transform:uppercase;
  border:.5px solid var(--line);border-radius:100px;padding:11px 18px;color:var(--ink-3);
  position:relative;overflow:hidden;isolation:isolate;
  transition:color var(--ui) var(--ez),border-color var(--ui) var(--ez),transform var(--ui) var(--ez-out)}
.ru .chip::before{content:"";position:absolute;inset:0;background:var(--ink);z-index:-1;
  transform:translateY(101%);transition:transform var(--ui) var(--ez-out)}
.ru .chip:hover{color:var(--ink);border-color:var(--ink-3)}
.ru .chip.on{color:#fff;border-color:var(--ink)}
.ru .chip.on::before{transform:none}
.ru .verdict{font-size:clamp(1.1rem,1.7vw,1.55rem);font-weight:300;letter-spacing:-.03em;line-height:1.34}

/* ——— 02 · WARDROBE MATH ——— */
.ru .count{font-size:clamp(4rem,13vw,11rem);line-height:.84;letter-spacing:-.07em;font-weight:200;
  font-variant-numeric:tabular-nums}
.ru .piece{display:flex;align-items:center;gap:12px;padding:12px 0;border-top:.5px solid var(--line);
  width:100%;text-align:left;transition:opacity var(--ui) var(--ez)}
.ru .piece .dot{width:9px;height:9px;border-radius:100px;border:1px solid var(--ink-3);flex:none;
  transition:background var(--ui) var(--ez),border-color var(--ui) var(--ez),transform var(--ui) var(--ez-out)}
.ru .piece.on .dot{background:var(--ink);border-color:var(--ink);transform:scale(1.25)}
.ru .piece:not(.on){opacity:.4}
.ru .piece:hover{opacity:1}

/* ——— 03 · IDENTITY RECEIPT ——— */
.ru .receipt{background:#fff;padding:26px 24px 30px;max-width:340px;position:relative;
  box-shadow:0 24px 60px -34px rgba(12,12,11,.5);font-family:'Montserrat',sans-serif;font-size:.66rem;
  letter-spacing:.04em;color:var(--ink)}
.ru .receipt::after{content:"";position:absolute;left:0;right:0;bottom:-11px;height:12px;background:#fff;
  -webkit-mask:repeating-linear-gradient(90deg,#000 0 9px,transparent 9px 18px);
  mask:repeating-linear-gradient(90deg,#000 0 9px,transparent 9px 18px)}
.ru .receipt hr{border:0;border-top:1px dashed rgba(12,12,11,.28);margin:14px 0}
.ru .rline{display:flex;justify-content:space-between;gap:14px;padding:4px 0;align-items:baseline}
.ru .rline b{font-weight:500}
.ru .barcode{display:flex;gap:2px;align-items:flex-end;height:34px;margin-top:16px}
.ru .barcode i{flex:1;background:var(--ink)}

.ru .labwrap{min-height:100svh;background:radial-gradient(120% 70% at 50% 0%,#FFF 0%,#F7F6F3 55%,#EFEEEA 100%)}
.ru .tile{position:relative;cursor:grab;touch-action:none;transition:transform var(--ui) var(--ez-out)}
.ru .tile:hover{transform:translateY(-5px)}
.ru .tf{position:relative;overflow:hidden;aspect-ratio:3/4;background:var(--paper-3);
  box-shadow:inset 0 0 0 0 var(--ink);transition:box-shadow var(--ui) var(--ez)}
.ru .tile.on .tf{box-shadow:inset 0 0 0 1px var(--ink)}
.ru .ghost{position:fixed;z-index:300;pointer-events:none;width:140px;top:0;left:0;
  box-shadow:0 50px 80px -34px rgba(12,12,11,.6);will-change:transform}
.ru .stage{position:relative;min-height:clamp(440px,78svh,900px)}
.ru .stage::before{content:"";position:absolute;left:50%;bottom:4%;width:52%;height:5%;
  transform:translateX(-50%);border-radius:50%;
  background:radial-gradient(closest-side,rgba(12,12,11,.16),transparent)}
.ru .stage.hot::after{content:"";position:absolute;inset:-3% -6%;border-radius:50%/42%;
  background:radial-gradient(closest-side,rgba(27,42,59,.13),transparent 70%)}
.ru .lyr{position:absolute;inset:0;display:grid;place-items:end center;
  transition:opacity var(--content) var(--ez),transform var(--cine) var(--ez-out),filter var(--content) var(--ez)}
.ru .meter{height:1px;background:var(--line);position:relative;overflow:hidden}
.ru .meter i{position:absolute;inset:0 auto 0 0;background:var(--ink);transition:width var(--content) var(--ez-out)}
.ru .cmp{position:relative;overflow:hidden;user-select:none;touch-action:none;background:var(--paper-2)}
.ru .dv{position:absolute;top:0;bottom:0;width:1px;background:rgba(255,255,255,.92);
  box-shadow:0 0 0 .5px rgba(12,12,11,.22);cursor:ew-resize}
.ru .dvk{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:46px;height:46px;
  border-radius:100px;display:grid;place-items:center;font-size:.62rem;letter-spacing:.12em}

.ru .veil{position:fixed;inset:0;z-index:350;background:#fff;display:grid;place-items:center;
  pointer-events:none;opacity:0;transition:opacity 460ms var(--ez)}
.ru .veil.on{opacity:1;pointer-events:auto}
.ru .vm{font-family:'Montserrat',sans-serif;font-weight:600;
  transition:letter-spacing var(--cine) var(--ez-out),transform var(--cine) var(--ez-out),
    opacity var(--content) var(--ez),font-size var(--cine) var(--ez-out)}

/* ——————————————————————————————————————————————————————————————
   NATIVE PLATFORM LAYER (2026)
   Everything below is progressive enhancement. Unsupported browsers keep
   the JavaScript path already built above; nothing breaks, nothing is lost.
   —————————————————————————————————————————————————————————————— */

/* Cross-document view transitions. One at-rule; no router, no JS.
   Chromium 126+ and Safari 18.2+ animate; everything else navigates normally.
   This also covers the site ⇄ lab route change. */
@view-transition { navigation: auto; }
::view-transition-old(root){animation:vt-out 380ms cubic-bezier(.22,.68,.16,1) both}
::view-transition-new(root){animation:vt-in 640ms cubic-bezier(.16,1,.3,1) both}
@keyframes vt-out{to{opacity:0;transform:scale(.994)}}
@keyframes vt-in{from{opacity:0;transform:scale(1.006)}}
@media(prefers-reduced-motion:reduce){
  ::view-transition-old(root),::view-transition-new(root){animation:none}
}

/* Scroll-driven animations run on the compositor, not the main thread.
   They replace the IntersectionObserver reveal work entirely where supported. */
@supports (animation-timeline: view()){
  @media (prefers-reduced-motion: no-preference){

    /* reading indicator — was a rAF subscriber, now zero JS */
    .ru .prog{animation:prog-grow linear both;animation-timeline:scroll(root block)}
    @keyframes prog-grow{from{transform:scaleX(0)}to{transform:scaleX(1)}}

    /* reveals — "both" fill is essential, or state snaps back on scroll-up */
    .ru .rv{animation:rv-up linear both;animation-timeline:view();
      animation-range:entry 6% entry 44%}
    @keyframes rv-up{from{opacity:0;transform:translateY(26px)}to{opacity:1;transform:none}}

    /* headlines rise out of their own baseline, on scroll rather than on trigger */
    .ru .lm>span{animation:lm-rise cubic-bezier(.16,1,.3,1) both;
      animation-timeline:view();animation-range:entry 10% entry 52%}
    @keyframes lm-rise{from{transform:translateY(105%)}to{transform:none}}
    /* the hero is already on screen at load — it keeps its timed reveal */
    .ru .hero .lm>span{animation:none}

    /* full-bleed frames breathe as they cross the viewport */
    .ru .breathe{animation:breathe linear both;animation-timeline:view();animation-range:cover}
    @keyframes breathe{from{transform:scale(1.08)}to{transform:scale(1)}}
  }
}

/* Skip rendering work for sections that aren't near the viewport.
   The intrinsic size keeps the scrollbar honest so nothing jumps. */
.ru .cv{content-visibility:auto;contain-intrinsic-size:auto 100svh}

/* Soft optical edge instead of a hard crop — mask, not another gradient div */
.ru .fade-b{-webkit-mask-image:linear-gradient(180deg,#000 62%,transparent);
  mask-image:linear-gradient(180deg,#000 62%,transparent)}

@media(max-width:1100px){
  .ru .cut{width:72vw;height:62%;right:-9%}
  .ru .dive{width:min(460px,94vw)}
}

/* ——— tablet and below: the 12-column grid collapses to one ———
   Every section places its children with explicit "grid-column", so the
   override has to be authoritative. This is the single rule that stops the
   desktop composition from surviving onto a phone. */
@media(max-width:900px){
  .ru{--marg:clamp(18px,5vw,40px)}
  .ru .g{grid-template-columns:1fr}
  .ru .g>*{grid-column:1 / -1 !important;margin-top:0 !important}

  /* timeline restacks in narrative order: needs → the man → identity */
  .ru .zl{order:1}
  .ru .zc{order:2;margin-block:clamp(26px,5vh,44px) !important}
  .ru .zr{order:3}
  .ru .zc>div:first-child{height:clamp(380px,62svh,560px) !important}
  .ru .era.out .zl,.ru .era.out .zr{transform:translateY(14px)}

  /* the white-space act stops competing for horizontal room */
  .ru .wsplot{max-width:420px;margin-inline:auto}

  /* lab: figure stays central, sources become a horizontal shelf */
  .ru .labsrc{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(116px,1fr);
    gap:12px;overflow-x:auto;scroll-snap-type:x mandatory;
    scrollbar-width:none;padding-bottom:6px}
  .ru .labsrc::-webkit-scrollbar{display:none}
  .ru .labsrc>*{scroll-snap-align:start}
  .ru .stage{min-height:clamp(400px,60svh,560px)}

  /* matrix rows become labelled stacks instead of unlabelled columns */
  .ru .row{grid-template-columns:1fr;gap:0;padding:20px 0}
  .ru .row>*:first-child{margin-bottom:10px}
  .ru .rowhead{display:none}
  .ru .row [data-l]{display:grid;grid-template-columns:8.5rem 1fr;gap:12px;padding:4px 0}
  .ru .row [data-l]::before{content:attr(data-l);font-family:'Montserrat',sans-serif;
    font-size:.52rem;letter-spacing:.2em;text-transform:uppercase;color:var(--ink-3)}
}

@media(max-width:640px){
  .ru .nl{display:none}
  .ru .fstage{height:82svh}
  .ru .dive{width:100vw}
  .ru .hero{min-height:560px}
  .ru .cut{width:88vw;height:54%;right:-14%;opacity:.9}
  .ru .rail{gap:2px;padding:8px 10px}
  .ru .conn{display:none}
  .ru .cmp{height:clamp(320px,54svh,460px) !important}
}

@media(prefers-reduced-motion:reduce){
  .ru *,.ru *::before,.ru *::after{animation-duration:1ms!important;transition-duration:140ms!important}
  .ru .rv{opacity:1;transform:none}
  .ru .lm>span{transform:none}
  .ru .intro{display:none}
}
`;

/* ==========================================================================
   §4  MOTION ENGINE
========================================================================== */
const subs = new Set();
let looping = false, prev = 0;
function tick(t) {
  const dt = Math.min(0.05, (t - prev) / 1000 || 0.016);
  prev = t;
  for (const f of subs) f(dt);
  if (subs.size) requestAnimationFrame(tick); else looping = false;
}
function useFrame(cb) {
  const ref = useRef(cb); ref.current = cb;
  useEffect(() => {
    const f = (dt) => ref.current(dt);
    subs.add(f);
    if (!looping) { looping = true; prev = performance.now(); requestAnimationFrame(tick); }
    return () => { subs.delete(f); };
  }, []);
}
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const damp = (cur, target, lambda, dt) => cur + (target - cur) * (1 - Math.exp(-lambda * dt));
const reduced = () => typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Measures on resize only (never per frame → no layout thrash), then drives
    `apply(p)` with a damped 0→1 progress every frame. */
function useScene(ref, apply, lambda = 7) {
  const box = useRef({ top: 0, h: 0 });
  const v = useRef(0);
  const fn = useRef(apply); fn.current = apply;
  useEffect(() => {
    const measure = () => {
      const el = ref.current; if (!el) return;
      const r = el.getBoundingClientRect();
      box.current = { top: r.top + window.scrollY, h: r.height };
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(document.documentElement);
    if (ref.current) ro.observe(ref.current);
    window.addEventListener("load", measure);
    return () => { ro.disconnect(); window.removeEventListener("load", measure); };
  }, [ref]);
  useFrame((dt) => {
    const { top, h } = box.current;
    if (!h) return;
    const vh = window.innerHeight, y = window.scrollY;
    const pinned = h > vh * 1.2;
    const raw = pinned ? (y - top) / (h - vh) : (y + vh - top) / (h + vh);
    const target = clamp(raw);
    v.current = reduced() ? target : damp(v.current, target, lambda, dt);
    fn.current(v.current, dt);
  });
}

/* ==========================================================================
   §5  PRIMITIVES
========================================================================== */
function Placeholder({ slot, note }) {
  return <div className="ph"><b>MEDIA</b><span>{slot}</span>{note ? <span style={{ opacity: .6 }}>{note}</span> : null}</div>;
}

/** Renders whatever the manifest gives it: image, video, or canvas sequence.
    Until a file resolves, a labelled placeholder holds the exact layout. */
function Media({ a, style, imgStyle, eager, className = "", scrubRef }) {
  const vidRef = useRef(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    const el = vidRef.current;
    if (!el || a?.scrub) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) el.play?.().catch(() => { }); else el.pause?.();
    }, { threshold: .05 });
    io.observe(el);
    return () => io.disconnect();
  }, [a]);

  if (!a) return <div className={`m ${className}`} style={style}><Placeholder slot="—" /></div>;

  const slot = a.kind === "sequence"
    ? `${a.prefix}0001–${String(a.count).padStart(a.pad, "0")}.${a.ext}`
    : a.path || "—";

  return (
    <div className={`m ${className}`} style={style}>
      {a.kind === "video" ? (
        <video
          ref={(n) => { vidRef.current = n; if (scrubRef) scrubRef.current = n; }}
          src={url(a.path)} poster={a.poster ? url(a.poster) : undefined}
          muted playsInline loop={a.loop && !a.scrub} autoPlay={!a.scrub}
          preload={eager || a.scrub ? "auto" : "metadata"}
          onLoadedData={() => setOk(true)}
          style={{ objectFit: a.fit, objectPosition: a.focus, ...imgStyle }} />
      ) : (
        <img src={url(a.path)} srcSet={srcSet(a.path)} sizes="100vw" alt={a.alt || ""}
          loading={eager ? "eager" : "lazy"} decoding="async"
          fetchPriority={eager ? "high" : undefined}
          onLoad={() => setOk(true)}
          style={{ objectFit: a.fit, objectPosition: a.focus, ...imgStyle }} />
      )}
      {!ok && <Placeholder slot={slot} note={a.alt} />}
    </div>
  );
}

/** Canvas image-sequence player — the per-frame-control alternative to video. */
function Sequence({ a, progressRef }) {
  const cv = useRef(null);
  const frames = useRef([]);
  const drawn = useRef(-1);
  useEffect(() => {
    let alive = true;
    const load = (i) => new Promise((res) => {
      const im = new Image();
      im.onload = im.onerror = () => res(im);
      im.src = url(`${a.prefix}${String(i + 1).padStart(a.pad, "0")}.${a.ext}`);
    });
    (async () => {
      // first and last frames first, so the opening paint never waits on frame 200
      const order = [0, a.count - 1, ...Array.from({ length: a.count }, (_, i) => i)];
      for (const i of order) {
        if (!alive) return;
        if (frames.current[i]) continue;
        frames.current[i] = await load(i);
      }
    })();
    return () => { alive = false; };
  }, [a]);
  useFrame(() => {
    const c = cv.current; if (!c) return;
    const i = Math.round((progressRef.current || 0) * (a.count - 1));
    if (i === drawn.current) return;
    const im = frames.current[i];
    if (!im || !im.width) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (c.width !== Math.round(c.clientWidth * dpr)) {
      c.width = Math.round(c.clientWidth * dpr);
      c.height = Math.round(c.clientHeight * dpr);
    }
    const ctx = c.getContext("2d");
    const s = Math.max(c.width / im.width, c.height / im.height);
    ctx.drawImage(im, (c.width - im.width * s) / 2, (c.height - im.height * s) / 2, im.width * s, im.height * s);
    drawn.current = i;
  });
  return <canvas ref={cv} style={{ width: "100%", height: "100%" }} aria-label={a.alt} />;
}

function Reveal({ children, delay = 0, className = "", style, as: T = "div" }) {
  const ref = useRef(null); const [seen, set] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && (set(true), io.disconnect()),
      { threshold: .08, rootMargin: "0px 0px -5% 0px" });
    io.observe(el); return () => io.disconnect();
  }, []);
  return <T ref={ref} className={`rv ${seen ? "in" : ""} ${className}`}
    style={{ transitionDelay: `${delay}ms`, ...style }}>{children}</T>;
}

/** Headline that rises out of its own baseline, line by line. */
function Lines({ lines, className = "big", delay = 0, stagger = 90, style }) {
  const ref = useRef(null); const [seen, set] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && (set(true), io.disconnect()), { threshold: .15 });
    io.observe(el); return () => io.disconnect();
  }, []);
  return (
    <h2 ref={ref} className={`${className} ${seen ? "in" : ""}`} style={style}>
      {lines.map((l, i) => (
        <span className="lm" key={i}>
          <span style={{ transitionDelay: `${delay + i * stagger}ms`, color: l.dim ? "var(--ink-3)" : undefined }}>
            {l.t ?? l}
          </span>
        </span>
      ))}
    </h2>
  );
}

/** Cursor-magnetic control. Desktop pointer only; off under reduced motion. */
function Magnetic({ children, strength = 14, className = "", style, ...rest }) {
  const ref = useRef(null);
  const on = (e) => {
    if (reduced() || window.matchMedia("(pointer:coarse)").matches) return;
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.transform =
      `translate(${((e.clientX - r.left) / r.width - .5) * strength}px,${((e.clientY - r.top) / r.height - .5) * strength}px)`;
  };
  const off = () => { if (ref.current) ref.current.style.transform = ""; };
  return (
    <button ref={ref} className={className} onMouseMove={on} onMouseLeave={off}
      style={{ transition: "transform 500ms cubic-bezier(.16,1,.3,1)", ...style }} {...rest}>{children}</button>
  );
}

const LB = ({ children, style }) => <p className="lb" style={style}>{children}</p>;

/* ==========================================================================
   §6  SITE
========================================================================== */
function Intro({ done }) {
  const bar = useRef(null);
  useEffect(() => {
    let v = 0, raf;
    const step = () => {
      v = Math.min(1, v + .012);
      if (bar.current) bar.current.style.width = `${v * 100}%`;
      if (v < 1) raf = requestAnimationFrame(step);
    };
    step(); return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className={`intro ${done ? "gone" : ""}`} aria-hidden={done}>
      <span className="im">RUMOAR</span>
      <span className="ibar" ref={bar} />
    </div>
  );
}

function Progress() {
  const el = useRef(null);
  // CSS drives this via animation-timeline: scroll() where supported.
  // The rAF path below only runs on browsers that can't.
  const native = typeof CSS !== "undefined" &&
    CSS.supports && CSS.supports("animation-timeline: scroll()");
  useFrame(() => {
    if (native) return;
    const h = document.documentElement.scrollHeight - window.innerHeight;
    if (el.current) el.current.style.transform = `scaleX(${h > 0 ? clamp(window.scrollY / h) : 0})`;
  });
  return <div className="prog" ref={el} />;
}

function Nav({ active, onLab }) {
  const [pill, setPill] = useState(false);
  useFrame(() => {
    const n = window.scrollY > window.innerHeight * .72;
    setPill((p) => (p === n ? p : n));
  });
  const go = (id) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  return (
    <nav className={`nav ${pill ? "pill" : ""}`} aria-label="Primary">
      <div className="navin">
        <button className="wm" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>RUMOAR</button>
        {CHAPTERS.slice(0, 4).map((c) => (
          <button key={c.id} className={`nl ${active === c.id ? "on" : ""}`} onClick={() => go(c.id)}>{c.label}</button>
        ))}
        <Magnetic className="cta" onClick={onLab}>Styling Lab</Magnetic>
      </div>
    </nav>
  );
}

function Hero() {
  const sec = useRef(null), plate = useRef(null), cut = useRef(null),
    type = useRef(null), wash = useRef(null), cue = useRef(null);

  /* Pointer target, read by the same loop that reads scroll.
     BUG FIXED: this used to animate marginLeft/marginRight in a second rAF
     loop. Margin is a layout property — every frame forced a reflow, and the
     two loops fought over the same elements. Both inputs now compose into one
     transform written once per frame. */
  const ptr = useRef({ tx: 0, ty: 0, x: 0, y: 0, on: false });

  useEffect(() => {
    if (reduced() || window.matchMedia("(pointer:coarse)").matches) return;
    const mm = (e) => {
      ptr.current.on = true;
      ptr.current.tx = (e.clientX / window.innerWidth - .5) * 18;
      ptr.current.ty = (e.clientY / window.innerHeight - .5) * 12;
    };
    window.addEventListener("mousemove", mm, { passive: true });
    return () => window.removeEventListener("mousemove", mm);
  }, []);

  useScene(sec, (p, dt) => {
    const q = ptr.current;
    q.x = damp(q.x, q.tx, 5, dt);
    q.y = damp(q.y, q.ty, 5, dt);

    if (plate.current) plate.current.style.transform =
      `translate3d(${q.x * .22}px,${p * 9}%,0) scale(${1 + p * .1})`;
    if (cut.current) cut.current.style.transform =
      `translate3d(${q.x * -.6}px,calc(${p * -7}% + ${q.y * -.3}px),0)`;
    if (type.current) {
      type.current.style.transform = `translate3d(${q.x * .12}px,${p * -84}px,0)`;
      type.current.style.opacity = `${1 - p * 1.6}`;
    }
    if (wash.current) wash.current.style.opacity = `${1 - p * .28}`;
    if (cue.current) cue.current.style.opacity = `${1 - p * 3.4}`;
  }, 9);

  return (
    <section className="hero" ref={sec}>
      <div className="plate" ref={plate}><Media a={M.hero.plate} eager style={{ height: "100%" }} /></div>
      <div className="hwash" ref={wash} />
      <div className="cut" ref={cut}>
        <Media a={M.hero.figure} style={{ height: "100%", background: "transparent" }} />
      </div>

      <div className="full" ref={type} style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center" }}>
        <div>
          <LB style={{ marginBottom: "clamp(20px,4vh,40px)" }}>RUMOAR — Field note 01</LB>
          <h1 className="mega in" style={{ maxWidth: "13ch" }}>
            <span className="lm"><span style={{ transitionDelay: "1900ms" }}>Men changed.</span></span>
            <span className="lm"><span style={{ transitionDelay: "2010ms", color: "var(--ink-3)" }}>Menswear</span></span>
            <span className="lm"><span style={{ transitionDelay: "2120ms" }}>didn't.</span></span>
          </h1>
        </div>
      </div>

      <div className="full" ref={cue} style={{
        position: "absolute", left: 0, right: 0, bottom: "clamp(20px,4vh,42px)",
        display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 20
      }}>
        <LB>Scroll</LB>
        <LB>An investigation in six parts</LB>
      </div>
    </section>
  );
}

function Chapter({ id, n, title, note }) {
  return (
    <section id={id} className="g" style={{ padding: "clamp(90px,18vh,230px) 0 clamp(30px,6vh,80px)" }}>
      <div style={{ gridColumn: "1 / 3" }}><Reveal><LB>{n}</LB></Reveal></div>
      <div style={{ gridColumn: "3 / 11" }}>
        <Lines lines={title} className="big" />
        {note ? <Reveal delay={220}><p className="lede" style={{ marginTop: 28, maxWidth: "46ch" }}>{note}</p></Reveal> : null}
      </div>
    </section>
  );
}

function Timeline() {
  const [i, setI] = useState(0);
  const [out, setOut] = useState(false);
  const rail = useRef(null), btns = useRef([]), figure = useRef(null), sec = useRef(null);
  const [knob, setKnob] = useState({ left: 0, width: 0 });
  const pending = useRef(0);

  const select = (n) => {
    if (n === pending.current) return;
    pending.current = n;
    setOut(true);
    setTimeout(() => { setI(pending.current); setOut(false); }, reduced() ? 60 : 400);
  };

  useEffect(() => {
    const move = () => {
      const b = btns.current[i], r = rail.current;
      if (!b || !r) return;
      setKnob({ left: b.offsetLeft - r.scrollLeft, width: b.offsetWidth });
    };
    move();
    /* BUG FIXED: scrollIntoView walks every scrollable ancestor, so centring a
       year inside the rail was also yanking the page vertically. Scroll the
       rail itself and nothing above it moves. */
    const b = btns.current[i], r = rail.current;
    if (b && r && r.scrollWidth > r.clientWidth) {
      r.scrollTo({
        left: b.offsetLeft - (r.clientWidth - b.offsetWidth) / 2,
        behavior: reduced() ? "auto" : "smooth",
      });
    }
    r?.addEventListener("scroll", move, { passive: true });
    window.addEventListener("resize", move);
    return () => { r?.removeEventListener("scroll", move); window.removeEventListener("resize", move); };
  }, [i]);

  // slow drift on the era figure — reads as a held camera, not a parallax trick
  useScene(sec, (p) => {
    if (figure.current) figure.current.style.transform = `scale(${1.05 - p * .05}) translate3d(0,${(p - .5) * 24}px,0)`;
  }, 6);

  const d = eraData[i];
  return (
    <section ref={sec} style={{ paddingBottom: "clamp(60px,10vh,140px)" }}>
      <div className="full" style={{ display: "flex", justifyContent: "center", marginBottom: "clamp(36px,7vh,88px)" }}>
        <div className="glass rail" ref={rail} role="tablist" aria-label="Eras" style={{ maxWidth: 900 }}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") select(Math.min(eraData.length - 1, i + 1));
            if (e.key === "ArrowLeft") select(Math.max(0, i - 1));
          }}>
          <div className="knob" style={{ left: knob.left, width: knob.width }} />
          {eraData.map((e, n) => (
            <React.Fragment key={e.year}>
              {n > 0 ? <span className="conn" /> : null}
              <button ref={(el) => (btns.current[n] = el)} role="tab" aria-selected={n === i}
                className={`tick ${n === i ? "on" : ""}`} onClick={() => select(n)}>
                <span className="y num">{e.year}</span><span className="t">{e.tag}</span>
              </button>
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className={`g era ${out ? "out" : ""}`} style={{ alignItems: "start" }}>
        <div className="zl" style={{ gridColumn: "1 / 4", transitionDelay: out ? "0ms" : "90ms" }}>
          <LB>What he needed</LB>
          <div style={{ marginTop: 20 }}>
            {d.needs.map((w, k) => <p key={w} className="need" style={{ opacity: 1 - k * .2 }}>{w}</p>)}
          </div>
          <p className="body" style={{ marginTop: 24, maxWidth: "34ch" }}>{d.note}</p>
          <div style={{ marginTop: 28 }}>
            {d.drivers.map((x) => (
              <span key={x} className="lb"
                style={{ display: "inline-block", marginRight: 16, marginBottom: 8, color: "var(--ink-2)" }}>{x}</span>
            ))}
          </div>
        </div>

        <div className="zc" style={{
          gridColumn: "4 / 10", transitionDelay: out ? "0ms" : "220ms", marginTop: "clamp(-44px,-4vh,0px)"
        }}>
          <div style={{ overflow: "hidden", height: "clamp(430px,70svh,800px)" }}>
            <div ref={figure} style={{ height: "100%", willChange: "transform" }}>
              <Media a={M.timeline[d.year]} style={{ height: "100%" }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: "clamp(18px,3vw,54px)", marginTop: 18, flexWrap: "wrap" }}>
            <div><LB>Era</LB><p className="body" style={{ marginTop: 6 }}>{d.era}</p></div>
            <div style={{ flex: 1, minWidth: 200 }}><LB>Style</LB><p className="body" style={{ marginTop: 6 }}>{d.style}</p></div>
            <div><LB>Reading</LB><p className="body" style={{ marginTop: 6 }}>{d.read}</p></div>
          </div>
        </div>

        <div className="zr" style={{ gridColumn: "10 / 13", transitionDelay: out ? "0ms" : "340ms" }}>
          <LB>How it read</LB>
          <p className="mid" style={{ marginTop: 18 }}>{d.eq[0]}<br /><span className="dim">→ {d.eq[1]}</span></p>
          <p className="body" style={{ marginTop: 20 }}>{d.identity}</p>
          <div style={{ marginTop: 28 }}>
            {d.signals.map((s) => <div className="kv" key={s}><span>{s}</span><span className="dim num">{d.year}</span></div>)}
          </div>
          <p className="lb" style={{ marginTop: 16 }}>{d.stat}</p>
        </div>
      </div>
    </section>
  );
}

function Silence({ a, line, kicker, align = "left" }) {
  const sec = useRef(null), plate = useRef(null);
  useScene(sec, (p) => {
    if (plate.current) plate.current.style.transform = `translate3d(0,${(p - .5) * -9}%,0) scale(1.06)`;
  }, 6);
  return (
    <section ref={sec} className="cv"
      style={{ height: "112svh", position: "relative", overflow: "hidden" }}>
      <div ref={plate} style={{ position: "absolute", inset: "-6% 0", willChange: "transform" }}>
        <Media a={a} style={{ height: "100%" }} />
      </div>
      <div style={{
        position: "absolute", inset: 0, background: align === "left"
          ? "linear-gradient(90deg,rgba(255,255,255,.94),rgba(255,255,255,.32) 56%,transparent)"
          : "linear-gradient(270deg,rgba(255,255,255,.94),rgba(255,255,255,.32) 56%,transparent)"
      }} />
      <div className="full" style={{
        position: "absolute", inset: 0, display: "flex", alignItems: "flex-end",
        paddingBottom: "clamp(56px,12vh,150px)", justifyContent: align === "left" ? "flex-start" : "flex-end"
      }}>
        <div style={{ maxWidth: "21ch" }}>
          {kicker ? <Reveal><LB style={{ marginBottom: 16 }}>{kicker}</LB></Reveal> : null}
          <Lines lines={line} className="mid" />
        </div>
      </div>
    </section>
  );
}

/** Scroll-scrubbed film. Video if the manifest gives a video, canvas sequence
    if it gives frames — both driven by the same damped progress. */
function Film() {
  const sec = useRef(null), video = useRef(null), veil = useRef(null);
  const prog = useRef(0);
  const near = useRef(true);
  const [line, setLine] = useState(0);
  const isSeq = M.film?.kind === "sequence";

  /* Don't ask the decoder for frames nobody is looking at. */
  useEffect(() => {
    const el = sec.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => { near.current = e.isIntersecting; },
      { rootMargin: "40% 0px" });
    io.observe(el); return () => io.disconnect();
  }, []);

  useScene(sec, (p) => {
    prog.current = p;
    const v = video.current;
    if (v && near.current && v.readyState >= 1 && v.duration && !reduced()) {
      const t = p * (v.duration - .05);
      /* One seek per ~2 frames of the source. Seeking more often than the
         decoder can serve just queues work and makes the scrub feel late. */
      if (Math.abs(v.currentTime - t) > 1 / 48) {
        if (v.fastSeek) { try { v.fastSeek(t); } catch (e) { v.currentTime = t; } }
        else v.currentTime = t;
      }
    }
    if (veil.current) veil.current.style.opacity = `${clamp((p - .86) / .14)}`;
    const n = Math.round(p * (filmCopy.length - 1));
    setLine((c) => (c === n ? c : n));
  }, 8);

  return (
    <section id="evolution" ref={sec} style={{ height: `${(isSeq ? Math.max(4, M.film.count / 18) : 6) * 62}svh` }}>
      <div className="fstage">
        {isSeq
          ? <Sequence a={M.film} progressRef={prog} />
          : <Media a={M.film} scrubRef={video} eager style={{ height: "100%" }} />}
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(0deg,#fff 0%,rgba(255,255,255,.5) 24%,transparent 54%)"
        }} />
        <div ref={veil} style={{ position: "absolute", inset: 0, background: "#fff", opacity: 0 }} />
        <div className="full" style={{
          position: "absolute", inset: 0, display: "flex", alignItems: "flex-end",
          paddingBottom: "clamp(52px,11vh,140px)"
        }}>
          <div style={{ position: "relative", width: "100%", height: "1.3em" }}>
            {filmCopy.map((c, k) => (
              <p key={k} className="mid" style={{
                position: "absolute", inset: 0, opacity: k === line ? 1 : 0,
                transform: `translateY(${k === line ? 0 : 14}px)`,
                transition: "opacity 620ms var(--ez),transform 900ms var(--ez-out)"
              }}>{c}</p>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ——————————————————————————————————————————————————————————————
   THE FIELD
   BUG FIXED: this ran on a 0 0 100 100 viewBox while setting label sizes in
   px. In SVG those are user units, so a "7.4px" label rendered ~67px tall at
   desktop width — the labels were bigger than the chart. Real coordinate
   space now, with px that mean px, and label sides chosen per point so the
   two formalwear brands stop colliding.
   —————————————————————————————————————————————————————————————— */
const FIELD = { w: 1000, h: 660, l: 92, r: 96, t: 46, b: 74 };
const fx = (v) => FIELD.l + (v / 100) * (FIELD.w - FIELD.l - FIELD.r);
const fy = (v) => FIELD.h - FIELD.b - (v / 100) * (FIELD.h - FIELD.t - FIELD.b);
/* label placement per point: which side, and any nudge to clear a neighbour */
const LABEL = {
  "van-heusen": { side: "left", dy: -2 },
  "louis-philippe": { side: "left", dy: 16 },
  "us-polo": { side: "right", dy: 14 },
  "allen-solly": { side: "right", dy: -6 },
  "rare-rabbit": { side: "right", dy: 0 },
  "snitch": { side: "left", dy: 0 },
  "rumoar": { side: "left", dy: -20 },
};

function Plot({ selected, hovered, onSelect, onHover, isolate = false, quiet = false, you = null }) {
  const ref = useRef(null);
  const [live, setLive] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && (setLive(true), io.disconnect()), { threshold: .25 });
    io.observe(el); return () => io.disconnect();
  }, []);
  const b = brandData.find((x) => x.id === (hovered || selected));
  const wsX = fx(whiteSpace.x), wsY = fy(whiteSpace.y + whiteSpace.h);
  const wsW = fx(whiteSpace.x + whiteSpace.w) - wsX, wsH = fy(whiteSpace.y) - wsY;

  return (
    <div style={{ position: "relative", width: "100%" }} ref={ref}>
      <svg viewBox={`0 0 ${FIELD.w} ${FIELD.h}`} style={{ width: "100%", display: "block" }}
        role="img" aria-label="Indian menswear positioning field">
        {[25, 50, 75, 100].map((g) => (
          <g key={g} stroke="#F2F1EE" strokeWidth="1">
            <line x1={fx(g)} y1={fy(0)} x2={fx(g)} y2={fy(100)} />
            <line x1={fx(0)} y1={fy(g)} x2={fx(100)} y2={fy(g)} />
          </g>
        ))}

        <rect x={wsX} y={wsY} width={wsW} height={wsH} rx="2"
          fill={isolate ? "rgba(27,42,59,.05)" : "transparent"}
          stroke={isolate ? "#1B2A3B" : "#E8E6E1"} strokeWidth="1" strokeDasharray="6 7"
          style={{ transition: "all 1.4s cubic-bezier(.22,.68,.16,1)" }} />
        {isolate ? (
          <text x={wsX + wsW / 2} y={wsY + wsH / 2 + 4} textAnchor="middle" className="ax" fill="#1B2A3B">
            THE WHITE SPACE
          </text>
        ) : null}

        <line x1={fx(0)} y1={fy(0)} x2={fx(100)} y2={fy(0)} stroke="#DFDDD8" strokeWidth="1" />
        <line x1={fx(0)} y1={fy(0)} x2={fx(0)} y2={fy(100)} stroke="#DFDDD8" strokeWidth="1" />
        <text x={fx(0)} y={FIELD.h - 28} className="ax">{axes.x.low}</text>
        <text x={fx(100)} y={FIELD.h - 28} className="ax" textAnchor="end">{axes.x.high}</text>
        <text x={34} y={fy(0)} className="ax" transform={`rotate(-90 34 ${fy(0)})`}>{axes.y.low}</text>
        <text x={34} y={fy(100)} className="ax" textAnchor="end"
          transform={`rotate(-90 34 ${fy(100)})`}>{axes.y.high}</text>

        {brandData.map((br, n) => {
          const on = selected === br.id || hovered === br.id;
          const fade = (isolate && !br.isBrand) || (selected && selected !== br.id);
          const L = LABEL[br.id] || { side: "right", dy: 0 };
          const left = L.side === "left";
          const cx = fx(br.x), cy = fy(br.y);
          const r = on ? 9 : br.isBrand ? 8 : 5.5;
          return (
            <g key={br.id} style={{
              opacity: live ? (fade ? .13 : 1) : 0,
              transition: `opacity 900ms cubic-bezier(.22,.68,.16,1) ${n * 80}ms`,
            }}>
              {(on || br.isBrand) ? (
                <circle cx={cx} cy={cy} r={on ? 26 : 18} fill="none"
                  stroke={br.isBrand ? "#1B2A3B" : "#0C0C0B"} strokeWidth="1" opacity=".35"
                  style={{ transition: "r 420ms cubic-bezier(.16,1,.3,1)" }} />
              ) : null}
              <circle className="pt" cx={cx} cy={cy} r={r}
                fill={br.isBrand ? "#1B2A3B" : "#0C0C0B"}
                onMouseEnter={() => !quiet && onHover(br.id)} onMouseLeave={() => !quiet && onHover(null)}
                onClick={() => !quiet && onSelect(br.id)}
                tabIndex={quiet ? -1 : 0} role={quiet ? undefined : "button"} aria-label={br.name}
                onKeyDown={(e) => e.key === "Enter" && onSelect(br.id)} />
              {/* generous invisible hit area — 5px dots are a cruel click target */}
              {!quiet ? <circle cx={cx} cy={cy} r="26" fill="transparent" style={{ cursor: "pointer" }}
                onMouseEnter={() => onHover(br.id)} onMouseLeave={() => onHover(null)}
                onClick={() => onSelect(br.id)} /> : null}
              <text className="ptl" x={cx + (left ? -16 : 16)} y={cy + 5 + (L.dy || 0)}
                textAnchor={left ? "end" : "start"}
                style={{ opacity: on ? 1 : .62, fontWeight: on ? 600 : 400 }}>{br.name}</text>
            </g>
          );
        })}

        {/* the visitor, once they've plotted themselves */}
        {you ? (
          <g style={{ pointerEvents: "none" }}>
            <circle cx={fx(you.x)} cy={fy(you.y)} r="34" fill="none" stroke="#1B2A3B" strokeWidth="1"
              opacity=".5" className="youring" />
            <line x1={fx(you.x)} y1={fy(you.y)} x2={fx(you.nearest.x)} y2={fy(you.nearest.y)}
              stroke="#1B2A3B" strokeWidth="1" strokeDasharray="3 5" opacity=".45" />
            <circle cx={fx(you.x)} cy={fy(you.y)} r="7" fill="#fff" stroke="#1B2A3B" strokeWidth="2.5" />
            <text className="ptl" x={fx(you.x)} y={fy(you.y) - 26} textAnchor="middle"
              fill="#1B2A3B" style={{ fontWeight: 600 }}>YOU</text>
          </g>
        ) : null}
      </svg>

      {!quiet && b ? (
        <div className="glass" style={{
          position: "absolute",
          left: `${(fx(b.x) / FIELD.w) * 100}%`, top: `${(fy(b.y) / FIELD.h) * 100}%`,
          transform: b.x > 60 ? "translate(-108%,-50%)" : "translate(24px,-50%)",
          padding: "15px 17px", minWidth: 208, borderRadius: 3, pointerEvents: "none"
        }}>
          <p className="h3">{b.name}</p>
          {[["Style", b.style], ["Audience", b.audience], ["Personalisation", b.personalization]].map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 20, paddingTop: 8 }}>
              <span className="lb">{k}</span>
              <span style={{ fontSize: ".75rem", fontWeight: 300, textAlign: "right" }}>{v}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Dive({ brand, onClose }) {
  const ref = useRef(null);
  const open = !!brand;

  /* BUG FIXED: the panel was aria-hidden while closed but still contained a
     focusable Close button — keyboard users could tab into a hidden element.
     `inert` removes the whole subtree from focus, hit-testing and the a11y
     tree in one property, and the top layer keeps it above the sticky nav. */
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.inert = !open;
    if (open) requestAnimationFrame(() => el.querySelector("button")?.focus());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const k = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);

  const qs = brand ? [
    ["Who they serve", brand.serve], ["What they solve", brand.solve],
    ["How they position", brand.position], ["Where the proposition stops", brand.stops],
    ["The open space", brand.open],
  ] : [];
  return (
    <aside ref={ref} className={`glass dive ${open ? "open" : ""}`}
      role="dialog" aria-modal="false" aria-label={brand ? `${brand.name} analysis` : undefined}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 18 }}>
        <div>
          <LB style={{ marginBottom: 12 }}>Brand analysis</LB>
          <h3 className="big" style={{ fontSize: "clamp(1.7rem,2.8vw,2.5rem)" }}>{brand?.name}</h3>
        </div>
        <button className="cta" onClick={onClose}>Close</button>
      </div>
      <div style={{ margin: "26px 0" }}>
        <Media a={brand ? M.brands[brand.id] : null} style={{ aspectRatio: "16/10" }} />
      </div>
      {qs.map(([q, a]) => (
        <div key={q} style={{ padding: "20px 0", borderTop: ".5px solid var(--line)" }}>
          <LB style={{ marginBottom: 9 }}>{q}</LB><p className="lede">{a}</p>
        </div>
      ))}
      <p className="lb" style={{ marginTop: 18, lineHeight: 1.9 }}>
        Coordinates {brand?.x} / {brand?.y} are directional editorial estimates — edit in brandData
      </p>
    </aside>
  );
}

function Matrix({ selected, onSelect, hovered, onHover }) {
  /* Shuttered by default. Three columns is what a reader can hold at a glance;
     the other five attributes live inside the row until asked for. */
  const cols = [["audience", "Built for"], ["identity", "Identity model"]];
  const more = [["style", "Style"], ["occasion", "Occasion"], ["price", "Price"],
  ["personalization", "Personalisation"]];
  return (
    <div>
      <div className="row rowhead" style={{ borderTop: 0, cursor: "default", padding: "0 0 14px" }}>
        <LB>Brand</LB>{cols.map(([, l]) => <LB key={l}>{l}</LB>)}
      </div>
      {brandData.map((b) => {
        const on = selected === b.id;
        return (
          <div key={b.id}>
            <div className={`row ${on || hovered === b.id ? "on" : ""}`} role="button" tabIndex={0}
              aria-expanded={on}
              onMouseEnter={() => onHover(b.id)} onMouseLeave={() => onHover(null)}
              onClick={() => onSelect(on ? null : b.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(on ? null : b.id); }
              }}>
              <p className="h3" style={{ color: b.isBrand ? "var(--mark)" : "var(--ink)" }}>{b.name}</p>
              {cols.map(([k, l]) => <p className="body" key={k} data-l={l}><span>{b[k]}</span></p>)}
              <span className="plus" aria-hidden />
            </div>
            <div className={`rx ${on ? "open" : ""}`}>
              <div style={{
                display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
                gap: "var(--gut)", padding: "4px 0 32px"
              }}>
                <div>
                  <LB style={{ marginBottom: 9 }}>Attributes</LB>
                  {more.map(([k, l]) => (
                    <div className="kv" key={k}><span>{l}</span><span className="dim">{b[k]}</span></div>
                  ))}
                </div>
                {[["Solves", b.solve], ["Stops at", b.stops], ["Leaves open", b.open]].map(([k, v]) => (
                  <div key={k}><LB style={{ marginBottom: 9 }}>{k}</LB><p className="body">{v}</p></div>
                ))}
              </div>
            </div>
          </div>
        );
      })}
      <div className="rule" />
    </div>
  );
}

function WhiteSpaceAct({ you }) {
  const sec = useRef(null);
  const [s, setS] = useState(0);
  useScene(sec, (p) => setS((c) => {
    const n = p < .3 ? 0 : p < .62 ? 1 : 2;
    return n === c ? c : n;
  }), 8);
  const lines = [
    ["The market is crowded.", "The identity space isn't."],
    ["Every brand answers the same question.", "What should a man wear?"],
    ["Almost none answer the other.", "Who is he trying to become?"],
  ];
  return (
    <section id="whitespace" ref={sec} style={{ height: "290svh" }}>
      <div style={{
        position: "sticky", top: 0, height: "100svh", display: "flex",
        alignItems: "center", overflow: "hidden"
      }}>
        <div className="g" style={{ width: "100%", alignItems: "center" }}>
          <div style={{ gridColumn: "1 / 8", position: "relative", minHeight: "5.6em" }}>
            {lines.map((l, k) => (
              <h2 key={k} className="big" style={{
                position: k === 0 ? "relative" : "absolute", inset: k === 0 ? undefined : 0,
                opacity: s === k ? 1 : 0, filter: s === k ? "none" : "blur(10px)",
                transform: `translateY(${s === k ? 0 : s > k ? -18 : 18}px)`,
                transition: "opacity 820ms var(--ez),filter 820ms var(--ez),transform 1.2s var(--ez-out)"
              }}>{l[0]}<br /><span style={{ color: k === 2 ? "var(--mark)" : "var(--ink-3)" }}>{l[1]}</span></h2>
            ))}
          </div>
          <div className="wsplot" style={{ gridColumn: "8 / 13", opacity: s === 0 ? .3 : 1, transition: "opacity 1.4s var(--ez)" }}>
            <Plot selected={null} hovered={null} onSelect={() => { }} onHover={() => { }}
              isolate={s === 2} quiet you={you} />
          </div>
        </div>
      </div>
    </section>
  );
}

function RumoarAct() {
  const sec = useRef(null), plate = useRef(null), mark = useRef(null);
  useScene(sec, (p) => {
    if (plate.current) {
      plate.current.style.transform = `scale(${1.12 - p * .12})`;
      plate.current.style.opacity = `${clamp(p * 2.4)}`;
    }
    if (mark.current) mark.current.style.letterSpacing = `${.52 - clamp(p * 1.4) * .28}em`;
  }, 7);
  return (
    <section id="rumoar" ref={sec} style={{ height: "190svh" }}>
      <div style={{ position: "sticky", top: 0, height: "100svh", overflow: "hidden", display: "flex", alignItems: "center" }}>
        <div ref={plate} style={{ position: "absolute", inset: 0, willChange: "transform" }}>
          <Media a={M.editorial.reveal} style={{ height: "100%" }} />
        </div>
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(80deg,#fff 0%,rgba(255,255,255,.88) 38%,rgba(255,255,255,.12) 92%)"
        }} />
        <div className="g" style={{ position: "relative", width: "100%" }}>
          <div style={{ gridColumn: "1 / 8" }}>
            <p ref={mark} className="wm" style={{ fontSize: "clamp(1rem,2.1vw,1.55rem)", marginBottom: "clamp(22px,5vh,58px)" }}>
              RUMOAR
            </p>
            <Lines className="big" lines={[
              "A wardrobe is not a list of purchases.",
              { t: "It is a set of rules that survives the office,", dim: true },
              { t: "the flight, the dinner and the decade —", dim: true },
              { t: "and still reads as one man.", dim: true },
            ]} />
          </div>
        </div>
      </div>
    </section>
  );
}

function Threshold({ onLab }) {
  return (
    <section id="lab" style={{ position: "relative", height: "100svh", overflow: "hidden", display: "flex", alignItems: "center" }}>
      <div style={{ position: "absolute", inset: 0 }}><Media a={M.editorial.threshold} style={{ height: "100%" }} /></div>
      <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,.88)" }} />
      <div className="g" style={{ position: "relative", width: "100%" }}>
        <div style={{ gridColumn: "1 / 9" }}>
          <Reveal><LB>06 — The Styling Lab</LB></Reveal>
          <Lines className="mega" style={{ margin: "clamp(22px,4vh,46px) 0" }}
            lines={["Same man.", { t: "Six identities.", dim: true }]} />
          <Reveal delay={200}>
            <p className="lede" style={{ maxWidth: "40ch", marginBottom: "clamp(28px,5vh,54px)" }}>
              Dress him in the market's answers, then in ours. The clothes are the easy part.
              Watch what happens to the man underneath.
            </p>
          </Reveal>
          <Reveal delay={280}>
            <Magnetic className="cta" strength={20} onClick={onLab}
              style={{ padding: "16px 34px", fontSize: ".64rem" }}>
              Enter the RUMOAR Styling Lab
            </Magnetic>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function Colophon() {
  return (
    <footer className="g" style={{ padding: "clamp(70px,12vh,150px) 0 clamp(40px,6vh,80px)" }}>
      <div style={{ gridColumn: "1 / 5" }}>
        <p className="wm" style={{ fontSize: "1rem" }}>RUMOAR</p>
        <LB style={{ marginTop: 12 }}>Build your identity</LB>
      </div>
      <div style={{ gridColumn: "9 / 13" }}><LB style={{ lineHeight: 2 }}>[FINAL CTA — brand team]</LB></div>
    </footer>
  );
}

/* ==========================================================================
   §7  LAB
========================================================================== */
function LookRender({ look, active, preview }) {
  const layers = M.lab.layers[look.id] || {};
  const stack = [M.lab.base, layers.bottom, layers.top, layers.outer].filter((x) => x && x.path);
  const composed = M.lab.looks[look.id];
  const hasLayers = stack.length > 1;
  return (
    <div className="lyr" style={{
      opacity: active ? 1 : preview ? .3 : 0,
      transform: active ? "none" : "scale(.98) translateY(16px)",
      filter: active ? "none" : "blur(12px)",
    }}>
      {hasLayers ? (
        <div style={{ position: "relative", width: "100%", height: "100%" }}>
          {stack.map((l, k) => (
            <Media key={k} a={l} style={{ position: "absolute", inset: 0, background: "transparent" }} />
          ))}
        </div>
      ) : composed && composed.path ? (
        <Media a={composed} style={{ height: "100%", background: "transparent" }} />
      ) : (
        <StandIn tone={look.tone} name={look.name} />
      )}
    </div>
  );
}

/* Temporary development stand-in — real assets replace it entirely. */
function StandIn({ tone, name }) {
  return (
    <div style={{ position: "relative", width: "100%", height: "100%", display: "grid", placeItems: "end center" }}>
      <svg viewBox="0 0 140 320" style={{ height: "94%" }} aria-label={name}>
        <g fill={tone}>
          <circle cx="70" cy="30" r="19" />
          <path d="M42 60h56l16 26-12 8-6-14v88H44v-88l-6 14-12-8z" />
          <path d="M46 176h22l-2 128H46z" /><path d="M72 176h22v128H74z" />
        </g>
      </svg>
      <p className="lb" style={{ position: "absolute", left: 0, bottom: 0 }}>
        Development stand-in — lab/looks/ or lab/character/
      </p>
    </div>
  );
}

function Compare({ a, b }) {
  const box = useRef(null), div = useRef(null), clip = useRef(null);
  const target = useRef(50), cur = useRef(50), on = useRef(false);
  const move = (cx) => {
    const r = box.current?.getBoundingClientRect(); if (!r) return;
    target.current = clamp(((cx - r.left) / r.width) * 100, 1, 99);
  };
  useFrame((dt) => {
    cur.current = damp(cur.current, target.current, 14, dt);
    if (clip.current) clip.current.style.clipPath = `inset(0 0 0 ${cur.current}%)`;
    if (div.current) div.current.style.left = `${cur.current}%`;
  });
  return (
    <div className="cmp" ref={box} style={{ height: "clamp(380px,68svh,760px)" }}
      onPointerDown={(e) => { on.current = true; e.currentTarget.setPointerCapture(e.pointerId); move(e.clientX); }}
      onPointerMove={(e) => on.current && move(e.clientX)}
      onPointerUp={() => (on.current = false)} onPointerCancel={() => (on.current = false)}>
      <div style={{ position: "absolute", inset: 0 }}>
        <LookRender look={a} active />
        <p className="lb" style={{ position: "absolute", left: 24, top: 22 }}>Generic — {a.name}</p>
      </div>
      <div ref={clip} style={{ position: "absolute", inset: 0, background: "#fff", clipPath: "inset(0 0 0 50%)" }}>
        <LookRender look={b} active />
        <p className="lb" style={{ position: "absolute", right: 24, top: 22, color: "var(--mark)" }}>RUMOAR</p>
      </div>
      <div className="dv" ref={div} style={{ left: "50%" }}><span className="glass dvk">↔</span></div>
    </div>
  );
}

function Lab({ onExit }) {
  const [id, setId] = useState("corporate");
  const [preview, setPreview] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [hot, setHot] = useState(false);
  const [history, setHistory] = useState(["corporate"]);
  const stage = useRef(null), ghost = useRef(null), start = useRef(null);
  const g = useRef({ x: 0, y: 0, cx: 0, cy: 0, r: 0 });
  const hotRef = useRef(false);

  const look = lookData.find((l) => l.id === id) || lookData[0];
  const apply = useCallback((n) => {
    setPreview(null); setId(n);
    setHistory((h) => [n, ...h.filter((x) => x !== n)].slice(0, 6));
  }, []);

  // ghost trails the pointer with lag and tilts from its own velocity — weight
  useFrame((dt) => {
    const s = g.current, px = s.cx;
    s.cx = damp(s.cx, s.x, 22, dt);
    s.cy = damp(s.cy, s.y, 22, dt);
    s.r = damp(s.r, clamp((s.cx - px) * .9, -10, 10), 10, dt);
    if (ghost.current) ghost.current.style.transform =
      `translate3d(${s.cx - 70}px,${s.cy - 92}px,0) rotate(${s.r}deg) scale(${hotRef.current ? 1.08 : 1})`;
  });

  const down = (e, n) => {
    start.current = { x: e.clientX, y: e.clientY, id: n };
    g.current.x = g.current.cx = e.clientX;
    g.current.y = g.current.cy = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e) => {
    const s = start.current; if (!s) return;
    g.current.x = e.clientX; g.current.y = e.clientY;
    if (Math.hypot(e.clientX - s.x, e.clientY - s.y) > 8) {
      if (!dragId) setDragId(s.id);
      const r = stage.current?.getBoundingClientRect();
      const inside = !!r && e.clientX > r.left && e.clientX < r.right && e.clientY > r.top && e.clientY < r.bottom;
      hotRef.current = inside;
      setHot((h) => (h === inside ? h : inside));
    }
  };
  const up = (e) => {
    const s = start.current; start.current = null; if (!s) return;
    const dragged = Math.hypot(e.clientX - s.x, e.clientY - s.y) > 8;
    if (dragged) {
      if (hotRef.current) apply(s.id);
      setDragId(null); setHot(false); hotRef.current = false;
      return;
    }
    if (preview === s.id) apply(s.id); else setPreview(s.id);
  };

  const shown = preview || id;
  const metrics = [["Formality", look.metrics.formality], ["Versatility", look.metrics.versatility],
  ["Distinction", look.metrics.distinction], ["Range", look.metrics.range]];
  const gLook = dragId ? lookData.find((l) => l.id === dragId) : null;

  return (
    <div className="labwrap">
      <div className="nav" style={{ position: "sticky" }}>
        <div className="navin glass" style={{
          maxWidth: 1180, borderRadius: 100, padding: "8px 8px 8px 24px", borderColor: "var(--gl-edge)"
        }}>
          <span className="wm">RUMOAR — STYLING LAB</span>
          <Magnetic className="cta" onClick={onExit}>Back to the argument</Magnetic>
        </div>
      </div>

      <div className="g" style={{ paddingTop: "clamp(16px,3vh,42px)", paddingBottom: "clamp(50px,8vh,110px)", alignItems: "start" }}>
        <div style={{ gridColumn: "1 / 3" }}>
          <LB>Sources</LB>
          <div className="labsrc" style={{ display: "grid", gap: 13, marginTop: 16 }}>
            {lookData.map((l) => (
              <div key={l.id} className={`tile ${shown === l.id ? "on" : ""}`} role="button" tabIndex={0}
                aria-label={`Dress him in ${l.name}`}
                onPointerDown={(e) => down(e, l.id)} onPointerMove={move} onPointerUp={up}
                onKeyDown={(e) => e.key === "Enter" && apply(l.id)}>
                <div className="tf"><Media a={M.lab.thumbs[l.id]} style={{ height: "100%" }} /></div>
                <p style={{ fontSize: ".78rem", fontWeight: 400, marginTop: 8, color: l.isBrand ? "var(--mark)" : "var(--ink)" }}>
                  {l.name}
                </p>
                <LB>{l.house}</LB>
              </div>
            ))}
          </div>
          <p className="lb" style={{ marginTop: 18, lineHeight: 1.9 }}>
            Drag onto the figure — or tap to preview, tap again to dress
          </p>
        </div>

        <div style={{ gridColumn: "3 / 10" }}>
          <div ref={stage} className={`stage ${hot ? "hot" : ""}`}>
            {lookData.map((l) => (
              <LookRender key={l.id} look={l} active={l.id === id && !preview} preview={preview === l.id} />
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16, alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
            <LB>{hot ? "Release to dress him" : preview ? "Preview — tap again to apply" : "The figure"}</LB>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              {history.map((h) => (
                <button key={h} className="lb" style={{ color: h === id ? "var(--ink)" : "var(--ink-3)" }}
                  onClick={() => apply(h)}>{lookData.find((l) => l.id === h)?.name}</button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ gridColumn: "10 / 13" }}>
          <LB>The look</LB>
          <p className="mid" style={{ marginTop: 12 }}>{look.look}</p>
          <LB style={{ marginTop: 32 }}>Reads as</LB>
          <p className="h3" style={{ marginTop: 10, color: look.isBrand ? "var(--mark)" : "var(--ink)" }}>{look.reads}</p>
          <LB style={{ marginTop: 32 }}>Characteristics</LB>
          <div style={{ marginTop: 8 }}>{look.traits.map((t) => <div className="kv" key={t}><span>{t}</span></div>)}</div>
          <LB style={{ marginTop: 32 }}>Occasions</LB>
          <p className="body" style={{ marginTop: 8 }}>{look.occasions.join(" · ")}</p>
          <div style={{ marginTop: 32, display: "grid", gap: 17 }}>
            {metrics.map(([k, v]) => (
              <div key={k}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <LB>{k}</LB><span className="lb num">{v}/10</span>
                </div>
                <div className="meter"><i style={{ width: `${v * 10}%` }} /></div>
              </div>
            ))}
          </div>
          <p className="body" style={{ marginTop: 26, fontSize: ".83rem" }}>{look.note}</p>
        </div>
      </div>

      <div className="g" style={{ paddingBottom: "clamp(70px,12vh,150px)" }}>
        <div style={{ gridColumn: "1 / 13" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 18 }}>
            <h3 className="mid">The same man, two systems</h3><LB>Drag the divider</LB>
          </div>
          <Compare a={lookData[0]} b={lookData[lookData.length - 1]} />
        </div>
      </div>

      {/* what you leave with — an itemised session, not a cart */}
      <div className="g" style={{ paddingBottom: "clamp(80px,14vh,180px)", alignItems: "start" }}>
        <div style={{ gridColumn: "1 / 6" }}>
          <LB>Take it with you</LB>
          <h3 className="mid" style={{ marginTop: 16, maxWidth: "18ch" }}>
            Every version of him you built, itemised.
          </h3>
          <p className="body" style={{ marginTop: 18, maxWidth: "34ch" }}>
            Not a cart. A record of what each wardrobe did to the same man —
            and what it cost him in range.
          </p>
        </div>
        <div style={{ gridColumn: "8 / 13" }}>
          <Receipt history={history} />
        </div>
      </div>

      {gLook ? (
        <div className="ghost" ref={ghost} aria-hidden
          style={{ transform: `translate3d(${g.current.cx - 70}px,${g.current.cy - 92}px,0)` }}>
          <div style={{ aspectRatio: "3/4" }}><Media a={M.lab.thumbs[gLook.id]} style={{ height: "100%" }} /></div>
        </div>
      ) : null}
    </div>
  );
}

/* ==========================================================================
   §7b  THE THREE
   Each one puts the visitor inside the argument instead of describing it.
========================================================================== */

/** 01 · PLOT YOURSELF
    The visitor picks the roles they actually occupy in a week, and lands as a
    point on the same field as the brands — with a dotted line to whichever
    house sits closest. The argument stops being about the market and becomes
    about them. */
function PlotYourself({ you, setYou }) {
  const [picked, setPicked] = useState([]);

  const toggle = (id) => setPicked((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);

  useEffect(() => {
    if (picked.length < 2) { setYou(null); return; }
    const rs = roleData.filter((r) => picked.includes(r.id));
    const mean = (k) => rs.reduce((a, r) => a + r[k], 0) / rs.length;
    /* Spread across more roles pushes demand for identity range to the right.
       Coefficient is a stated editorial weighting, not a measured effect. */
    const x = Math.min(96, mean("x") + (rs.length - 1) * 6.5);
    const y = Math.min(96, mean("y") + (rs.length - 1) * 2.5);
    let nearest = brandData[0], best = Infinity;
    for (const b of brandData) {
      if (b.isBrand) continue;
      const d = Math.hypot(b.x - x, b.y - y);
      if (d < best) { best = d; nearest = b; }
    }
    setYou({ x, y, nearest, gap: Math.round(best), roles: rs.length });
  }, [picked, setYou]);

  return (
    <div>
      <LB>Or put yourself on it</LB>
      <p className="body" style={{ margin: "14px 0 22px", maxWidth: "34ch" }}>
        Which of these is true in a normal week? Pick every one that applies.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {roleData.map((r) => (
          <button key={r.id} className={`chip ${picked.includes(r.id) ? "on" : ""}`}
            aria-pressed={picked.includes(r.id)} onClick={() => toggle(r.id)}>{r.label}</button>
        ))}
      </div>

      <div style={{
        marginTop: 28, paddingTop: 22, borderTop: ".5px solid var(--line)",
        opacity: you ? 1 : .35, transition: "opacity 620ms var(--ez)"
      }}>
        {you ? (
          <>
            <p className="verdict">
              {you.roles} versions of you.<br />
              <span className="dim">Nearest house is {you.nearest.name} — and it is built for one of them.</span>
            </p>
            <div style={{ display: "flex", gap: 26, marginTop: 20, flexWrap: "wrap" }}>
              <div><LB>Distance to nearest</LB><p className="num" style={{ fontSize: "1.5rem", fontWeight: 200 }}>{you.gap}</p></div>
              <div><LB>Identity demand</LB><p className="num" style={{ fontSize: "1.5rem", fontWeight: 200 }}>{Math.round(you.x)}</p></div>
            </div>
            <p className="lb" style={{ marginTop: 18, lineHeight: 1.9 }}>
              A positioning sketch, not a measurement
            </p>
          </>
        ) : (
          <p className="verdict dim">Pick two or more to place yourself.</p>
        )}
      </div>
    </div>
  );
}

/** 02 · WARDROBE MATH
    "Nine pieces, forty outfits" is the kind of line every brand asserts.
    This computes it live — and shows the count collapse when a piece stops
    relating to the others, which is the whole argument for a system. */
function WardrobeMath() {
  const [on, setOn] = useState(wardrobe.map((w) => w.id));
  const shown = useRef(null);
  const [display, setDisplay] = useState(0);

  const { total, coherent } = useMemo(() => {
    const sel = wardrobe.filter((w) => on.includes(w.id));
    const tops = sel.filter((w) => w.cat === "top");
    const bottoms = sel.filter((w) => w.cat === "bottom");
    const outers = [null, ...sel.filter((w) => w.cat === "outer")];
    let t = 0, c = 0;
    for (const a of tops) for (const b of bottoms) for (const o of outers) {
      t++;
      const parts = [a, b, o].filter(Boolean);
      const fs = parts.map((p) => p.formality);
      const spread = Math.max(...fs) - Math.min(...fs);
      const clash = parts.some((p) => p.tone === "loud") && parts.some((p) => p.formality >= 6);
      if (spread <= 3 && !clash) c++;
    }
    return { total: t, coherent: c };
  }, [on]);

  /* count animates toward the real value — the number moving is the point */
  useFrame((dt) => {
    const cur = shown.current ?? coherent;
    const next = damp(cur, coherent, 9, dt);
    shown.current = next;
    setDisplay((d) => (Math.round(next) === d ? d : Math.round(next)));
  });

  return (
    <section className="g" style={{ padding: "clamp(70px,12vh,160px) 0", alignItems: "start" }}>
      <div style={{ gridColumn: "1 / 5" }}>
        <Reveal>
          <LB>The arithmetic</LB>
          <p className="body" style={{ margin: "16px 0 20px", maxWidth: "32ch" }}>
            Switch a piece off and watch what it costs. Coherence isn't a mood —
            it's a number, and most wardrobes are paying for pieces that don't
            multiply.
          </p>
        </Reveal>
        <div>
          {wardrobe.map((w) => (
            <button key={w.id} className={`piece ${on.includes(w.id) ? "on" : ""}`}
              aria-pressed={on.includes(w.id)}
              onClick={() => setOn((s) => s.includes(w.id) ? s.filter((x) => x !== w.id) : [...s, w.id])}>
              <span className="dot" />
              <span style={{ fontSize: ".86rem", fontWeight: 300 }}>{w.name}</span>
              <span className="lb" style={{ marginLeft: "auto" }}>{w.cat}</span>
            </button>
          ))}
        </div>
      </div>

      <div style={{ gridColumn: "6 / 13" }}>
        <Reveal delay={120}>
          <p className="count">{display}</p>
          <p className="mid" style={{ marginTop: 18, maxWidth: "16ch" }}>
            outfits that read as <span className="dim">the same man</span>
          </p>
          <div style={{ display: "flex", gap: 34, marginTop: 32, flexWrap: "wrap" }}>
            <div><LB>Pieces on</LB><p className="num" style={{ fontSize: "1.6rem", fontWeight: 200 }}>{on.length}</p></div>
            <div><LB>Combinations possible</LB><p className="num" style={{ fontSize: "1.6rem", fontWeight: 200 }}>{total}</p></div>
            <div><LB>Discarded as incoherent</LB><p className="num" style={{ fontSize: "1.6rem", fontWeight: 200 }}>{total - coherent}</p></div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/** 03 · THE IDENTITY RECEIPT
    Every look tried in the Lab is itemised like a till receipt — what it read
    as, what it cost in range. A takeaway object at the end of a styling
    session, instead of a cart. */
function Receipt({ history }) {
  const items = history.map((id) => lookData.find((l) => l.id === id)).filter(Boolean);
  const range = items.length ? Math.round(items.reduce((a, l) => a + l.metrics.range, 0) / items.length * 10) : 0;
  const stamp = new Date().toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const bars = useMemo(() => Array.from({ length: 34 }, () => 0.35 + Math.random() * 0.65), []);

  const copy = () => {
    const text = ["RUMOAR — IDENTITY RECEIPT", stamp, "",
      ...items.map((l) => `${l.name}  —  reads as ${l.reads.toLowerCase()}`),
      "", `Looks tried: ${items.length}`, `Average range: ${range}/100`,
      items.some((l) => l.isBrand) ? "You found the one built to move." : "None of these moves with you."]
      .join("\n");
    navigator.clipboard?.writeText(text);
  };

  return (
    <div className="receipt">
      <p style={{ letterSpacing: ".42em", fontWeight: 600, fontSize: ".68rem" }}>RUMOAR</p>
      <p style={{ opacity: .55, marginTop: 6 }}>IDENTITY RECEIPT · {stamp}</p>
      <hr />
      {items.length ? items.map((l, i) => (
        <div className="rline" key={l.id + i}>
          <span>{l.name}</span>
          <b style={{ textAlign: "right", opacity: .7 }}>{l.reads.toLowerCase()}</b>
        </div>
      )) : <p style={{ opacity: .5 }}>Nothing tried yet.</p>}
      <hr />
      <div className="rline"><span>LOOKS TRIED</span><b>{items.length}</b></div>
      <div className="rline"><span>AVERAGE RANGE</span><b>{range}/100</b></div>
      <div className="rline"><span>VERDICT</span>
        <b style={{ textAlign: "right", maxWidth: "60%" }}>
          {items.some((l) => l.isBrand) ? "One point of view, every room" : "A wardrobe, not a self"}
        </b>
      </div>
      <div className="barcode" aria-hidden>{bars.map((h, i) => <i key={i} style={{ height: `${h * 100}%` }} />)}</div>
      <button className="lb" style={{ marginTop: 16, textDecoration: "underline", textUnderlineOffset: 4 }}
        onClick={copy}>Copy receipt</button>
    </div>
  );
}

/* ==========================================================================
   §8  APP
========================================================================== */
export default function Rumoar() {
  const [route, setRoute] = useState(() =>
    typeof window !== "undefined" && window.location.hash === "#/lab" ? "lab" : "site");
  const [veil, setVeil] = useState(false);
  const [intro, setIntro] = useState(false);
  const [selected, setSelected] = useState(null);
  const [hovered, setHovered] = useState(null);
  const [you, setYou] = useState(null);   // the visitor's own point on the field
  const [active, setActive] = useState("man");

  const brand = useMemo(() => brandData.find((b) => b.id === selected) || null, [selected]);

  useEffect(() => { const t = setTimeout(() => setIntro(true), 1800); return () => clearTimeout(t); }, []);

  const swap = (r) => {
    setRoute(r);
    window.location.hash = r === "lab" ? "#/lab" : "";
    window.scrollTo(0, 0);
  };

  /* Native View Transitions where available: the browser snapshots both
     states and animates the difference on the compositor. The wordmark veil
     is the fallback for engines that haven't shipped it. */
  const goto = (r) => {
    if (document.startViewTransition && !reduced()) {
      document.startViewTransition(() => swap(r));
      return;
    }
    setVeil(true);
    setTimeout(() => {
      swap(r);
      setTimeout(() => setVeil(false), 520);
    }, 660);
  };

  useEffect(() => {
    const h = () => setRoute(window.location.hash === "#/lab" ? "lab" : "site");
    window.addEventListener("hashchange", h);
    return () => window.removeEventListener("hashchange", h);
  }, []);

  useEffect(() => {
    if (route !== "site") return;
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => e.isIntersecting && setActive(e.target.id)),
      { rootMargin: "-45% 0px -45% 0px" });
    CHAPTERS.forEach((c) => { const el = document.getElementById(c.id); if (el) io.observe(el); });
    return () => io.disconnect();
  }, [route]);

  return (
    <div className="ru">
      <style>{CSS}</style>
      <Intro done={intro} />

      {route === "site" ? (
        <>
          <Progress />
          <button className="skip" onClick={() => {
            const el = document.getElementById("man");
            el?.scrollIntoView({ behavior: "smooth" });
            el?.querySelector("h2")?.focus?.();
          }}>Skip to the argument</button>
          <Nav active={active} onLab={() => goto("lab")} />
          <Hero />

          <Chapter id="man" n="01 — The Man"
            title={["Six moments in which clothing", { t: "quietly changed jobs.", dim: true }]}
            note="From survival, to provision, to status, to supply, to fragmentation — and then to something that still has no name. Select a year." />
          <Timeline />

          <Silence a={M.editorial.silence1} kicker="02 — The Evolution"
            line={["Access solved itself.", { t: "Coherence didn't.", dim: true }]} />
          <Film />

          <Chapter id="market" n="03 — The Market"
            title={["There has never been more menswear.",
              { t: "There has never been more of a man left over.", dim: true }]}
            note="Six houses plotted on what they actually optimise for. None of them is wrong. Each is built for one man, in one setting, at one point in his life." />

          <section className="g" style={{ paddingBottom: "clamp(60px,10vh,140px)" }}>
            <div style={{ gridColumn: "1 / 10" }}>
              <Reveal>
                <div className={`plotbox ${selected ? "back" : ""}`}>
                  <Plot selected={selected} hovered={hovered} onSelect={setSelected}
                    onHover={setHovered} you={you} />
                </div>
              </Reveal>
            </div>
            <div style={{ gridColumn: "10 / 13" }}>
              <Reveal delay={220}>
                <PlotYourself you={you} setYou={setYou} />
              </Reveal>
            </div>
          </section>

          <section className="g" style={{ paddingBottom: "clamp(80px,13vh,170px)" }}>
            <div style={{ gridColumn: "1 / 13" }}>
              <Reveal><Matrix selected={selected} onSelect={setSelected} hovered={hovered} onHover={setHovered} /></Reveal>
            </div>
          </section>

          <Silence a={M.editorial.silence2} align="right" kicker="04 — The White Space"
            line={["A professional at ten. A friend at seven.",
              { t: "A traveller on Saturday. One wardrobe,", dim: true },
              { t: "built for one of them.", dim: true }]} />

          <WhiteSpaceAct you={you} />
          <RumoarAct />
          <WardrobeMath />
          <Threshold onLab={() => goto("lab")} />
          <Colophon />
          <Dive brand={brand} onClose={() => setSelected(null)} />
        </>
      ) : (
        <Lab onExit={() => goto("site")} />
      )}

      <div className={`veil ${veil ? "on" : ""}`}>
        <span className="vm" style={{
          fontSize: veil ? "clamp(1.3rem,5.5vw,3.6rem)" : ".9rem",
          letterSpacing: veil ? ".6em" : ".38em",
          transform: veil ? "scale(1)" : "scale(.84)", opacity: veil ? 1 : 0,
        }}>RUMOAR</span>
      </div>
    </div>
  );
}
