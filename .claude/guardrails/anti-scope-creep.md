# Guardrail: Anti-Scope Creep
## Level: 🟠 CHALLENGE → 🔴 BLOCK

## Purpose
Detect, name, and stop scope additions that are absorbed silently into existing
work without re-estimation or stakeholder acknowledgment. Scope creep is not
growth — it is planning failure made invisible.

---

## Trigger Conditions

### 🟠 CHALLENGE — Scope Expansion Signal
Activate when:
- A "small addition" is mentioned mid-task
- "While we're in there, we should also..." language appears
- A requirement is described that wasn't in the original story
- A new edge case is discovered that expands the solution surface
- A PR grows significantly beyond the described scope of the ticket

### 🔴 BLOCK — Confirmed Scope Creep
Activate when:
- A new feature is added to a story without acknowledgment
- Acceptance criteria are expanded after estimation
- A "quick addition" is described that requires touching new components
- The original estimate is being asked to cover additional work
- Multiple "small" additions are accumulating on a single ticket

---

## Response Protocol

### On CHALLENGE:
```
🟠 SCOPE EXPANSION DETECTED

The following appears to be outside the original scope:
  "[new requirement or addition]"

Original scope (as I understand it): [summary]
New element: [what's being added]

Before proceeding, let me verify:
1. Is this actually part of the original requirement, or a new one?
2. If new: has this been discussed with the stakeholder?
3. Does the original estimate still hold with this included?
4. Does the Definition of Done need updating?

This is not a refusal — it is a checkpoint.
Scope absorbed silently makes planning impossible.
```

### On BLOCK:
```
🔴 SCOPE CREEP — STOPPING

"[new requirement]" is a new requirement. It is not part of [original story/ticket].

I will not absorb this into the current work silently. Here is why:
  - The original estimate does not cover this
  - Shipping this without acknowledgment makes the velocity fictitious
  - If this is important, it deserves its own story and acceptance criteria
  - If it isn't important enough for its own story, it may not be needed

Required before I proceed:
  [ ] Acknowledge this as a scope change
  [ ] Create a new ticket OR explicitly amend the current one
  [ ] Re-estimate the amended scope (use @EstimationAgent)
  [ ] Update the Definition of Done
  [ ] Inform the relevant stakeholder that scope has changed

If you want to proceed with the original scope only:
  I will note the new requirement as a candidate for the next sprint.
```

---

## Scope Change Classification

| Type | Treatment |
|---|---|
| **Bug fix in related code** | Acceptable in same PR if small; note in PR description |
| **Refactoring while touching** | Acceptable if covered by tests; note in PR description |
| **New edge case in existing feature** | Acceptable if in original acceptance criteria; otherwise new ticket |
| **New feature request** | Always new ticket with separate estimate |
| **Requirement clarification** | Acceptable; update acceptance criteria explicitly |
| **Requirement expansion** | Always re-estimate; stakeholder acknowledgment required |
| **"Nice to have" addition** | Always new ticket; never absorb silently |

---

## Scope Creep Patterns

### The "While We're In There"
```
Pattern:  "While we're touching this component, we should also add X."
Problem:  X was not estimated. X may be larger than the original work.
Response: "X goes in a new ticket. What's the priority relative to current work?"
```

### The Expanding Acceptance Criterion
```
Pattern:  Acceptance criterion is rewritten mid-sprint to include more behavior.
Problem:  Work already estimated against the original criterion.
Response: "New criterion = new scope. Re-estimate required. Update stakeholders."
```

### The Silent Descope
```
Pattern:  A requirement is quietly dropped to hit the deadline.
          Then claimed as "done" at sprint review.
Problem:  Stakeholders believe they received what they asked for.
Response: "Dropped scope must be explicitly acknowledged in the sprint review.
          A new ticket must be created. Velocity is not improved — work was deferred."
```

### The Assumption Scope
```
Pattern:  Developer assumes a related feature is also needed and builds it.
Problem:  Unrequested features ship with untested edge cases and no acceptance criteria.
Response: "Build what was asked for. Suggest the addition in the retro or backlog.
          Never ship unrequested scope, however good the intention."
```

### The Discovered Requirement
```
Pattern:  Midway through implementation, a new requirement is discovered
          that must exist for the feature to make sense.
Problem:  This is real — requirements are incomplete. But it needs visibility.
Response: "Surface this to the stakeholder now. Get explicit direction.
          Do not assume and proceed. Document the discovery in the ticket."
```

---

## Scope Creep Detection Signals in Code

Flag these in code review as potential absorbed scope:

- Functions not referenced by any test for the stated feature
- New database columns not in the original schema design
- New API endpoints not in the original specification
- New UI components not mentioned in the requirements
- New dependencies added without discussion
- New configuration keys for unspecified behavior
- "Bonus" refactoring in a feature PR that wasn't a stated goal

---

## Sprint-Level Scope Health Check

At sprint mid-point, evaluate:

```
SPRINT SCOPE HEALTH CHECK
=========================
Sprint goal:           [original goal]
Current status:        [what's actually being built]

Scope additions since sprint start:
  [List any additions with originator and date]

Additions acknowledged by stakeholder: [n of n]
Additions re-estimated:                [n of n]
Additions with new acceptance criteria:[n of n]

VERDICT:
  🟢 CLEAN   — No additions, or all additions properly acknowledged
  🟡 MONITOR — 1-2 additions, partially acknowledged
  🔴 DERAILED — Unacknowledged additions threatening sprint goal

RECOMMENDATION:
  [Remove additions / acknowledge formally / renegotiate sprint goal]
```
