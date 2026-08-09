# RUMOAR

An interactive argument about men's identity, built as a website.

**You do not need to install anything.** Everything below happens in a browser.

---

## Deploy in about five minutes

### 1. Put this folder on GitHub

Go to [github.com/new](https://github.com/new), name the repository `rumoar`,
keep it private if you like, and create it.

On the empty repo page click **uploading an existing file**, then drag in the
*contents* of this folder — `src`, `public`, `index.html`, `package.json`,
`vite.config.js`, `vercel.json`, `.gitignore`. Commit.

> Drag the files inside the folder, not the folder itself. GitHub's uploader
> preserves subfolders, so `src/Rumoar.jsx` stays where it belongs.

### 2. Connect Vercel

Go to [vercel.com/new](https://vercel.com/new), sign in with GitHub, and import
the `rumoar` repository.

Vercel reads `vercel.json` and configures itself — framework Vite, build
`npm run build`, output `dist`. Change nothing. Press **Deploy**.

Ninety seconds later you have a live URL.

### 3. From then on

Every push to `main` redeploys automatically. To change anything — copy, a
brand's position, a photograph — edit the file on GitHub directly (open it,
press the pencil, commit) and the site rebuilds itself. You never touch a
terminal.

---

## Adding your photography

Upload into `public/assets/`, keeping these exact names. GitHub's uploader
handles drag-and-drop into subfolders.

```
hero/hero.mp4          hero/poster.jpg        hero/figure.png
timeline/1900.jpg      1970 · 2000 · 2010 · 2020 · 2026
film/film.mp4          film/poster.jpg
editorial/silence-01.jpg  silence-02.jpg  reveal.jpg  threshold.jpg
brands/van-heusen.jpg  louis-philippe · allen-solly · us-polo
                       rare-rabbit · snitch · rumoar
lab/character/base.png
lab/looks/corporate.png   casual · oldmoney · european · trend · rumoar
lab/thumbs/corporate.jpg  casual · oldmoney · european · trend · rumoar
```

Any file not yet uploaded shows a labelled placeholder printing the path it
wants, so you can add them one at a time and watch them land.

**GitHub refuses files over 100 MB.** If your hero video is bigger, either
compress it (see below) or host media separately and set `MEDIA.base` in
`src/Rumoar.jsx` §0 to your CDN URL. Everything else keeps working.

### Video encoding

The one step that decides whether this feels expensive:

```bash
# hero loop — muted, so drop the audio track entirely
ffmpeg -i source.mov -c:v libx264 -crf 23 -preset slow -pix_fmt yuv420p \
  -vf "scale=1920:-2" -an -movflags +faststart hero.mp4

# the scrubbed film — dense keyframes, or scrolling feels like it snags
ffmpeg -i source.mov -c:v libx264 -crf 22 -preset slow -pix_fmt yuv420p \
  -g 5 -keyint_min 5 -sc_threshold 0 -vf "scale=1920:-2" -an \
  -movflags +faststart film.mp4
```

A default export puts a keyframe roughly every 250 frames. Scroll-scrubbing
that file catches no matter how good the JavaScript is. `-g 5` is the fix, and
it costs file size.

If it still stutters on a real phone, switch to frames — one line in §1:

```js
film: seq("film/frame-", 120, { pad: 4, ext: "jpg" }),
```

---

## Where to edit what

Everything is in `src/Rumoar.jsx`, sectioned:

| § | Contains |
|---|---|
| §0 | Media resolver — point it at local files or any CDN |
| §1 | Asset manifest — every image and video slot |
| §2 | All copy and data: eras, brands, looks, roles, wardrobe |
| §3 | Design system — type scale, colour, glass, motion tiers |
| §4 | Motion engine |
| §5–§7 | Components |

Change a brand's position on the field by editing its `x` and `y` in
`brandData`. Change the wardrobe arithmetic by editing `wardrobe`. No component
logic to touch.

---

## The three interactive pieces

**Plot Yourself** (Market section) — the visitor picks the roles they occupy in
a normal week and lands as a point on the same field as the brands, with a
dotted line to whichever house sits closest. The argument stops being about the
market and becomes about them. Their point persists into the white-space
reveal, so when everything else fades, they're standing in the gap.

**Wardrobe Math** (before the Lab) — "nine pieces, forty outfits" is a line
every brand asserts. This computes it live from a compatibility model. Switch a
piece off and the count drops in front of you. The graphic tee costs four
outfits; a shirt costs eight. Coherence stops being a mood and becomes a number.

**The Identity Receipt** (end of the Lab) — every look tried is itemised like a
till receipt: what it read as, what it cost in range, a verdict at the bottom.
A takeaway object instead of a cart, copyable to the clipboard.

---

## Accessibility and motion

Reduced-motion is honoured throughout: the film stops scrubbing, cinematic
transitions collapse to fast fades, the intro is skipped. Keyboard: a skip link,
arrow keys on the timeline rail, Enter on brand points and matrix rows, Escape
closes the brand panel, and the panel is `inert` while closed so it can't be
tabbed into.
