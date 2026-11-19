# Security Incident Postmortem — INC-2026-0412 (VPN Credential Attack)

Classification: Strictly Confidential · Distribution: IT administrators and named incident responders · Author: IT Security · Date: 30 September 2026

Document control number: CANARY-IT-6b07

## 1. Summary

On **3 September 2026** Atlas Lojistik detected a credential-stuffing attack against the legacy VPN web portal. The attacker tried leaked username and password combinations from external breaches. **214 accounts** were targeted and **2 accounts** were successfully compromised. One compromised account belonged to a warehouse shift supervisor, the other to a finance accounting specialist. No customer data was exfiltrated as far as the investigation could determine. The incident was classified as a major incident (severity 2).

## 2. Timeline (all times TRT)

| Time | Event |
|---|---|
| 3 Sep 2026 01:12 | First burst of failed logins on the legacy VPN portal (vpn-old) |
| 3 Sep 2026 01:40 | More than 200 failed logins in 10 minutes; monitoring alert raised |
| 3 Sep 2026 01:52 | Infrastructure on-call engineer acknowledged the page |
| 3 Sep 2026 02:05 | IT Security informed per runbook; device not restarted, logs preserved |
| 3 Sep 2026 02:31 | Two successful logins from foreign IP addresses identified |
| 3 Sep 2026 02:45 | Both accounts disabled; sessions terminated |
| 3 Sep 2026 03:30 | Legacy VPN portal taken offline |
| 3 Sep 2026 09:00 | Incident bridge with CIO; forced password reset for all 214 targeted accounts |
| 4 Sep 2026 18:00 | Forensic review of the two compromised sessions completed |

## 3. Root cause

The legacy VPN portal **vpn-old** had been kept online for 31 handheld-terminal service accounts and a small number of users who had not been migrated to the new VPN with MFA. The portal did **not enforce multi-factor authentication**. It was excluded from the 2026 Q2 access review because it was recorded as "decommissioned" in the asset inventory, although it was still reachable from the internet.

Contributing factors:

1. The two compromised users reused passwords that had appeared in an external breach.
2. Rate limiting on vpn-old allowed 50 attempts per minute per source IP.
3. The asset inventory was not reconciled with the firewall rule base.

## 4. Impact

- The compromised finance account accessed a shared folder with supplier invoice PDFs for 11 minutes. No downloads above 2 MB were recorded.
- The compromised warehouse account had no access beyond the AtlasWMS reporting module and generated two reports.
- No ransomware, no persistence mechanism and no lateral movement were found.
- Estimated direct cost of the response, including external forensic support: **385,000 TL**.

## 5. Corrective actions

| No | Action | Owner | Due date | Status |
|---|---|---|---|---|
| CA-1 | Permanently decommission vpn-old and remove firewall rules | Infrastructure | 10 Sep 2026 | Done |
| CA-2 | Migrate the 31 handheld service accounts to certificate-based authentication | Infrastructure | 15 Oct 2026 | Done |
| CA-3 | Reconcile asset inventory with firewall rules monthly | IT Security | 31 Oct 2026 | Done |
| CA-4 | Enable breached-password screening for all accounts | IT Security | 30 Nov 2026 | In progress |
| CA-5 | Reduce VPN login rate limit to 5 attempts per minute per IP | Infrastructure | 15 Sep 2026 | Done |
| CA-6 | Targeted awareness session for finance and warehouse supervisors | Helpdesk | 31 Oct 2026 | Done |

## 6. Lessons learned

- Systems marked "decommissioned" must be verified as unreachable before they leave the access review scope.
- The on-call runbook worked: preserving logs before restarting the concentrator made the forensic review possible.
- The Helpdesk handled 214 password resets in one morning; a self-service bulk reset flow would reduce load next time.

## 7. Disclosure

Legal assessed that no personal data breach notification to the authority was required, because no personal data was accessed. The decision and its reasoning are documented in the legal file. Internal communication was limited to the affected users and their managers.
