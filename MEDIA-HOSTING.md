# RUMOAR — media hosting

Everything the site displays resolves through one function in `Rumoar.jsx` (§0).
You never touch component code to add or swap a photograph.

---

## 1. Create the bucket

Run this once against your Supabase project (SQL editor, or I can apply it for you):

```sql
-- public bucket, 200 MB per object, images + video
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'rumoar-media', 'rumoar-media', true, 209715200,
  array['image/jpeg','image/png','image/webp','image/avif','image/svg+xml',
        'video/mp4','video/webm','video/quicktime']
)
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- anyone can read; only signed-in users can write
create policy "rumoar media is public"
  on storage.objects for select
  using (bucket_id = 'rumoar-media');

create policy "rumoar media uploads"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'rumoar-media');

create policy "rumoar media updates"
  on storage.objects for update to authenticated
  using (bucket_id = 'rumoar-media');
```

A public bucket only means a public **read** URL exists. Uploads still require a
policy, which is why the insert policy above is separate.

---

## 2. Point the site at it

In `Rumoar.jsx`, §0:

```js
const MEDIA = {
  supabase: { ref: "yourprojectref", bucket: "rumoar-media" },
  base: "/assets/",
  transform: false,   // set true on Supabase Pro — see §4
  ...
};
```

That's the entire integration. Every path in the manifest now resolves to
`https://<ref>.supabase.co/storage/v1/object/public/rumoar-media/<path>`.

To host anywhere else instead (Cloudflare R2, Bunny, S3, Vercel), leave `ref`
empty and set `base: "https://your-cdn.com/"`. Absolute URLs in the manifest are
passed through untouched, so you can mix sources.

---

## 3. Upload

```bash
# Supabase CLI
supabase login
supabase storage cp --recursive ./media ss:///rumoar-media --experimental

# or drag the folders into Storage in the dashboard — the folder names
# become the paths, so keep the structure below exactly
```

### Filenames the site expects

```
hero/hero.mp4              full-page hero video      (mp4, h.264, faststart)
hero/poster.jpg            first frame, shown while the video loads
hero/figure.png            optional cutout figure, transparent

timeline/1900.jpg          one per era — 1900 1970 2000 2010 2020 2026
film/film.mp4              the scroll-scrubbed film
film/poster.jpg

editorial/silence-01.jpg   full-bleed pause after the timeline
editorial/silence-02.jpg   full-bleed pause before the white space
editorial/reveal.jpg       the RUMOAR reveal frame
editorial/threshold.jpg    the door into the Lab

brands/van-heusen.jpg      louis-philippe · allen-solly · us-polo
                           rare-rabbit · snitch · rumoar

lab/character/base.png     base figure, transparent  (Architecture A)
lab/looks/corporate.png    complete styled figures   (Architecture B)
                           casual · oldmoney · european · trend · rumoar
lab/thumbs/corporate.jpg   rail thumbnails, 3:4
                           casual · oldmoney · european · trend · rumoar
```

Any slot still missing renders a labelled placeholder printing the path it
wants, so you can upload in any order and see progress immediately.

---

## 4. Video encoding — this part matters

The hero loop and the scrubbed film have different requirements.

**Hero loop** (`autoplay muted loop playsinline`, already set):

```bash
ffmpeg -i source.mov -c:v libx264 -crf 23 -preset slow -pix_fmt yuv420p \
  -vf "scale=1920:-2" -an -movflags +faststart hero.mp4
```

Drop the audio track (`-an`) — muted autoplay is the only autoplay browsers
allow, and the audio is dead weight.

**Scrubbed film** — scrubbing means seeking, and seeking is only fast when
keyframes are dense. Default encodes place a keyframe every 250 frames, which
makes scroll-scrub feel like it's snagging. Force one every 5:

```bash
ffmpeg -i source.mov -c:v libx264 -crf 22 -preset slow -pix_fmt yuv420p \
  -g 5 -keyint_min 5 -sc_threshold 0 -vf "scale=1920:-2" -an \
  -movflags +faststart film.mp4
```

The file gets larger. It's the trade that makes the scrub feel like Apple's.

**If scrubbing still stutters** on a target device, switch the film to a frame
sequence — the manifest already supports it:

```js
film: seq("film/frame-", 120, { pad: 4, ext: "jpg" }),
// expects film/frame-0001.jpg … film/frame-0120.jpg
```

That path renders to `<canvas>`, preloads first and last frames before the rest,
and gives exact per-frame control. Video is lighter; frames are more reliable.

**Image transforms.** On Supabase Pro, set `transform: true` and images route
through the render endpoint, which serves WebP automatically and makes `srcset`
real — the browser requests 640px on a phone instead of downloading 2400px.
Free plan: leave it false and upload pre-sized WebP.

---

## 5. If you'd rather not use Supabase

The resolver is deliberately dumb. Anything that serves files over HTTPS with
range-request support works. Two notes:

- **Range requests are mandatory** for the scrubbed film. Supabase Storage,
  Cloudflare R2 and S3 all support them; some naive static hosts don't, and the
  film will refuse to seek.
- **CORS** must allow your domain if the media sits on a different origin.
