# مرجع افزونه pey.markdown

> قرارداد معتبر همیشه `manifest.json` است؛ در تعارض، ملاک `manifest.json` است و این سند باید اصلاح شود.

## هدف

تبدیل Markdown استاندارد + GFM به HTML fragment ضدعفونی‌شده، با امکان تزریق افزونه‌های فارسی پارس‌نشان به‌صورت per-call. یک ورودی Markdown، یک خروجی fragment امن؛ بدون پوسته سند، بدون تم، بدون منطق UI.

## ساختار

- `manifest.json` — هویت، سرویس، خطاها، پیکربندی (قرارداد معتبر).
- `package.json` — بسته ESM با وابستگی‌های `micromark`، `micromark-extension-gfm`، `micromark-extension-gfm-autolink-literal` و `parsneshan`.
- `index.js` — نقطه ورود دوفازی بنیان (`prepare`/`activate`).
- `lib/constants.js` — ثابت‌های مشترک (نام، نسخه، سرویس، سقف ورودی، کدهای خطا).
- `lib/error.js` — سازنده‌های خطای استاندارد بنیان.
- `lib/sanitize.js` — سانیتایزر allowlist رشته‌ای خالص (بدون DOM).
- `lib/markdown-service.js` — سرویس رندر (`renderFragment`)؛ stateless و سنکرون.
- `tests/sanitize.test.js` — تست‌های سانیتایزر.
- `tests/render-fragment.test.js` — تست‌های رندر CommonMark/GFM و خطا.
- `tests/entry.test.js` — تست‌های نقطه ورود دوفازی.
- `tests/parsneshan-injection.test.js` — تست‌های تزریق افزونه‌های فارسی.
- `tests/service-errors.test.js` — تست‌های قرارداد خطا.
- `tests/manifest.test.js` — تست‌های هماهنگی منیفست با کد.
- `docs/requirements.md` — نیازمندی‌های پایه و مبنای پذیرش.
- `docs/reference.md` — همین سند.
- `README.md` — معرفی کوتاه و ارجاع به همین سند.
- `CHANGELOG.md` — تاریخچه نسخه‌ها.

## وابستگی‌ها

- **Required:** ندارد.
- **Optional:** ندارد.

وابستگی‌های npm (در `package.json`، نه سرویس بنیان): `micromark` (موتور رندر)، `micromark-extension-gfm` (جدول، تسک‌لیست، strikethrough، اتولینک و پاورقی)، `parsneshan` (فقط افزونه تزریقی اختیاری per-call؛ هسته بدون آن کاملاً استاندارد کار می‌کند).

## API عمومی

سرویس `pey.markdown.service` با یک متد `renderFragment`. جزئیات رسمی پارامترها در `manifest.json` است؛ این‌جا فقط نحوه صدازدن:

```js
// رندر استاندارد (GFM همیشه روشن، بدون رفتار فارسی)
const { html } = service.renderFragment({ markdown: '# سلام\n\nمتن **مهم**' })
```

```js
// رندر با افزونه فارسی (کالر افزونه را می‌دهد، سرویس فقط ترکیب می‌کند)
import { warning, warningHtml } from 'parsneshan'

const { html } = service.renderFragment({
  markdown: '... هشدار\nمتن **مهم**\n...\n',
  syntaxExtensions: [warning()],
  htmlExtensions: [warningHtml()],
})
```

```js
// پاورقی با دامنه یکتا (مثل شناسه پیام در گپ)؛ بدون آن خروجی پایدار است
const { html } = service.renderFragment({ markdown: 'متن[^1]\n\n[^1]: توضیح', idPrefix: 'msg-42' })
```

ورودی خالی (`''`) fragment تهی (`{ html: '' }`) برمی‌گرداند، نه خطا.

### استفاده در مرورگر

نام‌های ساده در مرورگر بدون باندلر به import map نیاز دارند — و نه فقط چهار نام مستقیم، بلکه همه ۳۱ بسته transitive (از دل `micromark` و `parsneshan`) که این نگاشت با Chromium headless آزمایش شده و خروجی‌اش بایت‌به‌بایت با Node یکی است. مسیرهای نسبی map نسبت به **صفحه HTML** سنجیده می‌شوند، نه نسبت به این فایل:

```json
{
  "imports": {
    "pey.markdown/lib/": "./plugins/pey.markdown/lib/",
    "parsneshan": "./vendor/parsneshan/index.js",
    "parsneshan/extensions/warning": "./vendor/parsneshan/extensions/warning/index.js",
    "parsneshan/extensions/caution": "./vendor/parsneshan/extensions/caution/index.js",
    "parsneshan/extensions/important": "./vendor/parsneshan/extensions/important/index.js",
    "parsneshan/extensions/tip": "./vendor/parsneshan/extensions/tip/index.js",
    "parsneshan/extensions/note": "./vendor/parsneshan/extensions/note/index.js",
    "parsneshan/extensions/persian-list": "./vendor/parsneshan/extensions/persian-list/index.js",
    "parsneshan/extensions/persian-poem": "./vendor/parsneshan/extensions/persian-poem/index.js",
    "micromark": "./vendor/micromark@4.0.3/index.js",
    "micromark-core-commonmark": "./vendor/micromark-core-commonmark@2.0.4/index.js",
    "micromark-extension-gfm": "./vendor/micromark-extension-gfm@3.0.0/index.js",
    "micromark-extension-gfm-autolink-literal": "./vendor/micromark-extension-gfm-autolink-literal@2.1.0/index.js",
    "micromark-extension-gfm-footnote": "./vendor/micromark-extension-gfm-footnote@2.1.0/index.js",
    "micromark-extension-gfm-strikethrough": "./vendor/micromark-extension-gfm-strikethrough@2.1.0/index.js",
    "micromark-extension-gfm-table": "./vendor/micromark-extension-gfm-table@2.1.2/index.js",
    "micromark-extension-gfm-tagfilter": "./vendor/micromark-extension-gfm-tagfilter@2.0.0/index.js",
    "micromark-extension-gfm-task-list-item": "./vendor/micromark-extension-gfm-task-list-item@2.1.0/index.js",
    "micromark-factory-destination": "./vendor/micromark-factory-destination@2.0.1/index.js",
    "micromark-factory-label": "./vendor/micromark-factory-label@2.0.1/index.js",
    "micromark-factory-space": "./vendor/micromark-factory-space@2.1.0/index.js",
    "micromark-factory-title": "./vendor/micromark-factory-title@2.0.1/index.js",
    "micromark-factory-whitespace": "./vendor/micromark-factory-whitespace@2.0.1/index.js",
    "micromark-util-character": "./vendor/micromark-util-character@2.1.1/index.js",
    "micromark-util-chunked": "./vendor/micromark-util-chunked@2.0.1/index.js",
    "micromark-util-classify-character": "./vendor/micromark-util-classify-character@2.0.1/index.js",
    "micromark-util-combine-extensions": "./vendor/micromark-util-combine-extensions@2.0.1/index.js",
    "micromark-util-decode-numeric-character-reference": "./vendor/micromark-util-decode-numeric-character-reference@2.0.2/index.js",
    "micromark-util-edit-map": "./vendor/micromark-util-edit-map@1.0.0/index.js",
    "micromark-util-encode": "./vendor/micromark-util-encode@2.0.1/index.js",
    "micromark-util-html-tag-name": "./vendor/micromark-util-html-tag-name@2.0.1/index.js",
    "micromark-util-normalize-identifier": "./vendor/micromark-util-normalize-identifier@2.0.1/index.js",
    "micromark-util-resolve-all": "./vendor/micromark-util-resolve-all@2.0.1/index.js",
    "micromark-util-sanitize-uri": "./vendor/micromark-util-sanitize-uri@2.0.1/index.js",
    "micromark-util-subtokenize": "./vendor/micromark-util-subtokenize@2.1.0/index.js",
    "micromark-util-symbol": "./vendor/micromark-util-symbol@2.0.1/lib/default.js",
    "micromark-util-types": "./vendor/micromark-util-types@2.0.3/index.js",
    "decode-named-character-reference": "./vendor/decode-named-character-reference@1.3.0/index.js",
    "character-entities": "./vendor/character-entities@2.0.2/index.js"
  }
}
```

نکته‌ها:
- `parsneshan` روی npm نیست؛ checkout همان مخزن را کنار پروژه بگذارید و نگاشت کنید. زیرمسیرهای `extensions/*` را تک‌تک بنویسید: کلید پیشوندی (`parsneshan/`) پسوند `.js` را خودش اضافه نمی‌کند و در مرورگر خطای MIME می‌دهد (با تست واقعی گرفته شد). اگر پارس‌نشان افزونه تازه‌ای اضافه کند، زیرمسیرش را همین‌جا دستی اضافه کنید.
- برای محصول نهایی و آفلاین (Capacitor/Tauri) همین بسته‌ها را با نسخه پین‌شده کنار پروژه (`vendor/`) بگذارید: با قطع اینترنت CDN می‌میرد و نشانی ثابت هم تغییرناپذیری فایل سرور را تضمین نمی‌کند. ساخت پوشه از روی `node_modules` نصب‌شده (تست‌شده):
```bash
mkdir -p vendor
for d in node_modules/micromark*/ node_modules/decode-named-character-reference node_modules/character-entities; do
  n=$(basename "$d"); v=$(node -p "require('./$d/package.json').version")
  rm -rf "vendor/$n@$v" && cp -r "$d" "vendor/$n@$v"
done
cp -r node_modules/parsneshan vendor/parsneshan
```
- نسخه‌های نگاشت پین‌شده‌اند ولی `package.json` بازه می‌دهد (`^`)؛ پس از هر `npm update` نگاشت را با نسخه‌های واقعی `package-lock.json` هماهنگ کنید وگرنه مرورگر و Node دو نسخه متفاوت بارگذاری می‌کنند.

```js
import MarkdownService from 'pey.markdown/lib/markdown-service.js'

const { html } = new MarkdownService().renderFragment({ markdown: '# سلام' })
```

### CSS تیتر پاورقی

تیتر پاورقی کلاس `sr-only` دارد ولی شیوه‌نامه همراهش نیست؛ مصرف‌کننده خودش می‌دهد، وگرنه تیتر نمایان می‌ماند. اگر میزبان خودش `sr-only` دارد (Bootstrap یا Tailwind) همان کافی است:

```css
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
```

## رویدادها

- منتشر می‌کند: هیچی (`events: []`).
- گوش می‌دهد: هیچی (بدون dependency، نیازی به `core:service-unavailable` نیست).

## مرجع خطاها

| کد | نوع | چه زمانی |
|---|---|---|
| `MARKDOWN_RENDER_FAILED` | operational | ورودی نامعتبر (غیررشته‌ای، افزونه غیرآرایه‌ای)، عبور از `maxInputChars`، یا خطای داخلی رندر/ضدعفونی |
| `SERVICE_UNAVAILABLE` | operational (قرارداد مشترک همه سرویس‌ها) | فراخوانی پس از deactivate شدن افزونه |

همه خطاها ساختار استاندارد بنیان دارند (`code/message/source/type/timestamp/detail`) و محتوای ورودی یا داده حساس حمل نمی‌کنند.

## پیکربندی

| کلید | نوع | الزامی | پیش‌فرض |
|---|---|---|---|
| `maxInputChars` | number | خیر | `200000` |
| `allowExternalImages` | boolean | خیر | `true` |

عبور از سقف خطای `MARKDOWN_RENDER_FAILED` می‌دهد، نه برش خاموش.

## قوانین افزونه

- GFM (جدول، تسک‌لیست، strikethrough، اتولینک) همیشه روشن است و قابل خاموش‌کردن نیست.
- رفتار فارسی فقط وقتی اعمال می‌شود که کالر افزونه را در همان فراخوانی پاس بدهد؛ بدون تزریق، خروجی کاملاً استاندارد است.
- ترتیب ترکیب افزونه‌ها: اول GFM، بعد افزونه‌های کالر به ترتیب آرایه. در تداخل، دیرتر ثبت‌شده می‌برد (construct دیرتر زودتر امتحان می‌شود و هندلر html بازنویسی می‌شود)؛ پس افزونه کالر بر GFM می‌چربد.
- پاورقی GFM با ساختار کامل و برچسب‌های فارسی (`پاورقی`، `بازگشت به ارجاع N`) حفظ می‌شود؛ شناسه‌های ارجاع با `idPrefix` کالر (رشته یا عدد صحیح؛ مثل شناسه پیام) یکتا می‌شوند و بدون آن پایدار می‌مانند ولی در چند fragment یک صفحه تکرار می‌شوند (HTML نامعتبر؛ لینک به اولین مورد می‌پرد). `idPrefix` فقط رشته یا عدد صحیح معمولی با حروف لاتین، رقم و `_ : . -` است (عدد باید چنان باشد که `String(n)` تمیز بماند)؛ شناسه فارسی را کالر باید به شکل لاتین تبدیل کند. تیتر مخفی `footnote-label` در همه fragmentها مشترک است (بی‌ضرر). لینک `tel:` کار می‌کند.
- پیشوند شناسه قابل‌پیش‌بینی است: مهاجم می‌تواند لینک پاورقی پیام‌های دیگر را به عنصر خودش بکشاند (ریسک کم)؛ برای محتوای حساس، `idPrefix` غیرقابل‌حدس بدهید. در حالت نظریِ تبانی کالر و نویسنده (پیشوند `a-fn-b` با برچسب `c` در برابر پیشوند `a` با برچسب `b-fn-c`) شناسه یکسان ساخته می‌شود؛ نادیده‌گرفتنی است.
- تصاویر خارجی (مطلق `http(s)` با هر شکل اسلش، پروتکل-نسبی `//`، بک‌اسلش، یا مبهم‌سازی‌شده با انتیتی) به‌صورت پیش‌فرض مجازند (آی‌پی بیننده به سایت دیگر می‌رود)؛ با `allowExternalImages: false` فقط نسبی و `data:image` می‌مانند.
- `id` فقط با پیشوند `user-content-` یا دقیقاً `footnote-label` می‌ماند، `aria-describedby` فقط به `footnote-label` اشاره می‌کند، `aria-label` فقط قالب `بازگشت به ارجاع N` را دارد و `data-footnote-*` فقط تهی می‌ماند — تا HTML خام نتواند آن‌ها را جعل کند.
- مصرف‌کننده باید CSS کلاس `sr-only` را خودش بدهد، وگرنه تیتر پاورقی نمایان می‌ماند.
- خروجی همیشه fragment است؛ هیچ `<html>`، تم یا CSS تولید نمی‌شود.
- همه خروجی‌ها از سانیتایزر عبور می‌کنند؛ هیچ مسیری HTML ضدعفونی‌نشده برنمی‌گرداند.
- HTML خام سورس (بلوکی و درون‌خطی) مطابق CommonMark عبور می‌کند و سپس ضدعفونی می‌شود: تگ مجاز می‌ماند، تگ نامجاز باز می‌شود (محتوایش می‌ماند) و `script`/`style` هرگز زنده نمی‌مانند (حذف با محتوا یا escape رندر).
- کد فنس‌دار فقط `<pre><code class="language-x">` ساده است؛ هایلایت انجام نمی‌شود.
- سرویس بدون حافظه رندر و سنکرون است؛ هیچ چیز بین فراخوانی‌ها نگه داشته نمی‌شود جز پرچم چرخه‌حیات فعال/غیرفعال.

## محدودیت‌ها

- اسمبل سند کامل، تم، روتر و دانلود فایل با مصرف‌کننده است؛ از این افزونه انتظار پوسته `<html>` نداشته باشید.
- افزونه‌های `syntaxExtensions`/`htmlExtensions` کد اجرایی‌اند؛ فقط افزونه‌های معتبر و قابل‌اعتماد (مثل پارس‌نشان) پاس بدهید، نه ورودی کاربر نهایی.
- روی ماندن تگ نامجاز در خروجی حساب نکنید؛ فقط تگ‌های فهرست مجاز (از جمله `details`/`summary`/`kbd`) می‌مانند و بقیه باز می‌شوند.
- این افزونه event منتشر نمی‌کند؛ هماهنگی بعد از رندر (مثلاً به‌روزرسانی UI) با سرویس صداکننده است.
