Below is a **single, “do it like Instagram” spec** you can paste into your project docs. It includes: **storage schema, URL pattern, DB tables, processing pipeline, sizes, formats, quality targets, and server-only delivery (no CDN).**

---

## Instagram-like Image Pipeline (No CDN, Serve From VPS)

### Goals

* Fast feed loads (small files, predictable sizes)
* Safe uploads (strip EXIF/GPS, validate content)
* Consistent UI (normalized aspect ratios)
* Simple storage + caching even without a CDN

---

# 1) What we store (never serve the original upload)

### Accepted uploads

* JPEG / PNG / WebP / HEIC (optional but recommended)
* (GIF only if you really want animation complexity)

### What we generate & store

* **WebP** (primary)
* **JPEG** fallback (for older clients / simple compatibility)

### Encoding targets (good defaults)

* **WebP quality:** `70` (range 65–80)
* **JPEG quality:** `82` (range 75–85)
* Chroma: **4:2:0**
* Strip metadata: **always**
* Auto-rotate based on EXIF: **always**

---

# 2) Variants (sizes) and why

You generate multiple sizes so the feed never downloads a “detail” image.

### Recommended size ladder (Instagram-ish)

Use “max dimension” resize (keep aspect ratio after crop rules below):

* `thumb`: **256px**
* `sm`: **640px**
* `md`: **1080px** (main feed)
* `lg`: **1440px** (detail)
* `xl`: **2048px** (zoom / future proof)

**Rule:** Never exceed **2048px** on the long edge for stored images.

---

# 3) Aspect ratio rules (how IG does it)

Don’t allow arbitrary aspect ratios in storage/delivery. Normalize display to a small set:

* **Square:** `1:1`
* **Portrait:** `4:5`
* **Landscape:** `1.91:1`

### How to implement

Store the user’s crop selection (or auto-center-crop), then generate variants from the cropped “master.”

**Flow:**

1. Decode + rotate + strip EXIF
2. Apply crop box (from user or auto)
3. Resize into variants
4. Encode to WebP + JPEG

---

# 4) Storage layout on disk (server-only)

Keep it boring and deterministic.

### Directory structure

```
/api/
  images/
    2026/
      02/
        <image_id>/
          master.webp
          master.jpg
          256.webp
          256.jpg
          640.webp
          640.jpg
          1080.webp
          1080.jpg
          1440.webp
          1440.jpg
          2048.webp
          2048.jpg
```

**Why nested by year/month?**
Avoids huge directories and makes backup/cleanup easier.

---

# 5) Public URL pattern (simple + cacheable)

### Option A (recommended): size + format in URL

```
GET /media/i/<image_id>/<size>.<ext>
```

Examples:

* `/media/i/9f3c.../1080.webp`
* `/media/i/9f3c.../256.jpg`

Where:

* `size` ∈ `256|640|1080|1440|2048|master`
* `ext` ∈ `webp|jpg`

### Option B: content-hash filenames (best for caching)

If you ever regenerate images, hashes prevent stale caches:

```
/media/i/<image_id>/<size>-<sha256_8>.<ext>
```

---

# 6) DB schema (Postgres)

You want 2 layers:

* `images` = original upload metadata + crop + processing state
* `image_variants` = each generated file (size/format/path/bytes)

### Table: `images`

* `id` (uuid, pk)
* `user_id` (uuid, fk)
* `created_at`
* `status` (`processing|ready|failed`)
* `original_filename`
* `original_mime`
* `original_bytes`
* `width` / `height` (after normalize/rotate)
* `crop_mode` (`square|portrait|landscape|free`)
* `crop_x`, `crop_y`, `crop_w`, `crop_h` (pixels on normalized base)
* `blurhash` (optional, for placeholders)
* `error` (nullable text)

### Table: `image_variants`

* `id` (uuid, pk)
* `image_id` (uuid, fk -> images.id)
* `size` (int) — 256/640/1080/1440/2048 or 0 for master
* `format` (`webp|jpg`)
* `path` (text) — absolute or relative
* `bytes` (int)
* `width` (int)
* `height` (int)
* `created_at`

**Indexes**

* `image_variants(image_id, size, format)` unique
* `images(user_id, created_at)` for galleries/feed

---

# 7) API responses (what frontend should request)

When returning a post:

* include `image_id`
* include a `srcset`-like list of URLs or a helper map

Example JSON:

```json
{
  "image_id": "9f3c...",
  "variants": {
    "256_webp": "/media/i/9f3c.../256.webp",
    "640_webp": "/media/i/9f3c.../640.webp",
    "1080_webp": "/media/i/9f3c.../1080.webp",
    "1440_webp": "/media/i/9f3c.../1440.webp",
    "256_jpg": "/media/i/9f3c.../256.jpg",
    "1080_jpg": "/media/i/9f3c.../1080.jpg"
  },
  "placeholder": {
    "blurhash": "LEHV6nWB2yk8pyo0adR*.7kCMdnj"
  }
}
```

Frontend rules:

* Feed uses `640` or `1080` depending on container width
* Detail uses `1080` or `1440`
* Only request `2048` for zoom

---

# 8) Serving from your VPS (no CDN) — do it safely & fast

Even without a CDN, you can get 80% of the benefit by doing:

### (A) Nginx serves files directly

Don’t stream media through Go if you can avoid it.

* Go authenticates/authorizes when needed (private media).
* Public media: Nginx `alias` / `try_files`.

### (B) Correct caching headers

Since your URLs are versioned by `image_id` and do not change, set:

* `Cache-Control: public, max-age=31536000, immutable`
  If you might replace files under the same URL, then don’t use immutable; instead use:
* `Cache-Control: public, max-age=86400`

**Strong recommendation:** use hash-in-filename or never overwrite, so you can safely set 1-year immutable.

### (C) Enable range requests

Great for progressive loading and future video.

* Nginx handles this.

### (D) Rate limits

You’re serving from one box, so basic throttling helps.

---

# 9) Upload & processing flow (small site version)

Even on a small site, don’t block the upload request doing full transforms if you can help it.

### Minimal safe approach

1. Upload endpoint saves file to a temp path + creates `images` row with `processing`
2. A worker (or goroutine + queue) generates variants
3. Mark `ready`
4. Feed only shows images with `ready`

Queue options (simple to robust):

* **Simplest:** in-process buffered channel worker (single instance)
* Better: Redis queue (since you already use Redis sometimes)
* Best: separate worker service

---

# 10) Security checklist (don’t skip)

* Validate MIME by sniffing file headers (not just extension)
* Limit upload size (example: 10MB)
* Limit dimensions (reject absurd 20000x20000)
* Strip EXIF always (privacy + rotation bugs)
* Store outside your app repo
* Never allow path traversal (only serve by DB-known IDs)
* Consider antivirus scan if you ever allow arbitrary file types

---

## Practical defaults you can adopt today

* Store: WebP + JPEG
* Variants: 256 / 640 / 1080 / 1440 / 2048 (+ master)
* WebP q=70, JPEG q=82
* Normalize aspect ratios to 1:1 / 4:5 / 1.91:1
* Store crop box in DB
* Serve from Nginx with `immutable` caching (if URLs never overwrite)

---
