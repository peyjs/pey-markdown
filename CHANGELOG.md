# Changelog — pey.markdown

## [1.2.1] - 1405-08-22

### Fixed

- **Heading close-tag resolution follows the sanitizer's stack model**: a `</hN>` closes the innermost open `hN`; a closer of any tag opened under a heading closes that heading too (`<b><h1>a</b>` → text `a`); stray closers are no-ops; closers inside `script`/`style` subtrees, comments or dead markup never close a heading. The injector mirrors the sanitizer's stack and re-syncs after every nested skip; contract tests lock `toc.text` == rendered text for every shape.
- **Attribute-aware tag scanning**: a `<hN>` inside a host tag's quoted attribute value (`<img alt="<h2>t">`) no longer receives an id or creates a ghost toc entry; malformed `<` heads, aborted tags, quoted closers and EOF truncation are handled exactly like the sanitizer, keeping `toc.text` identical to the rendered output.
- **Single-pass architecture for id injection and toc text** — per-heading close searches and text extraction were quadratic (a 60k-char unclosed-heading document took ~27s); the walk now carries each open heading's live-text sink and every character costs the same. Performance gates keep the whole family linear: unclosed headings, deep unclosed tag bases combined with many heading closes, stray closers, repeated same-text headings and document-scale comment clamps.
- **Footnote-label heading is a real barrier**: its whole subtree stays out of every toc entry and never leaks into an open outer heading's text.
- **Documented cost ceiling for footnote-heavy input**: the "one reference + one definition" family is quadratic inside micromark's gfm-footnote extension itself (both of this plugin's passes are linear); documented in the reference limits and NFR-4, with a 2,000-footnote service-path performance gate guarding the upstream dependency against regressions.
- Misc: the `toc.text` contract is spelled out in the reference and FR-13; the `FOOTNOTE_LABEL_ID` constant is shared from the policy table; `package-lock.json` is synced with 1.2.1; the README/manifest/requirements version stamps are locked by a test (199 tests).

(Entries below were published as originally written.)

## [1.2.0] - 1405-08-15

- تگ `<mark>` (هایلایت) به فهرست مجاز سانیتایزر افزوده شد — بدون هیچ اتریبیوتی، صرفاً برای هایلایت رندرشده (مصرف‌کننده‌ی اصلی: اکستنشن `==هایلایت==` افزونه‌ی pey.document-export). افزودنی و سازگار.
- رفع ناسازگاری نادر toc/html: پرش از زیردرخت `script`/`style` در تزریق شناسهٔ تیترها اکنون از همان راه‌رفتِ حذفِ سانیتایزر (`stepDropContent`) استفاده می‌کند — تگ‌های تودرتوی هم‌نام شمرده می‌شوند و `<script/>` تنها خودِ تگ را حذف می‌کند؛ در نتیجه هر id در `toc` عیناً در HTML نهاییِ ضدعفونی‌شده هم هست (آزمون قراردادی «toc ⊆ html» افزوده شد).
- خطاهای مرزی اکنون نمونهٔ واقعی `Error` هستند (`BonyanError extends Error` با همان شش فیلد استاندارد) — `instanceof Error` و stack trace برای کالر حفظ می‌شود.
- تقسیم مسئولیت در sanitize: جدول‌های سیاست (`sanitize-policy`)، فیلتر اتریبیوت‌ها (`sanitize-attributes`)، سیاست URI (`sanitize-uri`) و ماشین حالت تگ (`sanitize-state`) از `sanitize.js` جدا شدند؛ رمزگشای انتیتی و توکن‌ساز اتریبیوت در `html-text` مشترک شدند و تکثیرِ «kept in sync» بین sanitize و heading-ids از بین رفت.
- رفع واگرایی کامنت بسته‌نشده: کامنت بدون `-->` در تزریق شناسه دیگر تا انتهای ورودی پرش نمی‌کند — همان‌جا که سانیتایزر `&lt;!--` را متن می‌کند و ادامه را زنده می‌خوانَد، تیترهای بعدی شناسه و مدخل toc می‌گیرند.
- رفع تیتر تودرتو: تیترِ داخل تیتر (مثل `# a<h2>inner</h2>` از inline HTML) شناسه و مدخل toc خودش را می‌گیرد و متنش به‌غلط در متن تیتر بیرونی ادغام نمی‌شود.
- رفع شمارش عمق حذف: تگ self-closing هم‌نام (مثل `<script/>`) عمق زیردرختِ در حال حذف را زیاد نمی‌کند تا محتوای بعد از آن بی‌صدا حذف نشود.
- `sanitizeHtml` (خروجی عمومی `./lib/sanitize.js`) پرچم رشته‌ای `'true'`/`'false'` را مثل خود سرویس می‌پذیرد.
- پوشش آزمون: سیاست پیش‌فرض تصویر بیرونی در سطح سرویس، اتولینک `<https://…>`، اعمال config `allowExternalImages` در `prepare()` و پذیرش رشته‌ایِ پرچم‌ها؛ آزمون کارایی دیگر به زمان‌سنج واقعی وابسته نیست؛ آزمون دود نگاشت import map مرورگری (NFR-2) و آزمون قراردادی برچسب‌های aria-label هر دو منبع پاورقی افزوده شد؛ جداسازی توابع اسکن تگ به `lib/heading-scan.js`.

## [1.1.0] - 1405-08-03

- تیترهای `h1`–`h6` شناسهٔ پایدارِ ساختهٔ افزونه می‌گیرند (`user-content-h-<slug>` و با `idPrefix` کالر `user-content-<prefix>-h-<slug>`) و `renderFragment` علاوه بر `html` آرایهٔ `toc: [{id, level, text}]` را برمی‌گرداند که idهایش عیناً همان شناسه‌های اعمال‌شده در HTML است — تنها slugger داخل افزونه است، نه در مصرف‌کننده (ویرایشگر و ویکی id یکسان می‌بینند).
- سیاست slug: لاتین کوچک‌شده حفظ، فاصله/خط‌تیره به یک `-`، نشانه‌گذاری حذف، نویسه‌های حرف‌دار/رقم‌دار غیر ASCII (فارسی) درصد-انکد (هم‌راستا با شناسه پاورقی؛ قطعی و امن در URL hash)، تهی → `h` و تکراری‌ها داخل همان فراخوانی → `-1`، `-2`... (بدون هیچ حالتی بین فراخوانی‌ها؛ ورودی یکسان همیشه خروجی یکسان).
- `id` تیترِ پیش‌موجود در HTML خام با شناسهٔ افزونه جایگزین می‌شود؛ تیتر بخش پاورقی (`footnote-label`) دست‌نخورده می‌ماند و در `toc` نمی‌آید؛ تیتر داخل کامنت و زیردرخت `script`/`style` نادیده گرفته می‌شود.
- سانیتایزر: اتریبیوت `id` به تیترهای `h1` و `h3`–`h6` هم اجازه داده شد (مقدار همچنان فقط `user-content-*` یا `footnote-label`).
- تغییر دامنه نسبت به 1.0.0: «فهرست» از بیرونِ کاملِ دامنه به «دادهٔ toc از افزونه، رندر فهرست و anchor با مصرف‌کننده» تغییر کرد (docs/requirements.md بخش ۳ و تصمیم‌های ۴ و ۵).

## [1.0.0] - 1405-07-09

- متد `renderFragment`: تبدیل Markdown استاندارد + GFM (جدول، تسک‌لیست، strikethrough، اتولینک، پاورقی) به HTML fragment ضدعفونی‌شده.
- هسته فارسی-اگنوستیک با افزونه‌های تزریقی micromark در هر فراخوانی (فارسی با `parsneshan`؛ ترتیب: دیرتر ثبت‌شده می‌برد)؛ `parsneshan` فقط وابستگی توسعه است و `lib` به آن وابسته نیست.
- سانیتایزر رشته‌ای خالص با فهرست مجاز و اسکن خطی: تگ‌های مجاز می‌مانند، بقیه باز می‌شوند، `script`/`style` هرگز زنده نمی‌مانند؛ URIها روی مقدار نرمال‌شده سنجیده می‌شوند.
- HTML خام طبق CommonMark عبور می‌کند؛ تگ نامتوازن خودکار بسته می‌شود.
- لینک `tel:` کار می‌کند؛ schemeهای خطرناک همیشه خنثی می‌شوند.
- پاورقی با ساختار کامل؛ برچسب‌ها پیش‌فرض انگلیسی‌اند و فقط با `footnoteOptions` کالر (مثل `persianFootnoteOptions` از پارس‌نشان) فارسی می‌شوند. شناسه‌ها با `idPrefix` اختیاری کالر یکتا و بدون آن پایدار و تکرارپذیرند.
- پیکربندی `maxInputChars` (پیش‌فرض `200000`) و `allowExternalImages` (پیش‌فرض `true`).
- خطاهای استاندارد بنیان (`MARKDOWN_RENDER_FAILED`، `SERVICE_UNAVAILABLE`) بدون نشت محتوای ورودی.
- پوسته استاندارد بنیان: `manifest.json` + ورودی دوفازی `index.js`، معماری `0.11`.
- بسته ESM بدون باندلر با نگاشت `exports`؛ نیازمند Node ۲۲ یا بالاتر برای اجرای تست‌ها.
- پارس‌نشان `v0.2.0` از گیت‌هاب با `git+https` (بدون نیاز به کلید SSH) فقط برای توسعه؛ نگاشت مرورگر با زیرمسیر `persian-footnote` به‌روز و دودشده است.
