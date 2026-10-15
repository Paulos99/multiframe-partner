# PRODUCT_SPEC — MultiFrame Проблемомер

Screen-by-screen product contract for the MVP SPA. Exact Russian UI strings are normative. Engineering may rearrange markup, but must not change meaning, omit required copy, or reintroduce out-of-scope capabilities from `CHECKLIST.md` (Capability ledger).

**Related:** `CHECKLIST.md` (intake + ledger) · live context `https://paulos99.github.io/multiframe-problemomer/` (do not redesign from the live site alone).

**Audiences (superseded 2026-09-16):** Start has **no role picker**. One site visitor path: check acoustic comfort **on this object / room**. «Для себя / для клиента» removed — it confused people («для себя» = «для меня»). Specialists (sales, installer, measurer, designer) reuse the **same** object → result flow. The long JTBD list is still a content map, not UI.

**Core value (owner-confirmed direction):** show that in *this* room comfort is lower than assumed; MultiFrame can raise comfort class (often by a step+); let user feel how much quieter; present system features (comfort, install, versatility, safety) so value is **inferred**, not priced aloud. Specialists get the same pack as a ready argument. Still **not** a materials calculator and **not** a lab certificate.

**Global product rules**

- Feeling + comfort-class story first on early screens; **no numbers on Start**.
- On Before/After + Profile: show the **full evidence pack** — personal room story, classes А/Б/В, numbers, charts, and plain-language explanations of each (owner 2026-09-12: «показать всё, аргументированно, понятно, персонально»).
- **Evidence layout (Q4, owner 2026-09-12):** everything on one scroll — **conclusion / verdict on top**, detailed data below. Not progressive disclosure; not audience-trimmed packs. Anyone skims what they need. Same full stack for all user models (context may still change copy/CTA emphasis).
- **Result chain (owner 2026-09-17):** (1) **Нормы комфорта в стройке** — СП А/Б/В + Rw/Lnw + construction context, (2) **Текущая ситуация** — official hybrid SP header + two felt 5-step axes (now only), (3) **С MultiFrame** — official hybrid after + felt axes with now/after + % + audio + frequency charts, (4) **Уникальность системы MultiFrame** — StP pillar cards (звукоизоляция+комфорт, безопасность, экология, монтаж, универсальность); no comparison with plain stretch film, (5) **Следующий шаг**. No top ComfortScale table, no separate «Что изменится на слух», no «Расчёт и нормы / подробности», no `LOG_DB_FOOTNOTE`.
- **Felt vs official (owner 2026-09-18):** headers use official hybrid via `comfortClassFor` + `HYBRID_CLASS_LABELS` / «ниже допустимого» (never «Д», never felt words in headers). **Felt axes = Rw (воздух) / Lnw (удар)** mapped to А/Б/В + «очень шумно» ниже В. Axis captions show **Rw / Lnw** with direction hints (Rw больше — лучше; Lnw меньше — лучше) — not room L2 dBA. Demo audio stays on received L2; copy near audio says шкалы = изоляция, звук = громкость в комнате.
- **Channel names (owner 2026-09-17):** `Воздушный шум (голоса и музыка)` · `Ударный шум (шаги и падения)`; audio `Воздушный шум` · `Ударный шум` · `Смешанный шум`.
- **Numbers policy (updated 2026-10 field anchors):** show a **full working MultiFrame effect model** calibrated to **object tests** (`field_in_situ` / `field_objects`) — foamblock, Kostroma, Andrianova(+Полиблок 10 + стяжка 60). Not a lab certificate. See `docs/sources/08-multiframe-field-anchors.md`.
- Effect source: `field_in_situ`; disclaimer: `field_objects` / expert qualitative — never lab guarantees. Charts/numbers are **oriented arguments** from field spectra.
- MultiFrame Δ is **field-shaped**: bare/ordinary ΔRw ~**+1…+9** by slab Rw (Kostroma ~+2, light ~+9), |ΔLnw| ~**4…7**; floating floor above → Andrianova residual ~**+1 / −1**. UI range from the room model. Never present as a lab certificate.
- Classes **А/Б/В** (СП 51.13330.2011): **А** = высокий комфорт, **Б** = комфорт, **В** = допустимый уровень. Below-scale official wording is **`ниже допустимого`** (no letter «Д», no «(В)»). Felt axes are visual only.
- «примерно вдвое спокойнее» **only for air (воздух)**; impact (удар) = quieter + floor often needed — never claim Lnw norm from ceiling alone.
- Audio = **три группы примеров:** воздух · удар · смешанный. **До** = stem, приведённый к L2/dBA этой комнаты (соседи, площадь, плита); **После** = тот же граф + полосовой MultiFrame transfer `ΔL(f)` из receiving (field_objects). Не showroom duck и не одинаковый сырой MP3 для всех помещений.
- Mobile: denser inputs + sticky question/CTA; both noise rows remain on the same shared scale axis and keep their everyday labels. No raw tech dumps without explanation.
- **Premium tone (owner 2026-09-13):** never UI phrases like «за что платим», «за что ~500 тыс.», blunt cost/price push. Show features and effects so the user **infers** value. Soft B2B benefits OK without «средний чек» / money-first language.
- Out of scope: walls, partitions, floors systems, Polyblock, framed systems, fake lab guarantees, floor-level question.

### Workshop log (durable)

| Date | Decision |
| ---- | -------- |
| 2026-09-12 | Value ≈ «плёнка без акустики / шум останется» + class uplift + feel quieter + feature-based value (not price talk) + sales tool |
| 2026-09-12 | Audiences **C** (narrow binary) — **superseded 2026-09-13** |
| 2026-09-12 | Result depth: **full pack** — personal + classes + numbers + charts + explanations (not A/B-only; not “feeling only”) |
| 2026-09-12 | Evidence presentation **Q4**: all-at-once scroll; **вывод сверху, данные ниже**; self-select depth (not progressive disclosure; not audience-trimmed) |
| 2026-09-13 | Charts **C**: class scale А→Б→В on top + before/after bars (ΔRw/ΔLnw) below; no frequency spectrum in MVP |
| 2026-09-13 | Numbers: **show full unconfirmed model now**; after confirmation swap to correct values (do not hide numbers in MVP) |
| 2026-09-13 | User models = **JTBD content map** (not a long Start quiz); Start = only «для себя / для клиента»; no further Start clarification — full buy-case content covers all JTBD |
| 2026-09-13 | Tone: no «за что платим» / price-first copy; value inferred from features; MultiFRAME deck is primary product-feature source |
| 2026-09-13 | MultiFrame features on Result: **понятно + аргументированно** (plain language + why it matters; not bare bullet dump, not tech dump) |
| 2026-09-13 | Feature copy pattern confirmed: **claim + 1 short why/how** (e.g. drum-effect → MultiFrame dissipates); clear and argued |
| 2026-09-13 | Result feature order: **1 class of comfort/housing → 2 effectiveness → 3 drum-effect → 4 safety → 5 rest**. Install only as **fast / no long construction** — not tech details about mounting/comms unless needed |
| 2026-09-13 | Class labels: **hybrid** — plain name + letter (А/Б/В), soft link to normative doc (Trofimov/SP). Official: А высокая комфортность, Б комфортная, В предельно допустимая. Do not invert letters. |
| 2026-09-13 | Class V UI label = **Допустимый (В)**; below-scale state when even V not reached (common) — UI label **`Дискомфорт`** (confirmed) |
| 2026-09-13 | Result top class shift copy confirmed: e.g. `Сейчас: Дискомфорт → с MultiFrame: Комфорт (Б)` |
| 2026-09-13 | Norm footnote under class shift: **A** — `Ориентир по шкале комфортности (норм. документы)` |
| 2026-09-13 | Effectiveness block: **delta orientations first**, each with explaining caption + sensation (not feeling-only lead) |
| 2026-09-13 | Effectiveness: **always both** Δ channels (воздух + удар), each with caption + sensation |
| 2026-09-13 | **Remove Scenarios from survey** — client may not live there / not have thought about noise; asking «что мешает» risks «мне ничего не мешает». Audio uses default demo set |
| 2026-09-13 | **Remove Current complaint survey** with Scenarios (same anti-pattern). Flow: Start → Room → Before/After → Audio → Result |
| 2026-09-13 | Room = **primary diagnostic block** (comfort model input). Keep type + area + slab; propose high-impact extras (floor above, building type, object stage, planned ceiling) — owner to pick |
| 2026-09-13 | Room fields: keep type+area+slab; **add** floor-above, house type, object stage, planned ceiling; replace «кто сверху» with **noisy neighbors** check (not bother quiz) |
| 2026-09-13 | Year of build: **optional candidate** — useful as soft proxy for typical construction + normative context; weaker than slab/floor-above; owner to confirm |
| 2026-09-13 | Build year: **not in MVP**. Noisy neighbors options: drop «ещё не живу»; keep only `Не знаю` · `Обычно тихо` · `Соседи сверху шумные` |
| 2026-09-13 | Floor-above: **Не знаю is a first-class valid answer** — user often does not know; model uses conservative ASSUMPTION when unknown |
| 2026-09-13 | Room validation: **required only** room type + area. Floor-above, house type, stage, planned ceiling, noisy neighbors — each may be `Не знаю`; enough to proceed |
| 2026-09-13 | Room field order confirmed: type → area → slab type → slab thickness → floor above → house type → stage → planned ceiling → noisy neighbors |
| 2026-09-13 | Slab: **type and thickness as separate Room fields** (do not multiply type×mm cards). Thickness may be `Не знаю` |
| 2026-09-13 | Slab thickness UI = **ranges/buckets**, not single mm points (owner not in typical-thickness details) |
| 2026-09-13 | Slab thickness ranges confirmed: `До ~160` · `~160–200` · `~200–250` · `Толще ~250` · `Не знаю` |
| 2026-09-13 | Floor-above: remove `Пока без чистового пола` — not a floor-construction param (belongs to object stage if at all) |
| 2026-09-13 | Floor-above copy confirmed: `Не знаю` · `Обычный пол (без плавающей схемы)` · `Есть плавающий пол / шумоизоляция в полу` |
| 2026-09-13 | House type options expanded for common RU stock: add **Блочный**; monolith includes монолит-кирпич (note); keep Не знаю — confirmed |
| 2026-09-13 | House type options confirmed: `Панельный` · `Блочный` · `Кирпичный` · `Монолит` (в т.ч. монолит-кирпич) · `Деревянный / по балкам` · `Не знаю` |
| 2026-09-13 | Object stage confirmed: `Новостройка / до заселения` · `Идёт ремонт` · `Уже живут` · `Не знаю` |
| 2026-09-13 | Planned ceiling confirmed (B): `Планируем натяжной` · `Потолок уже есть` · `Не знаю` — plain language, no ГКЛ/черновой jargon |
| 2026-09-13 | Noisy neighbors confirmed (B): `Не знаю` · `Обычно тихо` · `Сверху бывает шумно` — softer third label; not a «does it bother you» quiz |
| 2026-09-13 | Before/After «До» card bullet (A): last Before bullet = hybrid class from model — `Сейчас: {Высокий комфорт (А)|Комфорт (Б)|Допустимый (В)|Дискомфорт}`; drop `Тихо/Терпимо/Мешает` |
| 2026-09-13 | Before/After «После» card bullet (A): last After bullet = `С MultiFrame: {hybrid class}` — symmetric with Before |
| 2026-09-13 | Before/After copy rewrite: owner — previous emotional bullets / feeling chips are **obsolete**; rebuild from hybrid class + new copy (not patch old `Тихо/Терпимо/Мешает` SPA) |
| 2026-09-13 | Before/After bullet frame (A): **2 phrases + hybrid class** per card (not one phrase only, not class-only) |
| 2026-09-13 | Before/After bullet copy locked: Before `Соседи сверху слышны слишком отчётливо` · `Бытовые звуки сверху легко различить` · `Сейчас: {class}`; After `В комнате заметно спокойнее` · `Ударный и воздушный шум воспринимаются мягче` · `С MultiFrame: {class}` |
| 2026-09-13 | Before/After chrome: subtitle **S3** `Как меняется комфорт комнаты с MultiFrame`; numbers **N3** `Оценка в цифрах`; honesty **H3b** `Цифры — ориентир, не лабораторный замер. Потолок смягчает удары сверху, а норму по удару часто закрывает пол у соседа.` |
| 2026-09-13 | **Audio rewrite (Trofimov + owner):** channels воздух / удар (+ UI group **смешанный**); After = case-specific MultiFrame reduction — cut **level and frequencies**; % tied to this room’s Δ (`pre_lab`) |
| 2026-09-13 | Audio examples locked (D): **воздух** — лай собаки · музыка · громкие разговоры; **удар** — детский бег · перестановка мебели · цоканье когтей собаки; **смешанный** — стиральная машина · пылесос |
| 2026-09-13 | Audio reduction UI **C:** `≈ −{n}%` + Δ caption; log footnote **F2b:** `Шкала дБ логарифмическая: −8 дБ ≈ вдвое тише по ощущению.` |
| 2026-09-13 | Audio chrome locked: title **T1** `Услышать разницу`; subtitle **S6** `Сравните звук обычного потолка и потолка с MultiFrame`; buttons **B2** `До` · `После`; sticky **N3** `Смотреть итог` |
| 2026-09-13 | Result top verdict line reconfirmed (A): `Сейчас: {класс} → с MultiFrame: {класс}` (e.g. `Сейчас: Дискомфорт → с MultiFrame: Комфорт (Б)`) |
| 2026-09-13 | Result one-liner **L1:** `В этой комнате MultiFrame поднимает комфорт на ступень выше.` (with class line; same for self/client) |
| 2026-09-13 | Result chrome: title `Акустический профиль помещения` (locked 2026-09-14); subtitle **R1** `Ориентир комфорта для вашей комнаты и следующий шаг к расчёту` |
| 2026-09-13 | Result summary cards **A:** same 2 phrases + class as Before/After; drop old noise-type / «вдвое спокойнее» card copy |
| 2026-09-13 | Result feature order reconfirmed (A): **1** class → **2** effectiveness → **3** drum-effect → **4** safety → **5** rest |
| 2026-09-13 | Result sticky CTA **C4:** `Открыть калькулятор MultiFrame` (replaces «Расчёт материалов») |
| 2026-09-13 | Result lead = consultation/selection: open **P2** `Запросить консультацию или подбор`; title `Заявка на консультацию`; note `Разберём ваш случай, подберём материал.`; no separate disabled «Консультация» button |
| 2026-09-13 | Workshop reconcile: product chrome/flow largely locked; still open for owner — exact feature тезис+why lines (beyond drum example). Engineering ASSUMPTIONs OK until Trofimov: dB→% map, mixed EQ blend, Δ model numbers, lead stub endpoint |
| 2026-09-13 | Start chrome: **no kicker**; H1 kept; lead **E8c**; CTA `Начать` |
| 2026-09-13 | Result features: drop Flat/Wave from «остальное»; drum-effect rephrased (draft) — air gap under stretch acts like a drum body; MultiFrame dissipates energy in the panel |
| 2026-09-14 | **Remove Before/After screen** (duplicated Result). **Audio** moves into Result as compact block after «Сейчас / С MultiFrame» cards. Flow: Start → Room → Result |
| 2026-09-14 | Result trust pack: large Δ Rw / Δ Lnw; frequency isolation charts (zamer_graph shape, room Δ); **2** client advantages (drum + install); official class ladder. Spectrum is secondary — quietness bars stay primary so Rw↑ does not look «громче». |
| 2026-09-14 | **Acoustic two-layer model:** construction R(f)/Lnw from Trofimov + answers (slab, house, floor, stage, stretch drum); in-room level from neighbors / room type / area. Neighbors do **not** change Rw/Lnw. MultiFrame ΔR(f) is invented with physical shape (`pre_lab`); never take Lnw to class A by ceiling alone. |
| 2026-09-15 | **Expert material + receiving-room spectra:** R(f)/Ln(f) from mass law, coincidence, ПК voids, wood LF leak, house flanking, frequency-shaped floor ΔLn. In-room dBA = A-weighted L1(f)−R(f)+10log(S/A) (Sabine absorption by room type + furnishing). MultiFrame still invented. |
| 2026-09-15 | Result fallback when hybrid class does **not** move (impact still > V): do not present `Дискомфорт → Дискомфорт` as “MultiFrame does nothing”. Keep locked L1 + class-shift only when hybrid rises. Otherwise show **air / impact channels** (Rw/Lnw + channel class), explain that full SP class needs both and ceiling alone does not close Lnw ≤ 60. Ladder may follow **air** if air rose. |
| 2026-09-15 | **Independent channel comfort:** Result always shows separate air (Rw) and impact (Lnw) comfort levels + ladders. Full SP hybrid class is secondary footnote only. Norm table tags sit in Rw / Lnw columns separately. |
| 2026-09-15 | **Verdict declutter:** drop nested gray cards and duplicate captions; short one-liner + two lean channel columns (Д/В/Б/А) + hybrid one-liner. |
| 2026-09-15 | **Features block:** title `Чем MultiFrame отличается` + lead; two text cards (барабан · быстрый монтаж); claim + why, no price talk. |
| 2026-09-15 | **In-situ baseline realism:** product «сейчас» is not Trofimov lab Rw. Stronger flanking (panel/unknown mass stock), drum −2 Rw, ordinary floor no +1 Rw, universal leak −2 Rw. Lab fixtures unchanged (180=54/76). |
| 2026-09-15 | **Real audio stems:** До/После use `public/audio/` MP3 (разговор / топот / пылесос). After = Web Audio level+EQ from this room’s ΔRw/ΔLnw, not a second file. |
| 2026-09-17 | **Room-truthful audio:** calibrate stems; До matches received L2/dBA for this room; После applies ΔL(f) from receiving bands (not scalar ASSUMPTION EQ only). |
| 2026-09-16 | **JTBD Result arc:** reorder — verdict → emotion → quieter → audio → whyMultiFrame → features+safety → **narrative ribbon (5 params)** → SP table+charts → **«Следующий шаг»** (calc + lead + client summary copy). `interestFor` copy on Start/Room/Result. |
| 2026-09-16 | **Hot funnel:** in-body calculator; structured `buildLeadHandoff` (room+sim+why); client «Скопировать сводку»; premium stagger reveal + Room progress bar; `prefers-reduced-motion` respected. |
| 2026-09-16 | **Result simplification (supersedes the two rows above):** verdict → one shared official scale with two rows → combined effect+audio → three MultiFrame reasons → next step → open «Расчёт и нормы». Remove emotion cards, separate Δ cards, `whyFit` duplication, features duplication and the five-step ribbon. |
| 2026-09-16 | **Official-scale correction:** only А/Б/В are classes. The fourth axis position is written `Ниже В`, never «Д». If a class does not change, use one combined marker and explain the numeric improvement below it. |
| 2026-09-16 | **Motion correction:** no section stagger on Result. Animate only scale markers and effect bars; `prefers-reduced-motion` disables both. Existing sticky calculator CTA remains. |
| 2026-09-16 | **Scale/table merge:** replace the abstract dot-and-line scale with a compact table: official levels are columns, everyday noise types are rows, and state badges sit in their actual cells. Technical thresholds remain below as a second layer. |
| 2026-09-16 | **Final CTA order:** open table and frequency graphs come before the in-body `Следующий шаг`; the conversion block is the last substantive section on Result. |
| 2026-09-18 | **Last Room question:** drop niche wishes (музыка / ТВ / сон ребёнка). Universal use: `Отдых и сон` · `Работа и учёба` · `Обычная жизнь` · `Не знаю`. |
| 2026-09-17 | **Result structure rewrite:** norms → current → MultiFrame (felt axes + % + audio + charts) → why → CTA. Official SP hybrid in headers; everyday 5-step felt on axes only. Channel renames; Start lead updated; noisyNeighbors subtitle removed; drop technical/подробности and LOG_DB footnotes. |
| 2026-09-17 | **Processing ceremony:** after last Room question, fullscreen StP-green loading (~10s, not skippable) before Result. Center: one-line rotating status + thin progress bar. No chips/equalizer/classes/dB. Header and sticky CTA hidden. Back from Result skips replaying it. |
| 2026-09-17 | **Features block rename:** `Почему MultiFrame подходит` → `Уникальность системы MultiFrame`. Three cards from stp-multiframe.ru positioning (эффективно / быстро / экологично): panel vs film+drum, fast frameless install + any slab/stage, eco/no mineral wool. Drop dynamic `Под ваш потолок` why-line from the UI; `whyMultiFrame` stays in lead handoff only. |
| 2026-09-17 | **Felt axes = received dBA** (sync with ≈дБ + demo audio). Official SP hybrid stays in block headers only. Playback refs raised so «приемлемо/тихо» cut the through-wall stems hard. |
| 2026-09-18 | **Felt axes back to Rw/Lnw (SP).** Room L2 only drives demo audio. Axis captions show Rw/Lnw with direction; copy separates изоляция vs громкость в комнате. |
| 2026-09-17 | **Uniqueness block rewrite (owner):** two cards `Только плёнка` vs `Плёнка + MultiFrame` — three parallel bullets (вид / шум / что под полотном). Lead: тишина зависит от слоя между плитой и полотном. No nonsense table rows (e.g. «минвата» vs обычный натяжной). |
| 2026-09-17 | **Uniqueness pillars (owner):** no stretch-film comparison. Grid of 5 StP pillars: звукоизоляция+комфорт, безопасность, экологичность, быстрый монтаж, универсальность. Lead `Эффективно. Безопасно. Без долгой стройки.` Title + one line each. |
| 2026-09-18 | Consultation CTA: `Запросить консультацию или подбор` opens `https://stp-multiframe.ru/#section-partner` (bottom «Связаться с нами» / contacts) in a new tab. In-app lead form removed. Calculator + copy summary stay. |
| 2026-10-13 | **Post demo (leadership):** Room titles UPPERCASE + denser cards; `Блочный` hint (газоблок/пеноблок); slab options filtered by house type; ceiling = `Натяжной` · `Гипсокартон / подвесной` · `Штукатурка или покраска` · `Другой потолок уже есть` · `Не знаю`; after noisyNeighbors if noisy → `noiseKind` (топот / голоса / оба); last question = everyday goal **without MultiFrame brand**; Result: personal story + recommendations, KPI % first / dB secondary, felt labels = SP housing norms, independent spectrum hover. |

---

## User models (JTBD) & Start

### Why the long role list exists

Owner listed ads / search / MultiFrame site / partner site / sales manager / installer / measurer / designer **so the product content covers their jobs-to-be-done** — not so Start becomes a role catalog.

**Agent decision (product rationale):** further Start questions (sales vs site vs design…) are **not needed** if Result already ships one complete MultiFrame purchase justification that each helper can reuse with a client. Extra Start branching adds friction and fake precision without new facts. Soft hooks may still come from UTM/referrer (**ASSUMPTION**, no extra question).

### JTBD → content the Result must satisfy

| Who (examples) | Job to be done | Content the shared pack must deliver |
| -------------- | -------------- | ------------------------------------ |
| Client from ads «красивый → тихий» | Decide to add acoustics while choosing a nice ceiling | Baseline comfort risk without MultiFrame; feel quieter; beautiful+quiet story; ~value / non-dB pluses |
| Client from search «звукоизоляция потолка» | Check if ceiling MultiFrame is the right answer | Oriented effect model; class move; honesty on impact/floor; next step to calculator |
| Client from MultiFrame site | «Check my ceiling» self-diagnosis | Personal baseline → after MultiFrame; audio contrast |
| Client from partner ceiling site | Know if ЗИ is needed under stretch ceiling | Why film alone isn’t enough; MultiFrame under stretch; full effect + pluses |
| Sales manager | Upsell MultiFrame with a client | Ready argument: class + numbers + audio + non-dB benefits; skim-friendly verdict on top |
| Installer on site | Fast “why ЗИ” for the client | Same full pack, usable on phone in minutes |
| Measurer | Extra sale at measurement | Same pack + clear CTA to materials calc |
| Designer | Put ЗИ in the project and justify to client | Baseline vs MultiFrame story + advantages (height, frameless, speed) for project talk |

### Start segmentation (superseded 2026-09-16)

**No Start role choice.** Workshop 16.09: «для себя / для клиента» путает; на сайте StP проверяют комфорт **своего объекта / помещения**. `interestFor` may remain in the session payload as unused `'self'`. Tone is always «ваш объект». Specialists walk the same flow.

Everyday first-layer labels on Result (alongside SP letters):

| SP | Everyday |
| -- | -------- |
| below | `Некомфортно` |
| В | `Допустимо` |
| Б | `Комфортно` |
| А | `Тихо` |


### Comfort class labels (hybrid — confirmed direction 2026-09-13)

| Letter (official, Trofimov/SP) | Meaning (official) | UI plain label (DRAFT) |
| ------------------------------ | ------------------ | ---------------------- |
| **А** | высокая комфортность | `Высокий комфорт (А)` |
| **Б** | комфортная | `Комфорт (Б)` |
| **В** | предельно допустимая | `Допустимый (В)` |
| — (below scale) | ниже предельно допустимой / вне категорий А–В | `Ниже В` |

- Owner (2026-09-13): **В** = only `Допустимый (В)` (not «Базовый»). Below V is common → always support a fourth UI state.
- Show **plain name + letter** together (below-scale has **no letter**).
- Owner correction (2026-09-16): below-scale is **`Ниже В`**, not an invented class «Д».
- Soft footnote/link: e.g. `Ориентир по шкале комфортности (нормативные документы / материалы StP)` — not “мы сертифицировали вашу квартиру”.
- Owner intent: mix official scale with everyday words. **Do not** call **А** «эконом» — that would invert the official ladder (А is best).
- Chart still uses А→Б→В movement with these hybrid captions.

### MultiFrame features for Result (from owner presentation + stp-multiframe.ru)

**Tone:** present facts so the user concludes value themselves. **Forbidden in UI:** «за что платим», blunt price/cost framing, «средний чек».

**Presentation rule (confirmed 2026-09-13):** advantages **понятно, но аргументированно** — each point = **тезис + 1 короткая фраза why/how**. Not a bare slogan list; not a datasheet dump. Drum copy: see item 3 below (rephrased 2026-09-13).

**Result feature order (confirmed 2026-09-13)** — each item = тезис + why/how; no price talk.  
**Copy tone (owner 2026-09-13):** лёгкий премиальный язык, цельные фразы; не обрывать мысль тире и не писать «телеграфно». Умеренная длина.  
**2026-09-13:** пункт **Форма (Flat/Wave)** убран из блока «остальное». Эффект барабана — перефразирован (draft ниже).

1. **Класс комфорта жилья**
   - Тезис: `Сейчас: {класс} → с MultiFrame: {класс}`
   - Why: `Так комната читается на шкале комфортности: это понятный ориентир для вашего случая и мягкая опора на нормативные представления о тишине, без претензии на лабораторный вердикт.`

2. **Эффективность**
   - Тезис: `Ориентиры снижения шума: по воздуху около {Δ}, по удару около {Δ}.`
   - Why: `Обе оценки собраны под параметры этой комнаты. Поскольку шкала децибел логарифмическая, даже небольшое снижение на слух ощущается заметно спокойнее.`

3. **Эффект барабана** *(rephrase draft — owner to confirm)*
   - Тезис: `Под обычным натяжным потолком воздух в зазоре усиливает шум сверху, как полотно барабана.`
   - Why: `MultiFrame рассеивает эту энергию в панели, и комната воспринимается спокойнее.`

4. **Безопасность** *(draft)*
   - Тезис: `Решение, с которым спокойно жить в комнате.`
   - Why: `Состав и сертификаты подтверждают, что система уместна в жилом интерьере и не воспринимается как «чисто строительный» материал.`

5. **Остальное** *(draft — без Flat/Wave)*
   - **Монтаж.** Тезис: `Монтаж идёт в том же темпе, что и обычный натяжной потолок.` Why: `Панели собираются быстро, без тяжёлого каркаса и без ощущения затяжной стройки на объекте.`
   - **Поколение.** Тезис: `Панель нового поколения с продуманной архитектурой.` Why: `Жёсткий контур вместе с перфорацией рассеивает энергию шума в пространстве над полотном.`

**Монтаж / коммуникации (owner nuance):** клиенту **не** разворачивать технику крепежа и прокладки коммуникаций. Достаточно смысла: **быстро, без долгой стройки** (vendor: 1 мастер, панель ≤1 мин — as soft claim). Details for «для клиента» / профи могут быть глубже later; MVP client-facing copy stays light.

**Для пути «для клиента» (мягко):** высокий спрос на услугу; лояльность; встраивается в монтаж потолка; низкий порог освоения — **без** формулировок про деньги/чек.

**Process story (optional short):** подготовка → MultiFrame → коммуникации → каркас → потолок → финиш/свет.

Acoustic diagnosis remains the core of Problemoмер; these features complete the buy-case without price talk.


---

## Global chrome

### Header

| Element | Copy / behavior |
| ------- | --------------- |
| Logos | `StP`, `MultiFRAME` (alt text) |
| Product name | `Проблемомер` (may hide on very narrow ≤420px) |
| Theme toggle | aria/title: `Светлая тема` / `Тёмная тема` |

Must **not** appear: calculator links, dB values, lead form, Polyblock, floor question.

### Progress

| Step key | Progress label |
| -------- | -------------- |
| `start` | Старт |
| `room` | Объект |
| `result` | Итог |

One-shot `processing` (ceremony between Room and Result) is **not** a progress-dot step.

**Removed from survey (2026-09-13):** `scenarios` («что слышите/мешает») and `current` (complaint comfort quiz). Reason: many users have not lived in the flat or have not framed a noise problem; asking invites «мне ничего не мешает». Education of typical upstairs noise moves into Result/Before-After copy + default audio demo — not a quiz.

- Hidden on Start and on `processing`.
- On narrow viewports (≤520px): dots only, labels may hide.
- `aria-label`: `Прогресс`.

### Sticky CTA

- Hidden on Start and on `processing`.
- Shown on steps `room` … `result`.
- Back: `Назад` (enabled when not on first sticky step; Start has no sticky bar).
- Next default: `Далее`.
- Overrides: see per-screen (`Услышать разницу`, `Смотреть итог`, `Открыть калькулятор MultiFrame`).
- Next disabled until screen validation passes (except Result: always enabled → calculator).
- Fixed bottom + safe-area; primary control min touch height **44px**.

### Default expert disclaimer

`Оценка экспертная и качественная. Это не инженерный расчёт звукоизоляции и не гарантия конкретных показателей.`

### Simulation disclaimer (SimCompare)

`Не замер и не гарантия Δ. Классы комфорта — ориентир по шкале комфортности (норм. документы); не сертификат и не полный расчёт по СП. Потолком нельзя заявлять полную норму по ударному шуму: часто нужен пол у соседа сверху.`

### Simulation badge

`Оценка до лабораторных данных`

---

## Screen 1 — Start (`start`)

### Goal

Create demand for acoustic comfort **on this object**. No role question. No numbers. Same full diagnostic for every JTBD.

### Visible elements

- H1, lead, primary CTA `Начать`
- Header (no progress, no sticky CTA, **no kicker**, **no «для себя / для клиента»**)

### Exact primary copy (RU)

| Role | Text |
| ---- | ---- |
| H1 | `Проверьте уровень акустического комфорта на своём объекте` |
| Lead | `Проблемомер показывает средний уровень шума исходя из типа перекрытия и строительных материалов, а также внутренних и внешних факторов.` + абзац `Следующий расчет показывает, как изменится звукоизоляция и акустический комфорт после монтажа системы MultiFrame.` |
| Primary CTA | `Начать` |

### Controls

| Control | Action | Enabled |
| ------- | ------ | ------- |
| `Начать` | Go to Room | Always |

### Validation messages

None.

### Must NOT appear

Role picker `для себя` / `для клиента`; long role catalog; Rw/Lnw, ΔdB, class chips, slab picker, lead form, Polyblock, walls, floor-above question, audio player.

---

## Screen 2 — Room (`room`)

### Goal

Diagnostic from **general to particular**. External factors first (house, slab type, slab thickness). Then internal (room + area, ceiling, stage, neighbors, **how the room is used**). **Пол сверху is not asked** (model keeps `unknown`). Year of build: **not in MVP**. Room type is **not** the first question. Last step is universal use (`Отдых и сон` · `Работа и учёба` · `Обычная жизнь` · `Не знаю`) — not music/TV/child sleep.

### Visible elements

- Eyebrow `Внешние факторы` / `Внутренние факторы`
- Order: house type → slab type → slab thickness → room type + area → planned ceiling → object stage → noisy neighbors → room wish
- Progress + sticky `Назад` / `Далее`. Required to leave `basics` (and to reach Result): room type + area > 0.

### Exact primary copy (RU)

| Role | Text |
| ---- | ---- |
| Title | `Комната и потолок` |
| Subtitle | `Опишите помещение. Этаж не спрашиваем — важен потолок и перекрытие сверху.` |
| Room types | `Гостиная` · `Спальня` · `Детская` · `Кухня` · `Кабинет` · `Другое` |
| Area label | `Площадь потолка, м²` |
| Area hint | `Нужна для ссылки на калькулятор MultiFRAME` |
| Area placeholder | `Например, 18` |
| Optional block title | `Перекрытие сверху (по желанию)` |
| Optional help | `Для оценочной симуляции. Если не указать — берём сплошную 180 мм.` |
| Slab field | `Тип / толщина плиты` |
| Slab empty option | `Не указывать (180 по умолчанию)` |
| Slab options | `Сплошная 140 мм` · `Сплошная 160 мм` · `Сплошная 180 мм (по умолчанию)` · `Сплошная 200 мм` · `ПК 220 мм (пустотка)` · `Монолит 250 мм` |

### Controls

| Control | Action | Enabled |
| ------- | ------ | ------- |
| Room card (single select) | Sets `roomType` | Always |
| Area number input | Sets `ceilingAreaM2` | Always |
| Slab select | Sets optional `floorSlab` / key; empty → default 180 | Always |
| Sticky `Далее` | Go to Before/After | Enabled iff room type selected **and** area > 0. Other Room fields optional / may be `Не знаю` |
| Sticky `Назад` | Go to Start | Always |

### Validation messages

When Далее disabled, status may show: `выберите тип` and/or `укажите площадь`.

### Must NOT appear

Этаж / номер этажа; wall materials; Polyblock; dB tables; lead form.

---


### Room as primary diagnostic (owner 2026-09-13)

Room answers drive the **presumed comfort class** on the object. Type + area + slab stay. Additional fields — only if they change the model; prefer «Не знаю» over forcing expertise.

**Room fields — direction (owner 2026-09-13)**

**Locked / keep:** тип помещения · площадь · **тип перекрытия** · **толщина перекрытия** (separate; both allow `Не знаю`).

**Add to Room (confirmed intent):**

| Field | Role in model | UI sketch (RU) | Notes |
| ----- | ------------- | -------------- | ----- |
| Тип перекрытия | Construction family for baseline | `Монолит / сплошная ж/б` · `Многопустотная (ПК)` · `Деревянное / по балкам` · `Не знаю` | No mm on these cards |
| Толщина перекрытия | Mass proxy for Rw / baseline | **Ranges **confirmed**:** `До ~160 мм` · `Около 160–200 мм` · `Около 200–250 мм` · `Толще ~250 мм` · `Не знаю` | Owner: give spreads, not expert single values. Map ranges → model mid ASSUMPTION internally. Type×mm matrix forbidden |

**Thickness copy rule:** show **разбросы** for non-experts; engineering may map bucket → mid value inside the model (ASSUMPTION), never force user to pick exact mm.

Owner: do **not** put «пока без чистового пола» under floor-above — applies across situations / belongs to **стадия объекта**, not floor construction.
| Пол сверху | Strongest impact on удар / Lnw baseline | `Не знаю` · `Обычный пол (без плавающей схемы)` · `Есть плавающий пол / шумоизоляция в полу` | **Не знаю = valid** (owner). When unknown → conservative model ASSUMPTION (typical ordinary floor / no floating). Do not block Далее. |
**House-type coverage (confirmed):** most frequent apartment cases = panel / block / brick / monolith (+ clad monolith). Wood/beam for private or old beam floors. Do not add separate «сталинка» / «хрущёвка» cards — those are eras, partly covered by type (+ deferred year).
| Тип дома | Proxy when slab unknown; typical construction | `Панельный` · `Блочный` · `Кирпичный` · `Монолит` (в т.ч. монолит-кирпич) · `Деревянный / по балкам` · `Не знаю` | Common RU apartment stock. Сталинка → usually `Кирпичный` (hint, not separate card). Skip rare types. | `Панельный` · `Блочный` · `Кирпичный` · `Монолит` (в т.ч. монолит-кирпич) · `Деревянный / по балкам` · `Не знаю` | |
| Стадия объекта | Narrative without «мешает ли» | `Новостройка / до заселения` · `Идёт ремонт` · `Уже живут` · `Не знаю` | Confirmed | `Новостройка / до заселения` · `Идёт ремонт` · `Уже живут` · `Не знаю` | |
| Планируемый потолок | Fit story for MultiFrame under finish | `Натяжной` · `Гипсокартон / подвесной` · `Штукатурка или покраска` · `Другой потолок уже есть` · `Не знаю` | Post-demo 2026-10-13: full ceiling types, not stretch-only | |
| Шумные соседи сверху | Expectation of upstairs activity (not “does it bother you”) | `Не знаю` · `Обычно тихо` · `Сверху бывает шумно` · `Сверху часто шумно` | Owner chose **B** — softer third label. Fourth step = frequent noise. Replaces «кто сверху». Must **not** sound like complaint quiz |
| Тип шума сверху | Personalize Result air/impact emphasis | `Топот и шаги` · `Голоса и музыка` · `И то, и другое` · `Сложно сказать` | Asked **only** if sometimes/often noisy |
| Что важнее | Everyday goal (no MultiFrame brand in question) | `Чтобы сверху стало тише` · `Чтобы вас меньше было слышно сверху` · `Чтобы в комнате было меньше эха` · `Общий акустический комфорт` · `Пока не определился` | Product explained on Result |

**Field order on Room (2026-10-13):** тип дома → тип перекрытия (filtered by house) → толщина → тип комнаты + площадь → потолок → стадия → шумные соседи → [тип шума если шумно] → что важнее. **Пол сверху снят с UI.**

**Room required vs optional (confirmed 2026-09-13):**
- **Required to proceed:** `roomType` + `area` (> 0).
- **Optional (any may be `Не знаю`, still proceed):** slab type, slab thickness, floor above, house type, object stage, planned ceiling, noisy neighbors.
- Missing optional / `Не знаю` → model ASSUMPTIONs (conservative where it affects class/Δ; default slab ASSUMPTION remains e.g. solid 180 mm until tuned).

**Unknown floor-above (confirmed):** choosing `Не знаю` is normal and sufficient to proceed. Sim uses a declared conservative default (ASSUMPTION: treat as ordinary floor without floating scheme unless later tuned).

**Dropped:** «Кто сверху» (жилая/нежилое) — replaced by noisy-neighbors check.

**Year of construction — deferred (owner 2026-09-13: not in MVP):**

- **Can help:** (1) soft proxy for typical slab/era (хрущёвка / 90s panel / modern monolith); (2) framing that expectations/norms and build practice differ by generation; (3) when user picks «не знаю» on slab + house type.
- **Limits:** Russian residential acoustic limits are mainly by **building category А/Б/В** and construction type, not a simple “year → other Lnw number” table in the MVP model. Year ≠ substitute for slab + floor-above.
- **Decision:** do **not** add year/period in current MVP. Revisit later if slab+house type leave too much ambiguity.

---

## Screen 2b — Processing (`processing`)

### Goal

Minimal fullscreen loading ceremony after the last Room answer: the UI immerses in StP green; the user only sees a progress bar and rotating status lines. Must not look like Result.

### Visible elements

- Full-viewport green stage (`#01644f`); header, progress dots and sticky CTA hidden
- Centered **one-line** status (smooth out/in swap) + thin progress bar
- No skip control
- No cards, equalizers, chips, checklists, classes, or dB

### Exact primary copy (RU)

| Role | Text |
| ---- | ---- |
| Status lines (cycle ~10 s) | `Собираем модель вашего помещения` · `Считываем перекрытие и тип дома` · `Оцениваем, как слышно сверху сейчас` · `Считаем эффект MultiFrame` · `Собираем акустический профиль` · `Почти готово…` |

### Controls

| Control | Action | Enabled |
| ------- | ------ | ------- |
| Auto-advance | After ~10 s → Result (`derived` already computed) | Always |
| Reduced motion | ~400 ms → Result | When `prefers-reduced-motion` |

### Must NOT appear

Rw / Lnw / ΔdB, classes А/Б/В / «Дискомфорт», % quieter, sticky CTA, progress dots, header, hand-drawn illustrations, equalizer panels, answer chips, Polyblock, calculator.

### Navigation notes

- Entered only from the last Room substep (with `withDerived`).
- Back from Result returns to the last Room question — **does not** replay Processing.

---

## Screens removed from survey (2026-09-13)

### ~~Scenarios (`scenarios`)~~ — **removed**

Do **not** ask «Что слышите сверху?» / multi-select of bothersome noises. Owner: client may not live in the apartment yet or may not have thought about noise; the quiz can push them to conclude nothing bothers them.

Typical upstairs noises (steps, talk, TV, …) may appear as **illustrations** in Before/After, Audio demo, or Result — not as required answers.

### ~~Current state (`current`)~~ — **removed**

Do **not** ask complaint-framed «Как сейчас?» / «мешает ли». Same anti-pattern as Scenarios. Comfort class before→after is **derived** by the expert/placeholder model from room (+ optional slab), not from a self-reported bother score.

---

## Screen 3 — Before / After (`beforeAfter`)

### Goal

Show the comfort shift for this room: ordinary stretch ceiling vs MultiFrame. **Hybrid class is the primary signal** (not old `Тихо/Терпимо/Мешает`). Full pack on one scroll: **verdict strip on top**, numbers/charts/explanations below (owner Q4). Emotional bullets — **rewrite from scratch** (owner 2026-09-13: prior copy obsolete).

### Visible elements

- **Top:** short conclusion with class shift `Сейчас: … → с MultiFrame: …` before deep dive.
- Title, subtitle, Before card, After card, secondary SimCompare (hybrid classes, no feeling chips), numbers + chart block, honesty note, sticky CTA with next label override.
- **Charts block (C):** class scale А→Б→В with move arrow, then before/after bars (ΔRw / ΔLnw) with captions; both required.
- **Below fold OK:** detailed oriented numbers/charts — user scrolls as needed.

### Exact primary copy (RU)

| Role | Text |
| ---- | ---- |
| Title | `До и после` |
| Subtitle | `Как меняется комфорт комнаты с MultiFrame` |
| Before tag | `Сейчас типично` |
| Before h2 | `Обычный потолок` |
| Before bullets | `Соседи сверху слышны слишком отчётливо` · `Бытовые звуки сверху легко различить` · `Сейчас: {hybrid class}` |
| After tag | `С MultiFrame` |
| After h2 | `Бескаркасная акустика` |
| After bullets | `В комнате заметно спокойнее` · `Ударный и воздушный шум воспринимаются мягче` · `С MultiFrame: {hybrid class}` |
| Numbers section title | `Оценка в цифрах` |
| Honesty note | `Цифры — ориентир, не лабораторный замер. Потолок смягчает удары сверху, а норму по удару часто закрывает пол у соседа.` |
| Sticky next | `Услышать разницу` |

**Class rule (confirmed):** Before and After cards both end with the hybrid class from the Room model. Same vocabulary as the top verdict strip. No `Тихо` / `Терпимо` / `Мешает`.

**Bullet frame (confirmed A):** exactly **two** short sensation lines + class line per card. Wording may be tuned; structure locked.

### Controls

| Control | Action | Enabled |
| ------- | ------ | ------- |
| Sticky `Услышать разницу` | Go to Audio | Always |
| Sticky `Назад` | Go to Room | Always |

### Validation messages

None.

### Must NOT appear

«вдвое спокойнее» on the impact channel; guaranteed SP compliance; framed-system comparison; Polyblock.

---

## Screen 4 — Audio (`audio`)

### Goal

**Hear the MultiFrame effect for this room** — not a generic showroom contrast. Physics frame remains Trofimov’s two indices (**Rw** / **Lnw**). UI groups examples into **воздушный · ударный · смешанный**. «После» applies the **case-specific** reduction from the Room model: lower **level** and **frequencies** (not “just quieter”).

### Visible elements

- Title, short subtitle (air / impact / mixed explained in plain language).
- Three sections: **Воздушный шум** · **Ударный шум** · **Смешанный шум**.
- Per section: locked household example chips/cards; each with До / После play.
- Per example (or per group): shown reduction for **this case** — e.g. `≈ −X%` and/or oriented Δ — from derived sim (`pre_lab`).
- Honesty near impact (and mixed as needed): floor above often complements ceiling.
- Compact audio disclaimer; sticky CTA.

### Exact primary copy (RU) — chrome

| Role | Text |
| ---- | ---- |
| Title | `Услышать разницу` |
| Subtitle | `Сравните звук обычного потолка и потолка с MultiFrame` |
| Channel air title | `Воздушный шум` |
| Channel air help | `Через перекрытие (Rw): речь, музыка, лай.` |
| Channel impact title | `Ударный шум` |
| Channel impact help | `Удар по плите (Lnw): бег, мебель, когти.` |
| Channel mixed title | `Смешанный шум` |
| Channel mixed help | `И воздух, и удар сразу — бытовая техника.` |
| Reduction line | `≈ −{n}% · ориентир {Δ} дБ` (C — both; % = **perceived** reduction from Δ, not linear Δ/level) |
| Log footnote | `Шкала дБ логарифмическая: −8 дБ ≈ вдвое тише по ощущению.` |
| Before button | `До` |
| After button | `После` |
| Playing state | `Играет` · `нажмите — пауза` |
| Impact honesty | `По удару потолок смягчает; пол сверху часто дополняет результат.` |
| Audio disclaimer | `Аудио — иллюстрация приёма в этой комнате и эффекта MultiFrame (ориентир до лабораторных данных), не лабораторный замер.` |
| Sticky next | `Смотреть итог` |

### Household examples — locked (owner 2026-09-13, D)

| Group | Examples (exact RU labels) |
| ----- | -------------------------- |
| **Воздушный** | `Лай собаки` · `Музыка` · `Громкие разговоры` |
| **Ударный** | `Детский бег` · `Перестановка мебели` · `Цоканье когтей собаки` |
| **Смешанный** | `Стиральная машина` · `Пылесос` |

**Processing ASSUMPTION for смешанный:** After uses a blend of this room’s air + impact MultiFrame effect (both level and EQ). Exact blend weights — refine with Trofimov; until then treat as combined oriented cut, still `pre_lab`.

### Controls

| Control | Action | Enabled |
| ------- | ------ | ------- |
| Example select | Sets active stub within group | Always |
| До / После | Toggle play with case filter on After | Always when example present |
| Sticky `Смотреть итог` | Go to Result | Always |
| Sticky `Назад` | Go to Before/After | Always |

**Audio rules (confirmed 2026-09-13; room-truthful 2026-09-17)**

- **Structure:** UI = three example groups (воздух / удар / смешанный); model still Rw + Lnw.
- **Examples:** locked list above — do not invent extra stubs without owner.
- **Personalization:** **До** = stem × room gain from L2_before (group-specific refs; quiet good rooms cut almost 1:1). **После** = that same «До» base × relative MultiFrame transfer (`afterGainDb` = ΔdBA + residual `deltaEqDb` = ΔL(f) − afterGain) — never an independent absolute remap from the sample.
- **Processing:** through-wall stems; trim ≤0 → shared beforeGain → on После only: broadband ΔdBA (−14…−3) + residual peaking ΔL(f); soft peak safety only (must not squash До into После). Mixed = blend of air+impact. Exact Δ remains `pre_lab`.
- **Reduction UI (C):** always show **both** `≈ −{n}%` and short Δ caption (`ориентир −8 дБ` / case Δ). `%` = **perceived loudness** map from Δ (rule of thumb ASSUMPTION: ~−10 dB ≈ half as loud → ~−50%; ~−8 dB ≈ ~−40…−45% perceived — tune with Trofimov). **Never** compute % as linear `(64−56)/64` or `8/64`.
- **Log education (required):** visible footnote that dB is logarithmic — small dB numbers = large sensation change; example `64 → 56` is substantial, not “a few percent”.
- **Impact honesty:** ceiling softens impact; floating floor above often needed for norm — visible near impact (and mixed if impact-heavy).
- **Labeling:** keep `ориентир` / `pre_lab` — not lab measurement; drop old «контраст усилен для показа» as the *primary* promise.
- Mode: real MP3 stems in `public/audio/`; Web Audio room graph. Legacy `stub:` synth kept as fallback only.

### Validation messages

None.

### Must NOT appear

- Old showroom-only promise «До заведомо громче / После утрированно тише»
- Scenario / «что мешает» quiz
- Claims of laboratory measurement or “certified” WAV as lab proof
- Silence or identical before/after (product bug — difference must be audible)
- Polyblock / walls scope

---

## Screen 5 — Result / Profile (`result`)

### Goal

Walk **norms → current → MultiFrame → why → CTA** on one scroll. Official SP class lives in block headers; everyday felt 5-step axes sit under them. CTA to calculator and consultation.

### Visible elements

- **1. Нормы комфорта в стройке:** short SP explanation + А/Б/В Rw/Lnw table + construction context (перекрытие + тип дома).
- **2. Текущая ситуация:** header `Сейчас: уровень комфорта по нормам «…»` + two felt axes (now only).
- **3. С MultiFrame:** header `С MultiFrame: уровень комфорта по нормам «…»` + felt axes with now/after + % quieter + compact audio + frequency charts.
- **4. Уникальность системы MultiFrame:** lead + 5 pillar cards (StP positioning), no film comparison.
- **5. Следующий шаг:** calculator + StP consultation link + summary copy + restart.
- Title `Акустический профиль помещения`. Subtitle about **your object**.
- Do **not** show: top ComfortScale table, separate «Что изменится на слух», «Расчёт и нормы / подробности», `LOG_DB_FOOTNOTE`, long verdictLead.

### Exact primary copy (RU)

| Role | Text |
| ---- | ---- |
| Title | `Акустический профиль помещения` |
| Subtitle | `Ориентир комфорта для вашего объекта и следующий шаг к расчёту` |
| Norms title | `Нормы комфорта в стройке` |
| Now title | `Текущая ситуация` |
| Now header | `Сейчас: уровень комфорта по нормам «{official}»` |
| MF title | `С MultiFrame` |
| MF header | `С MultiFrame: уровень комфорта по нормам «{official}»` |
| Channel axes | `Воздушный шум (голоса и музыка)` · `Ударный шум (шаги и падения)` |
| Felt steps | `Сильный дискомфорт` · `Ниже допустимого` · `Допустимый (В)` · `Комфорт (Б)` · `Высокий комфорт (А)` (aligned with SP housing norms) |
| Level in room | `Сейчас: ≈ N дБ` · under MultiFrame also `→ с MultiFrame: ≈ M дБ` |
| Audio groups | `Воздушный шум` · `Ударный шум` · `Смешанный шум` |
| Why title | `Уникальность системы MultiFrame` |
| Why lead | `Эффективно. Безопасно. Без долгой стройки.` |
| Why pillars | Звукоизоляция и акустический комфорт · Безопасность · Экологичность · Быстрый монтаж · Универсальность (title + one line each) |
| Next-step title | `Следующий шаг` |
| Calculator CTA | `Открыть калькулятор MultiFrame` |
| Lead open | `Запросить консультацию или подбор` |
| Summary | `Скопировать сводку` |
| Restart | `Пройти ещё раз` |
| Sticky next | `Открыть калькулятор MultiFrame` (opens calculator; always enabled) |

**Official header labels:** `Высокий комфорт (А)` · `Комфорт (Б)` · `Допустимый (В)` · `ниже допустимого` (no «Д»).

**Dynamic whyMultiFrame lines (up to ~4, from answers):** examples locked in code intent —

- impact/mixed: `Ударный шум сверху идёт через плиту — бескаркасная MultiFrame работает на потолке, без каркаса.`
- airborne/mixed: `Воздушный шум тоже проходит через перекрытие; акустика потолка смягчает «соседский фон».`
- steps/drop: `Шаги и падения — самые частые жалобы без акустической подготовки потолка.`
- bothers / quiet / else variants about comfort reserve without framed height loss.

### Controls

| Control | Action | Enabled |
| ------- | ------ | ------- |
| `Открыть калькулятор MultiFrame` (in-body + sticky) | Open calculator URL in new tab | Always (area may be omitted only if invalid — MVP requires area from Room) |
| `Запросить консультацию или подбор` | Open `https://stp-multiframe.ru/#section-partner` in a new tab | Always |
| `Пройти ещё раз` | Reset session → Start | Always |
| Sticky `Назад` | Go to Audio | Always |

### Validation messages

Consultation CTA has no in-app form fields.

### Must NOT appear

Separate disabled «Консультация (недоступно в демо)»; primary labels «Оставить заявку (демо)» / «Заявка · демо»; fake live StP phone/email; lab certificate; Polyblock upsell; walls/floors systems; guaranteed Lnw norm from ceiling alone; fictional class «Д»; felt words in official SP headers.

---

## Empty / error / demo states (global)

| State | Behavior |
| ----- | -------- |
| Empty scenarios | **N/A** — screen removed |
| Empty room type / area | Cannot proceed; `выберите тип` / `укажите площадь` |
| Missing slab | Default solid **180 mm** silently for sim |
| Audio no matching pair | Fallback both pairs + `демо-набор` |
| Audio playing | Show `Играет` / pause affordance |
| Lead form | **Removed** — consultation CTA opens the StP site contact block |
| Consultation button | **Removed** as separate disabled control — `Запросить консультацию или подбор` covers consultation/selection |
| Theme | Light/dark client toggle; content identical |
| Reduced motion | Keep functionality; reduce decorative motion |

---

## Mobile rules

- First viewport and forms denser ≤520px (card grids, sticky question headers where used).
- Sticky header + progress + bottom CTA; content padded above footer (`safe-area` aware).
- Touch targets ≥44px on primary actions.
- Progress labels may hide; product name may hide ≤420px.
- The shared comfort axis stays common to both rows on narrow widths; audio keeps large `До` / `После` controls.
- No desktop-only tech dumps; same one flow for showroom phone handoff.

---

## SimCompare component contract

**Purpose:** show before→after **hybrid comfort class** + oriented metrics. Owner 2026-09-13: rewrite away from old feeling chips.

**Inputs**

- `sim: DerivedSimulation` (before/after sides, delta, deltaRange, uiLabel, honestLines, hybridClassBefore/After, slabKey, source, disclaimer)
- `emphasize?: 'before' | 'after' | 'both'` (default `both`)
- `tone?: 'primary' | 'secondary'` (secondary = quieter digits when dual cards are on screen)

**Must render**

- Badge = `По полевым замерам на объектах` (field_objects frame; not a lab certificate)
- Columns: `Сейчас` · `С MultiFrame`
- **Hybrid class labels (primary):** `Высокий комфорт (А)` · `Комфорт (Б)` · `Допустимый (В)` · `Ниже В` — plus soft norm hint
- **Do NOT render** old feeling chips `Тихо` · `Терпимо` · `Мешает` (obsolete)
- **Chart A — class scale:** visual `Ниже В → В → Б → А` showing before→after move; below-scale has no fictional letter
- **Chart B — bars:** before/after bars for oriented ΔRw (воздух) and ΔLnw (удар); secondary to class scale; always captioned
- Channels: `Воздух` / `Удар` with caption + sensation + tertiary dB / Δ
- Range line when useful: from **this room’s** `deltaRange` (not a global +8…+12 / −6…−10)
- `honestLines` + `DISCLAIMER_SIMULATION`

**Must NOT render (MVP)**

- Frequency / spectrum charts **as the primary** evidence visual (they sit under Δ + quietness bars on Result)
- Feeling chips `Тихо` / `Терпимо` / `Мешает`

**Must NOT**

- Present Δ as measured lab result
- Use «вдвое спокойнее» on impact hero
- Claim full Lnw norm from ceiling alone

**Effect model (two layers — see Acoustic room model below)**

| Item | Value |
| ---- | ----- |
| Construction anchors (bare, no drum) | solid 180 → Rw 54 / Lnw 76; ПК 220 → 52/74 (Trofimov) |
| Other solid (Trofimov) | 100→47/82 … 250→56/74 |
| MultiFrame Δ | Field-calibrated ΔR(f): bare ~ΔRw 1…9 / |ΔLnw| 4…7; floating residual ~1 (Andrianova+Polyblock). **Not** a flat +10/−8 |
| UI range | From the room model (`deltaRange`), not hardcoded |
| NORMS (Rw min / Lnw max) | A 54/55; B 52/58; V 50/60 |
| source | `field_in_situ` |
| disclaimer | `field_objects` |

---

## Acoustic room model

Two layers so each Room answer moves the right number. Code: `src/state/acoustic/*` + facade `deriveSimulation`.

**Construction** (slab type/thickness, house as slab proxy *and* flanking, floor above, object stage, stretch drum) → Rw / Lnw and R(f) / impact isolation. This drives the SP class table and frequency charts. Charts are **material-shaped** (not one zamer curve globally shifted).

**Source / room** (neighbors, room type, area, furnishing from stage) → received band levels, then A-weighted dBA. This drives quietness bars, perceived %, and audio copy. Neighbors **never** change slab Rw/Lnw.

| Answer | Where it goes |
| ------ | ------------- |
| Slab type + thickness | Trofimov **indices** + physics **shape**: mass law (~6 dB/oct), coincidence fc≈c²/(1.8 c_L h) for RC, ПК void dip 100–250 Hz, wood LF leak + deck coincidence ~1.25 kHz. UI mids 150 / 180 / 225 / 260 mm. Wood bare **ASSUMPTION** Rw ~46 / Lnw ~84 (not Trofimov ТС-6.x) |
| House type | If slab «Не знаю»: panel/block → ПК 220; monolith → solid ~200; brick → solid ~180; wood → wood; else solid 180. **Always in product mode:** in-situ flanking — panel/block/unknown mass-stock prior lower R′w; brick/monolith milder but not lab-zero. |
| Floor above | Ordinary: ΔLnw ~−2, ΔRw ~0 (no fake +1). Floating: ΔLnw ~−22, ΔRw ~+3 (Trofimov mid). Newbuild + unknown floor = **bare** slab |
| Object stage | Floor prior when floor unknown (newbuild = bare). Receiving-room absorption: empty newbuild louder; occupied furniture raises α |
| Planned ceiling | Stretch drum in «сейчас»: index ≈ −2 дБ Rw + mid dip; MultiFrame removes it. Product baseline always includes drum vs MultiFrame |
| In-situ vs lab | Trofimov anchors stay lab fixtures. Product `buildConstruction` adds leak ≈ −2 Rw / +1 Lnw (joints, sockets). Typical panel «сейчас» Rw ~44–48, not 50–54. |
| Area | Does not change Rw. Enters ISO-style `10·log10(S/A(f))` with S = this ceiling. Size is a small term vs kitchen hardness / emptiness |
| Room type | Source **spectrum** + absorption: kids → impact 100–250 Hz; kitchen hard α and appliance mid-HF; bedroom more textiles; office speech 250–2000 Hz |
| Neighbors | Source level + shape only: quiet −4, unknown 0, sometimes +3, often +7 and extra LF (music). Not Rw |

**Frequency curves:** 1/3-octave 100…5000 Hz. Airborne from Sharp/Cremer mass law + coincidence + kind texture, then calibrated so ISO 717 Rw matches Trofimov (+ floor/drum/flanking). Impact Ln from RC tapping prototype + mass/kind, then floor ΔLn(f), then Lnw calibration. Anchors: bare 180 mm = 54/76; ПК 220 = 52/74.

**In-room level:** `L2(f) = L1(f) − R(f) + 10·log10(S/A(f))` (air); impact `Ln(f) + 10·log10(10/A) + source`. Displayed loudness = A-weighted energy sum (IEC 61672). A(f) from room type α and stage furnishing (Sabine surfaces, h=2.7 m).

**MultiFrame** (`field_in_situ`): ΔR(f) / Δiso(f) from object tests — foamblock, Kostroma, Andrianova (monolith 200 + Полиблок 10 under 60 mm screed). Bare/ordinary interpolate by Rw; floating uses Andrianova residual. **Never** take Lnw to class A (55) by the ceiling alone. See `docs/sources/08-multiframe-field-anchors.md`.

**Honesty on Result:** indices are about the floor/ceiling construction (and house flanking); loudness in the room also depends on how noisy it is upstairs, room finish, and area. Ceiling softens impact; the Lnw A-norm often needs the neighbor’s floating floor.

Golden anchors: `npx tsx src/state/acoustic/check.ts` (180=54/76; ПК 220=52/74; wood weak at 100 Hz; floating ΔI larger at 500 than 100; panel Rw < brick; kitchen louder than bedroom; neighbors do not change Rw; MultiFrame does not reach Lnw A on a bare slab).

---

## Audio component contract

| Rule | Spec |
| ---- | ---- |
| Purpose | Hear **case-specific** MultiFrame effect on household noises (Trofimov Rw/Lnw + mixed UI group) |
| UI groups | **Голоса и музыка** · **Шаги и удары** · **Бытовой шум** |
| Examples (locked) | Air: `Лай собаки` · `Музыка` · `Громкие разговоры`. Impact: `Детский бег` · `Перестановка мебели` · `Цоканье когтей собаки`. Mixed: `Стиральная машина` · `Пылесос` |
| After processing | Apply this room’s oriented Δ: cut **level + frequencies** (mixed = blend air+impact ASSUMPTION) |
| Reduction UI | Parent block `Что изменится на слух` shows `≈ {n}% тише` as primary, oriented `{Δ} дБ` as secondary and one bar per noise type. Compact audio controls do not repeat percentages or Δ. |
| Log footnote | Shown once for the combined effect + audio block: `Шкала дБ логарифмическая: −8 дБ ≈ вдвое тише по ощущению.` |
| Impact honesty | Near impact (and mixed if needed): ceiling softens; floor above often complements |
| Sources | Web Audio / procedural stubs OK until real stems; must obey processing rules |
| Labels | `ориентир` / not lab; drop primary promise of «контраст усилен» |
| Controls | Large `До` / `После` with pause; example picker per group |
| Accessibility | Aria includes group + example name |

---

## CTA query params & demo lead

### Calculator URL

Base: `https://paulos99.github.io/MF_StP/`

| Param | Source |
| ----- | ------ |
| `area` | ceiling m² (> 0) |
| `mode` | always `area` when area present |
| `walls` | always `0` — ceiling only, no wall surfaces |
| `source` | always `problemomer` |
| `roomType` | enum: `living` \| `bedroom` \| `kids` \| `kitchen` \| `office` \| `other` (optional metadata) |

Calculator opens area mode, fills ceiling area, clears walls, runs quick ceiling calc.

### Session / CTA payload (`schemaVersion: 1`)

Visible/export shape includes: `{ schemaVersion, answers, derived, audio, cta }` where `cta` carries `{ roomType, ceilingAreaM2 }` (no scenarios).

### Lead handoff (`buildLeadHandoff`, 2026-09-16)

MVP `console.info('[lead-demo]', handoff)` shape:

`{ source: 'problemomer', timestamp, interestFor, name?, phone?, room, cta, sim: { before, after, delta, perceivedAirPct, perceivedImpactPct }, whyMultiFrame }`

Client path also: `buildClientSummary(session)` — plain-text digest for clipboard / менеджер.

### Consultation CTA

- Purpose: request **consultation or material selection** on the official StP site (not an in-app form).
- Open: `Запросить консультацию или подбор` → `https://stp-multiframe.ru/#section-partner` in a new tab (bottom contacts / «Связаться с нами»).
- No in-app name/phone form and no invented StP CRM endpoint.
- No separate disabled «Консультация» button.
- `buildLeadHandoff` remains for `buildClientSummary` (clipboard digest).
- Result motion is limited to scale markers and effect bars; Room progress remains. Honor `prefers-reduced-motion`.

### Anonymous analytics (owner 2026-10-10)

- **Metrics only** — funnel, channels, CTA clicks, demand segments. **No leads / phones / CRM.**
- Soft attribution via URL: `utm_*`, `ref`, `mgr` (first-touch in `sessionStorage`). See `docs/analytics.md`.
- Yandex Metrika goals: `pm_start`, `pm_room_step`, `pm_result_view`, `pm_cta_calc`, `pm_cta_consult`, `pm_share`, `pm_pdf`, `pm_audio_play` (gated by cookie consent; `VITE_YM_ID`).
- On Result: `buildAnalyticsPayload` → optional `POST` to `VITE_ANALYTICS_INGEST_URL` (no contact fields).
- Privacy note: `public/privacy.html`.

---

## Acceptance tests

### A — Visitor on StP site

1. Open Start: **no** role picker, object H1, new lead, **no dB**, tap `Начать`.
2. Room: house/slab first, then room + area > 0; **no** «пол сверху»; «Шум сверху» without «мешает ли» subtitle; optional wish; `Далее`.
3. Processing: fullscreen green loading with one-line status animation (no classes/dB); auto → Result.
4. Result reads as: нормы → сейчас → MultiFrame → вывод → CTA.
5. Official headers use А/Б/В (or «ниже допустимого»); felt 5-step axes on channels; audio Воздушный / Ударный / Смешанный.
6. Calculator preserves `area` (+ `roomType`); consultation CTA opens StP site `#section-partner`; copy summary, restart work.
7. Must **not** present role split, Scenarios, Current complaint, floor-above, or standalone Before/After and Audio screens.
8. Back from Result returns to Room (last question), **without** replaying Processing.

**Pass:** completes without tech dumps; never promises Lnw norm from ceiling alone; sticky CTA OK on phone.

### B — Specialist with client ≤ 3 minutes

1. Same Start (no role). Default slab OK (`Не знаю`).
2. External factors quickly → room/area → Result.
3. Result full pack; copyable summary; norms/MF evidence before the final calculator / consultation block.
4. ≤3 min without scenario/complaint quiz.

**Pass:** path ≤3 min; audio shows case-specific two-channel difference; norms then current then MultiFrame; calculator CTA works.

---

## Doc drift note

`README.md` historically said the qualitative model is without fake ΔRw/ΔLnw. **Product decision (this spec + checklist):** placeholders **are** shown as tertiary marketing_placeholder figures with pre_lab labeling. Prefer this spec over the older README phrasing when they conflict.