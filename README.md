# pey.markdown

[![AI](https://img.shields.io/badge/Built%20with-AI-blueviolet)](#)
[![version](https://img.shields.io/badge/version-1.2.1-blue.svg)](#)
[![license](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Bonyan Architecture](https://img.shields.io/badge/bonyan-0.11-56c3bf)](https://github.com/barnevis/bonyan)

## هدف

افزونه‌ی ویژگی (feature) از زیست‌بوم پی برای تبدیل Markdown استاندارد + GFM به HTML fragment ضدعفونی‌شده، با امکان تزریق افزونه‌های فارسی پارس‌نشان در هر فراخوانی. یک ورودی Markdown، یک خروجی fragment امن با شناسهٔ پایدار تیترها و آرایهٔ `toc` مطابقشان — بدون پوستهٔ سند، بدون تم، بدون منطق UI.

## ساختار

- `docs/` — سندهای پروژه.
- `lib/` — منطق سرویس، سانیتایزر و تزریق شناسهٔ تیترها.
- `tests/` — آزمون‌های افزونه.
- `index.js` — نقطه‌ی ورود.
- `manifest.json` — قرارداد افزونه.

## وابستگی‌ها

- **الزامی:** ندارد.
- **اختیاری:** ندارد.

## نصب و استفاده

این بسته هنوز در npm منتشر نشده است: پوشهٔ افزونه را در مسیر افزونه‌های پروژه بگذارید و وابستگی‌های npm را (`micromark` و `micromark-extension-gfm`) در همان پوشه با `npm install` نصب کنید. افزونه در `bootstrap.json` ثبت می‌شود و سرویس `pey.markdown.service` پس از آماده‌سازی و فعال‌سازی در دسترس است؛ `parsneshan` فقط وابستگی توسعه است و مصرف‌کننده‌ای که فارسی می‌خواهد خودش آن را تزریق می‌کند. استفادهٔ مستقیم از `lib` بیرون از بنیان و نگاشت کامل مرورگر در [مرجع](docs/reference.md) آمده است.

## مجوز

این پروژه با مجوز MIT منتشر شده است؛ متن کامل در [LICENSE](LICENSE).

## سندهای مرتبط

- [معرفی](docs/introduction.md) — شناخت افزونه به زبان ساده.
- [مرجع](docs/reference.md) — API، رویدادها، خطاها و پیکربندی.
- [نیازمندی‌ها](docs/requirements.md) — سند ساخت افزونه، مکتوب پیش از پیاده‌سازی.
