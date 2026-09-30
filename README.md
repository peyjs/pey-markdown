# pey.markdown

افزونه `feature` بنیان (معماری `0.11`) برای تبدیل Markdown استاندارد + GFM به HTML fragment ضدعفونی‌شده، با امکان تزریق افزونه‌های فارسی پارس‌نشان به‌صورت per-call.

## ساختار

- `manifest.json` — قرارداد معتبر افزونه.
- `package.json` — بسته ESM.
- `index.js` — نقطه ورود دوفازی (`prepare`/`activate`).
- `lib/` — `constants.js`، `error.js`، `sanitize.js`، `markdown-service.js` (خالص، سنکرون، بدون DOM).
- `tests/` — تست‌های `node:test` به‌ازای هر فایل سورس.
- `docs/` — `requirements.md` (نیازمندی‌های پایه) و `reference.md` (مرجع کامل).

## وابستگی‌ها

- **Required:** ندارد.
- **Optional:** ندارد.

مرجع کامل API، خطاها، پیکربندی، قواعد و محدودیت‌ها در `docs/reference.md` است.
