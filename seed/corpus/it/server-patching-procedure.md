# Server and Endpoint Patching Procedure

Owner: Information Technology · Scope: IT department · Version 2.1 · Effective: 1 February 2026

## 1. Purpose

This procedure defines how Atlas Lojistik IT applies security and stability patches to servers, network devices, endpoints and warehouse handheld terminals. It sets deadlines by severity, defines the maintenance window and describes the change approval and rollback requirements.

## 2. Scope

The procedure covers:

- Windows and Linux servers in the primary data centre (Ümraniye, İstanbul) and the secondary data centre (Ankara),
- Cloud workloads in the Atlas tenant,
- Firewalls, switches and VPN concentrators,
- Employee laptops and desktops,
- Android handheld terminals used with AtlasWMS.

## 3. Patch deadlines by severity

Severity is based on the vendor rating or the CVSS base score, whichever is higher. The deadline starts when the patch is released by the vendor.

| Severity | CVSS score | Deadline for servers and network | Deadline for endpoints |
|---|---|---|---|
| Critical | 9.0 – 10.0 | 72 hours | 5 days |
| High | 7.0 – 8.9 | 14 days | 14 days |
| Medium | 4.0 – 6.9 | 30 days | 30 days |
| Low | 0.1 – 3.9 | 90 days | Next quarterly cycle |

If a critical vulnerability is actively exploited and listed in the threat intelligence feed, the deadline for internet-facing systems is reduced to **24 hours** and an emergency change can be used.

## 4. Maintenance window

The standard maintenance window for production servers is the **third Saturday of each month, 01:00–05:00 TRT**. Warehouse systems (AtlasWMS) are patched in the same window, because warehouse volume is lowest on Saturday night. The 2026 windows are published in the IT change calendar.

During peak season, from 15 November to 31 December, only critical and high patches are applied; other patches wait until the January window.

## 5. Change approval

| Change type | Approval | Lead time |
|---|---|---|
| Standard change (pre-approved monthly patch bundle) | Change Manager | 5 business days |
| Normal change (non-standard patch, firmware) | Change Advisory Board (CAB) | Next CAB meeting |
| Emergency change | Head of Infrastructure and CIO | No lead time |

The Change Advisory Board meets every **Wednesday at 10:00**. Requests must be submitted in the change tool by Monday 17:00 to be discussed in the same week.

## 6. Testing

1. Patches are first applied to the test environment and to a pilot group of 25 IT laptops.
2. The pilot runs for at least 48 hours before production rollout, except for emergency changes.
3. Application owners confirm that AtlasERP, AtlasWMS and AtlasTMS smoke tests pass.

## 7. Rollback

Every normal and emergency change must include a written rollback plan. For servers, a snapshot or backup taken no more than 12 hours before patching is mandatory. If a smoke test fails, the change implementer must start the rollback within 30 minutes and inform the CAB chair.

## 8. Handheld terminals

Android handheld terminals receive operating system updates through the mobile device management platform. Updates are pushed to one warehouse first (Bursa Nilüfer, the smallest site) and to the remaining sites after 3 business days without incidents.

## 9. Reporting

The IT Security team publishes a patch compliance report on the fifth business day of each month. The 2026 target is 98% compliance for servers and 95% for endpoints. In the second quarter of 2026, server compliance was 96.4% and endpoint compliance 93.1%.

Systems that cannot be patched by the deadline require a documented risk exception approved by the CIO, valid for at most 90 days.

## 10. Roles

| Role | Responsibility |
|---|---|
| Infrastructure team | Servers, network, data centres |
| Helpdesk team | Endpoint patch issues reported by users |
| IT Security | Severity assessment, compliance reporting |
| Change Manager | Standard change approval, change calendar |

## 11. Contact

Questions: it-degisiklik@atlas-lojistik.test.
