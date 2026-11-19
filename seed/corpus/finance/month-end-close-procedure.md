# Month-End Close Procedure

Owner: Finance · Scope: Finance department · Version 5.1 · Effective: 1 January 2026

## 1. Purpose

This procedure sets the calendar, responsibilities and controls for the monthly financial close of Atlas Lojistik A.Ş. and the consolidation of Atlas Lojistik GmbH. The goal is to deliver a reliable management report to the executive team on the **eighth working day** (WD8) after month end.

## 2. Close calendar

Working days (WD) are counted from the first working day of the new month. WD1 of January 2026 was 5 January 2026, because 1 and 2 January were a public holiday and a company bridge day.

| Working day | Activity | Owner |
|---|---|---|
| WD-2 | Reminder to all departments: submit purchase receipts and accrual information | Accounting |
| WD1 | Cut-off for supplier invoices and goods receipts at 12:00 | Accounting |
| WD1 | Fuel card transactions imported from the fuel card provider | Accounting |
| WD2 | Accruals and prepayments booked | Accounting |
| WD3 | Intercompany reconciliation with Atlas Lojistik GmbH | Accounting |
| WD3 | Bank reconciliations completed for all accounts | Treasury |
| WD4 | Fixed asset depreciation run and fleet asset review | Accounting |
| WD5 | Preliminary P&L and balance sheet | Financial Controlling |
| WD6 | Variance analysis and comments from department heads | Financial Controlling |
| WD7 | Final close; period locked in AtlasERP at 18:00 | Head of Accounting |
| WD8 | Management report sent to the CEO and executives | CFO |

## 3. Accruals

- Expenses of **10,000 TL or more** for which goods or services were received but no invoice has arrived must be accrued.
- Departments send accrual information to accounting by WD1 at 17:00 using the accrual template.
- Recurring accruals (rent, energy, subcontracted carriers) are calculated by Accounting based on the last three months.
- Subcontracted carrier costs are accrued per trip from AtlasTMS data, because carrier invoices often arrive 30–45 days after delivery.

## 4. Revenue recognition

Freight revenue is recognised when the delivery is completed and the proof of delivery (POD) is uploaded to AtlasTMS. Shipments that are in transit at month end are recognised in proportion to the distance travelled, based on AtlasTMS GPS data. Warehousing revenue is recognised monthly based on pallet days recorded in AtlasWMS.

## 5. Foreign exchange

All EUR balances are revalued on the **last calendar day** of the month at the Atlas Finance reference rate. Unrealised FX gains and losses are booked in a separate account and commented on in the management report if they exceed 2,000,000 TL.

## 6. Intercompany

Atlas Lojistik GmbH invoices Atlas Lojistik A.Ş. a monthly service fee for sales and customs coordination. The intercompany balances of both entities must match on WD3; differences above 5,000 EUR are investigated the same day by the accounting team and the GmbH controller.

## 7. Controls

| Control | Frequency | Evidence |
|---|---|---|
| Journal entries above 500,000 TL reviewed by a second accountant | Every entry | Approval in AtlasERP |
| Manual journal entries on WD6 and WD7 approved by the Head of Accounting | Every entry | Approval in AtlasERP |
| Balance sheet account reconciliations | Monthly | Signed reconciliation file |
| Suspense account cleared | Monthly | Zero balance at WD7 |

## 8. Reporting package

The WD8 management report includes:

1. P&L by department and by business line (domestic freight, international freight, warehousing),
2. Balance sheet and cash flow,
3. Fleet cost per kilometre and fuel cost per kilometre,
4. Days sales outstanding (DSO) and overdue receivables,
5. Comparison with budget and forecast.

The 2026 target for DSO is **52 days**. In September 2026, DSO was 57 days.

## 9. Year-end

The year-end close follows the same calendar but adds inventory counts of spare parts, a physical count of fleet assets and the audit preparation file. The 2026 year-end close is planned to finish on WD12 of January 2027.

## 10. Contact

Accounting team: muhasebe@atlas-lojistik.test.
