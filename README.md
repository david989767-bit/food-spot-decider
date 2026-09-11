# Eat Along the Line

A Google Sheet is the source of truth. `build.mjs` turns it into one static HTML
file. Nothing runs on a server, so nothing costs money to run.

```
data/places.csv    ← template for the "places" sheet
data/suburbs.csv   ← template for the "suburbs" sheet
src/index.html     ← the site, with a /*__DATA__*/ marker where data goes
build.mjs          ← sheet -> dist/index.html
dist/index.html    ← what you deploy (generated, don't edit)
```

## Build

```bash
node build.mjs
```

With no environment variables it reads the local CSVs, so it always builds
offline. Point it at the live sheet with:

```bash
SHEET_PLACES="<published csv url>" SHEET_SUBURBS="<published csv url>" node build.mjs
```

## The sheet

Two tabs. Travel time and train line belong to the **suburb**, not the
restaurant, so you enter them once and never again.

**places** — one row per restaurant, this is the only tab you touch regularly

| column | notes |
| --- | --- |
| `name` | restaurant name — becomes the ticket headline |
| `suburb` | must match a row in the suburbs tab |
| `cuisine` | free text |
| `price` | `$`, `$$`, `$$$` (or 1/2/3) |
| `dish` | what to order — not shown on the ticket yet, used on suburb pages |
| `note` | one line, in your voice. The only field an aggregator can't copy |
| `active` | `no` hides a row without deleting it |

**suburbs** — set up once, edited when you add a new area

| column | notes |
| --- | --- |
| `suburb` | display name |
| `region` | `city`, `innerwest`, `west` or `north` |
| `line` | `T1`–`T9`, `M`, `L1`–`L3`, or `WALK` |
| `mins` | minutes from Central, as a number |
| `no` | instalment number |

The build warns about unknown suburbs, unknown train lines and missing notes,
and refuses to write a file if every row fails.

## Connecting the real sheet

1. Build the two tabs in one Google Sheet using the CSV templates as headers.
2. **File → Share → Publish to web**, pick the *places* tab, format
   **Comma-separated values (.csv)**, publish, copy the URL. Repeat for
   *suburbs*.
   Use these published URLs — a normal share link returns HTML and the build
   will tell you so.
3. Put both URLs in the host's environment variables as `SHEET_PLACES` and
   `SHEET_SUBURBS`.

Publishing a tab makes that tab publicly readable, so keep anything private in
a separate unpublished sheet.

## Deploying (free)

Cloudflare Pages, connected to a GitHub repo:

- build command `node build.mjs`
- output directory `dist`

Free tier covers unlimited bandwidth and 500 builds a month. A `.pages.dev`
subdomain costs nothing; a custom domain is the only real expense, around
$15–25 a year.

Vercel's Hobby tier is also free but is licensed for non-commercial use only,
which is a problem the moment the account takes sponsorship. Cloudflare Pages
has no such restriction.

**Adding a restaurant** = one row in the sheet, then trigger a rebuild. Create a
Deploy Hook in the Pages project and bookmark the URL — opening it kicks off a
build.

## Placeholder data

Every row currently in `data/places.csv` is invented and prefixed
`PLACEHOLDER —`. None of those restaurants exist. Replace them before this goes
anywhere public.
