# MultiFrame field anchors (object tests)

Source archive: `данные мультифрейм по перекрытиям.zip` (owner, 2026-10).  
Model consumer: `src/state/acoustic/multiframe.ts` (`source: field_in_situ`).

Not a laboratory certificate — in-situ object measurements used to calibrate demo ΔRw / ΔLnw and spectral shapes.

## Anchors

| Code | Object / protocol | Construction in source room (КВУ) | Rw before → after | ΔRw | Impact |
|------|-------------------|-----------------------------------|-------------------|-----|--------|
| Foam | Пеноблок 120 мм, ρ≈650 | Light enclosing partition (air proxy for weak / wood) | 38 → 47 | **+9** | No impact series in file |
| Kostroma | Бетон 160 мм, ρ≈1000 | Standard slab **without** floating floor in protocol | 49 → 51 | **+2** | Lnw ≈ 76 → 70 (**−6**); mean Δiso ≈ +9.5 dB |
| Andrianova | Монолит 200 мм, ρ=2200 | Monolith **+ Полиблок 10 under 60 mm screed** (floating floor above) | 57 → 58 | **+1** | Lnw ≈ 75 → 74 (**−1**); isolation index 32→32 |

### Andrianova ≠ bare heavy monolith

The small air and near-zero impact Δ on Andrianova are the **residual** MultiFrame effect on top of an already-isolated floating floor (Polyblock 10 + 60 mm screed), not “MF is weak on thick concrete.”

In the app:

- `floor === 'floating'` → Andrianova residual targets (ΔRw≈1, |ΔLnw|≈1) and spectra
- `bare` / `ordinary` → foam ↔ Kostroma by `before.Rw`; heavy bare impact follows Kostroma with mild roll-off (does **not** copy Andrianova’s near-zero ΔLnw)

## Stretch ceiling (Andrianova variants)

Same floating floor above; ceiling variants vs bare stretch (TONL):

- TONL worsens indices (Rw 55, impact index 28)
- MF recovers to Rw 58 / impact 32

Product baseline often includes stretch «drum»; `drumLift` in the model is a modest recovery on top of field Δ shapes.

## Files in the archive

- `ЗА МФ ПОТОЛОК` — foamblock air (→ Foam)
- `ЗА МФ ПЕРЕКРЫТИЕ СТАНДАРТНОЕ КОСТРОМА` — Kostroma air + impact
- `ЗА МФ ПЕРЕКРЫТИЕ ТЯЖ АНДРИАНОВА` — Andrianova + Polyblock floor; variant sheet includes TONL / MF
- JPG charts: monolith 200, concrete 160, foamblock 120
- Tech sheet PDF (graphics; no extractable text)

Normalized 1/3-oct Δ arrays live in TypeScript; raw XLS are not committed.
