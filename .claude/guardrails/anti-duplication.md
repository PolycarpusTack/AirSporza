---
name: anti-duplication
level: WARN → BLOCK
source: Clean Code Chapter 12 (G5), DRY Principle
---

# Guardrail: Anti-Duplication

## Purpose
Duplication is the root of all software evil. Every instance of duplicated code
is a missed abstraction. When the logic changes, every copy must change — and
one will be missed. That missed copy is the bug.

## Forms of Duplication to Detect

**Literal duplication:** Identical code blocks in two or more locations.

**Algorithmic duplication:** Same algorithm expressed differently.
Two loops doing the same traversal with different variable names.

**Structural duplication:** Same sequence of method calls in multiple places.
`open(); read(); close();` appearing everywhere — extract a reader.

**Conditional duplication:** Same switch/case or if/else chain in multiple places.
This almost always signals a need for polymorphism.

## WARN Triggers
- Near-identical code blocks (> 5 lines, > 70% similar)
- Same method call sequence appearing in 2+ locations
- Copy-paste with minor variable name changes

## BLOCK Triggers
- Identical switch/case on the same type enum in 3+ locations
  → `🔴 DUPLICATION: This switch belongs in a polymorphic hierarchy.`
- Identical error handling blocks in 5+ locations
  → `🔴 DUPLICATION: Extract to a shared handler.`
- Copy-pasted class with only constants changed
  → `🔴 DUPLICATION: Parameterize the class or use a factory.`

## Response Format
```
⚠️ DUPLICATION DETECTED [WARN / BLOCK]:
   Locations: [file:line, file:line, ...]
   Type:      [LITERAL / ALGORITHMIC / STRUCTURAL / CONDITIONAL]
   Abstraction: [name for the concept these copies represent]
   Extract to: [function / class / pattern]
```

---
name: anti-function-complexity
level: WARN → BLOCK
source: Clean Code Chapter 3
---

# Guardrail: Anti-Function Complexity

## Purpose
Complex functions are the primary hiding place for bugs.
Long functions, many arguments, mixed abstraction levels — all signs of
a function doing more than one thing.

## WARN Triggers
- Function > 20 lines
- Function with 3 arguments
- Function with nested if/for > 2 levels deep
- Function mixing high-level and low-level operations

## BLOCK Triggers
- Function > 40 lines
  → `🔴 TOO LONG: Identify sections. Each section is a function waiting to be extracted.`
- Function with 4+ arguments
  → `🔴 TOO MANY ARGS: Create an argument object.`
- Boolean (flag) argument
  → `🔴 FLAG ARGUMENT: Split into two named functions.`
- Argument used as output (mutated by function)
  → `🔴 OUTPUT ARGUMENT: Return a value. Don't mutate arguments.`
- try/catch mixed with business logic
  → `🔴 MIXED CONCERNS: Extract business logic into a function called from within try.`

## Response Format
```
🔴 FUNCTION COMPLEXITY [WARN / BLOCK]: [function name]
   Issue:    [specific violation]
   Lines:    [n]
   Args:     [n]
   Extract:  [what to pull out and what to name it]
```
