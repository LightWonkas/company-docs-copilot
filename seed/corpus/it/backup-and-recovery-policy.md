# Backup and Disaster Recovery Policy

Owner: Information Technology · Scope: IT department · Version 1.6 · Effective: 1 January 2026

## 1. Purpose

This policy defines how Atlas Lojistik backs up business data and restores critical systems after an outage or disaster. It sets recovery objectives for each system, retention periods, storage locations and testing requirements.

## 2. Definitions

- **RPO (Recovery Point Objective):** the maximum acceptable amount of data loss, measured in time.
- **RTO (Recovery Time Objective):** the maximum acceptable time to restore a service after a disruption.
- **Primary data centre:** Ümraniye, İstanbul.
- **Secondary data centre:** Ankara, at least 350 km from the primary site.

## 3. Recovery objectives by system

| System | Business criticality | RPO | RTO |
|---|---|---|---|
| AtlasWMS (warehouse management) | Tier 1 | 15 minutes | 2 hours |
| AtlasERP (finance, purchasing, payroll) | Tier 1 | 15 minutes | 4 hours |
| AtlasTMS (transport planning) | Tier 1 | 1 hour | 4 hours |
| AtlasCRM | Tier 2 | 4 hours | 12 hours |
| E-mail and Teams | Tier 2 | 24 hours | 8 hours |
| HRportal | Tier 2 | 24 hours | 24 hours |
| File shares | Tier 3 | 24 hours | 24 hours |
| Intranet | Tier 3 | 24 hours | 48 hours |

AtlasWMS has the shortest RTO because every hour of warehouse downtime delays an average of 1,900 order lines across the six warehouses.

## 4. Backup methods

1. **Tier 1 databases** use continuous log shipping to the secondary data centre and a full backup every night at 23:00.
2. **Tier 2 and Tier 3 systems** receive a nightly incremental backup and a weekly full backup on Sunday at 02:00.
3. **Cloud workloads** are backed up with the cloud provider's native snapshot service, copied every night to an Atlas-controlled storage account.

All backups follow the **3-2-1 rule**: three copies of the data, on two different media, with one copy off-site. The off-site copy is stored in the Ankara data centre and in an immutable object storage bucket that cannot be modified or deleted for 35 days.

## 5. Retention

| Backup type | Retention |
|---|---|
| Daily backups | 35 days |
| Weekly full backups | 13 weeks |
| Monthly backups (first Sunday of the month) | 13 months |
| Yearly backups (first Sunday of January) | 7 years |

Finance and payroll data are kept for 10 years in the archive system in addition to the yearly backups, to meet legal retention requirements.

## 6. Encryption and access

Backups are encrypted with AES-256 at rest and in transit. Encryption keys are stored in the key management service, separate from the backup storage. Only members of the backup operator group in the Infrastructure team can start restores; restore requests from other teams are submitted through the Helpdesk and approved by the system owner.

## 7. Restore testing

| Test | Frequency | Scope |
|---|---|---|
| File restore test | Monthly | 10 random files from file shares |
| Database restore test | Quarterly | One Tier 1 database, rotating |
| Full disaster recovery exercise | Twice a year (April and October) | Fail over AtlasWMS and AtlasERP to Ankara |

The October 2026 disaster recovery exercise restored AtlasWMS in 1 hour 40 minutes and AtlasERP in 3 hours 15 minutes, both within their RTO.

## 8. Disaster declaration

A disaster can be declared only by the CIO or, if the CIO is unavailable, by the Head of Infrastructure. After the declaration, the Infrastructure on-call team follows the failover runbook. Business departments are informed through the crisis communication group within 30 minutes of the declaration.

## 9. Monitoring

Backup jobs are monitored every morning at 08:00. Failed Tier 1 backup jobs must be re-run and documented on the same day. Two consecutive failures of the same Tier 1 job are reported to the CIO.

## 10. Contact

Questions: altyapi@atlas-lojistik.test.
