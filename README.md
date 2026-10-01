# pey.markdown

[![نسخه](https://img.shields.io/badge/version-1.0.0-blue.svg)](#) [![مجوز](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE) [![معماری بنیان](https://img.shields.io/badge/bonyan-0.11-5cc3bf)](https://github.com/barnevis/bonyan)

افزونه مارک‌داون بخشی از چارچوب پی، پیاده‌سازی‌شده بر پایه معماری بنیان؛ برای تبدیل Markdown استاندارد + GFM به HTML fragment ضدعفونی‌شده، با امکان تزریق افزونه‌های فارسی پارس‌نشان در هر فراخوانی.

## هدف

یک ورودی Markdown، یک خروجی HTML fragment امن — بدون پوسته سند، بدون تم، بدون منطق UI. هر چهار مصرف چارچوب پی (دانلود HTML در ویرایشگر، ویکی شبیه docsify، پیام‌های گپ، صفحات وبگاه) فقط همین یک متد را صدا می‌زنند و پوسته را خودشان می‌سازند.

## ویژگی‌ها

- CommonMark + GFM (جدول، تسک‌لیست، strikethrough، اتولینک استاندارد و literal) — همیشه روشن.
- هسته فارسی-اگنوستیک: بدون افزونه تزریقی، خروجی کاملاً استاندارد است.
- ضدعفونی با فهرست مجاز داخل خود افزونه: `script`، `on*`، `javascript:` و تگ‌های خطرناک هرگز زنده نمی‌مانند.
- `lib/` خالص و سنکرون: بدون DOM، بدون Core/EventBus، بدون شبکه — قابل import مستقیم بیرون بنیان.
- ESM مرورگر-مبنا، بدون باندلر؛ کد فنس‌دار فقط `<pre><code class="language-x">` ساده.

## نصب

این بسته هنوز در npm منتشر نشده است؛ پوشه افزونه را در مسیر افزونه‌های پروژه قرار دهید و وابستگی‌ها را نصب کنید:

```bash
npm install
```

سپس در `bootstrap.json` ثبت کنید:

```json
{
  "plugins": [
    { "name": "pey.markdown", "version": "1.0.0", "path": "plugins/pey.markdown" }
  ],
  "config": {
    "pey.markdown": { "maxInputChars": 200000 }
  }
}
```

## شروع سریع

استفاده از سرویس (داخل بنیان، پس از `core:ready`):

```js
const service = /* pey.markdown.service از رجیستری */
const { html } = service.renderFragment({ markdown: '# سلام\n\nمتن **مهم**' })
```

استفاده مستقل از `lib` (بیرون بنیان — ویکی ساده، رندر جزئی، تست):

```js
import MarkdownService from 'pey.markdown/lib/markdown-service.js'

const service = new MarkdownService()
const { html } = service.renderFragment({ markdown: '- [x] انجام شد' })
```

> نکته مرورگر: import با نام ساده در مرورگر بدون باندلر به import map نیاز دارد (مثلاً `"pey.markdown/"` به مسیر افزونه و `"micromark"` به CDN)؛ در Node کافی است وابستگی‌ها نصب شده باشند.

رندر با افزونه فارسی پارس‌نشان (کالر افزونه را می‌دهد، سرویس فقط ترکیب می‌کند):

```js
import { warning, warningHtml } from 'parsneshan'

const { html } = service.renderFragment({
  markdown: '... هشدار\nمتن **مهم**\n...\n',
  syntaxExtensions: [warning()],
  htmlExtensions: [warningHtml()],
})
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

وابستگی‌های npm (در `package.json`): `micromark`، `micromark-extension-gfm` و `parsneshan` (پین‌شده به `v0.1.0`؛ فقط افزونه تزریقی اختیاری).

## آزمون‌ها

```bash
npm test
```

۱۰۶ تست سبز: رندر CommonMark/GFM، پاورقی و HTML خام، سانیتایزر و XSS و پرفورمنس، تزریق پارس‌نشان، قرارداد خطا، نقطه ورود دوفازی و هماهنگی منیفست.

## مستندات

- مرجع کامل API، خطاها، پیکربندی، قواعد و محدودیت‌ها: [`docs/reference.md`](./docs/reference.md)
- نیازمندی‌های پایه و مبنای پذیرش: [`docs/requirements.md`](./docs/requirements.md)

## مجوز

MIT — متن کامل در [`LICENSE`](./LICENSE).
