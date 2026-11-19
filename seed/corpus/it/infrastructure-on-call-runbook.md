# Infrastructure On-Call Runbook

Owner: IT Infrastructure team · Scope: IT Infrastructure team · Version 4.2 · Last updated: 7 September 2026

## 1. Purpose

This runbook tells the on-call engineer of the Infrastructure team what to do when paged outside business hours. It covers the rota, acknowledgement and escalation times, first-response steps for the most common alerts and the failover decision.

## 2. On-call rota

- The on-call week runs from **Monday 09:00 to the following Monday 09:00**.
- Handover takes place in the Monday 09:00 infrastructure stand-up. The outgoing engineer documents open incidents in the handover note.
- There is always a **primary** and a **secondary** on-call engineer. The secondary is the primary of the previous week.
- Swaps are allowed if they are entered in the on-call calendar at least 48 hours in advance.

### 2.1 On-call compensation

| Item | Amount |
|---|---|
| On-call allowance (primary) | 2,750 TL per week |
| On-call allowance (secondary) | 1,250 TL per week |
| Call-out work outside business hours | Paid as overtime, minimum 1 hour per call-out |
| Compensatory rest after a night call-out longer than 2 hours | Start work 4 hours later the next day |

## 3. Acknowledgement and escalation

| Step | Time limit |
|---|---|
| Primary acknowledges the page | 10 minutes |
| Automatic escalation to secondary if not acknowledged | After 20 minutes |
| Escalation to the Head of Infrastructure | After 40 minutes, or immediately for P1 with site-wide impact |
| Escalation to the CIO | P1 not resolved after 2 hours |

The incident bridge is opened in Teams by the primary engineer for every P1. Business stakeholders are informed through the Helpdesk duty manager.

## 4. First-response playbooks

### 4.1 AtlasWMS unreachable at a warehouse

1. Check whether the problem affects one warehouse or all. Look at the WMS health dashboard.
2. If one warehouse: check the site WAN link and the local switch stack. Each warehouse has a 4G backup router that should take over within 5 minutes.
3. If all warehouses: check the WMS application servers and the database cluster in the Ümraniye data centre.
4. If WMS cannot be restored within 60 minutes, call the Head of Infrastructure to discuss failover.

### 4.2 VPN concentrator alarms

1. Check the number of concurrent sessions; the licence limit is 1,200 sessions.
2. Check for unusual login failure rates. More than 200 failed logins in 10 minutes is treated as a possible credential attack: inform IT Security immediately and do not restart the device before evidence is collected.
3. If the primary concentrator fails, traffic moves automatically to the standby unit in Ankara.

### 4.3 Backup job failure

Tier 1 backup failures at night are re-run once by the on-call engineer. If the re-run fails, the engineer documents the error and hands it over to the backup operator group at 08:00.

### 4.4 Data centre power or cooling alarm

Call the facility security desk at the Ümraniye data centre (extension 3911) and follow the facility procedure. If the room temperature exceeds 32 °C, start a controlled shutdown of non-critical test systems.

## 5. Failover decision

Failover of Tier 1 systems to the Ankara secondary data centre is a disaster recovery decision. It can only be authorised by the CIO or the Head of Infrastructure, in line with the Backup and Disaster Recovery Policy. The on-call engineer prepares the failover checklist but never starts a failover alone.

## 6. Tools and access

| Tool | Purpose |
|---|---|
| Paging app | Receives alerts, acknowledgement |
| Monitoring dashboard | Health of servers, network and applications |
| Privileged access tool | Admin sessions, recorded |
| Runbook wiki | Detailed procedures per system |

On-call engineers must have a valid privileged admin account. Privileged access is granted for at most 90 days and must be renewed before the on-call week starts.

## 7. After the incident

For every P1 and every P2 that lasted more than 4 hours, the primary engineer writes an incident report within 2 business days. Major incidents receive a full postmortem led by the Head of Infrastructure.

## 8. Contact

Infrastructure team lead: altyapi@atlas-lojistik.test.
