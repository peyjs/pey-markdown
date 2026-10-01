# pey.markdown

[![نسخه](https://img.shields.io/badge/version-1.0.0-blue.svg)](#)
[![مجوز](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)
[![معماری بنیان](https://img.shields.io/badge/bonyan-0.11-5cc3bf)](https://github.com/barnevis/bonyan)

افزونه مارک‌داون بخشی از چارچوب پی، پیاده‌سازی‌شده بر پایه معماری بنیان؛ برای تبدیل Markdown استاندارد + GFM به HTML fragment ضدعفونی‌شده، با امکان تزریق افزونه‌های فارسی پارس‌نشان در هر فراخوانی.

## هدف

یک ورودی Markdown، یک خروجی HTML fragment امن — بدون پوسته سند، بدون تم، بدون منطق UI. هر چهار مصرف چارچوب پی (دانلود HTML در ویرایشگر، ویکی شبیه docsify، پیام‌های گپ، صفحات وبگاه) فقط همین یک متد را صدا می‌زنند و پوسته را خودشان می‌سازند.

## ویژگی‌ها

- CommonMark + GFM (جدول، تسک‌لیست، strikethrough، اتولینک استاندارد و literal، پاورقی با برچسب انگلیسی پیش‌فرض) — همیشه روشن.
- فارسی تزریقی: پاورقی فارسی و افزونه‌های پارس‌نشان فقط وقتی اعمال می‌شوند که کالر بدهد (`footnoteOptions`، `syntaxExtensions`/`htmlExtensions`)؛ بدون تزریق، خروجی کاملاً استاندارد است.
- لینک `tel:` کار می‌کند؛ schemeهای خطرناک همیشه خنثی می‌شوند.
- هسته فارسی-اگنوستیک: بدون افزونه تزریقی، خروجی کاملاً استاندارد است.
- ضدعفونی با فهرست مجاز داخل خود افزونه: `script`، `on*`، `javascript:` و تگ‌های خطرناک هرگز زنده نمی‌مانند.
- `lib/` خالص و سنکرون: بدون DOM، بدون Core/EventBus، بدون شبکه — قابل import مستقیم بیرون بنیان.
- ESM مرورگر-مبنا، بدون باندلر؛ کد فنس‌دار فقط `<pre><code class="language-x">` ساده.

## نصب

این بسته هنوز در npm منتشر نشده است؛ پوشه افزونه را در مسیر افزونه‌های پروژه قرار دهید و وابستگی‌ها را **داخل همان پوشه** نصب کنید (`npm install` در ریشه پروژه، `package.json` داخل پوشه افزونه را نصب نمی‌کند):

```bash
cd plugins/pey.markdown && npm install
```

سپس در `bootstrap.json` ثبت کنید (مثل نمونه‌های سند معماری، `path` با `./` شروع می‌شود):

```json
{
  "plugins": [
    { "name": "pey.markdown", "version": "1.0.0", "path": "./plugins/pey.markdown" }
  ],
  "config": {
    "pey.markdown": { "maxInputChars": 200000, "allowExternalImages": true }
  }
}
```

## شروع سریع

استفاده از سرویس (داخل بنیان، پس از `core:ready` — مصرف‌کننده رفرنس سرویس را از Core می‌گیرد، نه مستقیم از Registry که هیچ پلاگین و UI به آن دسترسی ندارد):

```js
// service: رفرنس `pey.markdown.service` که Core به مصرف‌کننده داده است
const { html } = service.renderFragment({ markdown: '# سلام\n\nمتن **مهم**' })
```

استفاده مستقل از `lib` (بیرون بنیان — ویکی ساده، رندر جزئی، تست):

```js
import MarkdownService from 'pey.markdown/lib/markdown-service.js'

const service = new MarkdownService()
const { html } = service.renderFragment({ markdown: '- [x] انجام شد' })
```

> نکته مرورگر: import با نام ساده در مرورگر بدون باندلر به import map کامل نیاز دارد؛ نمونه کوتاه بالا برای مرورگر کافی نیست — نگاشت کامل و تأییدشده در بخش «استفاده در مرورگر» در [`docs/reference.md`](./docs/reference.md#استفاده-در-مرورگر) است.

رندر با افزونه فارسی پارس‌نشان (کالر افزونه را می‌دهد، سرویس فقط ترکیب می‌کند):

```js
import { warning, warningHtml } from 'parsneshan'

const { html } = service.renderFragment({
  markdown: '... هشدار\nمتن **مهم**\n...\n',
  syntaxExtensions: [warning()],
  htmlExtensions: [warningHtml()],
})
```

پاورقی با دامنه یکتا — گپ و ویکی (UC-2 و UC-3) برای هر پیام/صفحه `idPrefix` بدهند تا شناسه‌ها تکراری نشوند:

```js
const { html } = service.renderFragment({ markdown: 'متن[^1]\n\n[^1]: توضیح', idPrefix: 'msg-42' })
```

پاورقی فارسی — گپ و ویکی فارسی (UC-2 و UC-3) `footnoteOptions` هم بدهند (نصب `parsneshan` با کالر است، وگرنه import او خطا می‌دهد):

```js
import { persianFootnoteOptions } from 'parsneshan'

const { html } = service.renderFragment({ markdown: 'متن[^1]\n\n[^1]: توضیح', footnoteOptions: persianFootnoteOptions })
```

## پیکربندی

| کلید | نوع | الزامی | پیش‌فرض | توضیح |
|---|---|---|---|---|
| `maxInputChars` | عدد | خیر | `200000` | سقف طول ورودی هر فراخوانی؛ عبور از آن خطای `MARKDOWN_RENDER_FAILED` می‌دهد |
| `allowExternalImages` | بولی | خیر | `true` | با `false`، تصویر خارجی (مطلق، `//`، بک‌اسلش، انتیتی) حذف می‌شود (حریم آی‌پی بیننده) |

## ساختار

- `manifest.json` — قرارداد معتبر افزونه (هویت، سرویس، خطاها، پیکربندی).
- `package.json` — بسته ESM و وابستگی‌های npm.
- `index.js` — نقطه ورود دوفازی بنیان (`prepare`/`activate`).
- `lib/constants.js` — ثابت‌های مشترک (نام، نسخه، سرویس، سقف ورودی، کدهای خطا).
- `lib/error.js` — سازنده‌های خطای استاندارد بنیان.
- `lib/sanitize.js` — سانیتایزر رشته‌ای خالص با فهرست مجاز (بدون DOM).
- `lib/markdown-service.js` — سرویس رندر `renderFragment`؛ بدون حالت و سنکرون.
- `tests/` — تست `node:test` به‌ازای هر فایل سورس (۶ فایل).
- `docs/` — `requirements.md` (نیازمندی‌های پایه) و `reference.md` (مرجع کامل).

## وابستگی‌ها

- **ضروری:** ندارد.
- **اختیاری:** ندارد.

وابستگی‌های npm: `micromark` و `micromark-extension-gfm` (اجباری، نصب خودکار)؛ `parsneshan` فقط وابستگی توسعه است (نسخه مصرفی در تست‌ها `v0.2.0` از گیت‌هاب) — مصرف‌کننده‌ای که برچسب یا افزونه فارسی می‌خواهد خودش آن را نصب می‌کند (از گیت‌هاب، چون روی npm نیست؛ پس نصب به دسترسی گیت‌هاب وابسته است).

## آزمون‌ها

```bash
npm test
```

اجرای تست‌ها به Node ۲۲ یا بالاتر نیاز دارد (به‌خاطر import attribute در تست‌ها) و همین حداقل در `engines` کل بسته هم اعلام شده است؛ منطق خود سرویس روی WebViewهای مدرن (حدود ۲۰۲۰ به بعد) اجرا می‌شود.

همه تست‌ها سبز: رندر CommonMark/GFM، پاورقی و HTML خام، سانیتایزر و XSS و پرفورمنس، تزریق پارس‌نشان، قرارداد خطا، نقطه ورود دوفازی و هماهنگی منیفست.

## مستندات

- مرجع کامل API، خطاها، پیکربندی، قواعد و محدودیت‌ها: [`docs/reference.md`](./docs/reference.md)
- نیازمندی‌های پایه و مبنای پذیرش: [`docs/requirements.md`](./docs/requirements.md)

## مجوز

MIT — متن کامل در [`LICENSE`](./LICENSE).
