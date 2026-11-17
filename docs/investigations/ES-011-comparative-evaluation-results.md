# ES-011 — Comparative Evaluation Results

- Protocol: `docs/investigations/ES-011-comparative-evaluation-protocol.md`
- Status: **In Progress — collecting data**
- Started: 2026-11-17
- Minimum required: ≥3 events per group before drawing conclusions

---

## How to fill this file

For each compaction event, copy the template below and fill it in.
Observations can be brief — directional signal is sufficient, precision not required.

```
### Event X-N — <date> — <brief session description>

- **M1 Resumption turns:** <number> turns before work effectively resumed
- **M2 Corrections needed:** <number> explicit re-statements of context
- **M3 Key decisions preserved:** Yes / No / Partial — <note if relevant>
- **M4 Files preserved:** Yes / No / Partial — <note if relevant>
- **Notes:** <anything notable about the compaction or summary quality>
```

---

## Group A — Control (`guideEnabled = false`)

> Sessions with the guidance toggle **disabled** (default). `/compact` runs without preservation hints.

<!-- Minimum 3 events required. -->

### Event A-1 — _pending_

_Not yet recorded. Run a session with guidance disabled, trigger /compact, and fill this in._

---

### Event A-2 — _pending_

_Not yet recorded._

---

### Event A-3 — _pending_

_Not yet recorded._

---

## Group B — Treatment (`guideEnabled = true`)

> Sessions with the guidance toggle **enabled** (button `● Active` in the Context Optimizer pane). `/compact` receives the PRESERVATION_TEMPLATE appended to existing instructions.

<!-- Minimum 3 events required. -->

### Event B-1 — _pending_

_Not yet recorded. Enable guidance in the pane, run a session, trigger /compact, and fill this in._

---

### Event B-2 — _pending_

_Not yet recorded._

---

### Event B-3 — _pending_

_Not yet recorded._

---

## Metric Summary Table

> Fill this after ≥3 events per group.

| Metric | Group A avg / typical | Group B avg / typical | Direction | Notes |
|---|---|---|---|---|
| M1 — Resumption turns | — | — | — | |
| M2 — Corrections needed | — | — | — | |
| M3 — Key decisions preserved | — | — | — | |
| M4 — Files preserved | — | — | — | |

---

## Verdict

> Fill this after completing the minimum events.

**Metrics improved in Group B:** _/ 4_

| Outcome | Criteria | Met? |
|---|---|---|
| GO | ≥2 of {M1, M2, M3, M4} improved in Group B | — |
| NO-GO | No improvement after ≥5 events per group | — |
| CONDITIONAL GO | M3 or M4 improved, M1/M2 unchanged | — |

**Conclusion:** _Pending data._

**Next step:** _Pending conclusion._

---

## Session Notes

> Qualitative observations that don't fit the per-event template — summary tone, length, structure, surprising behaviors.

_None yet._
