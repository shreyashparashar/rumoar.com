import React, { useState, useEffect, useRef, useCallback, useMemo, createContext, useContext } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

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
    /* Each era is a small stack, not one photograph — the way a research board
       is actually built. Drop 1900-a.jpg … 1900-d.jpg into public/assets/timeline
       and the collage fills in. Until then each plate shows its own labelled
       placeholder, so the sequence is legible while the images are sourced. */
    /* The six single-era photographs were removed — each era is a collage of
       four plates now, so only the -a/-b/-c/-d files are needed. */
    plates: Object.fromEntries([1900, 1970, 2000, 2010, 2020, 2026].map((y) => [y,
      ["a", "b", "c", "d"].map((k) => img(`timeline/${y}-${k}.jpg`, `${y} — plate ${k}`, "50% 30%")),
    ])),
  },

  /* The scroll-scrubbed film. Video preferred; for per-frame control use:
       film: seq("film/frame-", 120, { pad: 4, ext: "jpg" })                 */
  film: vid("film/film.mp4", { poster: "film/poster.jpg", scrub: true, alt: "The week" }),

  /* THE THESIS FILM — the pinned "one man, the wardrobe changes" sequence.

     Scroll-scrubbed. The file is encoded with a keyframe every 5 frames
     (-g 5 -keyint_min 5 -sc_threshold 0), which is the whole trick: a default
     export puts a keyframe roughly every 250 frames, so dragging currentTime
     forces the browser to decode an entire group of pictures per scroll tick
     and the scrub visibly snags. Dense keyframes cost file size and buy smooth
     scrubbing. Re-encode any replacement the same way or it will stutter.

     Source: scroll.mp4 → 1280×720, 24fps, 5.04s, 121 frames, audio stripped,
     faststart. 1.2 MB.

     If you ever want per-frame control instead, this slot also accepts a
     numbered frame sequence and the component adapts with no other changes:
       man: seq("thesis/man-", 121, { pad: 4, ext: "webp" })                 */
  thesis: {
    man: vid("thesis/man.mp4", { scrub: true,
      alt: "One man standing still while an entire wardrobe changes around him — smart casual, stripped to a base layer, then rebuilt as athletic wear" }),
  },

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

/* ---------------------------------------------------------------------------
   SHARED ERA STATE
   The timeline is no longer a section that owns its own index. It is the
   scrubber for the whole argument: income, roles and price all read from here.
   --------------------------------------------------------------------------- */
const EraContext = createContext({ era: 0, setEra: () => {} });
const useEra = () => useContext(EraContext);

/* ---------------------------------------------------------------------------
   §2b  INCOME & CONSUMPTION          [HYPOTHESIS 1]
   Sources: IMARC (menswear market), PRICE/Equity Edge (middle class share),
   Goldman Sachs (affluent cohort), Deloitte India Jan 2026 (premiumisation).
   `systems` is the flat line: how many wardrobe operating systems a man can buy.
   It has been 1 for a century, and that is the entire joke.
   --------------------------------------------------------------------------- */
const incomeSeries = [
  { year: 1900, income: 2, market: 1, middle: 2, systems: 1, note: "Cloth is bought by weight and worn until it fails." },
  { year: 1970, income: 8, market: 5, middle: 8, systems: 1, note: "One good set, kept for occasions. The wardrobe is permanent." },
  { year: 2000, income: 24, market: 18, middle: 17, systems: 1, note: "Malls, brands and EMI arrive together. Access is solved." },
  { year: 2010, income: 42, market: 38, middle: 24, systems: 1, note: "Infinite catalogue. A man can buy anything, and does." },
  { year: 2020, income: 68, market: 62, middle: 31, systems: 1, note: "Occasions collapse into each other. The closet does not adapt." },
  { year: 2026, income: 100, market: 100, middle: 38, systems: 1, note: "₹21.9B market, 7.24% CAGR, and still one way to build a wardrobe." },
];

const incomeFacts = [
  { k: "Menswear market, 2025", v: "$21.9B", s: "IMARC" },
  { k: "Projected 2034", v: "$42.4B", s: "7.24% CAGR" },
  { k: "Middle class by 2031", v: "41%", s: "of population" },
  { k: "Affluent consumers by 2027", v: "100M", s: "Goldman Sachs" },
  { k: "Branded share of apparel spend by 2030", v: ">50%", s: "OC&C" },
  { k: "Tried a new fashion brand this year", v: "~40%", s: "Deloitte India" },
];

/* ---------------------------------------------------------------------------
   §2c  THE ROLES                     [HYPOTHESIS 2]
   Not demographic segments. The market already segments by demographic and
   occasion, and that is precisely what produced the problem.

   Vox Populi Research (QRCA VIEWS, Dec 2025) found that urban Indian men
   recalibrate persona across social groups, and that the recalibration itself
   produces a fragmented sense of identity. So these are not different men.
   They are one man, in different rooms, inside the same week.

   `served` — 0-10, how well the current market dresses that role.
   `from`   — index into eraData at which the role becomes a distinct register.
   --------------------------------------------------------------------------- */
const personaData = [
  { id: "provider", name: "The Provider", x: 24, y: 24, served: 9, from: 1,
    room: "Office, client meeting, the commute",
    reads: "Competent. Reliable. Not to be questioned.",
    wears: "Formal, or near-formal. The one register the market genuinely solved.",
    tension: "The role he is thanked for least and dressed for most." },
  { id: "son", name: "The Son", x: 30, y: 18, served: 6, from: 0,
    room: "Parents' house, family function, the town he left",
    reads: "Still theirs. Still respectful. Doing well.",
    wears: "Ethnic, or formal standing in for ethnic.",
    tension: "Dressing to prove he hasn't changed, in a life that changed him." },
  { id: "ceremonial", name: "The Ceremonial Man", x: 20, y: 12, served: 8, from: 0,
    room: "Weddings, festivals, the extended network watching",
    reads: "Prosperous. Correct. A credit to the family.",
    wears: "Occasion wear. Worn twice, stored eleven months.",
    tension: "Maximum spend, minimum wear, zero carry-over." },
  { id: "peer", name: "The Peer", x: 46, y: 80, served: 7, from: 3,
    room: "Friends, the gym, the group chat, the bar",
    reads: "Current. In on it. Not trying too hard.",
    wears: "Trend-led, fast, replaced on a cycle.",
    tension: "The only register where being outdated carries a social cost." },
  { id: "partner", name: "The Partner", x: 52, y: 64, served: 3, from: 3,
    room: "Dinner, the flat, a weekend away",
    reads: "Chosen. Present. Someone she is glad to be seen with.",
    wears: "Improvised. Borrowed from the office or the gym.",
    tension: "The most intimate room has the least designed wardrobe." },
  { id: "self", name: "The Self", x: 70, y: 55, served: 1, from: 4,
    room: "Alone. The one nobody dresses for.",
    reads: "Nothing. There is no audience.",
    wears: "Whatever is soft and nearest.",
    tension: "The only self that is consistently him — and it has no clothes." },
];

/* ---------------------------------------------------------------------------
   §2d  THE PRICE GAP                 [HYPOTHESIS 4]
   Deloitte India, "Weaving a new India identity", January 2026.
   Mid-premium ₹3,500–7,000 compounds at ~25%. Premium above it at 45%+ —
   the highest growth figure in the report.

   The gap is NOT a hole in the price ladder. Brands exist in every band, and
   claiming otherwise would be false. The gap is in WHAT IS SOLD at a price:
   every house in the fastest-growing bands sells a garment. None sells a system.
   `system` — 0-10, how much of what you buy is a method rather than an object.
   --------------------------------------------------------------------------- */
const priceBands = [
  { id: "mass", name: "Mass", range: "under ₹3,500", cagr: "baseline", lo: 0, hi: 28 },
  { id: "mid", name: "Mid-premium", range: "₹3,500 – ₹7,000", cagr: "~25% CAGR", lo: 28, hi: 58 },
  { id: "premium", name: "Premium", range: "₹7,000 +", cagr: "45%+ CAGR", lo: 58, hi: 86 },
  { id: "luxury", name: "Luxury", range: "apex", cagr: "wealth-led", lo: 86, hi: 100 },
];

const pricePoints = [
  { id: "us-polo", name: "U.S. Polo Assn.", price: 14, system: 1 },
  { id: "snitch", name: "Snitch", price: 18, system: 1 },
  { id: "allen-solly", name: "Allen Solly", price: 30, system: 2 },
  { id: "van-heusen", name: "Van Heusen", price: 44, system: 3 },
  { id: "louis-philippe", name: "Louis Philippe", price: 62, system: 2 },
  { id: "rare-rabbit", name: "Rare Rabbit", price: 72, system: 3 },
  { id: "rumoar", name: "RUMOAR", price: 70, system: 9, isBrand: true },
];


const brandData = [
  { id: "van-heusen", name: "Van Heusen", x: 20, y: 27,
    audience: "The corporate man, 28–45", style: "Formal, boardroom-led", occasion: "Office, ceremony",
    price: "Mid-premium", personalization: "Low", identity: "Role-based",
    serve: "A man whose day has one setting, and whose clothes are judged inside it.",
    solve: "Dressing correctly for a workplace that still keeps a dress code.",
    position: "Authority through formality. The suit as professional equipment.",
    stops: "At the office door. It has little to say about the same man on Saturday.",
    open: "A role can be equipped. A person has to be built." },
  { id: "louis-philippe", name: "Louis Philippe", x: 32, y: 17,
    audience: "The senior professional, 35–55", style: "Elevated formal, heritage-coded", occasion: "Office, occasion",
    price: "Premium", personalization: "Low", identity: "Status-based",
    serve: "A man who has arrived and needs the wardrobe to confirm it.",
    solve: "Looking established — fabric, finish and formality as proof of seniority.",
    position: "Heritage and rank. Quality as a legible social signal.",
    stops: "At hierarchy. Its language is seniority, not self-definition.",
    open: "Status is a fixed coordinate. Identity moves." },
  { id: "allen-solly", name: "Allen Solly", x: 44, y: 50,
    audience: "The office-casual man, 25–40", style: "Friday dressing, smart casual", occasion: "Work-adjacent",
    price: "Mid", personalization: "Low", identity: "Mood-based",
    serve: "A man who wants to look relaxed without looking careless.",
    solve: "The gap between the suit and the tee. It gave Indian offices permission to loosen.",
    position: "Ease inside professionalism. A register, offered ready-made.",
    stops: "At the register. It supplies a mood, not a wardrobe logic.",
    open: "A mood can be borrowed. A point of view has to be constructed." },
  { id: "us-polo", name: "U.S. Polo Assn.", x: 30, y: 41,
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
  { id: "snitch", name: "Snitch", x: 42, y: 84,
    audience: "The trend-native man, 18–28", style: "Fast contemporary", occasion: "Social, evening",
    price: "Accessible", personalization: "Low", identity: "Trend-based",
    serve: "A man dressing for a feed as much as for a room.",
    solve: "Speed. Whatever is current, immediately, affordably.",
    position: "Cultural currency, refreshed weekly.",
    stops: "At the cycle. Relevance expires on schedule.",
    open: "A wardrobe built on cycles cannot compound into a self." },
  { id: "rumoar", name: "RUMOAR", x: 85, y: 88, isBrand: true,
    audience: "The man who is several men in one week", style: "Identity system", occasion: "Full range",
    price: "Mid-premium to premium", personalization: "High", identity: "System-based",
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
  { id: "money", label: "The Money" },
  { id: "man", label: "The Man" },
  { id: "roles", label: "The Roles" },
  { id: "evolution", label: "The Evolution" },
  { id: "market", label: "The Market" },
  { id: "price", label: "The Price" },
  { id: "whitespace", label: "White Space" },
  { id: "rumoar", label: "RUMOAR" },
  { id: "lab", label: "The Lab" },
];

/* ==========================================================================
   §3  SYSTEM
========================================================================== */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Archivo:ital,wght@0,100..900;1,100..900&family=Inter:wght@300..800&family=Bodoni+Moda:ital,opsz,wght@0,6..96,400;1,6..96,400&display=swap');

/* ===========================================================================
   ONE ROOM, TWO LIGHT LEVELS
   The document is dark. Full stop. The lamp is the only thing that changes
   that, and the visitor pulls it — the site never decides on its own.

   Every component reads these six tokens, so flipping the class inverts the
   entire site with no per-section overrides and no flip-flopping mid-scroll.
   =========================================================================== */
.ru{
  /* ---- TYPEFACES: change these two lines and the whole site follows ----
     The reference is "BDO Grotesk Variable", a licensed Framer font that
     cannot be loaded from Google Fonts. Archivo is the closest free variable
     neo-grotesque. If you license BDO, self-host it and put its name here. */
  --font-body:'Archivo','Inter',-apple-system,system-ui,sans-serif;
  --font-mark:'Inter',-apple-system,system-ui,sans-serif;

  /* LIGHT IS THE DEFAULT. Pure white. */
  --paper:#FFFFFF; --paper-2:#FFFFFF; --paper-3:#F4F4F6;
  --ink:#0B0B0D; --ink-2:#55555E; --ink-3:#8E8E98;
  --line:#E9E9ED;
  --mark:#D8232F;
  --glass-bg:rgba(255,255,255,.62);
  color-scheme:light;
  --glass:var(--glass-bg); --gl-hi:rgba(255,255,255,.85); --gl-edge:rgba(11,11,13,.07);
  --grid:#F0F0F2; --axis:#DCDCE1;
  --fig:#14131A; --fig-2:#3A2228; --fig-3:#0B0A0F;
  --pool-cool:#DCEAEC; --pool-warm:#F6DFE2; --cord-shade:#B9B9C2;
  --micro:180ms; --ui:420ms; --content:820ms; --cine:1400ms;
  --ez:cubic-bezier(.22,.68,.16,1); --ez-out:cubic-bezier(.16,1,.3,1);
  --gut:clamp(14px,1.8vw,26px); --marg:clamp(20px,6vw,116px);
  transition:background 700ms var(--ez),color 700ms var(--ez);
  font-family:var(--font-body);color:var(--ink);background:var(--paper);
  -webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;
  scrollbar-gutter:stable;
}
/* keyboard entry point — visible only when focused */
.ru .skip{position:fixed;top:10px;left:10px;z-index:500;padding:12px 18px;border-radius:100px;
  background:var(--ink);color:#fff;font-family:var(--font-body);font-size:.62rem;
  letter-spacing:.2em;text-transform:uppercase;transform:translateY(-160%);
  transition:transform var(--ui) var(--ez)}
.ru .skip:focus-visible{transform:none}
.ru *,.ru *::before,.ru *::after{box-sizing:border-box}
.ru p{margin:0}.ru h1,.ru h2,.ru h3{margin:0;font-weight:200;letter-spacing:-.05em;line-height:.94}
.ru button{font-family:inherit;border:0;background:none;color:inherit;cursor:pointer;padding:0}
.ru :focus-visible{outline:2px solid var(--mark);outline-offset:4px;border-radius:2px}
.ru img,.ru video,.ru canvas{display:block}
/* SELECTION — the highlight has to invert against whatever is under it.
   The old rule hard-coded white text on a var(--ink) background, so in night
   mode (--ink is bone white) it painted white on white and the selected words
   vanished. Both halves now come from the theme, so it inverts correctly in
   either light level. */
.ru ::selection{background:var(--ink);color:var(--paper)}
.ru ::-moz-selection{background:var(--ink);color:var(--paper)}
/* Two surfaces are dark in BOTH light levels — the hero plate and the loader.
   They need the night treatment even while the rest of the page is on paper. */
.ru .hero ::selection,.ru .ld ::selection{background:#F5F3EF;color:#0A0A0E}
.ru .hero ::-moz-selection,.ru .ld ::-moz-selection{background:#F5F3EF;color:#0A0A0E}

.ru .g{display:grid;grid-template-columns:repeat(12,1fr);gap:var(--gut);
  padding-inline:var(--marg);max-width:1720px;margin-inline:auto}
@media (min-width:721px){.ru .g,.ru .full,.ru .nav{padding-left:max(var(--marg),40px);padding-right:max(var(--marg),96px)}}
.ru .full{padding-inline:var(--marg);max-width:1720px;margin-inline:auto}

/* ---------------------------------------------------------------------------
   TYPE
   Everything small was set light and grey, which reads as "designed" in a
   screenshot and as "unreadable" on an actual screen. Small type now carries
   weight and a darker ink; the display sizes are untouched, so the page still
   looks the same from across the room.
   --------------------------------------------------------------------------- */
.ru .mega{font-size:clamp(2.6rem,7.4vw,8rem);line-height:.9;letter-spacing:-.045em;font-weight:700;
  text-wrap:balance;overflow-wrap:break-word}
.ru .big{font-size:clamp(1.9rem,4.2vw,4rem);line-height:1;letter-spacing:-.04em;font-weight:700;
  text-wrap:balance;overflow-wrap:break-word}
.ru .mid{font-size:clamp(1.3rem,2.2vw,2.1rem);line-height:1.14;letter-spacing:-.03em;font-weight:600;
  text-wrap:balance;overflow-wrap:break-word}
.ru .h3{font-size:clamp(1rem,1.25vw,1.2rem);font-weight:700;letter-spacing:-.02em;line-height:1.32}
.ru .body{font-size:clamp(.92rem,1vw,1.05rem);line-height:1.62;color:var(--ink-2);font-weight:500;
  text-wrap:pretty}
.ru .lede{font-size:clamp(1rem,1.15vw,1.16rem);line-height:1.55;color:var(--ink-2);font-weight:500}
/* the small-caps label: was .58rem/600 in the lightest grey on the page */
.ru .lb{font-family:var(--font-body);font-size:.68rem;letter-spacing:.2em;text-transform:uppercase;
  color:var(--ink-3);font-weight:700}
.ru .num{font-variant-numeric:tabular-nums}
.ru .dim{color:var(--ink-3)}
.ru .rule{height:1px;background:var(--line)}

.ru .glass{background:var(--glass-bg);backdrop-filter:blur(30px) saturate(1.8);
  -webkit-backdrop-filter:blur(30px) saturate(1.8);border:.5px solid var(--gl-edge);
  box-shadow:inset 0 .5px 0 var(--gl-hi),0 24px 64px -36px rgba(12,12,11,.5)}

/* --- sticky era rail: the timeline stops being navigation and becomes a
   scrubber for the whole argument. Pinned while the linked charts pass under. */
.ru .railwrap{position:sticky;top:clamp(58px,7.5vh,88px);z-index:60;padding-top:clamp(12px,2vh,22px);
  padding-bottom:clamp(12px,2vh,22px);display:flex;justify-content:center;
  background:linear-gradient(180deg,var(--paper) 58%,rgba(255,255,255,0) 100%)}
@media (max-width:720px){.ru .railwrap{top:clamp(52px,7vh,68px)}}

/* --- income & consumption --- */
.ru .ic{width:100%;display:block}
.ru .icdot{transition:opacity var(--ui) var(--ez)}
.ru .facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));
  gap:1px;background:var(--line);border:1px solid var(--line);margin-top:clamp(24px,4vh,44px)}
.ru .fact{background:var(--paper);padding:18px 16px}
.ru .fact .v{font-size:clamp(1.15rem,1.9vw,1.6rem);font-weight:700;letter-spacing:-.04em;
  font-variant-numeric:tabular-nums;line-height:1}
.ru .fact .k{font-family:var(--font-body);font-size:.55rem;letter-spacing:.18em;
  text-transform:uppercase;color:var(--ink-3);margin-top:9px;line-height:1.5}
.ru .fact .s{font-size:.72rem;color:var(--ink-3);margin-top:3px;font-weight:300}

/* --- roles --- */
.ru .roles{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));
  gap:1px;background:var(--line);border:1px solid var(--line)}
.ru .role{background:var(--paper);padding:clamp(18px,2vw,26px);position:relative;
  transition:background var(--ui) var(--ez),opacity var(--content) var(--ez),
    transform var(--content) var(--ez)}
.ru .role.off{opacity:.16;pointer-events:none}
.ru .role:hover{background:var(--paper-2)}
.ru .role .rn{font-size:clamp(.98rem,1.2vw,1.12rem);font-weight:600;letter-spacing:-.03em}
.ru .role .rm{font-size:.78rem;color:var(--ink-3);margin-top:7px;font-weight:300;line-height:1.5}
.ru .role .rt{font-size:.86rem;color:var(--ink-2);margin-top:16px;font-weight:300;line-height:1.6}
.ru .meter{height:2px;background:var(--line);margin-top:18px;position:relative;overflow:hidden}
.ru .meter i{position:absolute;inset:0 auto 0 0;background:var(--ink);
  transition:width var(--cine) var(--ez-out)}
.ru .meter.low i{background:#B4413C}
.ru .role .rs{font-family:var(--font-body);font-size:.54rem;letter-spacing:.2em;
  text-transform:uppercase;color:var(--ink-3);margin-top:9px;display:flex;
  justify-content:space-between}

/* --- price gap ---
   BUG WAS HERE: every fill in this chart was a hard-coded light-mode hex.
   Pull the lamp and the bands stayed near-white while the page went black,
   so the chart floated as a bright slab with invisible labels on top of it.
   All four now resolve from the theme, so the graph inverts with the room. */
.ru .pg{width:100%;display:block;overflow:visible}
.ru .band{fill:var(--paper-3);fill-opacity:.55;
  transition:fill 700ms var(--ez)}
.ru .band.hot{fill:color-mix(in srgb,var(--mark) 7%,var(--paper-3));fill-opacity:.85}
.ru .bandsep{stroke:var(--line);stroke-width:1}
.ru .bandl{font-family:var(--font-body);letter-spacing:.2em;
  text-transform:uppercase;fill:var(--ink-2)}
/* the empty quadrant — a tinted, dashed callout that has to survive both
   light levels, so it is mixed from the brand mark rather than a fixed navy */
.ru .voidbox{fill:color-mix(in srgb,var(--mark) 6%,transparent);
  stroke:var(--mark);stroke-width:1.4;stroke-dasharray:7 8}
.ru .voidlabel{fill:var(--mark);font-weight:700}

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
.ru .ph b{font-family:var(--font-body);font-size:.52rem;letter-spacing:.24em;color:var(--ink-3);font-weight:600}
.ru .ph span{font-family:var(--font-body);font-size:.6rem;color:var(--ink-2);word-break:break-all}

/* ===========================================================================
   NIGHT — the narrative sections run dark. The argument sections stay on
   paper. The document moves between the two, and the lamp is the switch.
   =========================================================================== */
/* DAY — what the lamp switches on. Warm archival paper, never clinical white. */
.ru.night{
  /* what the lamp switches OFF to */
  --paper:#0A0A0E; --paper-2:#121218; --paper-3:#1A1A22;
  --ink:#F5F3EF; --ink-2:#A6A2AE; --ink-3:#66626F;
  --line:rgba(245,243,239,.13);
  --mark:#FF3B47;
  --glass-bg:rgba(255,255,255,.045);
  color-scheme:dark;
}
/* legacy aliases — a few components still name these directly */
.ru{--night:var(--paper);--night-2:var(--paper-2);--night-3:var(--paper-3);
  --bone:var(--ink);--bone-2:var(--ink-2);--bone-3:var(--ink-3);
  --ember:#D8232F;--ember-soft:#E8505B;--ember-deep:#9E0F19;
  --cold:#0A9C90;--nline:var(--line);--nline-2:var(--line)}
.ru.night{--ember:#FF3B47;--ember-soft:#FF6B74;--cold:#35E0D0;
  --gl-hi:rgba(255,255,255,.10);--gl-edge:rgba(245,243,239,.14);
  --grid:rgba(245,243,239,.07);--axis:rgba(245,243,239,.22);
  --fig:#0E1016;--fig-2:#2B1218;--fig-3:#05060A;
  --pool-cool:#0E3038;--pool-warm:#4A0E18;--cord-shade:#000}
.ru .ember{color:var(--ember)}
.ru .it{font-style:italic}

/* the loader — a whisper typed in a dark room, then the wordmark condenses
   out of the same particles that were drifting behind it */
.ru .ld{position:fixed;inset:0;z-index:400;background:var(--night);display:grid;place-items:center;
  transition:opacity 1200ms var(--ez),visibility 1200ms;overflow:hidden}
.ru .ld.gone{opacity:0;visibility:hidden;pointer-events:none}
.ru .ld canvas{position:absolute;inset:0;width:100%;height:100%}
.ru .ldstage{position:relative;z-index:2;text-align:center;padding-inline:6vw}
.ru .ldtype{font-family:'Bodoni Moda',Didot,serif;font-weight:400;color:var(--bone);
  font-size:clamp(1.15rem,3.2vw,2.1rem);letter-spacing:.005em;line-height:1.5;min-height:1.5em}
.ru .ldtype i{display:inline-block;width:2px;height:1em;background:var(--ember);
  margin-left:6px;vertical-align:-.12em;animation:ck 1s steps(2) infinite}
@keyframes ck{50%{opacity:0}}
.ru .ldword{display:flex;justify-content:center;gap:.02em;font-weight:600;
  font-family:var(--font-mark);
  font-size:clamp(2.8rem,9.5vw,7.4rem);letter-spacing:.03em;color:var(--bone)}
.ru .ldword span{display:inline-block;opacity:0;filter:blur(16px);transform:translateY(26px) scale(1.06);
  transition:opacity 1150ms var(--ez-out),filter 1150ms var(--ez-out),transform 1150ms var(--ez-out)}
.ru .ldword.in span{opacity:1;filter:blur(0);transform:none}
.ru .ldword span.o{color:var(--ember);font-style:italic}
.ru .ldest,.ru .ldskip{position:absolute;bottom:2rem;font-family:var(--font-body);
  font-size:.55rem;letter-spacing:.28em;text-transform:uppercase;color:var(--bone-3)}
.ru .ldest{left:clamp(1.2rem,4vw,3rem)}
.ru .ldskip{right:clamp(1.2rem,4vw,3rem);opacity:0;transition:opacity .6s}
.ru .ld.can-skip .ldskip{opacity:1}

/* the edge strip — a rumour running the length of the page, vertically */
.ru .estrip{position:fixed;top:0;bottom:0;left:0;width:26px;z-index:170;overflow:hidden;
  border-right:1px solid var(--line);background:var(--paper);pointer-events:none;
  display:flex;align-items:flex-start;justify-content:center;transition:background var(--ui),border-color var(--ui)}
.ru .estrip .etrack{writing-mode:vertical-rl;white-space:nowrap;font-family:var(--font-body);
  font-size:.56rem;letter-spacing:.42em;text-transform:uppercase;color:var(--ink-3);
  animation:eroll 42s linear infinite;padding-block:10px}
.ru .estrip .etrack b{color:var(--ember);font-weight:500}
@keyframes eroll{to{transform:translateY(-50%)}}
@media (max-width:720px){.ru .estrip{display:none}}

/* the thesis stage — GSAP pins this. Each phase is a full-bleed grid layer,
   so nothing can collide: the timeline is the only thing that reveals them. */
.ru .tstage{position:relative;background:var(--paper)}
.ru .tpin{height:100svh;display:grid;place-items:center;overflow:hidden;position:relative;
  contain:layout paint}
.ru .tgrain{position:absolute;inset:0;pointer-events:none;opacity:.5;z-index:1;
  background-image:radial-gradient(circle at 18% 24%,rgba(255,59,71,.10),transparent 46%),
    radial-gradient(circle at 82% 74%,rgba(53,224,208,.07),transparent 44%)}
.ru .manwrap,.ru .tquote,.ru .tseq{grid-area:1/1;position:relative;z-index:2}
.ru .manwrap{display:flex;flex-direction:column;align-items:center;gap:clamp(12px,2vh,24px);
  will-change:opacity,filter,transform;max-height:100%;padding-block:clamp(48px,9vh,90px)}

/* ——— THE FILM PLATE ————————————————————————————————————————————————
   The footage is shot on a white cyclorama, which means the plate has to be
   handled differently at each light level:

   DAY   — white studio on white paper is already invisible. Nothing to do but
           soften the corners, and he appears to be standing on the page.
   NIGHT — a white slab on a black page is a lightbox. The plate is graded
           down to a dim studio, so the white floor becomes a mid-dark grey and
           he reads as a figure standing in a spotlight rather than a cut-out
           pasted onto the dark.

   Both levels run the same elliptical mask, which is the thing that stops the
   plate ever showing four hard corners — no blend modes, because .manwrap
   carries a will-change and therefore its own stacking context, so a
   mix-blend-mode here would blend against nothing and silently do nothing.

   The light pools sit BEHIND the plate and bleed through the masked edge, so
   the room can warm across the scroll without ever grading the man himself.
   ———————————————————————————————————————————————————————————————— */
.ru .manfilm{position:relative;z-index:2;
  width:min(94vw,calc(min(60svh,600px) * 16 / 9));
  aspect-ratio:16/9;flex:0 1 auto;
  opacity:0;transition:opacity 900ms var(--ez)}
.ru .manfilm.ready{opacity:1}
.ru .manfilm canvas,.ru .manfilm video{width:100%;height:100%;display:block;
  object-fit:cover;
  transition:filter 700ms var(--ez);
  -webkit-mask-image:radial-gradient(ellipse 58% 70% at 50% 46%,#000 44%,transparent 90%);
  mask-image:radial-gradient(ellipse 58% 70% at 50% 46%,#000 44%,transparent 90%)}
.ru.night .manfilm canvas,.ru.night .manfilm video{filter:grayscale(.22) brightness(.46) contrast(1.04)}

/* the two light pools — cool underneath, warm fading up over the scroll */
.ru .manlight{position:absolute;inset:0;z-index:1;pointer-events:none;display:grid;place-items:center}
.ru .manlight span{position:absolute;width:min(78vw,860px);aspect-ratio:1/1.05;border-radius:50%;
  filter:blur(14px)}
.ru .manlight .coollight{background:radial-gradient(circle at 50% 44%,var(--pool-cool),transparent 66%);
  opacity:.9}
.ru .manlight .warmlight{background:radial-gradient(circle at 50% 44%,var(--pool-warm),transparent 68%);
  opacity:0;will-change:opacity}
@media (max-width:760px){
  .ru .manfilm{width:min(96vw,calc(min(44svh,420px) * 16 / 9))}
  .ru .manlight span{width:96vw}
}
.ru .mancap{font-family:var(--font-body);font-size:.62rem;letter-spacing:.24em;
  text-transform:uppercase;color:var(--bone-2);text-align:center;min-height:1.4em;max-width:32ch}
.ru .tquote{display:grid;place-items:center;text-align:center;padding-inline:8vw;pointer-events:none;
  opacity:0;visibility:hidden}
.ru .tquote p{font-size:clamp(1.7rem,4.6vw,3.6rem);font-weight:200;letter-spacing:-.055em;
  line-height:1.08;color:var(--bone)}
.ru .tseq{display:grid;place-items:center;text-align:center;padding-inline:8vw;pointer-events:none}
.ru .tline{grid-area:1/1;will-change:opacity,transform,filter;opacity:0;visibility:hidden}
.ru .tline.neg{font-size:clamp(1.6rem,4.2vw,3.2rem);font-weight:200;letter-spacing:-.05em;
  color:var(--bone-2)}
.ru .tline.pos{font-size:clamp(2.6rem,8.5vw,6.8rem);font-weight:200;letter-spacing:-.065em;
  color:var(--bone);line-height:1}
.ru .strike{position:relative;display:inline-block}
.ru .strike i{position:absolute;left:0;top:56%;height:2px;width:100%;background:var(--ember);
  transform:scaleX(0);transform-origin:left}

/* mask wrapper — a line rises out of its own baseline, nothing spills */
.ru .msk{display:block;overflow:hidden;padding-bottom:.08em}
.ru .msk > span{display:block}


@media (prefers-reduced-motion:reduce){
  .ru .tstage{height:auto}
  .ru .tpin{height:auto;display:block;padding-block:clamp(60px,10vh,120px)}
  .ru .manwrap,.ru .tquote,.ru .tseq{grid-area:auto;display:block;text-align:center}
  .ru .manwrap{display:flex}
  .ru .tquote{opacity:1;visibility:visible;margin-top:clamp(40px,8vh,90px)}
  .ru .tseq{display:block;margin-top:clamp(32px,6vh,70px)}
  .ru .tline{grid-area:auto;opacity:1;visibility:visible;margin-block:.4em}
  .ru .tline.neg{font-size:clamp(1.1rem,2.4vw,1.6rem)}
  .ru .tline.pos{font-size:clamp(1.6rem,4vw,2.8rem)}
  .ru .manfilm{opacity:1}
  .ru .strike i{transform:scaleX(1)}
}

/* small 3D — cards with thickness, buttons with pull */
.ru .tiltgrid{perspective:1100px;perspective-origin:50% 50%}
.ru .tiltgrid > *{position:relative;transform-style:preserve-3d;will-change:transform}
.ru .sheen{position:absolute;inset:0;pointer-events:none;opacity:0;
  --mx:50%;--my:50%;
  background:radial-gradient(circle 220px at var(--mx) var(--my),
    rgba(255,255,255,.9),transparent 60%)}
.ru.night .sheen{background:radial-gradient(circle 220px at var(--mx) var(--my),
  rgba(255,255,255,.10),transparent 62%)}
.ru .mag{position:relative;display:inline-flex;align-items:center;justify-content:center;
  will-change:transform}
.ru .mag-l{display:inline-flex;align-items:center;gap:.6em;will-change:transform}

/* THE THREAD MARK — ornament scale, three stacked strokes */
.ru .mark{width:100%;max-width:270px;margin:0}
.ru .mark svg{width:100%;height:auto;display:block;overflow:visible}
.ru .mk-shade{fill:none;stroke:var(--cord-shade);stroke-opacity:.5;stroke-width:5.5;
  stroke-linecap:round;stroke-linejoin:round;filter:blur(3px);transform:translate(4px,5px)}
.ru .mk-core{fill:none;stroke:var(--ink);stroke-width:2.1;stroke-linecap:round;
  stroke-linejoin:round}
.ru .mk-spec{fill:none;stroke:#fff;stroke-opacity:1;stroke-width:.85;
  stroke-linecap:round}
.ru.night .mk-spec{stroke:var(--paper);stroke-opacity:.9}
.ru .mk-nodes circle{fill:var(--paper);stroke:var(--mark);stroke-width:1.6}
.ru .mark figcaption{font-family:var(--font-body);font-size:.5rem;letter-spacing:.26em;
  text-transform:uppercase;color:var(--ink-3);margin-top:14px}
@media (max-width:900px){.ru .mark{max-width:190px;margin-inline:auto}}

.ru .unfold{border-top:1px solid var(--line)}
.ru .unfold:last-of-type{border-bottom:1px solid var(--line)}
.ru .uf-head{width:100%;display:flex;align-items:center;gap:16px;padding:clamp(13px,1.7vh,20px) 0;
  text-align:left;cursor:pointer;background:none;border:0}
.ru .uf-label{font-size:clamp(.95rem,1.25vw,1.15rem);font-weight:600;letter-spacing:-.02em;
  color:var(--ink);flex:0 0 auto;max-width:70%}
.ru .uf-rule{flex:1 1 auto;height:1px;background:var(--line);transform:scaleX(0);
  transform-origin:left;transition:transform .55s var(--ez),background .3s}
.ru .unfold.on .uf-rule{transform:scaleX(1);background:var(--mark)}
.ru .uf-sign{font-size:1rem;color:var(--ink-3);flex:0 0 auto;width:14px;text-align:center}
.ru .unfold.on .uf-sign{color:var(--mark)}
.ru .uf-inner{padding-bottom:clamp(18px,2.4vh,28px);max-width:64ch}

/* THE STACK — five frames collapsing into one */
.ru .stack{position:relative}
.ru .stk-pin{height:100svh;display:flex;align-items:center;overflow:hidden;
  contain:layout paint}
.ru .stk-deck{position:relative;width:100%;aspect-ratio:16/10}
.ru .stk-card{position:absolute;inset:0;margin:0;overflow:hidden;
  background:var(--paper-2);border:1px solid var(--line);will-change:transform;
  box-shadow:0 4px 18px -12px rgba(0,0,0,.22)}
.ru .stk-card .m{width:100%;height:100%}
@media (max-width:760px){
  .ru .stk-pin{height:auto;padding-block:clamp(48px,8vh,90px)}
  .ru .stk-deck{aspect-ratio:4/3;margin-top:26px}
}

/* THE ERA COLLAGE — a board assembling itself */
.ru .collage{position:relative;width:100%;height:100%;min-height:clamp(280px,42vh,460px)}
.ru .pl{position:absolute;margin:0;will-change:transform,opacity}
.ru .pl-img{position:relative;height:100%;overflow:hidden;
  background:var(--paper-2);border:1px solid var(--line);
  box-shadow:0 2px 10px -6px rgba(0,0,0,.18)}
.ru .pl-img .m{width:100%;height:100%}
.ru .pl-call{position:absolute;display:flex;align-items:center;gap:0;pointer-events:none;
  transform:translate(0,-50%)}
.ru .pl-dot{width:6px;height:6px;border-radius:50%;background:var(--mark);flex:0 0 auto;
  box-shadow:0 0 0 3px color-mix(in srgb,var(--mark) 22%,transparent)}
.ru .pl-line{height:1px;width:clamp(16px,2.2vw,34px);background:var(--mark);
  transform-origin:left center;flex:0 0 auto}
.ru .pl-txt{font-family:var(--font-body);font-size:.46rem;letter-spacing:.16em;
  text-transform:uppercase;color:var(--ink);background:var(--paper);
  padding:4px 7px;border:1px solid var(--line);white-space:nowrap;font-weight:500;
  margin-left:-1px}
@media (max-width:720px){
  .ru .collage{min-height:300px}
  .ru .pl-txt{font-size:.4rem;letter-spacing:.1em;padding:3px 5px}
  .ru .pl-line{width:12px}
}

/* THE RECORD — lower left. Arrives open; collapses only after first use. */
.ru .vinyl{position:fixed;left:0;bottom:clamp(16px,3vh,34px);z-index:182;
  display:flex;align-items:flex-end;
  transition:transform 620ms var(--ez)}
.ru .vinyl.shut{transform:translateX(calc(-100% + 34px))}
.ru .vn-deck{display:flex;align-items:center;gap:12px;background:var(--paper-2);
  border:1px solid var(--line);border-left:0;border-radius:0 100px 100px 0;
  padding:10px 20px 10px 12px;cursor:pointer;
  box-shadow:0 14px 34px -18px rgba(0,0,0,.8)}
.ru .vn-platter{position:relative;width:46px;height:46px;flex:0 0 auto}
.ru .vn-disc{position:absolute;inset:0;border-radius:50%;
  background:radial-gradient(circle at 50% 50%,#15161B 0 22%,#0C0D11 22% 100%);
  border:1px solid var(--line);will-change:transform}
.ru .vn-groove{position:absolute;border-radius:50%;border:1px solid rgba(255,255,255,.07)}
.ru .vn-groove.g1{inset:5px}.ru .vn-groove.g2{inset:9px}.ru .vn-groove.g3{inset:13px}
.ru .vn-label{position:absolute;inset:34%;border-radius:50%;background:var(--mark);
  display:grid;place-items:center}
.ru .vn-label b{font-family:var(--font-mark);font-weight:700;font-size:.6rem;color:#fff;line-height:1}
.ru .vn-shine{position:absolute;inset:0;border-radius:50%;pointer-events:none;
  background:linear-gradient(125deg,transparent 42%,rgba(255,255,255,.16) 50%,transparent 58%)}
.ru .vn-arm{position:absolute;right:-3px;top:-2px;width:30px;height:30px;
  will-change:transform}
.ru .vn-arm i{position:absolute;right:3px;top:3px;width:2px;height:26px;
  background:var(--ink-3);transform-origin:top center;transform:rotate(38deg);border-radius:1px}
.ru .vn-arm b{position:absolute;right:1px;top:1px;width:7px;height:7px;border-radius:50%;
  background:var(--ink-3)}
.ru .vn-txt{font-family:var(--font-body);font-size:.48rem;letter-spacing:.22em;
  text-transform:uppercase;color:var(--ink-3);white-space:nowrap}
.ru .vinyl.on .vn-txt,.ru .vinyl.asking .vn-txt{color:var(--mark)}
.ru .vinyl.asking .vn-deck{border-color:var(--mark)}
.ru .vn-tab{width:22px;height:44px;margin-left:-1px;background:var(--paper-2);
  border:1px solid var(--line);border-left:0;border-radius:0 6px 6px 0;
  color:var(--ink-3);font-size:.85rem;line-height:1;cursor:pointer}
.ru .vn-tab:hover{color:var(--ink)}
@media (max-width:720px){
  .ru .vinyl{bottom:12px}
  .ru .vn-deck{padding:8px 14px 8px 10px}
  .ru .vn-platter{width:36px;height:36px}
}

/* THE LIGHTER — wireframe, right-hand side */
.ru .lighterwrap{display:flex;flex-direction:column;align-items:flex-end;text-align:right}
.ru .lighter{width:clamp(96px,8vw,124px);perspective:700px;transform-style:preserve-3d;
  will-change:transform}
.ru .lighter svg{width:100%;height:auto;display:block;overflow:visible}
.ru .lw-lid path,.ru .lw-shell path,.ru .lw-shell line{
  fill:none;stroke:var(--ink);stroke-width:1.15;stroke-linejoin:round;stroke-linecap:round;
  vector-effect:non-scaling-stroke}
.ru .lw-inner path{fill:none;stroke:#FFB93A;stroke-width:1.1;stroke-linejoin:round}
.ru .lw-scan{stroke:var(--mark)!important;stroke-width:1.6!important;opacity:.5}
.ru .lw-mark{font-family:var(--font-mark);font-weight:700;font-size:22px;fill:none;
  stroke:var(--ink);stroke-width:.8;opacity:.6}
.ru .lightercap{font-family:var(--font-body);font-size:.5rem;letter-spacing:.26em;
  text-transform:uppercase;color:var(--ink-3);margin-top:20px}
.ru .lightercap b{color:var(--mark);font-weight:500}
@media (max-width:900px){.ru .lighterwrap{align-items:center;text-align:center}}

/* THE DECK — a live hand, shuffling in the corner */
.ru .deck{position:relative;width:126px;height:168px;margin:0;
  perspective:760px;transform-style:preserve-3d}
.ru .card{position:absolute;inset:0;border-radius:7px;background:var(--paper-2);
  border:1px solid var(--line);will-change:transform;
  box-shadow:0 10px 26px -14px rgba(0,0,0,.75);
  display:grid;place-items:center;backface-visibility:hidden}
.ru .card .pip{font-family:'Bodoni Moda',Didot,serif;font-size:2.5rem;line-height:1;
  color:var(--ink);opacity:0}
.ru .card .pip.red{color:var(--mark)}
.ru .card .cnr{position:absolute;top:8px;left:9px;font-family:'Bodoni Moda',Didot,serif;
  font-size:.72rem;color:var(--ink);opacity:0}
.ru .card .cnr.red{color:var(--mark)}
.ru .card.back{background:
  repeating-linear-gradient(45deg,transparent 0 4px,rgba(255,59,71,.16) 4px 5px),
  var(--paper-3)}
.ru .deckcap{font-family:var(--font-body);font-size:.5rem;letter-spacing:.26em;
  text-transform:uppercase;color:var(--ink-3);margin-top:16px;display:block}
.ru .deckcap b{color:var(--mark);font-weight:500}
@media (max-width:900px){.ru .deck{margin-inline:auto}}

/* content sits above the section marks */
.ru .rt-content{position:relative;z-index:1}
/* NOTE: never put a transform/will-change:transform on .rt-content — it would
   become the containing block for the fixed nav, progress bar and dive panel,
   and would break ScrollTrigger's fixed pinning. */

/* the pulse — one day, drawn as one line */
.ru .pulse{border:1px solid var(--nline);padding:clamp(16px,2.4vw,28px);background:var(--night-2)}
.ru .phead{display:flex;justify-content:space-between;align-items:baseline;gap:16px;flex-wrap:wrap}
.ru .pnow{font-family:var(--font-body);font-size:.6rem;letter-spacing:.2em;text-transform:uppercase;
  display:flex;gap:12px;align-items:baseline}
.ru .pnow b{color:var(--ember);font-variant-numeric:tabular-nums;font-weight:600}
.ru .pnow i{color:var(--bone-2);font-style:normal;letter-spacing:.12em}
.ru .pulse canvas{width:100%;height:150px;display:block;margin-top:14px}
.ru .pfoot{display:flex;justify-content:space-between;gap:16px;margin-top:12px;
  font-family:var(--font-body);font-size:.55rem;letter-spacing:.18em;text-transform:uppercase;
  color:var(--bone-3);flex-wrap:wrap}
.ru .pfoot b{color:var(--cold)}

/* THE LAMP — a fixed fixture in the top-left, hanging all the time.
   It is the only light switch in the building, and the visitor owns it.
   Pull the cord: the whole document goes from night to daylight. */
.ru .lamp{position:fixed;top:0;right:clamp(46px,5vw,84px);z-index:180;
  display:flex;flex-direction:column;align-items:center;pointer-events:none}
.ru .lamp .cord{width:1px;height:clamp(34px,6vh,72px);background:var(--ink-3);opacity:.5}
.ru .lamp .fix{color:var(--ink-3);position:relative;transform-origin:50% -300%}
.ru .lamp svg{width:clamp(52px,5vw,78px);height:auto;display:block}
.ru .lamp .bulb{fill:#26262E;transition:fill 420ms var(--ez),filter 420ms var(--ez)}
.ru:not(.night) .lamp .bulb{fill:#FFE9B0;filter:drop-shadow(0 0 16px rgba(255,222,150,.95))}
.ru:not(.night) .lamp .fix{color:#8A8578}
/* the pull cord is the affordance — it is the only thing you can grab */
.ru .lamp .pull{pointer-events:auto;cursor:pointer;width:34px;
  display:flex;flex-direction:column;align-items:center;padding-bottom:14px;
  background:none;border:0;margin-top:-2px}
.ru .lamp .pull i{width:1px;height:clamp(26px,4vh,44px);background:var(--ink-3);opacity:.55;
  transition:height 220ms var(--ez)}
.ru .lamp .pull b{width:7px;height:7px;border-radius:50%;background:var(--ink-3);
  margin-top:-1px;transition:transform 220ms var(--ez),background 320ms var(--ez)}
.ru .lamp .pull:hover i{height:clamp(32px,5vh,54px)}
.ru .lamp .pull:hover b{transform:scale(1.5);background:var(--mark)}
.ru .lamp .pull:active i{height:clamp(40px,6.5vh,68px)}
.ru .lamp .beam{position:absolute;top:100%;left:50%;transform:translateX(-50%);
  width:min(60vw,620px);height:74vh;opacity:0;pointer-events:none;
  transition:opacity 700ms var(--ez);
  background:radial-gradient(ellipse 50% 62% at 50% 0%,rgba(255,228,170,.24),transparent 72%);
  clip-path:polygon(40% 0,60% 0,100% 100%,0 100%)}
.ru:not(.night) .lamp .beam{opacity:1}
.ru .lamphint{position:fixed;top:clamp(96px,15vh,168px);right:clamp(16px,2.4vw,44px);z-index:180;
  font-family:var(--font-body);font-size:.5rem;letter-spacing:.24em;text-transform:uppercase;
  color:var(--ink-3);writing-mode:vertical-rl;opacity:.55;pointer-events:none;
  transition:opacity var(--ui)}
@media (max-width:720px){.ru .lamp{right:16px}.ru .lamphint{display:none}}

.ru .risk{border:1px solid var(--line);padding:clamp(18px,2.4vw,28px);
  transition:border-color var(--ui)}
.ru .risk+.risk{margin-top:-1px}
.ru .rsev{font-family:var(--font-body);font-size:.52rem;letter-spacing:.22em;
  text-transform:uppercase;color:var(--mark);margin-right:10px;font-weight:600}
.ru .rq{font-size:clamp(.95rem,1.2vw,1.1rem);font-weight:600;letter-spacing:-.02em;color:var(--ink)}
.ru .rgrid{display:grid;grid-template-columns:1fr 1fr;gap:clamp(16px,2.4vw,32px);margin-top:18px}
@media (max-width:760px){.ru .rgrid{grid-template-columns:1fr}}
.ru .rgrid b{font-family:var(--font-body);font-size:.54rem;letter-spacing:.22em;
  text-transform:uppercase;display:block;margin-bottom:8px}
.ru .rgrid .atk b{color:var(--ember)}
.ru .rgrid .ans b{color:var(--cold)}

/* the chamber — say something, watch it stop being yours */
.ru .chamber{position:relative;height:min(72svh,620px);border:1px solid var(--nline);
  background:var(--night-2);overflow:hidden}
.ru .chamber canvas{position:absolute;inset:0;width:100%;height:100%}
.ru .chform{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:3;
  display:flex;flex-direction:column;align-items:center;gap:1.2rem;width:min(84vw,420px);
  transition:opacity .6s,filter .6s}
.ru .chform.gone{opacity:0;filter:blur(8px);pointer-events:none}
.ru .chform input{width:100%;background:transparent;border:0;border-bottom:1px solid var(--nline);
  color:var(--bone);font-family:var(--font-body);font-weight:200;text-align:center;
  font-size:clamp(1.4rem,3.4vw,2.2rem);letter-spacing:-.03em;padding:10px 0;outline:none}
.ru .chform input::placeholder{color:var(--bone-3);font-weight:200}
.ru .chform input:focus{border-bottom-color:var(--ember)}
.ru .chform button{font-family:var(--font-body);font-size:.58rem;letter-spacing:.26em;
  text-transform:uppercase;color:var(--bone-2);border:1px solid var(--nline);padding:11px 22px;
  border-radius:100px;transition:all var(--ui) var(--ez)}
.ru .chform button:hover{color:var(--night);background:var(--bone);border-color:var(--bone)}
.ru .chfield{position:absolute;inset:0;z-index:2}
.ru .wh{position:absolute;transform:translate(-50%,-50%);font-family:var(--font-body);
  font-weight:200;color:var(--bone);white-space:nowrap;letter-spacing:-.02em;
  opacity:0;transition:opacity 700ms var(--ez-out),transform 1500ms var(--ez),filter 1500ms var(--ez)}
.ru .wh.in{opacity:var(--wo,1)}
.ru .wh.root{color:var(--ember)}
.ru .wh.final{font-size:clamp(2rem,6vw,4rem)!important;letter-spacing:.06em}
.ru .chend{position:absolute;left:50%;bottom:8%;transform:translateX(-50%);z-index:4;text-align:center;
  width:min(90vw,640px);opacity:0;transition:opacity 900ms var(--ez)}
.ru .chend.on{opacity:1}
.ru .chend p{font-size:clamp(1rem,1.8vw,1.4rem);font-weight:200;letter-spacing:-.03em;color:var(--bone-2)}
.ru .chend button{margin-top:16px;font-family:var(--font-body);font-size:.55rem;
  letter-spacing:.24em;text-transform:uppercase;color:var(--bone-3)}
.ru .chend button:hover{color:var(--bone)}

/* the ask */
.ru .ask{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:1px;
  background:var(--nline);border:1px solid var(--nline)}
.ru .askc{background:var(--night);padding:clamp(20px,2.6vw,32px)}
.ru .askc .v{font-size:clamp(1.25rem,2vw,1.75rem);font-weight:700;letter-spacing:-.045em;
  font-variant-numeric:tabular-nums;line-height:1}
.ru .askc .k{font-family:var(--font-body);font-size:.54rem;letter-spacing:.2em;
  text-transform:uppercase;color:var(--bone-3);margin-top:10px}
.ru .askc .s{font-size:.8rem;color:var(--bone-2);margin-top:8px;font-weight:300;line-height:1.55}
.ru .term{font-family:var(--font-body);font-size:clamp(.7rem,1vw,.85rem);line-height:2;
  color:var(--bone-2);letter-spacing:.02em}
.ru .term b{color:var(--ember);font-weight:500}
.ru .term .c{color:var(--cold)}

.ru .intro{position:fixed;inset:0;z-index:400;background:#fff;display:grid;place-items:center;
  transition:opacity 900ms var(--ez),visibility 900ms}
.ru .intro.gone{opacity:0;visibility:hidden}
.ru .im{font-family:var(--font-mark);font-weight:600;font-size:clamp(.9rem,1.6vw,1.15rem);
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
.ru .wm{font-family:var(--font-mark);font-weight:600;letter-spacing:.42em;font-size:.76rem;
  margin-right:auto;white-space:nowrap}
.ru .nl{font-family:var(--font-body);font-size:.61rem;letter-spacing:.2em;text-transform:uppercase;
  color:var(--ink-3);position:relative;padding:5px 0;transition:color var(--micro) var(--ez);white-space:nowrap}
.ru .nl::after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:1px;background:var(--ink);
  transform:scaleX(0);transform-origin:right;transition:transform var(--ui) var(--ez)}
.ru .nl:hover{color:var(--ink)}
.ru .nl:hover::after,.ru .nl.on::after{transform:scaleX(1);transform-origin:left}
.ru .nl.on{color:var(--ink)}
.ru .cta{font-family:var(--font-body);font-size:.6rem;letter-spacing:.2em;text-transform:uppercase;
  border:.5px solid var(--ink);border-radius:100px;padding:10px 20px;white-space:nowrap;position:relative;
  overflow:hidden;isolation:isolate;color:var(--ink);transition:color var(--ui) var(--ez)}
.ru .cta::before{content:"";position:absolute;inset:0;background:var(--ink);z-index:-1;
  transform:translateY(101%);transition:transform var(--ui) var(--ez)}
.ru .cta:hover{color:#fff}
.ru .cta:hover::before{transform:none}

.ru .plate{position:absolute;inset:-8% -5%;will-change:transform;
  filter:none;transition:filter 700ms var(--ez)}
.ru.night .plate{filter:grayscale(.35) brightness(.62) contrast(1.08)}
.ru .cut{position:absolute;right:-3%;bottom:0;width:min(50vw,720px);height:86%;will-change:transform}
.ru .hero{position:relative;height:100svh;min-height:560px;overflow:hidden;
  background:#0C0E13;isolation:isolate}
.ru .hero-plate{position:absolute;inset:0;z-index:0}
.ru .hero-plate .m{width:100%;height:100%}
.ru .ripple{position:absolute;inset:0;z-index:1;width:100%;height:100%;display:block;
  pointer-events:none}
.ru .hero-grain{position:absolute;inset:0;z-index:2;pointer-events:none;
  background:linear-gradient(180deg,rgba(8,10,14,.58) 0%,rgba(8,10,14,.08) 30%,
    rgba(8,10,14,.08) 52%,rgba(8,10,14,.74) 100%)}
.ru .hero-ui{position:absolute;inset:0;z-index:3;padding:0 var(--marg);
  padding-top:clamp(92px,13vh,150px);display:flex;justify-content:space-between;
  align-items:flex-start;pointer-events:none}
.ru .hero-ui > *{pointer-events:auto}
.ru .hero-stmt{max-width:34ch;color:#fff}
.ru .hero-stmt b{display:block;font-weight:700;letter-spacing:-.035em;
  font-size:clamp(1.7rem,3.1vw,2.9rem);line-height:1.02;text-wrap:balance}
.ru .hero-stmt span{display:block;margin-top:clamp(14px,2vh,22px);max-width:38ch;
  color:rgba(255,255,255,.78);font-weight:500;line-height:1.5;
  font-size:clamp(.9rem,1.05vw,1.02rem)}
.ru .hero-begin{margin-top:clamp(24px,4vh,44px);display:inline-flex;align-items:center;
  gap:14px;color:#fff;font-size:.95rem;font-weight:500;padding-bottom:10px;
  border-bottom:1px solid rgba(255,255,255,.45);min-width:190px;justify-content:space-between;
  background:none;cursor:pointer;transition:border-color var(--ui),gap var(--ui)}
.ru .hero-begin i{width:9px;height:9px;border-top:1px solid #fff;border-right:1px solid #fff}
.ru .hero-begin:hover{border-bottom-color:#fff;gap:22px}
.ru .hero-index{text-align:right;color:#fff;font-size:clamp(.9rem,1.1vw,1.05rem);
  line-height:1.62;font-weight:500;margin-top:clamp(120px,22vh,260px)}
.ru .hero-index .n{color:rgba(255,255,255,.55);font-weight:400}
.ru .hero-x{position:absolute;z-index:3;color:rgba(255,255,255,.5);font-size:1rem;
  transform:translate(-50%,-50%);pointer-events:none;font-weight:300}
.ru .hero-mark{position:absolute;z-index:3;left:0;right:0;bottom:0;
  text-align:center;color:#fff;font-family:var(--font-mark);font-weight:700;
  font-size:clamp(4rem,15.5vw,15rem);line-height:.78;letter-spacing:-.02em;
  pointer-events:none;white-space:nowrap;padding-inline:2vw}
@media (max-width:860px){
  .ru .hero-ui{flex-direction:column;gap:clamp(26px,5vh,54px);padding-top:clamp(84px,12vh,120px)}
  .ru .hero-index{text-align:left;margin-top:0}
  .ru .hero-stmt{max-width:26ch;font-size:1rem}
  .ru .hero-mark{font-size:clamp(2.6rem,17vw,5rem)}
  .ru .hero-x{display:none}
}
/* the hero headline is deliberately modest — the photograph is the loud thing */
/* the hero headline rises after the loader clears, not on a fixed timer */
.ru .hero .hl{display:block;overflow:hidden;padding-bottom:.06em}
.ru .hero .hl > span{display:block;will-change:transform}

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
.ru .tick .t{font-family:var(--font-body);font-size:.48rem;letter-spacing:.22em;text-transform:uppercase;
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
/* SVG chart labels. These were hex-locked to the light palette — #56564F on a
   near-black chart is unreadable. They now follow the ink tokens, and each one
   is knocked out of whatever sits behind it (gridline, band, another point's
   halo) with a paint-order stroke in the page colour. */
.ru .ptl{font-family:var(--font-body);letter-spacing:.14em;fill:var(--ink);
  pointer-events:none;transition:opacity var(--ui) var(--ez),fill 700ms var(--ez);
  paint-order:stroke fill;stroke:var(--paper);stroke-width:4px;stroke-linejoin:round}
.ru .ax{font-family:var(--font-body);letter-spacing:.26em;fill:var(--ink-3);
  paint-order:stroke fill;stroke:var(--paper);stroke-width:3px;stroke-linejoin:round}
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
.ru .chip{font-family:var(--font-body);font-size:.62rem;letter-spacing:.16em;text-transform:uppercase;
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
  box-shadow:0 24px 60px -34px rgba(12,12,11,.5);font-family:var(--font-body);font-size:.66rem;
  letter-spacing:.04em;color:var(--ink)}
.ru .receipt::after{content:"";position:absolute;left:0;right:0;bottom:-11px;height:12px;background:#fff;
  -webkit-mask:repeating-linear-gradient(90deg,#000 0 9px,transparent 9px 18px);
  mask:repeating-linear-gradient(90deg,#000 0 9px,transparent 9px 18px)}
.ru .receipt hr{border:0;border-top:1px dashed rgba(12,12,11,.28);margin:14px 0}
.ru .rline{display:flex;justify-content:space-between;gap:14px;padding:4px 0;align-items:baseline}
.ru .rline b{font-weight:500}
.ru .barcode{display:flex;gap:2px;align-items:flex-end;height:34px;margin-top:16px}
.ru .barcode i{flex:1;background:var(--ink)}

.ru .labwrap{min-height:100svh;background:var(--paper)}
/* THE LAB ON MOBILE — the three-column desk collapses into a single column,
   the figure comes first because it is the thing you are changing, and the
   tile rail becomes a horizontal scroller under it. Drag still works, but tap
   is the primary gesture on touch and always was. */
@media (max-width:900px){
  .ru .labwrap .g > div{grid-column:1 / 13 !important}
  .ru .labwrap .g{row-gap:clamp(26px,5vh,48px)}
  .ru .lab-figure{order:-1}
  .ru .lab-rail{display:flex;gap:12px;overflow-x:auto;scroll-snap-type:x mandatory;
    -webkit-overflow-scrolling:touch;scrollbar-width:none;padding-bottom:6px;
    margin-inline:calc(var(--marg) * -1);padding-inline:var(--marg)}
  .ru .lab-rail::-webkit-scrollbar{display:none}
  .ru .lab-rail > *{flex:0 0 clamp(96px,30vw,132px);scroll-snap-align:start;margin:0 !important}
  .ru .stage{min-height:clamp(360px,52svh,520px)}
  .ru .tile:hover{transform:none}
  .ru .cmp{touch-action:pan-y}
}
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

.ru .veil{position:fixed;inset:0;z-index:350;background:var(--paper);display:grid;place-items:center;
  pointer-events:none;opacity:0;transition:opacity 200ms var(--ez)}
.ru .veil.on{opacity:1;pointer-events:auto}
.ru .vm{font-family:var(--font-mark);font-weight:600;color:var(--ink);
  transition:letter-spacing 320ms var(--ez-out),transform 320ms var(--ez-out),
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
  .ru .row [data-l]::before{content:attr(data-l);font-family:var(--font-body);
    font-size:.52rem;letter-spacing:.2em;text-transform:uppercase;color:var(--ink-3)}
}

@media(max-width:640px){
  .ru .nl{display:none}
  .ru .fstage{height:82svh}
  .ru .dive{width:100vw}
    .ru .cut{width:88vw;height:54%;right:-14%;opacity:.9}
  .ru .rail{gap:2px;padding:8px 10px}
  .ru .conn{display:none}
  .ru .cmp{height:clamp(320px,54svh,460px) !important}
}

/* ═══════════════════════════════════════════════════════════════════════════
   THE LEGIBILITY LAYER
   Every caption, label and micro-heading in this file was originally set
   somewhere between .46rem and .62rem, at weight 300–600, in the lightest
   grey in the palette. That is a look, and it is also unreadable — worst of
   all in the pinned "man" section, where the caption is the only copy on
   screen.

   This block is deliberately at the bottom and deliberately in one place:
   it re-states the small end of the type scale at a size and weight you can
   actually read, without touching a single display size. The page reads the
   same from three feet away and stops squinting up close.

   To tune the whole site's small type, change the numbers HERE. Nowhere else.
   ═══════════════════════════════════════════════════════════════════════════ */

/* --- the pinned man section: the caption IS the copy, so it leads --------- */
.ru .mancap{font-size:clamp(.78rem,1.05vw,.9rem);letter-spacing:.18em;font-weight:700;
  color:var(--bone);max-width:40ch;line-height:1.6}
.ru .tquote p{font-weight:400}
.ru .tline.neg{font-weight:500}
.ru .tline.pos{font-weight:600}

/* --- structural labels ---------------------------------------------------- */
.ru .skip{font-size:.7rem;font-weight:700}
.ru .wm{font-size:.8rem;font-weight:700}
.ru .nl{font-size:.7rem;font-weight:600;letter-spacing:.17em}
.ru .cta{font-size:.68rem;font-weight:700;letter-spacing:.17em}
.ru .chip{font-size:.7rem;font-weight:700;letter-spacing:.13em}
.ru .estrip .etrack{font-size:.62rem;font-weight:600}
.ru .lamphint{font-size:.6rem;font-weight:700}
.ru .ldest,.ru .ldskip{font-size:.64rem;font-weight:700}

/* --- chart furniture: SVG text does not scale with the page, so it has to
       be sized up in absolute units or it disappears on a laptop ----------- */
.ru .ptl{font-size:19px;font-weight:600;letter-spacing:.1em}
.ru .ax{font-size:16px;font-weight:700;letter-spacing:.2em}
.ru .bandl{font-size:15px;font-weight:700;letter-spacing:.16em}
@media(max-width:640px){.ru .ptl{font-size:23px}.ru .ax{font-size:19px}.ru .bandl{font-size:18px}}

/* --- data tiles ----------------------------------------------------------- */
.ru .fact .k{font-size:.64rem;font-weight:700;letter-spacing:.15em}
.ru .fact .s{font-size:.82rem;font-weight:500;color:var(--ink-2)}
.ru .role .rn{font-weight:700}
.ru .role .rm{font-size:.86rem;font-weight:500;color:var(--ink-2)}
.ru .role .rt{font-size:.95rem;font-weight:500}
.ru .role .rs{font-size:.62rem;font-weight:700;letter-spacing:.16em}
.ru .kv{font-size:.9rem;font-weight:500}
.ru .tick .y{font-weight:600;color:var(--ink-2)}
.ru .tick .t{font-size:.58rem;font-weight:700;letter-spacing:.17em}
.ru .tick.on .y{font-weight:700}
.ru .uf-label{font-weight:700}
.ru .rsev{font-size:.62rem;font-weight:700}
.ru .rgrid b{font-size:.64rem;font-weight:700;letter-spacing:.17em}
.ru .verdict{font-weight:500}
.ru .need{font-weight:400}
.ru .receipt{font-size:.74rem;font-weight:500}
.ru .row [data-l]::before{font-size:.62rem;font-weight:700}

/* --- ornaments and instruments -------------------------------------------- */
.ru .mark figcaption{font-size:.6rem;font-weight:700;letter-spacing:.2em;color:var(--ink-2)}
.ru .deckcap,.ru .lightercap{font-size:.6rem;font-weight:700;letter-spacing:.2em;color:var(--ink-2)}
.ru .vn-txt{font-size:.58rem;font-weight:700;letter-spacing:.17em}
.ru .pnow{font-size:.7rem;font-weight:700}
.ru .pfoot{font-size:.64rem;font-weight:700;letter-spacing:.14em}
.ru .pl-txt{font-size:.56rem;font-weight:700;letter-spacing:.12em}
@media(max-width:720px){.ru .pl-txt{font-size:.5rem;letter-spacing:.08em}}
.ru .ph b{font-size:.6rem;font-weight:700}
.ru .ph span{font-size:.68rem;font-weight:600}

/* --- the dark instruments -------------------------------------------------- */
.ru .chform button{font-size:.68rem;font-weight:700;letter-spacing:.2em}
.ru .chend p{font-weight:400}
.ru .chend button{font-size:.65rem;font-weight:700}
.ru .askc .k{font-size:.64rem;font-weight:700;letter-spacing:.16em}
.ru .askc .s{font-size:.9rem;font-weight:500}
.ru .term{font-weight:500}
.ru .hero-index{font-weight:600}
.ru .hero-index .n{font-weight:600}
.ru .hero-begin{font-weight:700}

/* ═══════════════════════════════════════════════════════════════════════════
   THE MARGIN GUARD
   Two separate bugs read as one symptom ("the text is cut off"):

   1. Descenders. Every rising headline sits inside a mask with
      overflow:hidden and no room underneath, so the tails of g, y, p, j and
      every italic were sliced off at the baseline. Fixed by giving the mask
      breathing room and pulling the same amount back out of the layout, so
      nothing moves and nothing clips.

   2. The left edge. The vertical rumour strip is fixed at 26px wide, and the
      grid's minimum left padding was 40px — leaving 14px of daylight between
      a fixed rail and the first character of every line. The floor is now
      wide enough that the column always clears it.
   ═══════════════════════════════════════════════════════════════════════════ */
.ru .lm,.ru .msk,.ru .hero .hl{padding-bottom:.16em;margin-bottom:-.16em}
.ru .big,.ru .mega,.ru .mid,.ru .need{padding-bottom:.02em}

@media (min-width:721px){
  .ru .g,.ru .full,.ru .nav{
    padding-left:max(var(--marg),72px);
    padding-right:max(var(--marg),96px);
  }
}
@media (max-width:720px){
  .ru{--marg:clamp(22px,5.5vw,42px)}
}
/* long single words (URLs, bracketed placeholders) can't push past the column */
.ru .body,.ru .lede,.ru .h3,.ru .uf-label{overflow-wrap:break-word}
/* the creed lines are the widest words on the site — give them room to shrink
   instead of running off both edges of a phone */
@media (max-width:720px){
  .ru .tline.pos{font-size:clamp(2rem,11vw,4rem)}
  .ru .tline.neg{font-size:clamp(1.35rem,6.5vw,2.4rem)}
  .ru .tquote,.ru .tseq{padding-inline:6vw}
  .ru .tquote p{font-size:clamp(1.4rem,7vw,2.6rem)}
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
/* A button that leans toward the cursor before you reach it. The label moves
   less than the shell, which reads as the surface having thickness. */
function Magnetic({ as: T = "button", strength = .34, className = "", children, ...rest }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || reduced() || window.matchMedia("(pointer:coarse)").matches) return;
    const label = el.querySelector(".mag-l");
    const move = (e) => {
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      const dist = Math.hypot(dx, dy);
      const reach = Math.max(r.width, r.height) * 1.5;
      if (dist > reach) return;
      const f = 1 - dist / reach;
      /* hard cap: whatever strength is passed, the control never leaves its
         own neighbourhood. A magnetic button that outruns the cursor is a bug. */
      const CAP = 26;
      const mx = gsap.utils.clamp(-CAP, CAP, dx * strength * f);
      const my = gsap.utils.clamp(-CAP, CAP, dy * strength * f);
      gsap.to(el, { x: mx, y: my, duration: .5, ease: "power3.out", overwrite: "auto" });
      if (label) gsap.to(label, { x: mx * .4, y: my * .4, duration: .5, ease: "power3.out", overwrite: "auto" });
    };
    const out = () => {
      gsap.to(el, { x: 0, y: 0, duration: .9, ease: "elastic.out(1,.4)" });
      if (label) gsap.to(label, { x: 0, y: 0, duration: .9, ease: "elastic.out(1,.4)" });
    };
    window.addEventListener("mousemove", move, { passive: true });
    el.addEventListener("mouseleave", out);
    return () => { window.removeEventListener("mousemove", move); el.removeEventListener("mouseleave", out); };
  }, [strength]);
  return <T ref={ref} className={`mag ${className}`} {...rest}><span className="mag-l">{children}</span></T>;
}

const LB = ({ children, style }) => <p className="lb" style={style}>{children}</p>;

/* ==========================================================================
   §6  SITE
========================================================================== */
/* ---------------------------------------------------------------------------
   THE LOADER
   Two lines typed into a dark room, then the wordmark condenses out of the
   same particles that were drifting behind them. The O is the ember — it is
   the only warm thing on screen, and it is the thing the whole brand is named
   for. Click anywhere to skip; reduced-motion users never see it.
   --------------------------------------------------------------------------- */
const LOADER_LINES = [
  "Every story starts with a whisper.",
  "Every great brand starts as a rumour.",
];

function Loader({ onDone }) {
  const cv = useRef(null);
  const [txt, setTxt] = useState("");
  const [word, setWord] = useState(false);
  const [wordIn, setWordIn] = useState(false);
  const [gone, setGone] = useState(false);
  const [skippable, setSkippable] = useState(false);
  const done = useRef(false);
  const gather = useRef(null);

  const finish = useCallback(() => {
    if (done.current) return;
    done.current = true;
    setWord(true); setWordIn(true);
    setTimeout(() => setGone(true), 420);
    setTimeout(() => onDone && onDone(), 1500);
  }, [onDone]);

  /* particles — whispers in a dark room. They drift upward until the wordmark
     needs them, then they gather into its bounding box. */
  useEffect(() => {
    if (reduced()) { finish(); return; }
    const c = cv.current; if (!c) return;
    const ctx = c.getContext("2d");
    let W = 0, H = 0, raf, run = true;
    const size = () => {
      const d = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth; H = window.innerHeight;
      c.width = W * d; c.height = H * d; ctx.setTransform(d, 0, 0, d, 0, 0);
    };
    size(); window.addEventListener("resize", size);
    const P = Array.from({ length: 70 }, () => ({
      x: Math.random() * window.innerWidth, y: Math.random() * window.innerHeight,
      vx: (Math.random() - .5) * .14, vy: -.06 - Math.random() * .16,
      r: .6 + Math.random() * 1.4, a: .12 + Math.random() * .3,
      seed: Math.random() * 6.283, warm: Math.random() < .3,
    }));
    const frame = (t) => {
      if (!run) return;
      ctx.clearRect(0, 0, W, H);
      const g = gather.current;
      for (const p of P) {
        if (g) {
          p.x += (g.x + Math.cos(p.seed) * g.rx - p.x) * .045;
          p.y += (g.y + Math.sin(p.seed * 1.7) * g.ry - p.y) * .045;
        } else {
          p.x += p.vx + Math.sin(t * .0006 + p.seed) * .08; p.y += p.vy;
          if (p.y < -8) p.y = H + 8;
          if (p.x < -8) p.x = W + 8;
          if (p.x > W + 8) p.x = -8;
        }
        ctx.fillStyle = p.warm ? `rgba(255,80,95,${p.a})` : `rgba(242,244,247,${p.a * .8})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { run = false; cancelAnimationFrame(raf); window.removeEventListener("resize", size); };
  }, [finish]);

  /* the typing sequence */
  useEffect(() => {
    if (reduced()) return;
    let cancelled = false;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const type = async (line, sp) => {
      for (let i = 1; i <= line.length; i++) {
        if (cancelled || done.current) return;
        setTxt(line.slice(0, i)); await wait(sp);
      }
    };
    const erase = async (line, sp) => {
      for (let i = line.length; i >= 0; i--) {
        if (cancelled || done.current) return;
        setTxt(line.slice(0, i)); await wait(sp);
      }
    };
    (async () => {
      await wait(520); if (cancelled || done.current) return;
      setSkippable(true);
      await type(LOADER_LINES[0], 27); await wait(680); await erase(LOADER_LINES[0], 11);
      if (cancelled || done.current) return;
      await wait(240);
      await type(LOADER_LINES[1], 27); await wait(1000); await erase(LOADER_LINES[1], 11);
      if (cancelled || done.current) return;
      await wait(220);
      /* the wordmark materialises out of the drifting particles */
      setWord(true);
      await wait(40);
      gather.current = { x: window.innerWidth / 2, y: window.innerHeight / 2, rx: Math.max(window.innerWidth * .18, 120), ry: 60 };
      setWordIn(true);
      await wait(1500); if (cancelled || done.current) return;
      setGone(true);
      await wait(1100); if (cancelled) return;
      onDone && onDone();
      done.current = true;
    })();
    return () => { cancelled = true; };
  }, [onDone]);

  if (reduced()) return null;

  return (
    <div className={`ld ${gone ? "gone" : ""} ${skippable ? "can-skip" : ""}`}
      aria-hidden="true" onClick={finish}>
      <canvas ref={cv} />
      <div className="ldstage">
        {!word ? <p className="ldtype">{txt}<i /></p> : null}
        {word ? (
          <div className={`ldword ${wordIn ? "in" : ""}`}>
            {"RUMOAR".split("").map((ch, i) => (
              <span key={i} className={i === 3 ? "o" : ""}
                style={{ transitionDelay: `${i * 80}ms` }}>{ch}</span>
            ))}
          </div>
        ) : null}
      </div>
      <span className="ldest">RUMOAR · MMXXVI</span>
      <span className="ldskip">Click to skip</span>
    </div>
  );
}

/* the rumour, running the length of the page down the right-hand edge */
function EdgeStrip() {
  const words = ["Identity", "Status", "Belonging", "Confidence"];
  const run = [...words, ...words, ...words, ...words];
  return (
    <div className="estrip" aria-hidden="true">
      <div className="etrack">
        {run.map((w, i) => (
          <React.Fragment key={i}>{w}<b> · </b></React.Fragment>
        ))}
      </div>
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





/* ===========================================================================
   THE RIPPLES  —  full-bleed, and built so it cannot silently do nothing
   ---------------------------------------------------------------------------
   Three things killed the previous versions, all fixed here:

   1. `(pointer: coarse)` was used as a "is this touch" guard. Touchscreen
      LAPTOPS report coarse as their primary pointer, so the whole effect was
      skipped on perfectly capable machines. Gone — mouse AND touch both drive
      it now.
   2. crossOrigin="anonymous" was set on a same-origin image. That forces a
      CORS check the plain /assets/ path never answers, so the load failed.
      It is now only set when the URL is genuinely cross-origin.
   3. Render-to-float-texture was required. Many browsers grant the extension
      and still refuse the framebuffer. The sim runs on the CPU instead.

   And if the photograph is missing entirely, the water still renders — shaded
   from its own height field — so this can never again look like "nothing
   happened".
   =========================================================================== */
const RIP_VERT = `
attribute vec2 aPos; varying vec2 vUV;
void main(){ vUV = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

const RIP_FRAG = `
precision mediump float;
varying vec2 vUV;
uniform sampler2D uHeight;
uniform sampler2D uImage;
uniform vec2 uTexel;
uniform vec2 uScale;      /* cover-fit correction */
uniform float uHasImage;
void main(){
  float l = texture2D(uHeight, vUV - vec2(uTexel.x, 0.0)).r;
  float r = texture2D(uHeight, vUV + vec2(uTexel.x, 0.0)).r;
  float b = texture2D(uHeight, vUV - vec2(0.0, uTexel.y)).r;
  float t = texture2D(uHeight, vUV + vec2(0.0, uTexel.y)).r;
  float h = texture2D(uHeight, vUV).r;
  vec2 slope = vec2(r - l, t - b);

  /* cover-fit the photograph, then bend it through the surface */
  vec2 uv = (vec2(vUV.x, 1.0 - vUV.y) - 0.5) * uScale + 0.5;
  uv += slope * 1.15;
  vec4 col = texture2D(uImage, clamp(uv, 0.001, 0.999));

  /* no photo? shade the water itself so it is still unmistakably there */
  vec3 water = vec3(0.10, 0.13, 0.18) + vec3(0.7, 0.8, 1.0) * (h - 0.5) * 2.2;
  col.rgb = mix(water, col.rgb, uHasImage);

  float spec = pow(max(0.0, slope.x * 0.7 + slope.y * 0.7), 2.0) * 42.0;
  col.rgb += vec3(1.0, 0.97, 0.92) * clamp(spec, 0.0, 0.6);
  gl_FragColor = vec4(col.rgb, 1.0);
}`;


/* ---------------------------------------------------------------------------
   THE 2D FALLBACK
   Same wave simulation, no GPU. The refraction is done by redrawing the
   photograph as a grid of overlapping tiles, each shifted by the slope of the
   water above it. Tiles overlap by a pixel so the seams close.

   It is the technique that predates WebGL water by about a decade, and it is
   the reason this effect now runs on machines with hardware acceleration
   switched off — which is exactly what was happening.
   --------------------------------------------------------------------------- */
function start2D(c, src) {
  const ctx = c.getContext("2d");
  if (!ctx) { console.info("[ripples] no 2D context either — hero renders plain"); return; }

  const GW = 160, GH = 90, N = GW * GH;
  let prev = new Float32Array(N), cur = new Float32Array(N);
  let img = null, iw = 0, ih = 0;

  if (src) {
    const im = new Image();
    if (/^https?:\/\//i.test(src) && !src.startsWith(window.location.origin)) im.crossOrigin = "anonymous";
    im.onload = () => { img = im; iw = im.naturalWidth; ih = im.naturalHeight; console.info("[ripples] 2D surface ready"); };
    im.onerror = () => console.info("[ripples] image missing — water still renders");
    im.src = src;
  }

  let W = 0, H = 0, dpr = 1;
  const size = () => {
    const r = c.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  size();
  window.addEventListener("resize", size);

  const drop = (gx, gy, radius, force) => {
    const r2 = radius * radius;
    for (let y = -radius; y <= radius; y++) {
      for (let x = -radius; x <= radius; x++) {
        const px = gx + x, py = gy + y;
        if (px < 1 || py < 1 || px >= GW - 1 || py >= GH - 1) continue;
        const d2 = x * x + y * y; if (d2 > r2) continue;
        cur[py * GW + px] += force * (Math.cos((Math.sqrt(d2) / radius) * Math.PI) * .5 + .5);
      }
    }
  };
  for (let i = 0; i < 3; i++)
    drop(24 + ((Math.random() * (GW - 48)) | 0), 20 + ((Math.random() * (GH - 40)) | 0), 8, 2.6);

  let lx = -1, ly = -1;
  const host = c.closest(".hero") || c.parentElement;
  const toGrid = (cx, cy) => {
    const r = c.getBoundingClientRect();
    return [Math.round(((cx - r.left) / r.width) * (GW - 1)),
            Math.round(((cy - r.top) / r.height) * (GH - 1))];
  };
  const push = (cx, cy) => {
    const [gx, gy] = toGrid(cx, cy);
    if (gx < 0 || gy < 0 || gx >= GW || gy >= GH) return;
    if (lx >= 0) {
      const steps = Math.min(6, (Math.hypot(gx - lx, gy - ly) / 3) | 0);
      for (let i = 1; i <= steps; i++)
        drop(Math.round(lx + (gx - lx) * (i / steps)), Math.round(ly + (gy - ly) * (i / steps)), 4, .8);
    }
    drop(gx, gy, 6, 1.7);
    lx = gx; ly = gy;
  };
  const onMove = (e) => push(e.clientX, e.clientY);
  const onTouch = (e) => { const t = e.touches && e.touches[0]; if (t) push(t.clientX, t.clientY); };
  const onLeave = () => { lx = -1; ly = -1; };
  const onDown = (e) => { const [gx, gy] = toGrid(e.clientX, e.clientY); drop(gx, gy, 13, 6); };
  host.addEventListener("mousemove", onMove, { passive: true });
  host.addEventListener("touchmove", onTouch, { passive: true });
  host.addEventListener("mouseleave", onLeave);
  host.addEventListener("pointerdown", onDown);

  let vis = true;
  const io = new IntersectionObserver(([e]) => { vis = e.isIntersecting; }, { threshold: 0 });
  io.observe(c);

  let raf, run = true, frame = 0;
  const tick = () => {
    if (!run) return;
    raf = requestAnimationFrame(tick);
    if (!vis) return;

    for (let y = 1; y < GH - 1; y++) {
      const row = y * GW;
      for (let x = 1; x < GW - 1; x++) {
        const i = row + x;
        prev[i] = ((cur[i - 1] + cur[i + 1] + cur[i - GW] + cur[i + GW]) * .5 - prev[i]) * .972;
      }
    }
    const sw = prev; prev = cur; cur = sw;

    /* cover-fit the source once per frame */
    const TX = 40, TY = 24;                     /* tile counts, not pixels */
    const tw = W / TX, th = H / TY;
    if (img) {
      const ca = W / H, ia = iw / ih;
      const sw2 = ca > ia ? iw : ih * ca;
      const sh2 = ca > ia ? iw / ca : ih;
      const sx0 = (iw - sw2) / 2, sy0 = (ih - sh2) / 2;
      for (let ty = 0; ty < TY; ty++) {
        for (let tx = 0; tx < TX; tx++) {
          const gx = Math.round((tx / TX) * (GW - 1)) || 1;
          const gy = Math.round((ty / TY) * (GH - 1)) || 1;
          const i = gy * GW + gx;
          const dx = (cur[i + 1] - cur[i - 1]) * 26;
          const dy = (cur[i + GW] - cur[i - GW]) * 26;
          ctx.drawImage(img,
            sx0 + (tx / TX) * sw2 + dx, sy0 + (ty / TY) * sh2 + dy,
            sw2 / TX, sh2 / TY,
            tx * tw - .5, ty * th - .5, tw + 1, th + 1);
        }
      }
    } else {
      /* no photograph — draw the water itself so it is still visible */
      ctx.clearRect(0, 0, W, H);
      for (let ty = 0; ty < TY; ty++) {
        for (let tx = 0; tx < TX; tx++) {
          const gx = Math.round((tx / TX) * (GW - 1)) || 1;
          const gy = Math.round((ty / TY) * (GH - 1)) || 1;
          const h = cur[gy * GW + gx];
          const v = Math.max(0, Math.min(255, 26 + h * 120)) | 0;
          ctx.fillStyle = `rgb(${v},${(v * 1.06) | 0},${(v * 1.3) | 0})`;
          ctx.fillRect(tx * tw, ty * th, tw + 1, th + 1);
        }
      }
    }
    frame++;
  };
  tick();

  return () => {
    run = false; cancelAnimationFrame(raf);
    window.removeEventListener("resize", size);
    host.removeEventListener("mousemove", onMove);
    host.removeEventListener("touchmove", onTouch);
    host.removeEventListener("mouseleave", onLeave);
    host.removeEventListener("pointerdown", onDown);
    io.disconnect();
  };
}

function HeroRipples({ src }) {
  const cv = useRef(null);

  useEffect(() => {
    const c = cv.current;
    if (!c) return;
    if (reduced()) return;                    /* motion preference is the ONLY opt-out */

    /* Try every context name, and try plain before optioned — some setups
       reject an options object they don't like rather than negotiating. */
    let gl = null;
    for (const name of ["webgl2", "webgl", "experimental-webgl"]) {
      for (const opts of [{ alpha: false, antialias: false, depth: false, powerPreference: "low-power" }, undefined]) {
        try { gl = c.getContext(name, opts); } catch { gl = null; }
        if (gl) break;
      }
      if (gl) break;
    }
    if (!gl) {
      /* No WebGL at all — usually hardware acceleration switched off. Fall back
         to a 2D canvas version of the same simulation rather than showing
         nothing. It is a few frames slower and it works everywhere. */
      console.info("[ripples] no WebGL — running the 2D fallback instead");
      return start2D(c, src);
    }

    const mk = (t, srcTxt) => {
      const sh = gl.createShader(t);
      gl.shaderSource(sh, srcTxt); gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.warn("[ripples] shader failed:", gl.getShaderInfoLog(sh)); return null;
      }
      return sh;
    };
    const vs = mk(gl.VERTEX_SHADER, RIP_VERT), fs = mk(gl.FRAGMENT_SHADER, RIP_FRAG);
    if (!vs || !fs) return;
    const prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn("[ripples] link failed:", gl.getProgramInfoLog(prog)); return;
    }
    gl.useProgram(prog);

    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const GW = 220, GH = 124, N = GW * GH;
    let prev = new Float32Array(N), cur = new Float32Array(N);
    const bytes = new Uint8Array(N * 4);
    for (let i = 0; i < N; i++) bytes[i * 4] = 128;

    const hTex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, hTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, GW, GH, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes);

    const iTex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, iTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
      new Uint8Array([18, 20, 26, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    let hasImage = 0, imgAspect = 1;
    if (src) {
      const im = new Image();
      /* only ask for CORS when the file really is on another origin — asking
         for it on a same-origin /assets/ path makes the load fail outright */
      if (/^https?:\/\//i.test(src) && !src.startsWith(window.location.origin)) {
        im.crossOrigin = "anonymous";
      }
      im.onload = () => {
        imgAspect = im.naturalWidth / im.naturalHeight;
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, iTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);
        hasImage = 1;
        console.info("[ripples] surface ready");
      };
      im.onerror = () => console.info("[ripples] image missing (" + src + ") — water still renders");
      im.src = src;
    }

    gl.uniform1i(gl.getUniformLocation(prog, "uHeight"), 0);
    gl.uniform1i(gl.getUniformLocation(prog, "uImage"), 1);
    gl.uniform2f(gl.getUniformLocation(prog, "uTexel"), 1 / GW, 1 / GH);
    const uScale = gl.getUniformLocation(prog, "uScale");
    const uHasImage = gl.getUniformLocation(prog, "uHasImage");

    let vw = 1, vh = 1;
    const size = () => {
      const r = c.getBoundingClientRect();
      const d = Math.min(window.devicePixelRatio || 1, 2);
      vw = Math.max(1, r.width); vh = Math.max(1, r.height);
      c.width = Math.round(vw * d); c.height = Math.round(vh * d);
      gl.viewport(0, 0, c.width, c.height);
    };
    size(); window.addEventListener("resize", size);

    /* seed a few drops so the surface is alive before anyone touches it */
    const drop = (gx, gy, radius, force) => {
      const r2 = radius * radius;
      for (let y = -radius; y <= radius; y++) {
        for (let x = -radius; x <= radius; x++) {
          const px = gx + x, py = gy + y;
          if (px < 1 || py < 1 || px >= GW - 1 || py >= GH - 1) continue;
          const d2 = x * x + y * y; if (d2 > r2) continue;
          cur[py * GW + px] += force * (Math.cos((Math.sqrt(d2) / radius) * Math.PI) * .5 + .5);
        }
      }
    };
    for (let i = 0; i < 3; i++)
      drop(30 + ((Math.random() * (GW - 60)) | 0), 30 + ((Math.random() * (GH - 60)) | 0), 10, 2.4);

    let lx = -1, ly = -1;
    const host = c.closest(".hero") || c.parentElement;
    const toGrid = (cx, cy) => {
      const r = c.getBoundingClientRect();
      return [Math.round(((cx - r.left) / r.width) * (GW - 1)),
              Math.round((1 - (cy - r.top) / r.height) * (GH - 1))];
    };
    const push = (cx, cy) => {
      const [gx, gy] = toGrid(cx, cy);
      if (gx < 0 || gy < 0 || gx >= GW || gy >= GH) return;
      if (lx >= 0) {
        const steps = Math.min(7, (Math.hypot(gx - lx, gy - ly) / 4) | 0);
        for (let i = 1; i <= steps; i++)
          drop(Math.round(lx + (gx - lx) * (i / steps)),
               Math.round(ly + (gy - ly) * (i / steps)), 5, .7);
      }
      drop(gx, gy, 7, 1.5);
      lx = gx; ly = gy;
    };
    const onMove = (e) => push(e.clientX, e.clientY);
    const onTouch = (e) => {
      const t = e.touches && e.touches[0]; if (t) push(t.clientX, t.clientY);
    };
    const onLeave = () => { lx = -1; ly = -1; };
    const onDown = (e) => { const [gx, gy] = toGrid(e.clientX, e.clientY); drop(gx, gy, 15, 5.5); };
    host.addEventListener("mousemove", onMove, { passive: true });
    host.addEventListener("touchmove", onTouch, { passive: true });
    host.addEventListener("mouseleave", onLeave);
    host.addEventListener("pointerdown", onDown);

    let vis = true;
    const io = new IntersectionObserver(([e]) => { vis = e.isIntersecting; }, { threshold: 0 });
    io.observe(c);

    let raf, run = true;
    const tick = () => {
      if (!run) return;
      raf = requestAnimationFrame(tick);
      if (!vis) return;

      for (let y = 1; y < GH - 1; y++) {
        const row = y * GW;
        for (let x = 1; x < GW - 1; x++) {
          const i = row + x;
          prev[i] = ((cur[i - 1] + cur[i + 1] + cur[i - GW] + cur[i + GW]) * .5 - prev[i]) * .972;
        }
      }
      const sw = prev; prev = cur; cur = sw;
      for (let i = 0; i < N; i++) {
        const v = 128 + cur[i] * 48;
        bytes[i * 4] = v < 0 ? 0 : v > 255 ? 255 : v;
      }

      gl.useProgram(prog);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, hTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, GW, GH, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, iTex);

      /* cover-fit: crop the long axis rather than squashing the picture */
      const canvasAspect = vw / vh;
      const sx = canvasAspect > imgAspect ? 1 : imgAspect / canvasAspect;
      const sy = canvasAspect > imgAspect ? canvasAspect / imgAspect : 1;
      gl.uniform2f(uScale, 1 / (sy || 1), 1 / (sx || 1));
      gl.uniform1f(uHasImage, hasImage);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    tick();

    return () => {
      run = false; cancelAnimationFrame(raf);
      window.removeEventListener("resize", size);
      host.removeEventListener("mousemove", onMove);
      host.removeEventListener("touchmove", onTouch);
      host.removeEventListener("mouseleave", onLeave);
      host.removeEventListener("pointerdown", onDown);
      io.disconnect();
      gl.deleteTexture(hTex); gl.deleteTexture(iTex);
      gl.deleteBuffer(quad); gl.deleteProgram(prog);
    };
  }, [src]);

  return <canvas className="ripple" ref={cv} aria-hidden="true" />;
}

/* ===========================================================================
   THE HERO  —  full bleed
   The photograph is the whole screen and the water is the whole screen with
   it. Copy sits in the quiet corners the way the reference does: a short
   statement top-left, an index top-right, and the wordmark laid across the
   base as a lockup rather than a headline.
   =========================================================================== */
function Hero() {
  const sec = useRef(null), copy = useRef(null), mark = useRef(null);

  useScene(sec, (p) => {
    if (copy.current) copy.current.style.transform = `translate3d(0,${p * -46}px,0)`;
    if (mark.current) {
      mark.current.style.transform = `translate3d(0,${p * 22}px,0)`;
      mark.current.style.opacity = String(Math.max(0, 1 - p * 1.6));
    }
  });

  return (
    <section className="hero" id="hero" ref={sec}>
      <div className="hero-plate"><Media a={M.hero.plate} eager style={{ height: "100%" }} /></div>
      <HeroRipples src={url(M.hero.plate.path)} />

      <div className="hero-grain" aria-hidden="true" />

      <div className="hero-ui" ref={copy}>
        <div className="hero-lead">
          <p className="hero-stmt">
            <b>Men changed.<br />Menswear didn&rsquo;t.</b>
            <span>An investigation into the Indian wardrobe &mdash; what it built,
            what it skipped, and what still has no name.</span>
          </p>
          <button className="hero-begin"
            onClick={() => document.getElementById("money")?.scrollIntoView({ behavior: "smooth" })}>
            Begin the argument<i />
          </button>
        </div>

        <div className="hero-index">
          <p><span className="n">01/</span> Evidence</p>
          <p>Identity</p>
          <p>System</p>
        </div>
      </div>

      {[[22, 24], [58, 38], [78, 62], [40, 74]].map(([x, y], i) => (
        <span className="hero-x" key={i} style={{ left: `${x}%`, top: `${y}%` }} aria-hidden="true">+</span>
      ))}

      <div className="hero-mark" ref={mark} aria-hidden="true">RUMOAR</div>
    </section>
  );
}


function Chapter({ id, n, title, note }) {
  return (
    <section id={id} className="g" style={{ padding: "clamp(96px,16vh,200px) 0 clamp(34px,6vh,80px)" }}>
      <div style={{ gridColumn: "1 / 3" }}><Reveal><LB>{n}</LB></Reveal></div>
      <div style={{ gridColumn: "3 / 10" }}>
        <Lines lines={title} className="big" />
      </div>
      {note ? (
        <div style={{ gridColumn: "3 / 8", marginTop: "clamp(28px,5vh,64px)" }}>
          <Reveal delay={220}><p className="lede" style={{ maxWidth: "38ch" }}>{note}</p></Reveal>
        </div>
      ) : null}
    </section>
  );
}

function Timeline() {
  const { era: i, setEra } = useEra();
  const [out, setOut] = useState(false);
  const rail = useRef(null), btns = useRef([]), figure = useRef(null), sec = useRef(null);
  const [knob, setKnob] = useState({ left: 0, width: 0 });
  const pending = useRef(0);

  const select = (n) => {
    if (n === pending.current) return;
    pending.current = n;
    setOut(true);
    setTimeout(() => { setEra(pending.current); setOut(false); }, reduced() ? 60 : 400);
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
    <section ref={sec} style={{ paddingBottom: "clamp(60px,10vh,146px)" }}>
      <div className="railwrap">
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

      <div className={`g era ${out ? "out" : ""}`} style={{ alignItems: "start", marginTop: "clamp(28px,5vh,64px)" }}>
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
              <EraCollage year={d.year} />
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
        paddingBottom: "clamp(56px,12vh,156px)", justifyContent: align === "left" ? "flex-start" : "flex-end"
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
        <div ref={veil} style={{ position: "absolute", inset: 0, background: "var(--paper)", opacity: 0 }} />
        <div className="full" style={{
          position: "absolute", inset: 0, display: "flex", alignItems: "flex-end",
          paddingBottom: "clamp(51px,11vh,146px)"
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
  "van-heusen": { side: "left", dy: -4 },
  "louis-philippe": { side: "right", dy: 6 },
  "us-polo": { side: "left", dy: 4 },
  "allen-solly": { side: "right", dy: 2 },
  "rare-rabbit": { side: "right", dy: 4 },
  "snitch": { side: "left", dy: 0 },
  "rumoar": { side: "left", dy: -22 },
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
          <g key={g} stroke="var(--grid)" strokeWidth="1">
            <line x1={fx(g)} y1={fy(0)} x2={fx(g)} y2={fy(100)} />
            <line x1={fx(0)} y1={fy(g)} x2={fx(100)} y2={fy(g)} />
          </g>
        ))}

        {/* THE IDENTITY SPACE.
            BUG WAS HERE: unless the white-space act had scrubbed to its final
            step, this rectangle was drawn transparent with a var(--axis)
            hairline — #DCDCE1 on white, and a 22%-alpha bone on black. The one
            region the entire argument is about was, in both light levels,
            effectively invisible. It is now always drawn in the brand mark and
            always labelled; the act's final step simply raises it from quiet
            to loud instead of from nothing to something. */}
        <rect x={wsX} y={wsY} width={wsW} height={wsH} rx="2"
          fill={`color-mix(in srgb,var(--mark) ${isolate ? 9 : 4}%,transparent)`}
          stroke="var(--mark)" strokeWidth={isolate ? 1.8 : 1.2} strokeDasharray="7 8"
          opacity={isolate ? 1 : .58}
          style={{ transition: "all 1.4s cubic-bezier(.22,.68,.16,1)" }} />
        <text x={wsX + wsW / 2} y={wsY + wsH - 16} textAnchor="middle" className="ax"
          fill="var(--mark)" opacity={isolate ? 1 : .72}
          style={{ fontWeight: 700, transition: "opacity 1.4s cubic-bezier(.22,.68,.16,1)" }}>
          THE IDENTITY SPACE
        </text>

        <line x1={fx(0)} y1={fy(0)} x2={fx(100)} y2={fy(0)} stroke="var(--axis)" strokeWidth="1" />
        <line x1={fx(0)} y1={fy(0)} x2={fx(0)} y2={fy(100)} stroke="var(--axis)" strokeWidth="1" />
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
                  stroke={br.isBrand ? "var(--mark)" : "var(--ink)"} strokeWidth="1" opacity=".35"
                  style={{ transition: "r 420ms cubic-bezier(.16,1,.3,1)" }} />
              ) : null}
              <circle className="pt" cx={cx} cy={cy} r={r}
                fill={br.isBrand ? "var(--mark)" : "var(--ink)"}
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
            <circle cx={fx(you.x)} cy={fy(you.y)} r="34" fill="none" stroke="var(--mark)" strokeWidth="1"
              opacity=".5" className="youring" />
            <line x1={fx(you.x)} y1={fy(you.y)} x2={fx(you.nearest.x)} y2={fy(you.nearest.y)}
              stroke="var(--mark)" strokeWidth="1" strokeDasharray="3 5" opacity=".45" />
            <circle cx={fx(you.x)} cy={fy(you.y)} r="7" fill="var(--paper)" stroke="var(--mark)" strokeWidth="2.5" />
            <text className="ptl" x={fx(you.x)} y={fy(you.y) - 26} textAnchor="middle"
              fill="var(--mark)" style={{ fontWeight: 600 }}>YOU</text>
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
              <span style={{ fontSize: ".82rem", fontWeight: 600, textAlign: "right" }}>{v}</span>
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
          <div style={{ gridColumn: "1 / 8", position: "relative", minHeight: "6.2em" }}>
            {/* BUG WAS HERE: the second line of every couplet — which is the
                half that carries the argument — was set in var(--ink-3), the
                faintest grey in the palette. Against white it ran ~2.9:1 and
                against the night background it ran ~3.0:1, so the whole act
                read as barely-there in BOTH modes. Second lines now use ink-2,
                and the payoff line keeps the mark. */}
            {lines.map((l, k) => (
              <h2 key={k} className="big" style={{
                position: k === 0 ? "relative" : "absolute", inset: k === 0 ? undefined : 0,
                opacity: s === k ? 1 : 0, filter: s === k ? "none" : "blur(10px)",
                transform: `translateY(${s === k ? 0 : s > k ? -18 : 18}px)`,
                transition: "opacity 820ms var(--ez),filter 820ms var(--ez),transform 1.2s var(--ez-out)"
              }}>{l[0]}<br /><span style={{ color: k === 2 ? "var(--mark)" : "var(--ink-2)" }}>{l[1]}</span></h2>
            ))}
          </div>
          {/* the field was dimmed to 30% for the whole first beat, which is
              most of the section — it now stays legible and merely recedes */}
          <div className="wsplot" style={{ gridColumn: "8 / 13", opacity: s === 0 ? .72 : 1, transition: "opacity 1.4s var(--ez)" }}>
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
      <div style={{ position: "absolute", inset: 0, background: "var(--paper)", opacity: .88 }} />
      <div className="g" style={{ position: "relative", width: "100%", alignItems: "center" }}>
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
            <Magnetic className="cta" onClick={onLab}
              style={{ padding: "16px 34px", fontSize: ".64rem" }}>
              Enter the RUMOAR Styling Lab
            </Magnetic>
          </Reveal>
        </div>

        {/* MOVED HERE from the deleted risk register. Unchanged component,
            unchanged label — it simply now answers "six identities" with
            "one unbroken thread", which is the point it was always making. */}
        <div style={{ gridColumn: "10 / 13", alignSelf: "center" }}>
          <Reveal delay={380}>
            <ThreadMark form="grid" label="nine pieces · one unbroken thread" />
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
      <div ref={clip} style={{ position: "absolute", inset: 0, background: "var(--paper)", clipPath: "inset(0 0 0 50%)" }}>
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

      <div className="g" style={{ paddingTop: "clamp(16px,3vh,42px)", paddingBottom: "clamp(50px,8vh,114px)", alignItems: "start" }}>
        <div style={{ gridColumn: "1 / 3" }}>
          <LB>Sources</LB>
          <div className="labsrc lab-rail" style={{ display: "grid", gap: 13, marginTop: 16 }}>
            {lookData.map((l) => (
              <div key={l.id} className={`tile ${shown === l.id ? "on" : ""}`} role="button" tabIndex={0}
                aria-label={`Dress him in ${l.name}`}
                onPointerDown={(e) => down(e, l.id)} onPointerMove={move} onPointerUp={up}
                onKeyDown={(e) => e.key === "Enter" && apply(l.id)}>
                <div className="tf"><Media a={M.lab.thumbs[l.id]} style={{ height: "100%" }} /></div>
                <p style={{ fontSize: ".86rem", fontWeight: 600, marginTop: 8, color: l.isBrand ? "var(--mark)" : "var(--ink)" }}>
                  {l.name}
                </p>
                <LB>{l.house}</LB>
              </div>
            ))}
          </div>
          <p className="lb" style={{ marginTop: 18, lineHeight: 1.9 }}>
            Tap to preview, tap again to dress. Drag also works.
          </p>
        </div>

        <div className="lab-figure" style={{ gridColumn: "3 / 10" }}>
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

      <div className="g" style={{ paddingBottom: "clamp(70px,12vh,156px)" }}>
        <div style={{ gridColumn: "1 / 13" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 18 }}>
            <h3 className="mid">The same man, two systems</h3><LB>Drag the divider</LB>
          </div>
          <Compare a={lookData[0]} b={lookData[lookData.length - 1]} />
        </div>
      </div>

      {/* what you leave with — an itemised session, not a cart */}
      <div className="g" style={{ paddingBottom: "clamp(80px,14vh,187px)", alignItems: "start" }}>
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
              <div><LB>Distance to nearest</LB><p className="num" style={{ fontSize: "1.6rem", fontWeight: 500 }}>{you.gap}</p></div>
              <div><LB>Identity demand</LB><p className="num" style={{ fontSize: "1.6rem", fontWeight: 500 }}>{Math.round(you.x)}</p></div>
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

/* ===========================================================================
   THE THREAD MARK
   The same cord as before — three stacked strokes, a blurred shadow offset
   down-right, the cord itself, and a specular dash that slides along the
   twist — but at ornament scale, dropped into the empty column of a section
   rather than taking over the screen.

   One mark per section, each holding the next form. Read top to bottom they
   are still one thread: stitch, curve, pulse, shirt, grid, signature.

   Every form is generated from exactly MARK_PTS control points through the
   same smoothing function, so the path skeletons are identical by
   construction and the morph can never snap.
   =========================================================================== */
const MARK_PTS = 14;

/* Catmull-Rom through the points, emitted as cubics. Fixed point count in,
   fixed command count out. */
function smoothPath(pts) {
  const p = pts;
  let d = `M ${p[0][0].toFixed(1)},${p[0][1].toFixed(1)}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

const MARK_FORMS = {
  /* a running stitch, at rest */
  stitch: [[16,100],[32,84],[48,116],[64,88],[80,112],[96,90],[112,110],[128,92],
           [144,108],[160,94],[176,106],[192,98],[208,102],[224,100]],
  /* income and market, climbing */
  curve:  [[16,172],[32,168],[48,161],[64,151],[80,139],[96,126],[112,112],[128,97],
           [144,82],[160,68],[176,56],[192,46],[208,39],[224,34]],
  /* one day — the spikes are the moments he is read */
  pulse:  [[16,100],[32,100],[48,52],[64,100],[80,148],[96,100],[112,40],[128,100],
           [144,156],[160,100],[176,34],[192,100],[208,120],[224,100]],
  /* THE SHIRT — collar, shoulder, sleeve, body, hem, and back up */
  shirt:  [[120,30],[146,38],[172,52],[196,86],[176,98],[156,76],[157,168],[120,174],
           [83,168],[84,76],[64,98],[44,86],[68,52],[100,36]],
  /* THE SYSTEM — nine pieces, and one thread that visits every one of them
     without ever being lifted. That is what a wardrobe system actually is:
     not nine good garments, but the single logic that connects them. The path
     is a true Hamiltonian walk of the 3x3 — every node hit exactly once. */
  grid:   [[52,52],[120,52],[188,52],[188,104],[120,104],[52,104],[52,156],
           [120,156],[188,156],[188,120],[120,120],[52,120],[52,68],[188,68]],
  /* signed */
  sign:   [[20,130],[38,96],[54,140],[72,104],[90,146],[108,102],[126,138],[144,98],
           [162,134],[180,100],[196,124],[210,108],[220,116],[228,110]],
};

function ThreadMark({ form = "stitch", label, className = "", style }) {
  const root = useRef(null);
  const d = useMemo(() => smoothPath(MARK_FORMS[form] || MARK_FORMS.stitch), [form]);

  useEffect(() => {
    const el = root.current; if (!el || reduced()) return;
    const ctx = gsap.context(() => {
      const paths = gsap.utils.toArray(".mk-shade, .mk-core, .mk-spec", el);
      const spec = el.querySelector(".mk-spec");

      /* draws itself in when it scrolls into view */
      gsap.set(paths, { strokeDasharray: 900, strokeDashoffset: 900 });
      gsap.to(paths, {
        strokeDashoffset: 0, duration: 1.6, ease: "power2.inOut", stagger: .07,
        scrollTrigger: { trigger: el, start: "top 88%", once: true },
        onComplete() {
          gsap.set(paths, { strokeDasharray: "none" });
          /* then the light starts travelling the twist, forever */
          gsap.set(spec, { strokeDasharray: "10 130" });
          gsap.to(spec, { strokeDashoffset: -280, duration: 4.5, ease: "none", repeat: -1 });
        },
      });

      /* the pieces land as the thread reaches them */
      const nodes = el.querySelectorAll(".mk-nodes circle");
      if (nodes.length) {
        gsap.set(nodes, { scale: 0, transformOrigin: "center" });
        gsap.to(nodes, {
          scale: 1, duration: .5, ease: "back.out(2.4)", stagger: .09, delay: .5,
          scrollTrigger: { trigger: el, start: "top 88%", once: true },
        });
      }

      /* it breathes — a cord under slight tension never sits perfectly still */
      gsap.to(el.querySelector(".mk-g"), {
        rotate: 1.1, y: -3, duration: 4.2, ease: "sine.inOut",
        yoyo: true, repeat: -1, transformOrigin: "50% 50%",
      });
      /* the shadow drifts against it, which is what reads as depth */
      gsap.to(el.querySelector(".mk-shade"), {
        x: 5.5, y: 6.5, duration: 4.2, ease: "sine.inOut", yoyo: true, repeat: -1,
      });
    }, el);
    return () => ctx.revert();
  }, [form]);

  return (
    <figure className={`mark ${className}`} ref={root} style={style}>
      <svg viewBox="0 0 240 200" aria-hidden="true">
        <g className="mk-g">
          <path className="mk-shade" d={d} />
          <path className="mk-core" d={d} />
          <path className="mk-spec" d={d} />
          {form === "grid" ? (
            <g className="mk-nodes">
              {[[52,52],[120,52],[188,52],[52,104],[120,104],[188,104],[52,156],[120,156],[188,156]]
                .map(([cx, cy], i) => <circle key={i} cx={cx} cy={cy} r="4.2" />)}
            </g>
          ) : null}
        </g>
      </svg>
      {label ? <figcaption>{label}</figcaption> : null}
    </figure>
  );
}




/* ===========================================================================
   THE ERA COLLAGE
   A research board assembling itself. Plate one lands and an arrow calls out
   one detail. Plate two slides over it, covering part of the first, and calls
   out another. Four plates, four callouts, roughly two and a half seconds.

   The overlap is the point: each new plate half-hides the one before it, the
   way a real board is built by piling references, not by laying them out in a
   neat row. Changing the era tears the board down and builds the next one.

   Callout coordinates are percentages of their own plate, so they stay pinned
   to the right part of the image at any size.
   =========================================================================== */
/* One layout, reused for every era. Heights are percentages of the collage
   box rather than an aspect ratio, so the board can never overflow the
   clipped container it sits in — whatever the viewport does. */
const PLATE_LAYOUT = [
  { left: "0%",  top: "5%",  w: "43%", h: "56%", r: -3.0 },
  { left: "26%", top: "0%",  w: "40%", h: "52%", r: 2.6 },
  { left: "55%", top: "11%", w: "40%", h: "55%", r: -1.8 },
  { left: "31%", top: "42%", w: "38%", h: "52%", r: 3.2 },
];

const ERA_PLATES = {
  1900: [
    { cx: 62, cy: 34, note: "Handwoven — no two the same" },
    { cx: 38, cy: 58, note: "Drape, not tailoring" },
    { cx: 55, cy: 26, note: "Turban states region" },
    { cx: 46, cy: 62, note: "Jewellery is the ledger" },
  ],
  1970: [
    { cx: 52, cy: 40, note: "One good set" },
    { cx: 44, cy: 30, note: "Terrycot — built to survive" },
    { cx: 58, cy: 52, note: "Safari cut, office to wedding" },
    { cx: 48, cy: 60, note: "Repaired, not replaced" },
  ],
  2000: [
    { cx: 46, cy: 36, note: "The brand becomes visible" },
    { cx: 56, cy: 44, note: "Denim arrives" },
    { cx: 40, cy: 28, note: "Logo as shorthand" },
    { cx: 52, cy: 58, note: "Mall lighting, mall taste" },
  ],
  2010: [
    { cx: 50, cy: 32, note: "Infinite catalogue" },
    { cx: 44, cy: 54, note: "Slim fit, borrowed wholesale" },
    { cx: 58, cy: 38, note: "Accessories as afterthought" },
    { cx: 46, cy: 62, note: "Everything available, nothing chosen" },
  ],
  2020: [
    { cx: 54, cy: 42, note: "Occasions collapse" },
    { cx: 42, cy: 30, note: "Home and office, same shirt" },
    { cx: 56, cy: 50, note: "Camera-up, waist-down" },
    { cx: 48, cy: 60, note: "The closet stops adapting" },
  ],
  2026: [
    { cx: 48, cy: 34, note: "Six selves, one week" },
    { cx: 56, cy: 46, note: "Objects do the talking" },
    { cx: 40, cy: 30, note: "Heritage, quoted not worn" },
    { cx: 52, cy: 58, note: "Still no system to hold it" },
  ],
};


/* ===========================================================================
   THE STACK
   A deck of frames that collapses as you scroll past it. At the top of its
   range the cards are fanned out behind each other, each one peeking above
   the last; by the bottom they have all shuffled down into a single frame.

   It exists to buy back vertical space: five images occupy the height of one,
   and the collapse is the transition rather than five separate scroll events.

   Cards are ordered back to front, so the one the reader ends on is the last
   in the array.
   =========================================================================== */
function Stack({ items = [], caption, index, id }) {
  const root = useRef(null), pin = useRef(null);
  const [active, setActive] = useState(items.length - 1);

  useEffect(() => {
    const el = root.current, box = pin.current;
    if (!el || !box || reduced()) return;

    const ctx = gsap.context(() => {
      const cards = gsap.utils.toArray(".stk-card", el);
      const n = cards.length;

      /* fanned: each card sits a little higher and a little wider than the
         one in front, so you can read the edge of every image at once */
      gsap.set(cards, {
        y: (i) => -(n - 1 - i) * 34,
        scale: (i) => 1 - (n - 1 - i) * 0.045,
        zIndex: (i) => i,
        transformOrigin: "50% 100%",
      });

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: el, start: "top top", end: "+=1500",
          scrub: .9, pin: box, pinSpacing: true,
          anticipatePin: 1, invalidateOnRefresh: true,
        },
      });

      /* they drop into register one at a time, back to front */
      cards.forEach((c, i) => {
        if (i === n - 1) return;
        tl.to(c, { y: 0, scale: 1, duration: 1, ease: "power2.inOut" }, i * .55)
          .add(() => setActive(i), i * .55 + .5);
      });
      tl.add(() => setActive(n - 1), "+=.2");
    }, el);

    return () => ctx.revert();
  }, [items.length]);

  const cur = items[active] || items[items.length - 1] || {};
  return (
    <section className="stack" id={id} ref={root}>
      <div className="stk-pin" ref={pin}>
        <div className="g" style={{ alignItems: "center", width: "100%" }}>
          <div style={{ gridColumn: "1 / 5" }}>
            {caption ? <h2 className="big">{caption}</h2> : null}
            <p className="lb" style={{ marginTop: 22 }}>
              {index || `(0${Math.min(active + 1, items.length)})`}
            </p>
            <p className="body" style={{ marginTop: 10, maxWidth: "28ch" }}>{cur.note}</p>
          </div>
          <div style={{ gridColumn: "6 / 13" }}>
            <div className="stk-deck">
              {items.map((it, i) => (
                <figure className="stk-card" key={i}>
                  <Media a={it.a} style={{ height: "100%" }} />
                </figure>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function EraCollage({ year }) {
  const root = useRef(null);
  const plates = ERA_PLATES[year] || ERA_PLATES[1900];
  const media = (M.timeline.plates && M.timeline.plates[year]) || [];

  useEffect(() => {
    const el = root.current; if (!el) return;
    const cards = gsap.utils.toArray(".pl", el);
    if (reduced()) { gsap.set(cards, { autoAlpha: 1, scale: 1, y: 0 }); return; }

    const ctx = gsap.context(() => {
      const tl = gsap.timeline();
      cards.forEach((c, i) => {
        const at = i * .34;
        const callout = c.querySelector(".pl-call");
        const line = c.querySelector(".pl-line");
        const dot = c.querySelector(".pl-dot");
        const txt = c.querySelector(".pl-txt");

        /* the plate is dealt onto the board */
        tl.fromTo(c,
          { autoAlpha: 0, y: 34, scale: .93, rotate: PLATE_LAYOUT[i].r - 6 },
          { autoAlpha: 1, y: 0, scale: 1, rotate: PLATE_LAYOUT[i].r,
            duration: .52, ease: "back.out(1.5)" }, at);

        /* then the arrow finds its detail */
        tl.fromTo(dot, { scale: 0 }, { scale: 1, duration: .22, ease: "back.out(3)" }, at + .26)
          .fromTo(line, { scaleX: 0 }, { scaleX: 1, duration: .26, ease: "power3.out" }, at + .32)
          .fromTo(txt, { autoAlpha: 0, x: -8 }, { autoAlpha: 1, x: 0, duration: .26 }, at + .42);
        if (callout) tl.set(callout, { zIndex: 40 }, at + .26);
      });
      /* the callouts fade back once the board is read, so the images breathe */
      tl.to(el.querySelectorAll(".pl-call"), {
        autoAlpha: .34, duration: .5, stagger: .05,
      }, "+=1.5");
    }, el);
    return () => ctx.revert();
  }, [year]);

  return (
    <div className="collage" ref={root} key={year}>
      {plates.map((p, i) => (
        <figure className="pl" key={i}
          style={{
            left: PLATE_LAYOUT[i].left, top: PLATE_LAYOUT[i].top,
            width: PLATE_LAYOUT[i].w, height: PLATE_LAYOUT[i].h, zIndex: 10 + i,
          }}>
          <div className="pl-img">
            <Media a={media[i]} style={{ height: "100%" }} />
          </div>
          <span className="pl-call" style={{ left: `${p.cx}%`, top: `${p.cy}%` }}>
            <i className="pl-dot" />
            <i className="pl-line" />
            <b className="pl-txt">{p.note}</b>
          </span>
        </figure>
      ))}
    </div>
  );
}

/* ===========================================================================
   THE ROOM TONE  —  the fallback when there is no audio file
   Synthesised, not played back: four detuned partials, a slow filter sweep
   and a quiet noise bed. Nothing to upload, nothing to licence, and because
   it is generated it never audibly loops.
   =========================================================================== */
function useRoomTone() {
  const nodes = useRef(null);

  const build = useCallback(() => {
    if (nodes.current) return nodes.current;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    const ac = new AC();
    const out = ac.createGain();
    out.gain.value = 0;
    out.connect(ac.destination);

    const filt = ac.createBiquadFilter();
    filt.type = "lowpass"; filt.frequency.value = 460; filt.Q.value = 1.4;
    filt.connect(out);

    const oscs = [55, 82.5, 110, 164.8].map((f, i) => {
      const o = ac.createOscillator();
      o.type = i % 2 ? "sine" : "triangle";
      o.frequency.value = f * (1 + (i - 1.5) * .0016);
      const g = ac.createGain();
      g.gain.value = [.5, .26, .3, .12][i];
      o.connect(g); g.connect(filt); o.start();
      return o;
    });

    const lfo = ac.createOscillator(), lfoGain = ac.createGain();
    lfo.frequency.value = .045; lfoGain.gain.value = 210;
    lfo.connect(lfoGain); lfoGain.connect(filt.frequency); lfo.start();

    const len = ac.sampleRate * 3;
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const ch = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const wv = Math.random() * 2 - 1;
      last = (last + wv * .02) * .995;
      ch[i] = last * 2.4;
    }
    const noise = ac.createBufferSource();
    noise.buffer = buf; noise.loop = true;
    const nf = ac.createBiquadFilter();
    nf.type = "bandpass"; nf.frequency.value = 900; nf.Q.value = .6;
    const ng = ac.createGain(); ng.gain.value = .05;
    noise.connect(nf); nf.connect(ng); ng.connect(out); noise.start();

    nodes.current = { ac, out, oscs, lfo, noise };
    return nodes.current;
  }, []);

  const start = useCallback(async () => {
    const n = build(); if (!n) return false;
    try {
      if (n.ac.state === "suspended") await n.ac.resume();
      if (n.ac.state !== "running") return false;
      n.out.gain.cancelScheduledValues(n.ac.currentTime);
      n.out.gain.setValueAtTime(n.out.gain.value, n.ac.currentTime);
      n.out.gain.linearRampToValueAtTime(.16, n.ac.currentTime + 2.6);
      return true;
    } catch { return false; }
  }, [build]);

  const stop = useCallback(() => {
    const n = nodes.current; if (!n) return;
    try {
      n.out.gain.cancelScheduledValues(n.ac.currentTime);
      n.out.gain.setValueAtTime(n.out.gain.value, n.ac.currentTime);
      n.out.gain.linearRampToValueAtTime(0, n.ac.currentTime + .7);
    } catch {}
  }, []);

  useEffect(() => () => {
    const n = nodes.current; if (!n) return;
    try { n.oscs.forEach((o) => o.stop()); n.lfo.stop(); n.noise.stop(); n.ac.close(); } catch {}
    nodes.current = null;
  }, []);

  /* stable identity — this object is read through a ref by useAudio, and a
     new literal each render is what caused the pause bug in the first place */
  const api = useRef(null);
  if (!api.current) api.current = {};
  api.current.start = start;
  api.current.stop = stop;
  return api.current;
}

/* ===========================================================================
   THE RECORD
   ---------------------------------------------------------------------------
   TO USE YOUR OWN MUSIC:
     1. rename your file to exactly   theme.mp3
     2. upload it to   public/assets/audio/   via GitHub's "Upload files"
        (drag the file in — do NOT use "Create new file", that makes an empty
        placeholder, which is why a 2-byte file plays nothing)
     3. that's it. The line below already points at it.

   To use a different name or format, change AUDIO_SRC. Any format a browser
   plays works: .mp3, .m4a, .ogg, .wav. One extension only — "x.mp3.mpeg" is
   served with the wrong content type and will refuse to play.

   If the file is missing, empty or unplayable, this falls back to the
   synthesised room tone automatically, so the page is never silent.
   Keep it under ~8 MB; GitHub's web uploader also caps at 25 MB.
   =========================================================================== */
const AUDIO_SRC = "audio/theme.mp3";     //  <-- your file, inside public/assets/

function useAudio(enabled) {
  const elRef = useRef(null);
  const tone = useRoomTone();            // stable ref, started only on demand
  const [on, setOn] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [fileDead, setFileDead] = useState(false);

  /* BUG THAT WAS HERE: useRoomTone returns a fresh object every render, so a
     useCallback depending on it was new every render, so the autostart effect
     re-ran every render and restarted the audio the moment you paused it.
     Everything the effect needs now lives behind a ref, so its identity is
     stable and it runs exactly once. */
  const api = useRef({});
  api.current.tone = tone;
  api.current.fileDead = fileDead;

  const usingFile = !!AUDIO_SRC && !fileDead;

  const start = useCallback(async () => {
    if (AUDIO_SRC && !api.current.fileDead) {
      const a = elRef.current;
      if (a) {
        try {
          a.volume = 0;
          await a.play();
          gsap.to(a, { volume: .55, duration: 2.4, ease: "power1.out" });
          setOn(true); setBlocked(false);
          return true;
        } catch (err) {
          /* a rejected play() is either the autoplay policy (retryable) or a
             broken file (not). Distinguish, so a bad upload doesn't leave the
             site silent forever. */
          if (a.error || a.networkState === 3) { setFileDead(true); api.current.fileDead = true; }
          else return false;
        }
      }
    }
    const ok = await api.current.tone.start();
    setOn(ok);
    if (ok) setBlocked(false);
    return ok;
  }, []);

  const stop = useCallback(() => {
    const a = elRef.current;
    if (a && !a.paused) {
      gsap.to(a, { volume: 0, duration: .6, onComplete: () => a.pause() });
    }
    api.current.tone.stop();
    setOn(false);
  }, []);

  /* runs once: try immediately, else wait for the first gesture anywhere */
  useEffect(() => {
    if (!enabled || reduced()) return;
    let dead = false;
    const kick = async () => {
      if (dead) return;
      if (await start()) {
        window.removeEventListener("pointerdown", kick);
        window.removeEventListener("keydown", kick);
        window.removeEventListener("touchstart", kick);
      }
    };
    (async () => {
      if (await start()) return;
      if (dead) return;
      setBlocked(true);
      window.addEventListener("pointerdown", kick);
      window.addEventListener("keydown", kick);
      window.addEventListener("touchstart", kick);
    })();
    return () => {
      dead = true;
      window.removeEventListener("pointerdown", kick);
      window.removeEventListener("keydown", kick);
      window.removeEventListener("touchstart", kick);
    };
  }, [enabled, start]);

  /* a missing or empty file falls back to the synthesised tone rather than
     leaving the page silent */
  const audioEl = AUDIO_SRC ? (
    <audio ref={elRef} src={url(AUDIO_SRC)} loop preload="auto" playsInline
      onError={() => setFileDead(true)} />
  ) : null;

  return { on, blocked, start, stop, audioEl, usingFile };
}

/* The player: a record on a deck. Collapsed it is the disc edge peeking out of
   the corner; open it is the full platter with the arm down. It arrives open
   so it is seen once — after the first click it behaves like a normal control. */
function RecordPlayer({ on, blocked, onToggle }) {
  const [open, setOpen] = useState(true);
  const [touched, setTouched] = useState(false);
  const disc = useRef(null), arm = useRef(null);

  /* the platter spins only while there is sound on it */
  useEffect(() => {
    const d = disc.current; if (!d || reduced()) return;
    const spin = gsap.to(d, { rotate: 360, duration: 3.6, ease: "none", repeat: -1 });
    if (!on) spin.pause();
    return () => spin.kill();
  }, [on]);

  /* the arm drops onto the record when it plays, lifts when it stops */
  useEffect(() => {
    const a = arm.current; if (!a || reduced()) return;
    gsap.to(a, { rotate: on ? 22 : -6, duration: .8, ease: "power3.inOut", transformOrigin: "84% 16%" });
  }, [on]);

  const handle = () => {
    if (!touched) setTouched(true);   // first press unlocks collapsing
    onToggle();
  };

  return (
    <div className={`vinyl ${open ? "open" : "shut"} ${on ? "on" : ""} ${blocked ? "asking" : ""}`}>
      <button className="vn-deck" onClick={handle} aria-pressed={on}
        aria-label={on ? "Stop the music" : "Play the music"}>
        <span className="vn-platter">
          <span className="vn-disc" ref={disc}>
            <i className="vn-groove g1" /><i className="vn-groove g2" /><i className="vn-groove g3" />
            <i className="vn-label"><b>R</b></i>
            <i className="vn-shine" />
          </span>
          <span className="vn-arm" ref={arm}><i /><b /></span>
        </span>
        <span className="vn-txt">
          {blocked ? "click to play" : on ? "now playing" : "paused"}
        </span>
      </button>

      {/* the collapse handle only appears once the player has been used once */}
      {touched ? (
        <button className="vn-tab" onClick={() => setOpen((o) => !o)}
          aria-expanded={open} aria-label={open ? "Collapse the player" : "Open the player"}>
          {open ? "\u2039" : "\u203A"}
        </button>
      ) : null}
    </div>
  );
}


/* ===========================================================================
   THE LIGHTER  —  wireframe
   Drawn only in line, the way the deck is: no fills, no fake steel. Every
   edge is a stroke, and the whole object is built on a real isometric box so
   the lid opens on a believable hinge and you can see through the shell to
   the far edges — a blueprint of a lighter rather than a picture of one.

   The glow is the only warm thing: an SVG blur beneath the flame that lifts
   as it catches, plus a light that spills onto the inside faces. It loops —
   drop, flip, spark, burn, turn, snuff, fall.
   =========================================================================== */
function Lighter() {
  const root = useRef(null);

  useEffect(() => {
    const el = root.current; if (!el || reduced()) return;
    let tl = null, live = false;

    const ctx = gsap.context(() => {
      const lid = el.querySelector(".lw-lid");
      const flame = el.querySelector(".lw-flame");
      const halo = el.querySelector(".lw-halo");
      const sparks = el.querySelectorAll(".lw-spark");
      const shell = el.querySelectorAll(".lw-shell path, .lw-shell line");
      const inner = el.querySelector(".lw-inner");
      const scan = el.querySelector(".lw-scan");

      tl = gsap.timeline({ repeat: -1, repeatDelay: .45 });
      tl.set(el, { y: -150, rotate: -20, opacity: 0 })
        .set(lid, { rotate: 0, transformOrigin: "22% 96%" })
        .set([flame, halo, inner], { opacity: 0 })
        .set(flame, { scaleY: .15, transformOrigin: "50% 100%" })
        .set(sparks, { opacity: 0, scale: 0 })
        .set(shell, { drawSVG: undefined })

        /* drops in and settles */
        .to(el, { y: 0, rotate: 0, opacity: 1, duration: .8, ease: "bounce.out" })
        .to(el, { y: -4, duration: .14 }).to(el, { y: 0, duration: .18 })

        /* the lid swings on its hinge */
        .to(lid, { rotate: -122, duration: .4, ease: "back.out(2.4)" }, "+=.08")

        /* flint */
        .to(sparks, { opacity: 1, scale: 1, duration: .07, stagger: .035 }, "+=.05")
        .to(sparks, { opacity: 0, y: -9, scale: .4, duration: .2, stagger: .03 })

        /* catches — and the inside of the shell lights up */
        .to([flame, halo], { opacity: 1, duration: .26, ease: "power3.out" }, "-=.14")
        .to(flame, { scaleY: 1, duration: .3, ease: "back.out(2)" }, "<")
        .to(inner, { opacity: .9, duration: .35 }, "<")
        .to(flame, { scaleY: 1.16, scaleX: .92, duration: .3, ease: "sine.inOut", yoyo: true, repeat: 3 })
        .to(halo, { scale: 1.18, opacity: .75, duration: .6, ease: "sine.inOut", yoyo: true, repeat: 1,
          transformOrigin: "50% 62%" }, "<")

        /* one turn — a scan line sweeps the wireframe as it rotates */
        .to(el, { rotateY: 360, duration: 1.6, ease: "power2.inOut" }, "-=1")
        .fromTo(scan, { attr: { x1: 6, x2: 6 } }, { attr: { x1: 118, x2: 118 }, duration: 1.6, ease: "power2.inOut" }, "<")

        /* out */
        .to([flame, halo, inner], { opacity: 0, duration: .24, ease: "power2.in" })
        .to(lid, { rotate: 0, duration: .28, ease: "power3.in" }, "-=.08")
        .to(el, { y: 160, rotate: 14, opacity: 0, duration: .62, ease: "power2.in" }, "+=.18");

      tl.pause();
      ScrollTrigger.create({
        trigger: el, start: "top 92%", end: "bottom 8%",
        onEnter: () => { live = true; tl.play(); },
        onEnterBack: () => { live = true; tl.play(); },
        onLeave: () => { live = false; tl.pause(); },
        onLeaveBack: () => { live = false; tl.pause(); },
      });
    }, el);

    const onVis = () => { if (tl) { document.hidden ? tl.pause() : (live && tl.play()); } };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      if (tl) tl.kill();
      ctx.revert();
    };
  }, []);

  return (
    <div className="lighterwrap">
      <div className="lighter" ref={root}>
        <svg viewBox="0 0 124 200" aria-hidden="true">
          <defs>
            <filter id="lw-glow" x="-120%" y="-120%" width="340%" height="340%">
              <feGaussianBlur stdDeviation="7" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <radialGradient id="lw-halo-g" cx="50%" cy="62%" r="50%">
              <stop offset="0%" stopColor="#FFB93A" stopOpacity=".55" />
              <stop offset="55%" stopColor="#FF3B47" stopOpacity=".18" />
              <stop offset="100%" stopColor="#FF3B47" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="lw-fl-g" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="#FF3B47" /><stop offset="45%" stopColor="#FFB93A" />
              <stop offset="100%" stopColor="#FFF3CE" />
            </linearGradient>
          </defs>

          <ellipse className="lw-halo" cx="62" cy="66" rx="54" ry="50" fill="url(#lw-halo-g)" />

          <g className="lw-flame" filter="url(#lw-glow)">
            <path d="M62,22 C74,44 82,54 82,68 C82,82 73,90 62,90 C51,90 42,82 42,68 C42,54 50,44 62,22 Z"
              fill="none" stroke="url(#lw-fl-g)" strokeWidth="1.6" />
            <path d="M62,46 C68,58 70,63 70,69 C70,77 66,81 62,81 C58,81 54,77 54,69 C54,63 56,58 62,46 Z"
              fill="none" stroke="#FFF3CE" strokeWidth="1.1" opacity=".9" />
            <path d="M62,62 C64,70 65,73 65,76 C65,79 64,81 62,81 C60,81 59,79 59,76 C59,73 60,70 62,62 Z"
              fill="#FFF8E4" opacity=".55" />
          </g>

          {[[48, 74], [76, 71], [62, 64], [54, 62]].map(([cx, cy], i) => (
            <circle className="lw-spark" key={i} cx={cx} cy={cy} r="1.9"
              fill="none" stroke="#FFD98A" strokeWidth="1.2" />
          ))}

          {/* lid — an isometric box lid on a real hinge */}
          <g className="lw-lid">
            <path d="M24,44 L62,28 L100,44 L62,60 Z" />
            <path d="M24,44 L24,80 L62,96 L62,60 Z" />
            <path d="M100,44 L100,80 L62,96 L62,60 Z" opacity=".55" />
            <line x1="24" y1="44" x2="100" y2="44" opacity=".35" />
          </g>

          {/* body */}
          <g className="lw-shell">
            <path d="M24,86 L62,70 L100,86 L62,102 Z" />
            <path d="M24,86 L24,164 L62,180 L62,102 Z" />
            <path d="M100,86 L100,164 L62,180 L62,102 Z" opacity=".55" />
            <path d="M24,164 L62,180 L100,164" opacity=".8" />
            <line x1="38" y1="118" x2="62" y2="128" opacity=".45" />
            <line x1="38" y1="130" x2="62" y2="140" opacity=".45" />
            <line x1="86" y1="118" x2="62" y2="128" opacity=".28" />
            <line x1="86" y1="130" x2="62" y2="140" opacity=".28" />
            <line className="lw-scan" x1="6" y1="66" x2="6" y2="186" />
          </g>

          {/* the inside faces, lit only while it burns */}
          <g className="lw-inner">
            <path d="M32,90 L62,77 L92,90 L62,103 Z" />
            <path d="M40,100 L62,110 L84,100" />
          </g>

          <text x="62" y="150" textAnchor="middle" className="lw-mark">R</text>
        </svg>
      </div>
      <span className="lightercap">Every rumour <b>needs a spark</b></span>
    </div>
  );
}

/* ===========================================================================
   THE DECK
   A live hand: five cards riffle, square up, and one turns over. It is always
   a face card and it is always the same point — the market deals every man the
   same hand and he is expected to find the good card himself.

   Runs on a loop, pauses when scrolled away or when the tab is hidden, so it
   costs nothing while you are reading something else.
   =========================================================================== */
const DECK_FACES = [
  { r: "A", s: "\u2660", red: false },
  { r: "K", s: "\u2665", red: true },
  { r: "A", s: "\u2666", red: true },
  { r: "K", s: "\u2663", red: false },
];

function Deck() {
  const root = useRef(null);
  const [face, setFace] = useState(0);

  useEffect(() => {
    const el = root.current; if (!el || reduced()) return;
    let live = false, tl = null;

    const ctx = gsap.context(() => {
      const cards = gsap.utils.toArray(".card", el);
      const top = cards[cards.length - 1];

      const build = () => {
        const t = gsap.timeline({
          repeat: -1, repeatDelay: 1.1,
          onRepeat: () => setFace((f) => (f + 1) % DECK_FACES.length),
        });

        /* squared up */
        t.set(cards, { x: 0, y: (i) => -i * 1.6, rotate: 0, rotateY: 0, zIndex: (i) => i });
        t.set(top.querySelectorAll(".pip, .cnr"), { opacity: 0 });
        t.set(top, { className: "card back" });

        /* the riffle — split, arc, interleave */
        t.to(cards, {
          x: (i) => (i % 2 ? 38 : -38), rotate: (i) => (i % 2 ? 7 : -7),
          duration: .34, ease: "power2.out", stagger: .035,
        })
          .to(cards, {
            x: (i) => (i % 2 ? 9 : -9), y: (i) => -i * 1.6 - (i % 2 ? 14 : 0),
            duration: .3, ease: "power2.inOut", stagger: .03,
          })
          .to(cards, {
            x: 0, y: (i) => -i * 1.6, rotate: 0,
            duration: .34, ease: "back.out(2)", stagger: .028,
          })
          /* a second, tighter shuffle so it reads as hands, not a loop */
          .to(cards, {
            x: (i) => (i % 2 ? -26 : 26), rotate: (i) => (i % 2 ? -5 : 5),
            duration: .26, ease: "power2.out", stagger: .022,
          })
          .to(cards, {
            x: 0, rotate: 0, duration: .3, ease: "back.out(1.8)", stagger: .022,
          })
          /* the turn */
          .to(top, { y: -30, scale: 1.06, duration: .34, ease: "power2.out" }, "+=.16")
          .to(top, {
            rotateY: 90, duration: .3, ease: "power2.in",
            onComplete: () => { top.className = "card"; },
          })
          .to(top, { rotateY: 0, duration: .34, ease: "power2.out" })
          .to(top.querySelectorAll(".pip, .cnr"), {
            opacity: 1, duration: .26, ease: "power2.out", stagger: .05,
          }, "-=.14")
          .to(top, { y: -34, duration: .5, ease: "sine.inOut", yoyo: true, repeat: 1 })
          .to(top.querySelectorAll(".pip, .cnr"), { opacity: 0, duration: .22 }, "+=.5")
          .to(top, { y: -(cards.length - 1) * 1.6, scale: 1, duration: .3, ease: "power2.inOut" }, "<");
        return t;
      };

      tl = build();
      tl.pause();

      /* only run while it is actually on screen */
      ScrollTrigger.create({
        trigger: el, start: "top 92%", end: "bottom 8%",
        onEnter: () => { live = true; tl.play(); },
        onEnterBack: () => { live = true; tl.play(); },
        onLeave: () => { live = false; tl.pause(); },
        onLeaveBack: () => { live = false; tl.pause(); },
      });

    }, el);

    /* NOTE: this listener is registered OUT here on purpose. Referencing `ctx`
       inside the gsap.context() callback reads the binding before the call has
       returned — a temporal dead zone error that takes the whole app down. */
    const onVis = () => {
      if (!tl) return;
      if (document.hidden) tl.pause();
      else if (live) tl.play();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      if (tl) tl.kill();
      ctx.revert();
    };
  }, []);

  const f = DECK_FACES[face];
  return (
    <div ref={root}>
      <figure className="deck">
        {[0, 1, 2, 3, 4].map((i) => (
          <div className={`card${i === 4 ? " back" : ""}`} key={i}>
            {i === 4 ? (
              <>
                <span className={`cnr ${f.red ? "red" : ""}`}>{f.r}{f.s}</span>
                <span className={`pip ${f.red ? "red" : ""}`}>{f.s}</span>
              </>
            ) : null}
          </div>
        ))}
      </figure>
      <span className="deckcap">Same hand, <b>every man</b></span>
    </div>
  );
}

/* ===========================================================================
   THE SMALL 3D  —  depth applied at component scale
   The spine gives the document a body. These give its parts weight.
   All of them are pointer-driven, all skip touch devices and reduced motion.
   =========================================================================== */

/* Cards that lift and tilt toward the cursor, with a specular sheen that
   tracks the light source. The sheen is what stops it looking like a
   cheap CSS rotate — real materials catch light where you point them. */
function useTilt(active = true) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !active || reduced() || window.matchMedia("(pointer:coarse)").matches) return;
    const cards = gsap.utils.toArray(":scope > *", el);
    const cleanups = [];
    cards.forEach((c) => {
      c.style.transformStyle = "preserve-3d";
      const sheen = document.createElement("i");
      sheen.className = "sheen";
      c.appendChild(sheen);
      const enter = () => gsap.to(c, { z: 26, duration: .45, ease: "power3.out" });
      const move = (e) => {
        const r = c.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - .5;
        const py = (e.clientY - r.top) / r.height - .5;
        gsap.to(c, {
          rotateY: px * 13, rotateX: -py * 13,
          duration: .5, ease: "power2.out", overwrite: "auto",
        });
        gsap.to(sheen, {
          opacity: .85, duration: .3,
          "--mx": `${(px + .5) * 100}%`, "--my": `${(py + .5) * 100}%`,
          overwrite: "auto",
        });
      };
      const leave = () => {
        gsap.to(c, { rotateY: 0, rotateX: 0, z: 0, duration: .8, ease: "elastic.out(1,.55)" });
        gsap.to(sheen, { opacity: 0, duration: .4 });
      };
      c.addEventListener("mouseenter", enter);
      c.addEventListener("mousemove", move);
      c.addEventListener("mouseleave", leave);
      cleanups.push(() => {
        c.removeEventListener("mouseenter", enter);
        c.removeEventListener("mousemove", move);
        c.removeEventListener("mouseleave", leave);
        sheen.remove();
      });
    });
    return () => cleanups.forEach((f) => f());
  }, [active]);
  return ref;
}

function TiltGrid({ className = "", children, ...rest }) {
  const ref = useTilt(true);
  return <div ref={ref} className={`tiltgrid ${className}`} {...rest}>{children}</div>;
}

/* ---------------------------------------------------------------------------
   GSAP MOTION LAYER
   Applied once, at the app root. Everything here is opt-in by class name so
   it layers on top of the existing components without rewriting them.

   Rules that keep it from feeling like a template:
   - nothing animates more than 34px (restraint reads as expensive)
   - stagger is always sub-90ms (any slower and the page feels like it lags)
   - every trigger is `once` except the parallax, so nothing re-fires on the
     way back up and makes the page feel twitchy
   --------------------------------------------------------------------------- */
function useGsapMotion(active) {
  useEffect(() => {
    if (!active || reduced()) return;
    const ctx = gsap.context(() => {

      /* the hero headline lands as the loader dissolves — one continuous move
         from the wordmark into the argument, no cut, no fixed timer */
      const heroLines = gsap.utils.toArray(".hero-line");
      if (heroLines.length) {
        gsap.from(heroLines, {
          yPercent: 112, duration: 1.35, ease: "expo.out", stagger: .085, delay: .15,
        });
        gsap.from(".hero .lb", { autoAlpha: 0, duration: 1.4, ease: "power2.out", delay: .5 });
      }

      /* headline mask-reveal — lines rise out of their own baseline */
      gsap.utils.toArray(".gs-rise").forEach((el) => {
        gsap.from(el, {
          yPercent: 108, duration: 1.15, ease: "expo.out",
          scrollTrigger: { trigger: el, start: "top 92%", once: true },
        });
      });

      /* body + card entrances */
      gsap.utils.toArray(".gs-up").forEach((el) => {
        gsap.from(el, {
          y: 34, autoAlpha: 0, duration: 1, ease: "expo.out",
          scrollTrigger: { trigger: el, start: "top 90%", once: true },
        });
      });

      /* stat cards and role tiles, dealt like a hand of cards */
      gsap.utils.toArray(".gs-stagger").forEach((wrap) => {
        gsap.from(wrap.children, {
          y: 28, autoAlpha: 0, duration: .85, ease: "expo.out", stagger: .07,
          scrollTrigger: { trigger: wrap, start: "top 88%", once: true },
        });
      });

      /* rules that draw themselves */
      gsap.utils.toArray(".gs-rule").forEach((el) => {
        gsap.from(el, {
          scaleX: 0, transformOrigin: "left", duration: 1.3, ease: "expo.inOut",
          scrollTrigger: { trigger: el, start: "top 92%", once: true },
        });
      });

      /* numerals count up — the only place the page raises its voice */
      gsap.utils.toArray(".gs-count").forEach((el) => {
        const raw = el.dataset.to;
        const num = parseFloat(raw);
        if (Number.isNaN(num)) return;
        const pre = el.dataset.pre || "", suf = el.dataset.suf || "";
        const dec = (raw.split(".")[1] || "").length;
        const o = { v: 0 };
        ScrollTrigger.create({
          trigger: el, start: "top 90%", once: true,
          onEnter: () => gsap.to(o, {
            v: num, duration: 1.9, ease: "expo.out",
            onUpdate: () => { el.textContent = pre + o.v.toFixed(dec) + suf; },
          }),
        });
      });

      /* slow parallax on night sections — depth without motion sickness */
      gsap.utils.toArray(".gs-drift").forEach((el) => {
        gsap.to(el, {
          yPercent: -12, ease: "none",
          scrollTrigger: { trigger: el, start: "top bottom", end: "bottom top", scrub: 1.1 },
        });
      });

      ScrollTrigger.refresh();
    });
    return () => ctx.revert();
  }, [active]);
}

/* ---------------------------------------------------------------------------
   THE THESIS — pinned scroll
   One man. He does not move. The wardrobe moves around him: smart casual
   dissolves, he is stripped to a base layer, and an entirely different life
   assembles itself on the same body. Then he dissolves and the claim lands
   alone.

   That is the entire argument for why this is an identity company and not a
   clothing company, and it is made without a word of copy.

   WAS: a drawn SVG silhouette with six accessories fading in on top of it.
   NOW: the real footage, scroll-scrubbed frame by frame. The accessory layer
   is gone entirely — the garments are in the film, so drawing vector wallets
   over a photograph of a man would have been fighting itself.
   --------------------------------------------------------------------------- */

const CREED_NEG = ["Not a store.", "Not a catalogue.", "Not accessories."];
const CREED_POS = ["Identity.", "Status.", "Belonging.", "Confidence."];

/* Captions ride the film. `at` is the position in the scrub, 0→1, where each
   line takes over — read straight off the footage, so if you re-cut the video
   these are the only numbers to move. */
const MAN_STEPS = [
  { at: .00, cap: "One man. Dressed for the room he was in this morning." },
  { at: .17, cap: "The overshirt goes. The room has changed." },
  { at: .34, cap: "Everything the market sold him, leaving at once." },
  { at: .50, cap: "This is what is actually underneath. It never changes." },
  { at: .62, cap: "A different life, assembling on the same body." },
  { at: .80, cap: "Same man. Same week. Nothing in common but him." },
];

/** THE FILM
    Accepts either descriptor kind from the manifest and picks the matching
    player, so swapping between a scrubbed video and a numbered frame sequence
    is a one-line change in §1 and nothing else moves. */
function ManFilm({ a, progressRef }) {
  if (a?.kind === "sequence") return <ManFrames a={a} progressRef={progressRef} />;
  return <ManVideo a={a} progressRef={progressRef} />;
}

/** Scrubbed video — the shipped path.
    currentTime is driven from scroll progress rather than from playback. Three
    things make this behave:

    1. The seek is skipped while a previous one is still in flight. Without
       that guard, a fast scroll queues dozens of seeks and the decoder falls
       behind the cursor by a visible margin.
    2. Sub-frame moves are ignored, so a stationary page isn't issuing a seek
       sixty times a second for a picture that would not change.
    3. iOS will not decode and present a first frame until the element has been
       told to play at least once, so it gets a muted play/pause nudge on
       mount. Without it the section is a black rectangle on iPhone until the
       visitor scrolls past the first keyframe. */
function ManVideo({ a, progressRef }) {
  const vid = useRef(null);
  const last = useRef(-1);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const v = vid.current; if (!v) return;
    const onReady = () => setReady(true);
    v.addEventListener("loadeddata", onReady);
    if (v.readyState >= 2) setReady(true);
    /* the iOS first-frame nudge */
    const p = v.play?.();
    if (p && p.then) p.then(() => v.pause()).catch(() => { });
    else { try { v.pause(); } catch { } }
    return () => v.removeEventListener("loadeddata", onReady);
  }, [a]);

  useFrame(() => {
    const v = vid.current;
    if (!v || !v.duration || !Number.isFinite(v.duration)) return;
    /* stop just short of the end: seeking to exactly duration parks some
       decoders on a blank frame rather than on the last picture */
    const t = clamp(progressRef.current || 0) * (v.duration - 0.04);
    if (Math.abs(t - last.current) < 0.01) return;
    if (v.seeking) return;
    last.current = t;
    try { v.currentTime = t; } catch { /* seek raced a reload; next frame retries */ }
  });

  return (
    <div className={`manfilm ${ready ? "ready" : ""}`}>
      <video ref={vid} src={url(a.path)} poster={a.poster ? url(a.poster) : undefined}
        muted playsInline preload="auto" aria-label={a.alt} />
    </div>
  );
}

/** Numbered frame sequence — the alternative path, kept working.
    Frames are preloaded first-and-last-first, so the opening paint never waits
    on the final frame, and the canvas is only redrawn when the frame index
    actually changes. */
function ManFrames({ a, progressRef }) {
  const cv = useRef(null);
  const frames = useRef([]);
  const drawn = useRef(-1);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    frames.current = [];
    drawn.current = -1;

    const load = (i) => new Promise((res) => {
      const im = new Image();
      im.decoding = "async";
      im.onload = im.onerror = () => res(im);
      im.src = url(`${a.prefix}${String(i + 1).padStart(a.pad, "0")}.${a.ext}`);
    });

    (async () => {
      /* first and last before anything else: the section can paint a correct
         opening and a correct ending before the middle has arrived */
      frames.current[0] = await load(0);
      if (!alive) return;
      setReady(true);
      frames.current[a.count - 1] = await load(a.count - 1);
      /* then fill in, coarse pass before fine, so an early scrub already has
         something close to the right frame instead of a blank canvas */
      for (const step of [8, 4, 2, 1]) {
        for (let i = 0; i < a.count; i += step) {
          if (!alive) return;
          if (frames.current[i]) continue;
          frames.current[i] = await load(i);
        }
      }
    })();

    return () => { alive = false; };
  }, [a]);

  useFrame(() => {
    const c = cv.current; if (!c) return;

    /* Size first, and invalidate the cache when it changes. Getting this
       backwards is a real bug: on a window resize the canvas backing store is
       reallocated (and therefore cleared), but if the frame index happens to
       be unchanged the early-out below would skip the redraw and leave a blank
       plate until the next scroll tick. */
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(c.clientWidth * dpr), h = Math.round(c.clientHeight * dpr);
    if (!w || !h) return;
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; drawn.current = -1; }

    const p = clamp(progressRef.current || 0);
    const want = Math.round(p * (a.count - 1));

    /* if the exact frame hasn't downloaded yet, hold the nearest one that has,
       rather than blanking — the sequence degrades to a lower frame rate
       instead of to nothing */
    let i = want;
    if (!frames.current[i]?.width) {
      for (let d = 1; d < a.count; d++) {
        if (frames.current[want - d]?.width) { i = want - d; break; }
        if (frames.current[want + d]?.width) { i = want + d; break; }
      }
    }
    if (i === drawn.current) return;
    const im = frames.current[i];
    if (!im || !im.width) return;

    const ctx = c.getContext("2d");
    const s = Math.max(c.width / im.width, c.height / im.height);
    ctx.drawImage(im, (c.width - im.width * s) / 2, (c.height - im.height * s) / 2,
      im.width * s, im.height * s);
    drawn.current = i;
  });

  return (
    <div className={`manfilm ${ready ? "ready" : ""}`}>
      <canvas ref={cv} role="img" aria-label={a.alt} />
    </div>
  );
}

function Thesis() {
  const root = useRef(null);
  const pin = useRef(null);
  const film = useRef(0);                 // 0→1 scrub position, written by GSAP
  const [cap, setCap] = useState(MAN_STEPS[0].cap);

  useEffect(() => {
    const el = root.current; if (!el) return;

    /* Reduced motion: CSS already un-stacks this section into normal flow and
       reveals every layer. The film holds on its last frame — the end of the
       argument — instead of scrubbing. */
    if (reduced()) { film.current = 1; return; }

    /* If anything in the timeline throws, the section must not be left blank —
       every layer starts hidden in CSS, so a failure has to reveal them. */
    const bail = () => {
      film.current = 1;
      gsap.set(el.querySelectorAll(".tquote"), { autoAlpha: 1, filter: "none" });
      gsap.set(el.querySelectorAll(".tline"), { autoAlpha: 0 });
      gsap.set(el.querySelectorAll(".tline.pos:last-child"), { autoAlpha: 1 });
    };

    let ctx;
    try {
    ctx = gsap.context(() => {
      const negs = gsap.utils.toArray(".tline.neg", el);
      const poss = gsap.utils.toArray(".tline.pos", el);

      /* PHASE GATES — every phase starts hidden and is explicitly cleared by
         the phase before it. This is what stops the creed sitting on top of
         the man: nothing is visible unless the timeline put it there. */
      gsap.set(".tquote", { autoAlpha: 0, filter: "blur(10px)" });
      gsap.set([...negs, ...poss], { autoAlpha: 0 });
      gsap.set(".strike i", { scaleX: 0 });
      gsap.set(".warmlight", { opacity: 0 });

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: el, start: "top top", end: "+=3600",
          /* scrub:1 damps the scroll wheel's step quantisation — the "jumpy"
             feel is the wheel arriving in ~100px chunks, not the timeline. */
          scrub: 1,
          pin: pin.current,          // pin the inner box, not the tall section
          pinSpacing: true,
          anticipatePin: 1,
          invalidateOnRefresh: true,
        },
      });

      /* 1 — THE FILM. One tween drives the whole sequence: a proxy value from
         0 to 1 that ManFilm reads every frame. The wardrobe changing IS the
         phase, so it owns the first 7 units of the timeline. */
      const RUN = 7;
      const prox = { v: 0 };
      tl.fromTo(prox, { v: 0 }, {
        v: 1, duration: RUN, ease: "none",
        onUpdate: () => { film.current = prox.v; },
      }, 0);

      /* captions are cued off the same 0→1 scrub as the footage */
      MAN_STEPS.forEach((st) => {
        tl.add(() => setCap(st.cap), st.at * RUN);
      });

      /* the room warms across the whole change — the light behind the plate,
         not on it, so the footage itself is never tinted */
      tl.fromTo(".warmlight", { opacity: 0 }, { opacity: 1, duration: RUN, ease: "none" }, 0);

      /* 2 — he dissolves, and the claim lands alone */
      const T = RUN + .6;
      tl.to(".manwrap", { autoAlpha: .05, filter: "blur(8px)", scale: .96, duration: 1.1 }, T)
        .add(() => setCap(""), T)
        .to(".tquote", { autoAlpha: 1, filter: "blur(0px)", duration: 1.2 }, T + .5);

      /* 3 — the creed. The quote is fully out before line one arrives. */
      const T2 = T + 3.4;
      tl.to(".tquote", { autoAlpha: 0, filter: "blur(10px)", duration: .8 }, T2);

      let c = T2 + .95;
      negs.forEach((l) => {
        tl.fromTo(l, { autoAlpha: 0, y: 30 }, { autoAlpha: 1, y: 0, duration: .5 }, c)
          .to(l.querySelector(".strike i"), { scaleX: 1, duration: .42, ease: "power3.inOut" }, c + .5)
          .to(l, { autoAlpha: 0, y: -24, duration: .42 }, c + 1.12);
        c += 1.62;   /* > 1.54 so the out completes before the next in starts */
      });

      c += .2;
      poss.forEach((l, i) => {
        const last = i === poss.length - 1;
        tl.fromTo(l, { autoAlpha: 0, scale: .9, filter: "blur(12px)" },
          { autoAlpha: 1, scale: 1, filter: "blur(0px)", duration: .65 }, c);
        if (!last) tl.to(l, { autoAlpha: 0, scale: 1.06, filter: "blur(10px)", duration: .48 }, c + 1.0);
        c += last ? 0 : 1.56;   /* > 1.48 so no two creed lines are ever lit together */
      });
      tl.to({}, { duration: 1.5 }, c + .9);
    }, el);
    } catch (err) {
      console.error("[RUMOAR] thesis timeline failed, revealing static state", err);
      bail();
    }
    return () => ctx && ctx.revert();
  }, []);

  return (
    <section className="tstage" ref={root} id="thesis">
      <div className="tpin" ref={pin}>
        <div className="tgrain" aria-hidden="true" />
        <div className="manwrap">
          {/* the light pools sit BEHIND the plate, so the room warms without
              ever grading the footage itself */}
          <div className="manlight" aria-hidden="true">
            <span className="coollight" />
            <span className="warmlight" />
          </div>
          <ManFilm a={M.thesis.man} progressRef={film} />
          <p className="mancap">{cap}</p>
        </div>

        <div className="tquote">
          <p>&ldquo;We don&rsquo;t change men.<br /><span className="it ember">We reveal them.&rdquo;</span></p>
        </div>

        <div className="tseq" aria-hidden="true">
          {CREED_NEG.map((l) => (
            <div key={l} className="tline neg">
              <span className="strike">{l}<i /></span>
            </div>
          ))}
          {CREED_POS.map((l, i) => (
            <div key={l} className="tline pos">
              {i === 0 ? <span className="it ember">{l}</span> : l}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}


/* ---------------------------------------------------------------------------
   ONE DAY, DRAWN AS ONE LINE
   Six moments in a day where he is read before he speaks. Four of them are
   settled by an object he chose that morning in about nine seconds. The line
   is live — a playhead runs the day on a loop and lights each moment as it
   passes. Teal dots are the ones decided by something he wears.
   --------------------------------------------------------------------------- */
const DAY_MOMENTS = [
  { at: .06, h: .55, t: "06:10", l: "the gym, before anyone is awake", worn: false },
  { at: .24, h: .78, t: "09:40", l: "standup, camera on, wrist visible", worn: true },
  { at: .42, h: .42, t: "13:15", l: "lunch, wallet out in front of the team", worn: true },
  { at: .60, h: .92, t: "18:30", l: "client handshake, second impression", worn: true },
  { at: .78, h: 1.0, t: "20:45", l: "first date, four seconds of judgement", worn: true },
  { at: .93, h: .30, t: "23:50", l: "the feed, learning what he wants next", worn: false },
];

/* canvases can't read CSS variables, so sample them from the DOM each frame */
function useToken(name, fallback) {
  const [v, setV] = useState(fallback);
  useEffect(() => {
    const read = () => {
      const el = document.querySelector(".ru");
      if (!el) return;
      const got = getComputedStyle(el).getPropertyValue(name).trim();
      if (got) setV(got);
    };
    read();
    const mo = new MutationObserver(read);
    const el = document.querySelector(".ru");
    if (el) mo.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, [name]);
  return v;
}

function PulseDay() {
  const cv = useRef(null);
  const [now, setNow] = useState(DAY_MOMENTS[0]);
  const inkTok = useToken("--ink", "#F5F3EF");
  const markTok = useToken("--mark", "#FF3B47");
  const coldTok = useToken("--cold", "#35E0D0");

  useEffect(() => {
    const c = cv.current; if (!c) return;
    const ctx = c.getContext("2d"); if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = 0, H = 0, vis = false, active = -1, raf, run = true;
    const size = () => {
      const r = c.getBoundingClientRect();
      W = r.width; H = r.height;
      c.width = Math.max(1, W * dpr); c.height = Math.max(1, H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    size(); window.addEventListener("resize", size);
    const io = new IntersectionObserver(([e]) => { vis = e.isIntersecting; }, { rootMargin: "80px" });
    io.observe(c);

    const yAt = (x, t) => {
      let y = H * .58 + Math.sin(x * .045 + t * .0011) * 3;
      for (const m of DAY_MOMENTS) {
        const d = (x - m.at * W) / (W * .018);
        if (Math.abs(d) < 6) y -= Math.exp(-d * d * .55) * Math.cos(d * 1.15) * m.h * (H * .40);
      }
      return y;
    };

    const frame = (t) => {
      if (!run) return;
      if (vis && W) {
        ctx.clearRect(0, 0, W, H);
        const head = ((t * .00013) % 1) * W;
        ctx.globalAlpha = .09; ctx.strokeStyle = inkTok; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, H * .58); ctx.lineTo(W, H * .58); ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.lineWidth = 1.6; ctx.lineJoin = "round";
        for (let x = 0; x < W; x += 2) {
          const age = (head - x + W) % W;
          const a = Math.max(0, 1 - age / (W * .92));
          if (a <= .02) continue;
          ctx.globalAlpha = a * .85; ctx.strokeStyle = markTok;
          ctx.beginPath(); ctx.moveTo(x, yAt(x, t)); ctx.lineTo(x + 2, yAt(x + 2, t)); ctx.stroke();
        }
        DAY_MOMENTS.forEach((m, i) => {
          const cx = m.at * W;
          const dist = ((head - cx) + W) % W;
          if (dist < W * .02 && active !== i) { active = i; setNow(m); }
          const lit = Math.max(0, 1 - dist / (W * .22));
          ctx.globalAlpha = m.worn ? .3 + lit * .7 : .14 + lit * .3;
          ctx.fillStyle = m.worn ? coldTok : inkTok;
          ctx.beginPath(); ctx.arc(cx, yAt(cx, t), m.worn ? 2.4 + lit * 2.6 : 1.8 + lit * 1.4, 0, 6.283); ctx.fill();
          if (m.worn && lit > .05) {
            ctx.globalAlpha = lit * .35; ctx.strokeStyle = coldTok; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(cx, yAt(cx, t), 6 + (1 - lit) * 16, 0, 6.283); ctx.stroke();
          }
        });
        ctx.globalAlpha = .9; ctx.fillStyle = inkTok;
        ctx.beginPath(); ctx.arc(head, yAt(head, t), 2.6, 0, 6.283); ctx.fill();
        ctx.globalAlpha = 1;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { run = false; cancelAnimationFrame(raf); io.disconnect(); window.removeEventListener("resize", size); };
  }, [inkTok, markTok, coldTok]);

  return (
    <div className="pulse">
      <div className="phead">
        <span className="lb">One day, drawn as one line</span>
        <span className="pnow"><b>{now.t}</b><i>{now.l}</i></span>
      </div>
      <canvas ref={cv} role="img"
        aria-label="One day of the modern Indian man drawn as a single pulse, spiking at the six moments he is read by other people" />
      <div className="pfoot">
        <span><b>Four</b> of the six spikes are decided by something he wears</span>
        <span>the line is live</span>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   INCOME & CONSUMPTION                                        [HYPOTHESIS 1]
   Two rising lines and one flat one. Income and market climb together across a
   century; the number of wardrobe systems available to a man never moves off 1.
   The flat line is the argument — everything else is context for it.
   --------------------------------------------------------------------------- */
function IncomeCurve() {
  const { era, setEra } = useEra();
  const ref = useRef(null);
  const [live, setLive] = useState(false);
  /* BUG THAT WAS HERE: strokeDasharray flipped from "2000" to "none" in the
     same frame the offset changed, so the whole path was revealed instantly
     and nothing ever animated. The dash array must STAY at the path's true
     length while only the offset animates. Measured per path, so it is
     correct at any viewport width. */
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const paths = el.querySelectorAll(".ic-line");
    const arm = () => {
      paths.forEach((pth) => {
        const len = pth.getTotalLength() || 1200;
        gsap.set(pth, { attr: { "stroke-dasharray": len, "stroke-dashoffset": len } });
      });
    };
    const play = () => {
      paths.forEach((pth, i) => {
        const len = pth.getTotalLength() || 1200;
        gsap.fromTo(pth, { attr: { "stroke-dashoffset": len } },
          { attr: { "stroke-dashoffset": 0 }, duration: 1.7, ease: "power2.inOut",
            delay: i * .22, overwrite: "auto" });
      });
    };
    if (reduced()) { setLive(true); return; }
    arm();
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setLive(true); play(); }
      else if (e.boundingClientRect.top > 0) { setLive(false); arm(); }
    }, { threshold: .18 });
    io.observe(el); return () => io.disconnect();
  }, []);

  const W = 1000, H = 460, L = 92, R = 96, T = 40, B = 66;
  const px = (n) => L + (n / (incomeSeries.length - 1)) * (W - L - R);
  const py = (v) => H - B - (v / 100) * (H - T - B);
  const path = (key) => incomeSeries.map((d, n) => `${n ? "L" : "M"}${px(n)},${py(d[key])}`).join(" ");
  const d = incomeSeries[era];

  return (
    <div ref={ref} style={{ position: "relative", width: "100%" }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="ic" role="img"
        aria-label="Income, market size and available wardrobe systems, 1900 to 2026">
        {[25, 50, 75, 100].map((g) => (
          <line key={g} x1={L} y1={py(g)} x2={W - R} y2={py(g)} stroke="var(--grid)" strokeWidth="1" />
        ))}
        <line x1={L} y1={py(0)} x2={W - R} y2={py(0)} stroke="var(--axis)" strokeWidth="1" />

        {/* the two that rise */}
        {["income", "market"].map((k, ki) => (
          <path key={k} className="ic-line" d={path(k)} fill="none" stroke="var(--ink)"
            strokeWidth={ki ? 1 : 1.6} opacity={ki ? .32 : 1} />
        ))}

        {/* the one that doesn't */}
        <path className="ic-line" d={path("systems")} fill="none" stroke="var(--mark)" strokeWidth="2" />
        <text x={W - R} y={py(1) - 14} className="ptl" textAnchor="end" fill="var(--mark)"
          style={{ opacity: live ? 1 : 0, transition: "opacity 700ms 1600ms" }}>
          WARDROBE SYSTEMS AVAILABLE — 1
        </text>

        <text x={L} y={py(100) - 12} className="ptl">DISPOSABLE INCOME</text>
        <text x={L} y={py(72) - 12} className="ptl" style={{ opacity: .55 }}>MENSWEAR MARKET</text>

        {incomeSeries.map((s, n) => (
          <g key={s.year} style={{ cursor: "pointer" }} onClick={() => setEra(n)}>
            <circle className="icdot" cx={px(n)} cy={py(s.income)} r={n === era ? 6 : 3.5}
              fill={n === era ? "var(--ink)" : "var(--ink-3)"} />
            <circle cx={px(n)} cy={py(s.income)} r="24" fill="transparent" />
            <text x={px(n)} y={H - 26} className="ax" textAnchor="middle"
              style={{ fill: n === era ? "var(--ink)" : "var(--ink-3)" }}>{s.year}</text>
          </g>
        ))}
      </svg>

      <p className="body" style={{ marginTop: 18, maxWidth: "52ch" }}>{d.note}</p>

      <TiltGrid className="facts gs-stagger">
        {incomeFacts.map((f) => (
          <div className="fact" key={f.k}>
            <p className="v num">{f.v}</p>
            <p className="k">{f.k}</p>
            <p className="s">{f.s}</p>
          </div>
        ))}
      </TiltGrid>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   THE ROLES                                                   [HYPOTHESIS 2]
   Roles appear as the eras advance. By 2026 there are six, and the bar under
   each one shows how well the market dresses it. Three are well served. The
   three that are not are the private, the intimate and the unwatched.
   --------------------------------------------------------------------------- */
function RoleGrid() {
  const { era } = useEra();
  const on = personaData.filter((r) => r.from <= era);
  const avg = on.length ? Math.round(on.reduce((a, r) => a + r.served, 0) / on.length * 10) / 10 : 0;

  return (
    <>
      <div className="g" style={{ padding: 0, marginBottom: "clamp(22px,4vh,40px)" }}>
        <div style={{ gridColumn: "1 / 8" }}>
          <p className="mid">
            {on.length === 1 ? "One role." : `${["", "One", "Two", "Three", "Four", "Five", "Six"][on.length]} roles.`}{" "}
            <span className="dim">One wardrobe.</span>
          </p>
        </div>
        <div style={{ gridColumn: "9 / 13", alignSelf: "end" }}>
          <LB>Average how well served</LB>
          <p className="num" style={{ fontSize: "clamp(1.6rem,3vw,2.6rem)", fontWeight: 500, letterSpacing: "-.04em", marginTop: 8 }}>
            {avg.toFixed(1)}<span className="dim" style={{ fontSize: ".5em" }}> / 10</span>
          </p>
        </div>
      </div>

      <TiltGrid className="roles gs-stagger">
        {personaData.map((r) => {
          const live = r.from <= era;
          return (
            <div className={`role ${live ? "" : "off"}`} key={r.id}>
              <p className="rn">{r.name}</p>
              <p className="rm">{r.room}</p>
              <p className="rt">{r.tension}</p>
              <div className={`meter ${r.served <= 3 ? "low" : ""}`}>
                <i style={{ width: live ? `${r.served * 10}%` : "0%" }} />
              </div>
              <div className="rs">
                <span>Served</span><span className="num">{r.served} / 10</span>
              </div>
            </div>
          );
        })}
      </TiltGrid>
    </>
  );
}

/* ---------------------------------------------------------------------------
   THE PRICE GAP                                               [HYPOTHESIS 4]
   Price on x, garment-versus-system on y. Every house clusters along the floor
   regardless of what it charges. The gap is not a hole in the price ladder —
   brands exist in every band — it is that nobody at any price sells a method.
   --------------------------------------------------------------------------- */
/* Label placement, one entry per point.
   BUG WAS HERE: every label was centred 18px above its own dot. U.S. Polo
   (₹-index 14) and Snitch (18) sit 32 user-units apart on a 1000-unit field —
   two ~110-unit-wide labels stacked on the same baseline, so they printed
   straight through each other. Anything on the garment floor now gets pushed
   sideways instead of stacked, and RUMOAR clears its own halo ring. */
const PRICE_LABEL = {
  "us-polo":        { anchor: "end",    dx: -15, dy: 5 },
  "snitch":         { anchor: "start",  dx: 15,  dy: 5 },
  "allen-solly":    { anchor: "middle", dx: 0,   dy: -20 },
  "van-heusen":     { anchor: "middle", dx: 0,   dy: -20 },
  "louis-philippe": { anchor: "middle", dx: 0,   dy: 26 },
  "rare-rabbit":    { anchor: "middle", dx: 0,   dy: -20 },
  "rumoar":         { anchor: "middle", dx: 0,   dy: -32 },
};

function PriceGap() {
  const ref = useRef(null);
  const [live, setLive] = useState(false);
  const [hov, setHov] = useState(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && (setLive(true), io.disconnect()), { threshold: .2 });
    io.observe(el); return () => io.disconnect();
  }, []);

  const W = 1000, H = 560, L = 92, R = 96, T = 44, B = 92;
  const gx = (v) => L + (v / 100) * (W - L - R);
  const gy = (v) => H - B - (v / 10) * (H - T - B);
  const h = pricePoints.find((p) => p.id === hov);

  return (
    <div ref={ref} style={{ position: "relative", width: "100%" }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="pg" role="img"
        aria-label="Indian menswear brands by price band and whether they sell a garment or a system">
        {priceBands.map((b, i) => (
          <g key={b.id}>
            <rect className={`band ${b.cagr.includes("%") ? "hot" : ""}`}
              x={gx(b.lo)} y={T} width={gx(b.hi) - gx(b.lo)} height={H - B - T} />
            {i ? <line className="bandsep" x1={gx(b.lo)} y1={T} x2={gx(b.lo)} y2={H - B} /> : null}
            <text x={(gx(b.lo) + gx(b.hi)) / 2} y={H - B + 28} className="bandl" textAnchor="middle">{b.name}</text>
            <text x={(gx(b.lo) + gx(b.hi)) / 2} y={H - B + 48} className="ax" textAnchor="middle">{b.range}</text>
            <text x={(gx(b.lo) + gx(b.hi)) / 2} y={H - B + 68} className="ax" textAnchor="middle"
              style={{ fill: b.cagr.includes("%") ? "var(--mark)" : "var(--ink-3)", fontWeight: 700 }}>{b.cagr}</text>
          </g>
        ))}

        {/* the empty quadrant: everything above the garment floor, at any price */}
        <rect className="voidbox" x={gx(28)} y={T} width={gx(100) - gx(28)} height={gy(4.6) - T}
          style={{ opacity: live ? 1 : 0, transition: "opacity 1200ms 900ms" }} />
        <text x={gx(64)} y={gy(7.6)} className="ax voidlabel" textAnchor="middle"
          style={{ opacity: live ? 1 : 0, transition: "opacity 700ms 1500ms" }}>
          NOBODY SELLS A SYSTEM AT ANY PRICE
        </text>

        <line x1={L} y1={gy(0)} x2={W - R} y2={gy(0)} stroke="var(--axis)" strokeWidth="1" />
        <line x1={L} y1={T} x2={L} y2={gy(0)} stroke="var(--axis)" strokeWidth="1" />
        <text x={34} y={gy(0)} className="ax" transform={`rotate(-90 34 ${gy(0)})`}>A GARMENT</text>
        <text x={34} y={gy(10)} className="ax" textAnchor="end" transform={`rotate(-90 34 ${gy(10)})`}>A SYSTEM</text>

        {pricePoints.map((p, n) => {
          const L2 = PRICE_LABEL[p.id] || { anchor: "middle", dx: 0, dy: -20 };
          const cx = gx(p.price), cy = gy(p.system);
          return (
            <g key={p.id} style={{
              opacity: live ? 1 : 0,
              transition: `opacity 800ms cubic-bezier(.22,.68,.16,1) ${n * 90}ms`,
            }}>
              {p.isBrand ? (
                <circle cx={cx} cy={cy} r="18" fill="none"
                  stroke="var(--mark)" strokeWidth="1" opacity=".4" />
              ) : null}
              <circle className="pt" cx={cx} cy={cy} r={p.isBrand ? 8 : 5.5}
                fill={p.isBrand ? "var(--mark)" : "var(--ink)"} />
              {/* the hit target used to be r=26 — wider than the gap between
                  U.S. Polo and Snitch, so the two stole each other's hover */}
              <circle cx={cx} cy={cy} r="15" fill="transparent"
                style={{ cursor: "pointer" }}
                onMouseEnter={() => setHov(p.id)} onMouseLeave={() => setHov(null)} />
              <text className="ptl" x={cx + L2.dx} y={cy + L2.dy} textAnchor={L2.anchor}
                style={{ opacity: hov === p.id ? 1 : .78, fontWeight: p.isBrand || hov === p.id ? 700 : 600 }}>
                {p.name}
              </text>
            </g>
          );
        })}
      </svg>

      <p className="body" style={{ marginTop: 20, maxWidth: "62ch" }}>
        {h
          ? `${h.name} — ${h.system >= 8 ? "sells a method that outlives any single purchase." : "sells excellent objects. Assembly is left to you."}`
          : "At ₹4,000–8,000 a man can buy an excellent shirt from four houses. He cannot buy a point of view from any of them. He assembles coherence himself, unpaid, and mostly fails."}
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   THE LAMP — "now the lights come on"
   Every deck has a slide where the founder stops selling. This is that slide.
   A lamp descends from the top of the section, the pull-cord tugs, and the
   room flips from night to daylight for the duration of the risk register.
   The device is the argument: scrutiny deserves light, and a founder who
   dims the room for the hard part is hiding something.
   --------------------------------------------------------------------------- */
const RISKS = [
  { n: "Risk 01", q: "A marketplace private-label clones the winners in six weeks",
    atk: "Myntra and Ajio have infinite traffic, deeper discounts and private labels that copy bestsellers overnight. On product alone this loses every time. It is the single most likely cause of death.",
    ans: "Never fight on product alone. The wardrobe system, the fit record, the drop calendar and the chapter membership are not clonable by a catalogue business, because cloning them would require a marketplace to become a small brand again." },
  { n: "Risk 02", q: "CAC eats the company before the system compounds",
    atk: "India's D2C graveyard is full of brands whose CPMs doubled while AOVs didn't. A ₹4,500 order cannot carry a ₹900 CAC, and an identity system takes longer to explain than a discount does.",
    ans: "Structural, not hopeful. Paid capped at a fixed share of revenue with a hard CAC ceiling; referral built into the parcel; wedding-season gifting as a zero-CAC demand spike. If organic pull hasn't appeared by month six the thesis is wrong, and the honest move is to pivot cheaply rather than scale expensively." },
  { n: "Risk 03", q: "Inventory is where the cash goes to die",
    atk: "A system wardrobe implies range, and range implies SKUs. One bad buy of a thousand units freezes six months of runway in cardboard.",
    ans: "Low domestic MOQs make small-batch drops viable, so scarcity is working-capital discipline before it is brand theatre. One category earns its way in at a time; sell-through above 80% unlocks the next, and below it the model absorbs the miss at 200 units instead of 2,000." },
  { n: "Risk 04", q: "\"System\" is a word men nod at and don't pay for",
    atk: "Coherence is a real pain, but pain is not the same as willingness to pay. He may agree with every word of this document and still buy the ₹1,299 shirt.",
    ans: "Which is why the first purchase is a garment at a competitive price, not a subscription to a philosophy. The system is what makes the second and third purchase inevitable — and repeat rate, not first order, is where this business is actually won." },
  { n: "Risk 05", q: "Founder-led taste doesn't survive contact with scale",
    atk: "A point of view is a person. Systems built on one man's eye break at the fiftieth SKU, or the day he stops picking.",
    ans: "The point of view has to be written down as rules before it is scaled — which is what the wardrobe logic in this document is. If it can be taught to a merchandiser it can be scaled; if it can't, the brand should stay small deliberately." },
];

function Lamp({ night, onPull }) {
  const fix = useRef(null);
  const pull = () => {
    if (!reduced() && fix.current) {
      /* the fixture takes the tug, then settles — the weight is the detail
         that makes it read as an object rather than a button */
      gsap.fromTo(fix.current, { rotate: -4.5 },
        { rotate: 0, duration: 1.5, ease: "elastic.out(1,.25)" });
    }
    onPull();
  };
  return (
    <>
      <div className="lamp">
        <i className="cord" />
        <div className="fix" ref={fix}>
          <svg viewBox="0 0 140 96" aria-hidden="true">
            <path d="M70,6 L70,18" stroke="currentColor" strokeWidth="4" />
            <path d="M34,58 Q34,22 70,20 Q106,22 106,58 Z" fill="currentColor" />
            <rect x="30" y="56" width="80" height="7" rx="3.5" fill="currentColor" />
            <circle className="bulb" cx="70" cy="76" r="13" />
          </svg>
          <i className="beam" />
        </div>
        <button className="pull" onClick={pull}
          aria-pressed={!night}
          aria-label={night ? "Turn the lamp on — daylight" : "Turn the lamp off — night"}>
          <i /><b />
        </button>
      </div>
      <span className="lamphint">{night ? "pull for daylight" : "pull for night"}</span>
    </>
  );
}


/* ===========================================================================
   THE UNFOLD
   Long-form detail that costs no vertical space until it is wanted. The
   summary stays a single line of type; opening it rolls the body out beneath
   and draws a rule across as it goes, so it reads as a sentence continuing
   rather than a panel appearing.
   =========================================================================== */
function Unfold({ label, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const body = useRef(null);
  useEffect(() => {
    const el = body.current; if (!el) return;
    if (reduced()) { el.style.height = open ? "auto" : "0px"; return; }
    gsap.to(el, {
      height: open ? "auto" : 0, opacity: open ? 1 : 0,
      duration: .55, ease: "power3.inOut", overwrite: "auto",
    });
  }, [open]);
  return (
    <div className={`unfold ${open ? "on" : ""}`}>
      <button className="uf-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="uf-label">{label}</span>
        <span className="uf-rule" />
        <span className="uf-sign">{open ? "\u2013" : "+"}</span>
      </button>
      <div className="uf-body" ref={body} style={{ height: 0, opacity: 0, overflow: "hidden" }}>
        <div className="uf-inner">{children}</div>
      </div>
    </div>
  );
}

function RiskRegister() {
  return (
    <section id="risks" style={{ paddingBlock: "clamp(93px,17vh,205px)" }}>
      <div className="g">
        <div style={{ gridColumn: "9 / 13", alignSelf: "center", order: 2 }}>
          <Reveal delay={220}><ThreadMark form="grid" label="nine pieces · one unbroken thread" /></Reveal>
        </div>
        <div style={{ gridColumn: "1 / 8" }}>
          <Reveal>
            <p className="lb">08 — Where this breaks</p>
            <h2 className="big" style={{ marginTop: 18 }}>
              <span className="msk"><span className="gs-rise">Every deck has a page</span></span>
              <span className="msk"><span className="gs-rise it">where the founder stops selling.</span></span>
            </h2>
            <p className="lede" style={{ marginTop: 22, maxWidth: "46ch" }}>
              The five most credible ways this company dies — attacked first, then answered.
            </p>
          </Reveal>
        </div>
      </div>

      <div className="g" style={{ marginTop: "clamp(40px,7vh,80px)" }}>
        <div style={{ gridColumn: "1 / 13" }}>
          {RISKS.map((r, i) => (
            <Reveal key={r.n} delay={i * 60}>
              <Unfold label={<><span className="rsev">{r.n}</span> {r.q}</>}>
                <div className="rgrid">
                  <div className="atk"><b>The attack</b><p className="body">{r.atk}</p></div>
                  <div className="ans"><b>The answer</b><p className="body">{r.ans}</p></div>
                </div>
              </Unfold>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------------
   THE WHISPER CHAMBER
   Type a word. It gets retold three generations deep, drifting a little with
   every retelling, then every version collapses back into the one word that
   survives being repeated. It is a toy, and it is also the distribution
   thesis: a brand is your word, retold until it belongs to everyone.
   --------------------------------------------------------------------------- */
const VOW = "aeiou";
function mutateWord(w, heat) {
  const a = w.split("");
  const ops = 1 + Math.floor(Math.random() * heat);
  for (let k = 0; k < ops; k++) {
    const r = Math.random();
    const i = 1 + Math.floor(Math.random() * Math.max(a.length - 2, 1));
    if (r < .3 && a.length > 1) { const t = a[i - 1]; a[i - 1] = a[i]; a[i] = t; }
    else if (r < .55 && a[i] && VOW.includes(a[i].toLowerCase())) { a[i] = VOW[(Math.random() * 5) | 0]; }
    else if (r < .75) { a.splice(i, 0, a[i] || a[i - 1] || ""); }
    else if (a.length > 3) { a.splice(i, 1); }
  }
  let out = a.join("");
  if (heat > 1 && Math.random() < .25) out += "?";
  return out;
}

function Chamber() {
  const stage = useRef(null), cv = useRef(null);
  const inkTok = useToken("--ink", "#F5F3EF");
  const [val, setVal] = useState("");
  const [words, setWords] = useState([]);
  const [running, setRunning] = useState(false);
  const [ended, setEnded] = useState(false);
  const edges = useRef([]);
  const cancel = useRef(false);

  useEffect(() => {
    const c = cv.current, st = stage.current; if (!c || !st) return;
    const ctx = c.getContext("2d");
    let W = 0, H = 0, raf, run = true;
    const size = () => {
      const d = Math.min(window.devicePixelRatio || 1, 2);
      const r = st.getBoundingClientRect();
      W = r.width; H = r.height;
      c.width = Math.max(1, W * d); c.height = Math.max(1, H * d);
      ctx.setTransform(d, 0, 0, d, 0, 0);
    };
    size(); window.addEventListener("resize", size);
    const frame = (t) => {
      if (!run) return;
      ctx.clearRect(0, 0, W, H);
      ctx.lineWidth = 1;
      for (const e of edges.current) {
        const age = Math.min((t - e.born) / 600, 1);
        ctx.globalAlpha = .05 + .09 * age * e.a; ctx.strokeStyle = inkTok;
        ctx.beginPath(); ctx.moveTo(e.x1 * W, e.y1 * H);
        const mx = ((e.x1 + e.x2) / 2) * W + Math.sin(t * .0009 + e.s) * 6;
        const my = ((e.y1 + e.y2) / 2) * H + Math.cos(t * .0011 + e.s) * 6;
        ctx.quadraticCurveTo(mx, my, (e.x1 + (e.x2 - e.x1) * age) * W, (e.y1 + (e.y2 - e.y1) * age) * H);
        ctx.stroke();
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { run = false; cancelAnimationFrame(raf); window.removeEventListener("resize", size); };
  }, [inkTok]);

  const rnd = (a, b) => a + Math.random() * (b - a);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  const run = async (seed) => {
    if (running) return;
    setRunning(true); setEnded(false); cancel.current = false;
    edges.current = [];
    const nodes = [{ x: .5, y: .46, t: seed }];
    setWords([{ id: "root", t: seed, x: .5, y: .46, fs: 44, a: 1, root: true, in: false }]);
    await wait(60);
    setWords((w) => w.map((x) => ({ ...x, in: true })));

    const GENS = [{ n: 6, fs: 26, a: .85, d: [.10, .18] },
                  { n: 12, fs: 19, a: .6, d: [.08, .16] },
                  { n: 16, fs: 14, a: .38, d: [.06, .13] }];
    for (let g = 0; g < GENS.length; g++) {
      const cfg = GENS[g], born = [];
      for (let i = 0; i < cfg.n; i++) {
        if (cancel.current) { setRunning(false); return; }
        const par = nodes[(Math.random() * nodes.length) | 0];
        const ang = Math.random() * Math.PI * 2, d = rnd(cfg.d[0], cfg.d[1]);
        const x = Math.max(.07, Math.min(.93, par.x + Math.cos(ang) * d));
        const y = Math.max(.09, Math.min(.88, par.y + Math.sin(ang) * d * 1.1));
        const t = mutateWord(par.t, g + 1);
        const id = `${g}-${i}`;
        edges.current.push({ x1: par.x, y1: par.y, x2: x, y2: y, born: performance.now(), s: Math.random() * 6.28, a: cfg.a });
        born.push({ x, y, t });
        setWords((w) => [...w, { id, t, x, y, fs: cfg.fs * (.85 + Math.random() * .4), a: cfg.a, in: false }]);
        await wait(30);
        setWords((w) => w.map((q) => (q.id === id ? { ...q, in: true } : q)));
        await wait(rnd(60, 150));
      }
      nodes.push(...born);
      await wait(360);
    }
    if (cancel.current) { setRunning(false); return; }
    await wait(900);
    /* every version converges back to the one word that survives retelling */
    setWords((w) => w.map((q) => (q.root ? q : { ...q, x: .5, y: .46, in: false })));
    edges.current = [];
    await wait(1500);
    if (cancel.current) { setRunning(false); return; }
    setWords([{ id: "root", t: "RUMOAR", x: .5, y: .46, fs: 44, a: 1, root: true, in: true, final: true }]);
    setEnded(true);
    setRunning(false);
  };

  const reset = () => {
    cancel.current = true;
    edges.current = []; setWords([]); setEnded(false); setRunning(false); setVal("");
  };

  return (
    <div className="chamber" ref={stage}>
      <canvas ref={cv} aria-hidden="true" />
      <div className={`chform ${words.length ? "gone" : ""}`}>
        <input value={val} maxLength={14} spellCheck={false} placeholder="leave one word"
          aria-label="Type one word to whisper into the chamber"
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && val.trim()) run(val.trim()); }} />
        <button type="button" onClick={() => val.trim() && run(val.trim())}>whisper it</button>
      </div>
      <div className="chfield" aria-live="polite">
        {words.map((w) => (
          <span key={w.id}
            className={`wh ${w.in ? "in" : ""} ${w.root ? "root" : ""} ${w.final ? "final" : ""}`}
            style={{ left: `${w.x * 100}%`, top: `${w.y * 100}%`, fontSize: w.fs, "--wo": w.a }}>
            {w.t}
          </span>
        ))}
      </div>
      <div className={`chend ${ended ? "on" : ""}`}>
        <p>That&rsquo;s all a brand is — <span className="it ember">your word, retold until it belongs to everyone.</span></p>
        <button type="button" onClick={reset}>whisper another</button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   THE ASK
   The old version of this page was an audition. This one is a term sheet with
   a pulse: what the money buys, what it proves, and what has to be true for
   the next round to exist. Operator-investors read the last page first.
   --------------------------------------------------------------------------- */
const ASK_CARDS = [
  { v: "One category", k: "What we launch with", s: "Not a catalogue. One line, built to prove the system logic holds before range is earned." },
  { v: "18 months", k: "What the round buys", s: "To first repeat cohort and a defensible gross margin, not to a vanity revenue number." },
  { v: "Repeat rate", k: "The metric that decides", s: "First order proves demand exists. The second proves the system does. Everything else is noise until then." },
  { v: "Month 6", k: "The kill date", s: "If organic pull hasn't appeared, the thesis is wrong and we pivot cheaply rather than scale expensively." },
];

function TheAsk() {
  return (
    <section id="ask" style={{ paddingBlock: "clamp(104px,19vh,237px)" }}>
      <div className="g">
        <div style={{ gridColumn: "1 / 8" }}>
          <Reveal>
            <p className="lb">09 — The Ask</p>
            <h2 className="big" style={{ marginTop: 18 }}>
              <span className="msk"><span className="gs-rise">Everything above is a thesis.</span></span>
              <span className="msk"><span className="gs-rise it">This part is a number.</span></span>
            </h2>
            <p className="lede" style={{ marginTop: 22, maxWidth: "48ch" }}>
              Neither the gap nor the thesis is a business until the unit economics hold.
            </p>
          </Reveal>
        </div>
        <div style={{ gridColumn: "9 / 13", alignSelf: "end" }}>
          <Reveal delay={140}>
            <ThreadMark form="sign" label="one point of view, signed"
              style={{ maxWidth: 210, marginBottom: 28 }} />
          </Reveal>
          <Reveal delay={200}>
            <p className="term">
              <b>What we are</b><br />
              An identity system for Indian men,<br />
              sold as garments, priced competitively,<br />
              defended by coherence.<br /><br />
              <span className="c">What we are not</span><br />
              A catalogue with better photography.
            </p>
          </Reveal>
        </div>
      </div>

      <div className="g" style={{ marginTop: "clamp(40px,7vh,80px)" }}>
        <div style={{ gridColumn: "1 / 13" }}>
          <div>
            <TiltGrid className="ask gs-stagger">
              {ASK_CARDS.map((c) => (
                <div className="askc" key={c.k}>
                  <p className="v num">{c.v}</p>
                  <p className="k">{c.k}</p>
                  <p className="s">{c.s}</p>
                </div>
              ))}
            </TiltGrid>
          </div>
        </div>
      </div>

      <div className="g" style={{ marginTop: "clamp(48px,9vh,110px)" }}>
        <div style={{ gridColumn: "3 / 11" }}>
          <Reveal>
            <p className="mid" style={{ textAlign: "center", color: "var(--bone)" }}>
              Every brand in this category sells him an object.<br />
              <span className="dim">The first one that sells him a method keeps him for a decade.</span>
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

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
      <p style={{ letterSpacing: ".42em", fontWeight: 600, fontSize: ".68rem", fontFamily: "var(--font-mark)" }}>RUMOAR</p>
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
  const [selected, setSelected] = useState(null);
  const [hovered, setHovered] = useState(null);
  const [you, setYou] = useState(null);   // the visitor's own point on the field
  const [active, setActive] = useState("money");
  const [era, setEra] = useState(0);      // shared timeline index — drives every chart
  const [introDone, setIntroDone] = useState(() => reduced());
  const [night, setNight] = useState(false);  // LIGHT by default; the lamp dims it
  const audio = useAudio(introDone && route === "site");
  const eraCtx = useMemo(() => ({ era, setEra }), [era]);

  const brand = useMemo(() => brandData.find((b) => b.id === selected) || null, [selected]);

  /* motion boots only after the loader clears, so ScrollTrigger measures a
     settled layout rather than one that is still animating in */
  useGsapMotion(route === "site" && introDone);

  /* any late layout shift (fonts, images) invalidates pin math */
  useEffect(() => {
    if (route !== "site" || !introDone) return;
    const t = setTimeout(() => ScrollTrigger.refresh(), 600);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => ScrollTrigger.refresh());
    return () => clearTimeout(t);
  }, [route, introDone]);

  const swap = (r) => {
    setRoute(r);
    /* BUG WAS HERE: assigning location.hash = "" navigates to the bare URL,
       which reloads the document — which replayed the whole loader. Rewriting
       the entry in place changes the URL without any navigation. */
    const url = r === "lab" ? "#/lab" : window.location.pathname + window.location.search;
    window.history.replaceState(null, "", url);
    window.scrollTo(0, 0);
    /* pins measured against the old route are meaningless now */
    requestAnimationFrame(() => ScrollTrigger.refresh());
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
      setTimeout(() => setVeil(false), 200);
    }, 240);
  };

  useEffect(() => {
    const h = () => setRoute(window.location.hash === "#/lab" ? "lab" : "site");
    /* replaceState doesn't emit hashchange, so this only fires on real
       back/forward navigation — exactly when we do want to re-sync. */
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
    <EraContext.Provider value={eraCtx}>
    <div className={`ru ${night ? "night" : ""}`}>
      <style>{CSS}</style>
      {!introDone ? <Loader onDone={() => setIntroDone(true)} /> : null}
      <EdgeStrip />
      {introDone ? (
        <>
          {audio.audioEl}
          <RecordPlayer on={audio.on} blocked={audio.blocked}
            onToggle={() => (audio.on ? audio.stop() : audio.start())} />
        </>
      ) : null}
      {introDone ? <Lamp night={night} onPull={() => setNight((n) => !n)} /> : null}

      {route === "site" ? (
        <div className="rt-content">
          <Progress />
          <button className="skip" onClick={() => {
            const el = document.getElementById("man");
            el?.scrollIntoView({ behavior: "smooth" });
            el?.querySelector("h2")?.focus?.();
          }}>Skip to the argument</button>
          <Nav active={active} onLab={() => goto("lab")} />
          <Hero />
          <Thesis />

          <section style={{ paddingBlock: "clamp(58px,9vh,118px)" }}>
            <div className="g">
              <div style={{ gridColumn: "11 / 13", alignSelf: "center", order: 2 }}>
                <Reveal delay={200}><ThreadMark form="stitch" label="one stitch" /></Reveal>
              </div>
              <div style={{ gridColumn: "2 / 11" }}>
                <Reveal>
                  <p className="body gs-up" style={{ maxWidth: "56ch" }}>
                    Sell objects and you compete on price. Sell identity and you compete on
                    meaning. <span className="it">Meaning compounds. Price erodes.</span>
                  </p>
                </Reveal>
              </div>
            </div>
          </section>

          <Chapter id="money" n="01 — The Money"
            title={["The wallet grew.", { t: "The wardrobe didn't.", dim: true }]}
            note="Income tripled in twenty years. Consumption doubled in ten. The number of ways to build a wardrobe has stayed at one." />

          <section className="g" style={{ paddingBottom: "clamp(60px,10vh,146px)" }}>
            <div style={{ gridColumn: "1 / 13" }}>
              <Reveal><IncomeCurve /></Reveal>
            </div>
          </section>

          {/* the deck sits in the gutter beside the market, where the page has
              room to breathe — a live hand, dealt the same way every time */}
          <section className="g" style={{ paddingBottom: "clamp(70px,12vh,156px)" }}>
            <div style={{ gridColumn: "1 / 4" }}>
              <Reveal><Deck /></Reveal>
            </div>
            <div style={{ gridColumn: "5 / 12", alignSelf: "center" }}>
              <Reveal delay={160}>
                <p className="mid" style={{ maxWidth: "22ch" }}>
                  The market deals every man <span className="it">the same hand.</span>
                </p>
                <p className="body" style={{ marginTop: 20, maxWidth: "46ch" }}>
                  Same six houses, re-dealt each season. He is expected to find the good
                  card himself, and mostly doesn&rsquo;t.
                </p>
              </Reveal>
            </div>
            <div style={{ gridColumn: "12 / 13", alignSelf: "center" }}>
              <Reveal delay={300}><ThreadMark form="curve" /></Reveal>
            </div>
          </section>

          <Chapter id="man" n="02 — The Man"
            title={["The century in which clothing", { t: "quietly changed jobs.", dim: true }]}
            note="From survival, to provision, to status, to supply, to fragmentation — and then to something that still has no name. Select a year. Everything below moves with it." />
          <Timeline />

          <Chapter id="roles" n="03 — The Roles"
            title={["He is not six men.", { t: "He is one man, in six rooms,", dim: true }, { t: "inside the same week.", dim: true }]}
            note="Not segments — registers one person is asked to hold, and how well the market dresses each." />

          <section className="g" style={{ paddingBottom: "clamp(40px,7vh,83px)" }}>
            <div style={{ gridColumn: "1 / 13" }}>
              <Reveal><RoleGrid /></Reveal>
            </div>
          </section>

          {/* the same argument at day scale — kept inside this chapter rather
              than given its own, because it is evidence, not a new claim */}
          <section className="g" style={{ paddingBottom: "clamp(80px,13vh,177px)" }}>
            <div style={{ gridColumn: "1 / 5" }}>
              <Reveal>
                <p className="lb">The same week, compressed</p>
                <p className="body" style={{ marginTop: 16, maxWidth: "34ch" }}>
                  All six turn up inside a single Tuesday. Four are settled by something
                  he chose in nine seconds that morning.
                </p>
              </Reveal>
              <Reveal delay={260}>
                <ThreadMark form="pulse" label="one day of being read"
                  style={{ marginTop: 34, maxWidth: 220 }} />
              </Reveal>
            </div>
            <div style={{ gridColumn: "5 / 13", alignSelf: "center" }}>
              <Reveal delay={140}><PulseDay /></Reveal>
            </div>
          </section>

          <Silence a={M.editorial.silence1} kicker="04 — The Evolution"
            line={["Access solved itself.", { t: "Coherence didn't.", dim: true }]} />

          {/* six looks collapsing into one — this is The Evolution, and the
              collapse IS the argument: everything arrived, nothing resolved */}
          <Stack
            id="evolution"
            caption={<><span className="msk"><span className="gs-rise">Everything arrived.</span></span>
              <span className="msk"><span className="gs-rise it">Nothing resolved.</span></span></>}
            items={[
              { a: M.lab.looks.corporate, note: "The register the market solved." },
              { a: M.lab.looks.casual,    note: "Improvised from the office and the gym." },
              { a: M.lab.looks.oldmoney,  note: "Heritage, quoted rather than worn." },
              { a: M.lab.looks.european,  note: "Borrowed wholesale, fitted to nobody." },
              { a: M.lab.looks.trend,     note: "Current for a season, then dead." },
              { a: M.lab.looks.rumoar,    note: "Nine pieces that already agree." },
            ]} />

          <Chapter id="market" n="05 — The Market"
            title={["There has never been more menswear.",
              { t: "There has never been more of a man left over.", dim: true }]}
            note="Six houses, plotted on what they optimise for. None is wrong. Each is built for one man, in one setting." />

          <section className="g" style={{ paddingBottom: "clamp(60px,10vh,146px)" }}>
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
              <Reveal delay={340}>
                <ThreadMark form="shirt" label="the thing it was always for"
                  style={{ marginTop: 36, maxWidth: 200 }} />
              </Reveal>
            </div>
          </section>

          <section className="g" style={{ paddingBottom: "clamp(80px,13vh,177px)" }}>
            <div style={{ gridColumn: "1 / 13" }}>
              <Reveal><Matrix selected={selected} onSelect={setSelected} hovered={hovered} onHover={setHovered} /></Reveal>
            </div>
          </section>

          <Chapter id="price" n="06 — The Price"
            title={["The gap is not in what it costs.", { t: "It is in what you get for it.", dim: true }]}
            note="Mid-premium grows 25% a year, premium 45%. Brands exist in both. Every one sells a garment." />

          <section className="g" style={{ paddingBottom: "clamp(80px,13vh,177px)" }}>
            <div style={{ gridColumn: "1 / 13" }}>
              <Reveal><PriceGap /></Reveal>
            </div>
          </section>

          <Silence a={M.editorial.silence2} align="right" kicker="07 — The White Space"
            line={["A professional at ten. A friend at seven.",
              { t: "A traveller on Saturday. One wardrobe,", dim: true },
              { t: "built for one of them.", dim: true }]} />

          <WhiteSpaceAct you={you} />
          <RumoarAct />
          {/* REMOVED — "The arithmetic" (the WardrobeMath counter).
              The component itself is left intact further down the file, so it
              can be dropped back in with one line if it is ever wanted again. */}
          <section id="chamber" style={{ paddingBlock: "clamp(93px,17vh,205px)" }}>
            <div className="g" style={{ marginBottom: "clamp(28px,5vh,56px)" }}>
              <div style={{ gridColumn: "1 / 8" }}>
                <Reveal>
                  <p className="lb">Interlude — an experiment you run</p>
                  <h2 className="big" style={{ marginTop: 18 }}>
                    <span className="msk"><span className="gs-rise">Say something.</span></span>
                    <span className="msk"><span className="gs-rise it">Watch it stop being yours.</span></span>
                  </h2>
                  <p className="body" style={{ marginTop: 22, maxWidth: "46ch" }}>
                    Type one word. Every retelling changes it a little. That drift is the
                    distribution model.
                  </p>
                </Reveal>
              </div>
            </div>
            <div className="g">
              <div style={{ gridColumn: "1 / 13" }}>
                <Reveal><Chamber /></Reveal>
              </div>
            </div>
            <div className="g" style={{ marginTop: "clamp(38px,6vh,72px)" }}>
              <div style={{ gridColumn: "2 / 9", alignSelf: "center" }}>
                <Reveal delay={220}>
                  <p className="body" style={{ maxWidth: "46ch" }}>
                    Distribution is a chain reaction, not a budget line. It spreads only if
                    what you gave them was worth repeating.
                  </p>
                </Reveal>
              </div>
              <div style={{ gridColumn: "10 / 13" }}>
                <Reveal delay={120}><Lighter /></Reveal>
              </div>
            </div>
          </section>

          {/* REMOVED — "08 — Where this breaks" (the RiskRegister).
              Its thread-mark ornament was the one piece worth keeping and has
              moved down to the Styling Lab threshold, where "nine pieces · one
              unbroken thread" sits directly opposite "Same man. Six identities."
              The component is left intact below if the register is ever
              wanted back. */}
          <TheAsk />
          <Threshold onLab={() => goto("lab")} />
          <Colophon />
          <Dive brand={brand} onClose={() => setSelected(null)} />
        </div>
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
    </EraContext.Provider>
  );
}
