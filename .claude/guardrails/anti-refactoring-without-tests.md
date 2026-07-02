---
name: anti-refactoring-without-tests
level: WARN → BLOCK
source: Fowler Refactoring Ch. 2 — Testing
---

# Guardrail: Anti-Refactoring-Without-Tests

## Purpose
Prevent refactoring of code that has no self-checking test suite.
Refactoring without tests is not refactoring — it is restructuring with hope.
The test suite is what makes each small step safe. Without it, the steps aren't safe.

## The Core Rule
"Before you start refactoring, make sure you have a solid suite of tests.
These tests must be self-checking." — Fowler

## WARN Triggers
- Refactoring proposed on code with < 40% coverage
- No tests run after a structural change is described
- Refactoring spans multiple files but only smoke-tested manually

## BLOCK Triggers
- Proposing structural refactoring on code with zero test coverage
  → `🔴 NO TESTS: Cannot safely refactor without a self-checking test suite.`
     Action: Write characterization tests first. Use @agent-legacy-code-strategist.
- Large refactoring without intermediate test runs
  → `🔴 UNSAFE STEPS: Each step must be tested before the next.`

## The Legacy Code Exception
When code cannot be tested without first refactoring, use the seam approach:
1. Apply targeted, automated refactorings only (rename, extract — no logic changes)
2. Build characterization tests via the newly accessible seam
3. Verify characterization tests pass
4. Proceed with refactoring under test coverage

## Response Format
```
🔴 REFACTORING WITHOUT TESTS: [specific location]
   Coverage:    [current coverage estimate]
   Risk:        "Each step without a test is a potential silent bug introduction."
   First step:  Write characterization tests for [specific behaviors to lock in]
   Resource:    @agent-legacy-code-strategist for seam identification
```

---
name: anti-speculative-optimization
level: WARN → BLOCK
source: Fowler Refactoring Ch. 2 — Performance
---

# Guardrail: Anti-Speculative-Optimization

## Purpose
Prevent performance optimization without profiling evidence.
The constant-attention approach to performance is the second approach described by Fowler —
and he explicitly says it doesn't work.
Performance improvements require measurement. Intuition about hot spots is reliably wrong.

## The Lesson (Ron Jeffries' story)
A team speculated extensively about what was slow in their payroll system.
They sketched architectural improvements.
The profiler revealed the actual cause: excessive Date object creation.
The fix took 5 minutes. None of the speculated causes were real.

## WARN Triggers
- "This might be slow" without profiling evidence
- Performance optimization proposed as part of a refactoring
- Loop optimization "just in case" with no measured baseline
- Caching added for a query that hasn't been profiled

## BLOCK Triggers
- Structural changes justified primarily by performance intuition
  → `🔴 SPECULATIVE OPTIMIZATION: Profile first, then optimize the measured hot spot.`
- "We should make this faster" without performance data
  → `⚠️ PROFILE FIRST: Measure before optimizing. You will be wrong about where the bottleneck is.`

## The Correct Performance Workflow
1. Build well-factored code (fast to understand)
2. When performance is a concern: profile
3. Find the actual hot spot (it will surprise you)
4. Optimize only that hot spot
5. Verify improvement with profiler
6. If well-factored code makes optimization harder: targeted reversal of that refactoring is acceptable

## Response Format
```
⚠️ SPECULATIVE OPTIMIZATION: [proposed change]
   Evidence:  [none / weak / strong]
   Rule:      "The secret to fast software is to write tunable software first."
   Action:    Profile first. Then optimize the measured bottleneck.
              Profiler command: [suggest appropriate profiling tool]
```

---
name: anti-big-bang-refactoring
level: WARN → BLOCK
source: Fowler Refactoring Ch. 2 — Process
---

# Guardrail: Anti-Big-Bang Refactoring

## Purpose
Prevent large, multi-day refactoring efforts that break the system's working state
for extended periods. Refactoring must keep the system working at all times.

## The Core Rule
"If someone says their code was broken for a couple of days while they are refactoring,
you can be pretty sure they were not refactoring." — Fowler

## What Makes Refactoring Safe
- Each individual step is small enough to complete without breaking anything
- Tests pass after every step
- The system is always in a deployable state
- If something goes wrong, you can revert to the last working commit

## WARN Triggers
- Refactoring plan with no intermediate test runs described
- "I'll refactor this whole module this week" without a step-by-step plan
- PR that touches 50+ files described as "refactoring"
- No commit strategy for a complex structural change

## BLOCK Triggers
- Described as "the system will be broken for 2+ days while we refactor"
  → `🔴 BIG-BANG REFACTORING: The system must remain working at each step.`
  Strategy: Use Branch By Abstraction or Strangler Fig instead.
- Renaming a widely-used function without a migration path
  → `🔴 BREAKING CHANGE: Retain old name as pass-through; migrate callers gradually.`

## The Safe Alternatives for Large Changes

**Branch By Abstraction:**
1. Create an abstraction layer over the thing being changed
2. Route all existing code through the abstraction
3. Build the new implementation behind the abstraction
4. Migrate incrementally
5. Remove the old implementation

**Strangler Fig:**
1. Build the replacement piece alongside the original
2. Route new callers to the replacement
3. Gradually migrate old callers
4. Delete the original when fully migrated

**Parallel Change (Expand-Contract):**
1. Add the new structure alongside the old
2. Transition callers to the new structure
3. Remove the old structure

## Response Format
```
🔴 BIG-BANG REFACTORING: [proposed change]
   Duration:  [estimated time code will be broken]
   Risk:      "Cannot deploy; cannot get feedback; hard to debug when broken."
   Strategy:  [Branch By Abstraction / Strangler Fig / Parallel Change]
   First safe step: [smallest increment that keeps everything working]
```
