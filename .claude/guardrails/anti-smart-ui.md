---
name: anti-smart-ui
level: CHALLENGE → BLOCK
source: Evans DDD Chapter 4 — The Smart UI Anti-Pattern
---

# Guardrail: Anti-Smart-UI Application of DDD

## Purpose
Detect when DDD and Model-Driven Design are being applied to a system that does not
warrant the investment. DDD is a powerful but expensive approach. Applying it to
simple CRUD systems or small data-entry applications creates overhead without benefit.
Evans is explicit: the Smart UI is a legitimate pattern for simple systems.
The mistake is choosing DDD and then not committing to it — not the Smart UI itself.

## When Smart UI IS the right choice
- Simple, data-dominated application with few business rules
- Short delivery timeline with modest requirements
- Team without advanced object modeling skills and no budget to build them
- Application that will not need to grow significantly

## The mutual exclusivity rule
Smart UI and Model-Driven Design are mutually exclusive paths.
You cannot start with Smart UI and gradually add a domain model.
If DDD is the right path, it must be committed to from the first iteration.
Hedging — using a flexible language but no real domain model — produces the worst outcome:
the cost of both approaches with the benefits of neither.

## CHALLENGE Triggers
- DDD being applied to a system described as "simple CRUD" or "data entry focused"
- Team is committing to layered architecture without the skill to sustain it
- Requirements are simple and stable with no expected complexity growth

## BLOCK Triggers
- System has no business rules beyond validation — domain layer would be empty
  → `🔴 DDD OVERKILL: This system has no domain logic to express. Use a simpler approach.`
- Team is hedging: "We'll add the domain model later" while using a flexible framework
  → `🔴 FALSE HEDGE: Smart UI and DDD are mutually exclusive. Commit or choose the other path.`

## Response Format
```
🟠 SMART UI CHALLENGE: Is DDD the right choice for this system?
   System description: [what it does]
   Business rules present: [YES count / NO]
   Complexity expected: [HIGH / MEDIUM / LOW]
   
   If LOW/NONE: Consider the Smart UI. It will deliver faster with less overhead.
   If MEDIUM/HIGH: DDD is appropriate — but commit fully from the first iteration.
   
   The half-DDD project is the worst outcome: overhead of DDD, benefits of neither.
```

---
name: anti-false-cognate
level: WARN → BLOCK
source: Evans DDD Chapter 14 — Maintaining Model Integrity
---

# Guardrail: Anti-False-Cognate / Model Fragmentation

## Purpose
Detect false cognates — the most insidiously harmful form of model fragmentation.
A false cognate occurs when two teams or two parts of the codebase use the same term
for slightly different concepts. Unlike duplicate concepts (which are visible), false
cognates are invisible: everyone believes they are talking about the same thing.
They surface later as mysterious bugs, data corruption, and confused collaboration.

## Examples of False Cognates
- "Customer" meaning a retail buyer in one context and an enterprise account in another
- "Charge" meaning a billable expense in billing and a payment charge in settlement
- "Order" meaning a purchase order in procurement and a sales order in fulfillment
- "Account" meaning a user login account in auth and a financial account in billing

## WARN Triggers
- Same class name used in two Bounded Contexts with slightly different behavior
- Domain experts from different areas use the same term but can't agree on its definition
- A class modified by one team breaks code in another team that "shouldn't have changed"
- Integration between two contexts requires zero translation (suspicious — check for false cognates)

## BLOCK Triggers
- The same term appears in two contexts with different invariants
  → `🔴 FALSE COGNATE RISK: [term] has different meanings in [context A] and [context B].`
    These must be given distinct names in each context and translated explicitly at the boundary.
- A shared class is being modified by two teams without a Shared Kernel agreement
  → `🔴 IMPLICIT SHARING: Establish explicit Bounded Context boundary and translation or Shared Kernel.`

## Response Format
```
🔴 FALSE COGNATE DETECTED: "[term]"
   Context A: "[how Context A defines it]"
   Context B: "[how Context B defines it]"
   Risk:      Data corruption when assumptions from one context bleed into the other
   Resolution:
     Option 1: Rename — give each context its own term
       Context A: "[new name A]"
       Context B: "[new name B]"
     Option 2: Shared Kernel — explicit agreement, joint tests, coordinated changes
     Option 3: Translation layer — ACL at the boundary, each context owns its definition
```

---
name: anti-core-domain-neglect
level: WARN → BLOCK
source: Evans DDD Chapter 15 — Distillation
---

# Guardrail: Anti-Core-Domain-Neglect

## Purpose
Detect the talent trap Evans names explicitly: senior developers assigned to Generic Subdomains
and infrastructure while the Core Domain is implemented by less experienced developers without
conceptual guidance. This produces technically competent infrastructure with a hollow, procedural
Core — the opposite of what DDD should produce.

## Signs of Core Domain Neglect

**Code signals:**
- Core Domain classes are thin data containers with no behavior (Anemic)
- Core Domain has no Ubiquitous Language — method names are generic CRUD verbs
- Complex business rules live in Application Services, not in Core Domain objects
- Core Domain has no dedicated unit tests — only integration tests
- Core Domain code is harder to read than the infrastructure code

**Team signals:**
- "The domain experts don't look at the code" — they can't, because it's unreadable
- Best developers are assigned to the ORM framework, messaging infrastructure, or APIs
- Sprint reviews focus on technical features, not domain capabilities
- New team members learn the infrastructure first, the domain never

## WARN Triggers
- Senior/lead developers primarily working on infrastructure for more than one sprint
- Core Domain has no Domain Vision Statement or Highlighted Core artifact
- Domain experts haven't reviewed domain model in > 2 weeks

## BLOCK Triggers
- All domain-related tickets assigned to junior developers with no senior pairing
  → `🔴 CORE NEGLECT: Core Domain work requires senior involvement. Reassign.`
- Core Domain classes have been untouched for 2+ sprints while infrastructure grows
  → `🔴 CORE STAGNATION: Infrastructure investment without matching Core Domain depth.`
- No domain expert has been consulted on Core Domain design decisions in > 1 sprint
  → `🔴 KNOWLEDGE GAP: Core Domain evolving without domain expert input.`

## Response Format
```
🔴 CORE DOMAIN NEGLECT: [specific signal]
   What is happening: [description of the neglect pattern]
   What is at risk:   "The Core Domain will remain shallow and procedural.
                       The application will never do anything truly compelling
                       for domain experts, regardless of technical quality."
   Required action:
     1. Assign [senior developer] to Core Domain work this sprint
     2. Schedule domain expert session on [specific Core concept]
     3. Create/update Domain Vision Statement before next planning session
     4. Identify one Core Domain concept for deep modeling this iteration
```
