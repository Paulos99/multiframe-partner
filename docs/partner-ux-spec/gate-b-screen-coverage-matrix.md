# Gate B — Screen coverage matrix (D3 E-* → D4)

**Revision:** `rev-gate-b-draft-2` · **APPROVED 2026-10-23**  
**Источник инвентаря:** [03-information-architecture.md](./03-information-architecture.md) §2  
**Индекс спек:** [04-screen-specs/00-index.md](./04-screen-specs/00-index.md)

| E-ID (D3) | Alias / legacy | Coverage | Spec path | Notes |
|-----------|----------------|----------|-----------|-------|
| E-login | — | dedicated | [e-login.md](./04-screen-specs/e-login.md) | |
| E-home | E-home-* | dedicated per role | [e-home-roles.md](./04-screen-specs/e-home-roles.md) + 5 role files | GB-P0-05 |
| E-tools | — | dedicated | [e-tools.md](./04-screen-specs/e-tools.md) | |
| E-quick-bind | BindModal | dedicated | [e-quick-bind.md](./04-screen-specs/e-quick-bind.md) | was missing |
| E-academy-hub | E-academy | dedicated | [e-academy.md](./04-screen-specs/e-academy.md) | alias E-academy |
| E-materials | — | merged subsection | e-academy.md §materials | same Learning zone; rationale: library adjacent to hub, not separate product surface |
| E-help-cabinet | — | merged subsection | e-academy.md §help | IA «Обучение» |
| E-support | — | dedicated | [e-stp-support.md](./04-screen-specs/e-stp-support.md) | |
| E-pm | — | dedicated + D6 | [e-pm.md](./04-screen-specs/e-pm.md), D6 | |
| E-calc | — | dedicated behavior | [e-calc-save.md](./04-screen-specs/e-calc-save.md) + D7 | tool host may be iframe; Save contract канон |
| E-projects | — | dedicated | [e-projects.md](./04-screen-specs/e-projects.md) | |
| E-project | — | dedicated | [e-project.md](./04-screen-specs/e-project.md) | |
| E-project-deal | E-deal, E-quote | dedicated | [e-quote-deal.md](./04-screen-specs/e-quote-deal.md) | aliases canonicalized |
| E-room | — | dedicated | [e-room.md](./04-screen-specs/e-room.md) | |
| E-room-docs | — | dedicated | [e-room-docs.md](./04-screen-specs/e-room-docs.md) | was missing |
| E-room-install | E-install | dedicated | [e-install.md](./04-screen-specs/e-install.md) | alias E-install |
| E-org | — | dedicated | [e-org.md](./04-screen-specs/e-org.md) | was missing |
| E-staff | — | dedicated | [e-staff.md](./04-screen-specs/e-staff.md) | was missing |
| E-partners | — | subsection | [e-partner-card.md](./04-screen-specs/e-partner-card.md) §list | list → card |
| E-partner-card | — | dedicated | [e-partner-card.md](./04-screen-specs/e-partner-card.md) | was missing |
| E-analytics | — | dedicated | [e-partner-analytics.md](./04-screen-specs/e-partner-analytics.md) | |
| E-analytics-training | — | dedicated | [e-analytics-training.md](./04-screen-specs/e-analytics-training.md) | was missing |
| E-inquiry | (create path) | dedicated | [e-create-inquiry.md](./04-screen-specs/e-create-inquiry.md) | D3 entry «Новый проект» |
| E-nav / chrome | E-nav | dedicated | [e-nav-chrome.md](./04-screen-specs/e-nav-chrome.md) | |

**Alias rules:** в AC и коде предпочитать канон D3 (`E-project-deal`, `E-room-install`, `E-academy-hub`). Legacy `E-deal` / `E-install` / `E-academy` допустимы как синонимы в тексте.

**Coverage check:** все ID из D3 §2.1–2.3 имеют dedicated **или** explicit merged subsection with rationale — PASS for draft-2.
