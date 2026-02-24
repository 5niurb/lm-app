# Research: The Longform Guide to Everything Claude Code
**Source:** affaanmustafa (Anthropic hackathon winner)
**Primary Repo:** https://github.com/affaan-m/everything-claude-code
**Longform guide:** https://x.com/affaanmustafa/status/2014040193557471352
**Shortform guide:** https://x.com/affaanmustafa/status/2012378465664745795

---

## Answer

A battle-tested collection of 13 agents, 43 skills, 31 commands, and hook configurations evolved over 10+ months of daily production use. The core philosophy: token economics first, reusable patterns compound over time, and the minimum viable parallelization wins over arbitrary terminal proliferation.

---

## Key Findings

### 1. MCP Optimization — Replace MCPs with CLI-Wrapped Skills

**Finding:** MCPs for GitHub, Supabase, Vercel, Railway consume context window tokens with every enabled MCP. Lazy loading helps with window but not cost.

**Recommendation:** Replace always-on MCPs with CLI-wrapped commands/skills:
- Instead of GitHub MCP: create a `/gh-pr` command wrapping `gh pr create`
- Instead of Supabase MCP: create skills using Supabase CLI directly

**Limits to enforce:**
- Under 10 MCPs enabled per project
- Under 80 active tools total
- Use `disabledMcpServers` in project `.claude/settings.json` for unused services

---

### 2. Memory and Context Persistence — The Three-Hook Pattern

**Finding:** Most people don't use the PreCompact, Stop, and SessionStart hooks for memory persistence.

**Pattern:**
```
PreCompact Hook  → save important state to file before compaction
Stop Hook        → persist session learnings on session end (NOT UserPromptSubmit)
SessionStart Hook → load previous context automatically on new session
```

**Session file format** (save to `.claude/<date>.tmp`):
- What approaches worked (with verifiable evidence)
- Which approaches failed and why
- What remains untested and still needs to be done

**Key:** Create a NEW file each day to avoid polluting old context into fresh sessions.

**Why Stop Hook over UserPromptSubmit:**
UserPromptSubmit fires on EVERY message — adds latency to every prompt. Stop fires once at session end — lightweight, no active-session penalty.

**Repo path:** `github.com/affaan-m/everything-claude-code/tree/main/hooks/memory-persistence`

---

### 3. Dynamic System Prompt Injection — Role-Based Context Loading

**Finding:** Loading everything into CLAUDE.md every session is wasteful. System prompts have higher authority than user messages, which outweigh tool results.

**Pattern:**
```bash
claude --system-prompt "$(cat memory.md)"
```

**Practical aliases for different work modes:**
```bash
alias claude-dev='claude --system-prompt "$(cat ~/.claude/contexts/dev.md)"'
alias claude-review='claude --system-prompt "$(cat ~/.claude/contexts/review.md)"'
alias claude-research='claude --system-prompt "$(cat ~/.claude/contexts/research.md)"'
```

**Why this matters:** Load surgical, role-specific context rather than one monolithic file for every session.

---

### 4. Model Selection Framework — Default to Sonnet, Not Opus

**Finding:** 90% of coding tasks should use Sonnet. Opus is reserved for specific cases.

| Task | Model | Rationale |
|------|-------|-----------|
| Exploration/file search | Haiku | Fast, cheap, adequate |
| Simple single-file edits | Haiku | Clear instructions |
| Multi-file implementation | Sonnet | Best balance |
| Complex architecture | Opus | Deep reasoning needed |
| PR reviews | Sonnet | Contextual, catches nuance |
| Security analysis | Opus | Cannot miss vulnerabilities |
| Documentation | Haiku | Structure is simple |
| Complex debugging | Opus | Needs full system context |

**Settings to add to `~/.claude/settings.json`:**
```json
{
  "model": "sonnet",
  "env": {
    "MAX_THINKING_TOKENS": "10000",
    "CLAUDE_AUTOCOMPACT_PCT_OVERRIDE": "50",
    "CLAUDE_CODE_SUBAGENT_MODEL": "haiku"
  }
}
```

**Cost impact:**
- Sonnet vs Opus: ~60% cost reduction
- Thinking tokens 31,999 → 10,000: ~70% hidden thinking cost reduction
- Auto-compact 95% → 50%: earlier compaction, better long-session quality

---

### 5. Token Optimization — mgrep Over grep

**Finding:** Replace grep/ripgrep with `mgrep` for ~50% average token reduction.

**Benchmark:** In a 50-task test, mgrep + Claude Code used ~2x fewer tokens than grep-based workflows at similar or better quality.

**Source:** https://github.com/mixedbread-ai/mgrep

---

### 6. Strategic Compaction — Manual Over Automatic

**Finding:** Auto-compaction triggers arbitrarily, often mid-task. Manual compaction at logical boundaries preserves the right context.

**When to compact:**
- After research/exploration, before implementation
- After completing a milestone, before the next
- After a debugging session, before continuing features
- After failed approaches, before trying alternatives

**When NOT to compact:**
- Mid-implementation — loses variable names, file paths, partial state

**How to implement:**
- Disable `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` or set to 50%
- Create a `/strategic-compact` skill that triggers at logical boundaries
- The `suggest-compact.js` hook monitors tool usage and suggests at 50 calls (default), then every 25 calls

**What survives compaction:** CLAUDE.md instructions, TodoWrite tasks, memory files, git state.
**What is lost:** intermediate reasoning, previously-read file contents, conversation history, tool call history.

---

### 7. Verification Loop — Six-Phase Quality Gate

**Pattern:** Run after feature completion, major refactoring, or before PRs.

```
Phase 1: Build Verification    — npm/pnpm build
Phase 2: Type Check            — tsc or pyright
Phase 3: Lint Check            — project linter
Phase 4: Test Suite            — 80% coverage minimum
Phase 5: Security Scan         — hardcoded secrets, console.log
Phase 6: Diff Review           — unintended changes, missing error handling
```

**Continuous mode:** Run every 15 minutes or after substantial code segments.

---

### 8. Eval Metrics — pass@k vs pass^k

**Finding:** Two different reliability metrics serve different goals.

```
pass@k: At least ONE of k attempts succeeds
  k=1: 70%  k=3: 91%  k=5: 97%

pass^k: ALL k attempts must succeed
  k=1: 70%  k=3: 34%  k=5: 17%
```

**Use pass@k** when functionality is the goal (does it work at all).
**Use pass^k** when consistency is essential (does it always work correctly).

---

### 9. Sequential Phase Orchestration — The Five-Phase Agent Pipeline

**Finding:** A sequential handoff pattern prevents agents from working with incomplete information.

```
Phase 1: RESEARCH  → Explore agent  → research-summary.md
Phase 2: PLAN      → Planner agent  → plan.md
Phase 3: IMPLEMENT → TDD-guide agent → code changes
Phase 4: REVIEW    → Code-reviewer  → review-comments.md
Phase 5: VERIFY    → Build-error-resolver (if needed) → done or loop back
```

**Rules:**
1. Each agent gets ONE clear input, produces ONE clear output
2. Outputs become the input for the next phase
3. Never skip phases
4. Use `/clear` between agents
5. Store all intermediate outputs as files

**The sub-agent context problem:** Sub-agents know the literal query but not the PURPOSE. Pass objective context alongside the query. Use the iterative retrieval pattern: evaluate the return, ask follow-up questions, loop max 3 cycles before accepting.

---

### 10. Parallelization — Minimum Viable, Not Maximum

**Finding:** The goal is maximum output with minimum viable parallelization. Arbitrary terminal proliferation (e.g., "run 10 instances") is counterproductive.

**Pattern for parallel work:**
- Main chat: code changes only
- Forks: codebase questions, external service research, documentation

**Git worktrees for truly parallel feature work:**
```bash
git worktree add ../project-feature-a feature-a
git worktree add ../project-feature-b feature-b
cd ../project-feature-a && claude
```

**The Cascade Method:**
- Open new tasks in tabs to the right
- Sweep left to right (oldest to newest)
- Focus on 3-4 tasks maximum simultaneously
- Name all chats with `/rename <name>`

---

### 11. Two-Instance Kickoff Pattern for New Projects

**Finding:** Start any new project with exactly two Claude instances running simultaneously.

**Instance 1 (Scaffolding Agent):**
- Creates project structure
- Sets up foundational configs (CLAUDE.md, rules, agents)

**Instance 2 (Deep Research Agent):**
- Connects to services and web search
- Creates detailed PRD
- Creates architecture diagrams
- Compiles referenced documentation with actual doc clips

**llms.txt trick:** Many documentation sites expose an LLM-optimized version at `/llms.txt` — use this instead of scraping the full docs site.

---

### 12. Continuous Learning v2 — The Instinct System

**Finding:** v1 used Stop hooks to extract patterns at session end. v2 uses PreToolUse/PostToolUse for real-time observation, producing atomic "instincts" instead of full skills.

**Architecture:**
```
Session → PreToolUse/PostToolUse hooks capture prompts + tool calls
       → JSONL storage of observations
       → Observer agent (Haiku model, background) detects patterns
       → Creates/updates instincts with confidence scores
       → /evolve command clusters instincts into skills/commands/agents
```

**Confidence scoring (0.3-0.9):**
- 0.7+: Auto-applied behavior
- 0.3: Suggestive, not enforced
- Scores increase with repeated observation and user validation
- Scores decrease when users correct behaviors

**Commands:**
```bash
/instinct-status    # Show learned patterns with confidence scores
/instinct-import    # Import patterns from other projects
/instinct-export    # Export your patterns for sharing
/evolve             # Cluster instincts into generalized skills
/skill-create       # Generate skill from git history
```

---

### 13. Rules Architecture — Hierarchical Modular Design

**Structure:**
```
~/.claude/rules/
  common/           # Always install — applies to all languages
    coding-style.md
    git-workflow.md
    testing.md       # 80% coverage mandate
    performance.md   # model selection, context management
    patterns.md      # design patterns, skeleton projects
    hooks.md         # hook architecture, TodoWrite pattern
    agents.md        # delegation criteria
    security.md      # mandatory security checks
  typescript/        # Add only if using TS/JS
  python/            # Add only if using Python
  golang/            # Add only if using Go
```

**Coding style mandates:**
- Files: 200-400 lines typical, 800 lines absolute maximum
- Functions: 50 lines maximum
- Nesting: 4 levels maximum
- Immutability: always create new objects, never mutate
- Error handling: always handle at every level, never silently ignore

---

### 14. Hooks Architecture — The Full Hook Reference

**Hook types and when they fire:**
```
PreToolUse     → Before tool execution (validation, blocking, parameter mod)
PostToolUse    → After tool execution (formatting, type checks, logging)
Stop           → When Claude's response ends (lightweight session-end work)
PreCompact     → Before context compaction (state preservation)
SessionStart   → New session begins (context loading)
SessionEnd     → Session terminates (full persistence)
UserPromptSubmit → Every message (AVOID for heavy work — adds latency)
```

**Production hook examples from hooks.json:**

PreToolUse:
- Block dev servers outside tmux (bash matcher)
- Suggest tmux for long-running commands (install, test, build, docker)
- Remind to review changes before git push (bash matcher)
- Block unnecessary .md file creation outside designated directories

PostToolUse:
- Auto-format JS/TS files via Prettier (edit matcher)
- Run TypeScript type checking (edit matcher)
- Warn about console.log statements (edit matcher)
- Log PR URLs and suggest review commands after PR creation

Stop:
- Check for console.log in modified files

**CRITICAL:** Do NOT add a `"hooks"` field to `.claude-plugin/plugin.json`. Claude Code v2.1+ auto-loads `hooks/hooks.json` from installed plugins. Explicit declaration causes duplicate detection errors (issues #29, #52, #103).

---

### 15. Plugin System — Bundle and Install

**Installation:**
```bash
/plugin marketplace add affaan-m/everything-claude-code
/plugin install everything-claude-code@everything-claude-code
```

**Plugin architecture:**
A plugin bundles skills + MCPs + tools. LSP plugins give real-time type checking and go-to-definition. The author's active plugins: typescript-lsp, pyright-lsp, hookify (conversational hook creation), mgrep.

**Minimum Claude Code CLI version: v2.1.0** (for auto-loading hooks.json from plugins)

---

### 16. AgentShield — Built-in Security Auditor

**Three modes:**
```bash
npx ecc-agentshield scan              # Quick scan, 14 secret patterns
npx ecc-agentshield scan --fix        # Auto-fix mode
npx ecc-agentshield scan --opus       # Red-team/blue-team/auditor pipeline (Opus 4.6)
```

**The --opus pipeline:** Attacker agent finds exploit chains → defender evaluates protections → auditor synthesizes prioritized report.

**Scanning coverage:** Secrets (14 patterns), permissions, hook injection, MCP server risk, agent config.

**Output:** Terminal (A-F grade), JSON (CI integration), Markdown, HTML. Exit code 2 = critical finding for build gates.

---

### 17. The Benchmarking Workflow

**How to evaluate whether a skill actually helps:**
1. Fork the conversation
2. In one fork: run task WITH the skill
3. In the other fork: run task WITHOUT the skill (worktree with no skill loaded)
4. Pull up a diff at the end and compare what was logged

This is the only way to know if a skill is adding value or just consuming tokens.

---

## Details

### What Makes This Collection Different from Generic Advice

The repo was built while shipping `zenith.chat` entirely with Claude Code (Anthropic x Forum Ventures hackathon, Sep 2025). The configurations are production-tested, not theoretical. 10+ months of daily use means the edge cases are documented.

The philosophy is unusual in emphasizing restraint: "maximum output with minimum viable parallelization" runs counter to the common advice to spin up as many agents as possible. The author explicitly pushes back on Anthropic's own suggestions about running 5+ local instances.

### Compounding Returns Principle

From @omarsar0 (cited in the guide): "Early on, I spent time building reusable workflows/patterns. Tedious to build, but this had a wild compounding effect as models and agent harnesses improved."

The investment priority order: subagents → skills → commands → planning patterns → MCP tools → context engineering patterns.

### Most Relevant to lm-app Immediately

1. **Stop Hook for session memory** — Replace the current SESSION_NOTES.md manual process with an automated Stop hook that writes to `.claude/<date>.tmp`. Already partially done via CLAUDE.md conventions.

2. **Model selection in settings.json** — We default Sonnet already; add `CLAUDE_CODE_SUBAGENT_MODEL=haiku` to settings.json so subagents auto-downgrade.

3. **Strategic compaction** — Disable auto-compaction, use `/compact` manually at phase boundaries (after research, before implementation).

4. **Verification loop as a skill** — The 6-phase gate (build → type → lint → test → security → diff) maps directly to our Design & Build Workflow in CLAUDE.md.

5. **Two-instance kickoff** — Use this pattern for the next major feature (e.g., run-loop, POS integration).

6. **The instinct/continuous-learning pattern** — Long-term: the Stop hook that saves project-specific patterns to `~/.claude/skills/learned/` would prevent repeating the same debugging prompts across sessions.

---

## Sources

- Longform guide (GitHub raw): https://raw.githubusercontent.com/affaan-m/everything-claude-code/main/the-longform-guide.md
- Shortform guide (GitHub raw): https://raw.githubusercontent.com/affaan-m/everything-claude-code/main/the-shortform-guide.md
- Repository README: https://github.com/affaan-m/everything-claude-code/blob/main/README.md
- Repository root: https://github.com/affaan-m/everything-claude-code
- Tweet/announcement: https://x.com/affaanmustafa/status/2014040193557471352
- mgrep token optimization: https://github.com/mixedbread-ai/mgrep
- Session reflection pattern (cited in guide): https://rlancemartin.github.io/2025/12/01/claude_diary/
- claude-flow orchestration (cited): https://github.com/ruvnet/claude-flow
- System prompts collection (cited): https://github.com/x1xhlol/system-prompts-and-models-of-ai-tools
- ccstatusline (cited): https://github.com/sirmalloc/ccstatusline
- ecc.tools (advanced skill creator): https://ecc.tools
