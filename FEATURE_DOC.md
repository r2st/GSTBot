# GSTBot — AI GST Compliance for Indian SMBs

## Problem

1.4 crore+ GST-registered businesses in India struggle with manual invoice matching between GSTR-1, GSTR-2B, and their books. Key pain points:

- **ITC leakage**: Missed Input Tax Credit claims due to mismatched or missing invoices cost businesses lakhs annually
- **Manual reconciliation**: Matching purchase registers with GSTR-2B is time-consuming and error-prone
- **Ghost credits**: Difficult to identify defaulting suppliers claiming credits they shouldn't
- **Deadline stress**: Quarterly filing deadlines with manual calculations lead to errors and penalties
- **No affordable tool**: Existing solutions (ClearTax Pro, Taxilla) are expensive for small businesses. Basic filing tools don't do reconciliation.

## Solution

AI-powered GST compliance assistant that automates invoice matching, reconciliation, and filing preparation using free LLMs.

## Core Features (MVP)

### 1. Invoice Upload & OCR
- Upload invoices via photo/PDF/Excel
- AI extracts vendor name, GSTIN, invoice number, amount, tax rate, HSN code
- Bulk upload support (zip files, folder upload)

### 2. Auto-Reconciliation
- Match purchase register against GSTR-2B data
- Flag mismatches: amount differences, missing invoices, duplicate entries
- Identify defaulting suppliers (filed in your books but not in their GSTR-1)
- Generate reconciliation report with actionable items

### 3. ITC Optimization
- Calculate eligible ITC based on matched invoices
- Flag potential ITC reversals (Rule 37, 42, 43)
- Track ITC utilization across IGST/CGST/SGST
- Alert on ITC approaching annual limits

### 4. Filing Preparation
- Auto-generate GSTR-1 data from sales invoices
- Pre-fill GSTR-3B from matched data
- Validation checks before filing (missing GSTINs, HSN mismatches, tax rate errors)
- Export in GST portal-compatible format (JSON/CSV)

### 5. Supplier Health Score
- Rate suppliers based on filing compliance history
- Flag risky suppliers (late filers, frequent mismatches)
- Recommend ITC provisioning for unreliable suppliers

### 6. Dashboard & Alerts
- Monthly GST summary with charts
- Filing deadline reminders (SMS/Email/WhatsApp)
- Mismatch trend analysis
- Tax liability forecast

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python/FastAPI |
| Frontend | React + Vite (SPA) |
| Database | PostgreSQL |
| Cache/Queue | Redis + Celery |
| AI/OCR | OpenRouter free models (invoice parsing, categorization), Tesseract (OCR fallback) |
| File storage | Local filesystem (MVP), S3 later |
| Auth | JWT + GSTIN-based onboarding |

## Architecture

- Multi-tenant from day 1 (business_id on every table)
- Channel-agnostic invoice ingestion (upload, email forward, WhatsApp photo)
- Event-driven processing pipeline: Upload → OCR → Parse → Match → Report
- Soft delete only on business data

## Data Model (Core Tables)

- `businesses` — GSTIN, trade name, state code, plan
- `invoices` — type (sales/purchase), vendor/customer GSTIN, amount, tax, HSN, status
- `gstr_returns` — period, return type (1/2B/3B), data JSON, filed status
- `reconciliation_runs` — period, matched/unmatched/mismatched counts, report
- `suppliers` — GSTIN, compliance score, filing history
- `alerts` — type, message, due_date, sent status

## Pricing

- **Free tier**: Up to 50 invoices/month, basic reconciliation
- **Starter**: ₹499/month — 500 invoices, full reconciliation, ITC optimization
- **Pro**: ₹1,499/month — unlimited invoices, supplier scoring, WhatsApp alerts, API access
- **CA Bundle**: ₹2,999/month — multi-client management, white-label reports, bulk operations

## Deployment

- Hetzner VPS (same as other products)
- Domain: gstbot.aiknol.com
- Systemd services: gstbot-api, gstbot-worker, gstbot-beat, gstbot-web

## MVP Timeline

Week 1: Project setup, auth, invoice upload + OCR parsing
Week 2: GSTR-2B import, auto-reconciliation engine
Week 3: Dashboard, ITC calculations, filing prep export
Week 4: Alerts, supplier scoring, polish + deploy

## Competition

| Competitor | Gap |
|---|---|
| ClearTax | Expensive for small businesses (₹18K+/year) |
| Zoho GST | Part of larger suite, not standalone |
| TallyPrime | Desktop-only, no AI, no auto-reconciliation |
| Masters India | Enterprise-focused |
| **GSTBot** | Affordable, AI-powered, standalone, mobile-friendly |

## Success Metrics

- 100 signups in first month (free tier)
- 10 paid conversions in month 2
- <5% reconciliation error rate
- NPS > 40 from paid users
