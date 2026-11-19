# AtlasCRM Usage Guide

Owner: Sales Operations · Scope: Sales department · Version 4.0 · Last updated: 20 January 2026

## 1. Purpose

AtlasCRM is the single source of truth for customers, contacts, opportunities and forecasts in the Sales department. This guide defines the mandatory data entry rules. Data quality in AtlasCRM directly affects commission calculations, forecasting and account planning.

## 2. Accounts and contacts

- Every customer must exist as one account. Before creating a new account, search by tax number to avoid duplicates.
- The account owner is the person responsible for the relationship; ownership changes require team lead approval.
- At least two contacts must be recorded for every key account: one operational contact and one decision maker.
- Contact data is personal data. Do not store private phone numbers or personal e-mail addresses unless the contact has given explicit consent, recorded in the consent field.

## 3. Opportunities

### 3.1 When to create an opportunity

An opportunity must be created **within 48 hours** of the first meeting in which the customer expresses a concrete need, such as a lane, a volume or a warehousing requirement.

### 3.2 Mandatory fields

| Field | Rule |
|---|---|
| Expected annual value | In TL; for EUR contracts use the Atlas Finance reference rate |
| Close date | Must not be in the past for open opportunities |
| Stage | One of the stages listed in section 3.3 |
| Service type | FTL domestic, FTL international, warehousing, reefer, ADR |
| Competitor | Mandatory from stage Propose onwards |
| Loss reason | Mandatory for Closed Lost |

### 3.3 Stages and probabilities

AtlasCRM assigns a default probability to every stage. The probability is used to calculate the weighted pipeline.

| Stage | Default probability |
|---|---|
| Qualify | 10% |
| Discover | 25% |
| Propose | 50% |
| Negotiate | 75% |
| Closed Won | 100% |
| Closed Lost | 0% |

Account executives may override the probability by at most ±15 percentage points, with a comment.

## 4. Activities

Customer meetings, calls and site visits are logged as activities within 2 business days. Visits to key accounts must include a short visit report. Activities are used in the quarterly key account review.

## 5. Forecasting

- The forecast is submitted in AtlasCRM every **Monday by 12:00**.
- Each opportunity in the current quarter is classified as Commit, Best Case or Pipeline.
- Team leads review the forecast of their team on Monday afternoon; the Head of Sales consolidates it on Tuesday.
- Forecast accuracy target for 2026: the Commit forecast at the start of the quarter must be within ±10% of actual revenue.

## 6. Data hygiene rules

1. No open opportunity may have a close date in the past. AtlasCRM sends a reminder after 3 days and moves the opportunity to the team lead's review list after 10 days.
2. Opportunities without activity for 60 days are flagged as stale.
3. Duplicate accounts are merged by Sales Operations every second Friday.
4. Data quality score per account executive is published monthly; the 2026 target is 90%.

## 7. Integration with other systems

- Closed Won opportunities create a customer master request in AtlasERP automatically.
- Lane and volume data are passed to AtlasTMS for capacity planning.
- Commission calculations read gross revenue from AtlasERP and ownership from AtlasCRM.

## 8. Access

AtlasCRM access is requested through the IT access request process; the system owner is Sales. Account executives see all accounts of their own team and the key accounts of the other team in read-only mode. Exports of more than 500 records require team lead approval.

## 9. Training

New Sales employees complete the AtlasCRM basic training within their first 10 business days. Refresher training takes place every September.

## 10. Contact

Sales Operations: satis-operasyon@atlas-lojistik.test.
