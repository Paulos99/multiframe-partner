import { Screen } from '../../ui/Screen';
import { CardSelect } from '../../ui/CardSelect';
import { Field, TextInput } from '../../ui/Field';
import { useSession } from '../../state/SessionContext';
import {
  HOUSE_TYPE_OPTIONS,
  NOISE_KIND_OPTIONS,
  NOISY_NEIGHBORS_OPTIONS,
  OBJECT_STAGE_OPTIONS,
  PLANNED_CEILING_OPTIONS,
  ROOM_FACTOR_GROUP,
  ROOM_FACTOR_GROUP_LABEL,
  ROOM_TYPE_LABELS,
  ROOM_WISH_OPTIONS,
  SLAB_THICKNESS_OPTIONS,
  SLAB_TYPE_OPTIONS,
  allowedSlabTypes,
  type RoomSubstep,
  type RoomType,
} from '../../state/types';
import { roomNextHint, visibleRoomSubstepIndex, visibleRoomSubsteps } from '../../state/session';
import styles from './RoomScreen.module.css';

const ROOM_TYPES = Object.keys(ROOM_TYPE_LABELS) as RoomType[];

const SUBSTEP_TITLE: Record<RoomSubstep, string> = {
  houseType: 'Укажите тип дома',
  slabType: 'Выберите тип перекрытия',
  slabThickness: 'Выберите толщину перекрытия',
  basics: 'Укажите тип комнаты и площадь',
  plannedCeiling: 'Какой у вас потолок?',
  objectStage: 'На какой стадии объект?',
  noisyNeighbors: 'Насколько шумно сверху?',
  noiseKind: 'Что именно слышно сверху?',
  roomWish: 'Что для вас важнее всего?',
};

const SUBSTEP_LEAD: Partial<Record<RoomSubstep, string>> = {
  slabType: 'Покажем только варианты, которые обычно бывают в таком доме.',
  noiseKind: 'Простыми примерами — так точнее подсветим, что важно именно вам.',
  roomWish: 'Можно выбрать несколько вариантов.',
};

export function RoomScreen() {
  const {
    session,
    setRoomType,
    setRoomTypeCustom,
    setCeilingArea,
    setSlabType,
    setSlabThickness,
    setHouseType,
    setObjectStage,
    setPlannedCeiling,
    setNoisyNeighbors,
    setNoiseKind,
    toggleRoomWish,
    canGoNext,
  } = useSession();
  const room = session.answers.room;
  const sub = session.roomSubstep;
  const hint = roomNextHint(session);
  const visible = visibleRoomSubsteps(room);
  const idx = visibleRoomSubstepIndex(sub, room);
  const total = visible.length;
  const progressPct = Math.round(((Math.max(idx, 0) + 1) / total) * 100);
  const factorLabel = ROOM_FACTOR_GROUP_LABEL[ROOM_FACTOR_GROUP[sub]];
  const slabOptions = SLAB_TYPE_OPTIONS.filter((opt) =>
    allowedSlabTypes(room.houseType).includes(opt.id),
  );
  const slabHint =
    room.houseType === 'panel' || room.houseType === 'block'
      ? 'Для панельного и блочного дома обычно многопустотная плита (ПК).'
      : room.houseType === 'wood'
        ? 'В деревянном доме перекрытие чаще по балкам.'
        : room.houseType === 'brick' || room.houseType === 'monolith'
          ? 'Чаще сплошная ж/б плита; иногда многопустотная (ПК).'
          : undefined;

  return (
    <Screen
      stickyHead
      eyebrow={factorLabel}
      lead={`Вопрос ${Math.max(idx, 0) + 1} из ${total} · ${factorLabel}`}
      title={SUBSTEP_TITLE[sub]}
    >
      {SUBSTEP_LEAD[sub] ? <p className={styles.subLead}>{SUBSTEP_LEAD[sub]}</p> : null}

      <div className={styles.progressWrap} aria-hidden>
        <div className={styles.progressTrack}>
          <div className={styles.progressFill} style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      {sub === 'houseType' ? (
        <div className={styles.grid}>
          {HOUSE_TYPE_OPTIONS.map((opt) => (
            <CardSelect
              key={opt.id}
              dense
              title={opt.label}
              hint={opt.hint}
              selected={room.houseType === opt.id}
              onClick={() => setHouseType(opt.id)}
            />
          ))}
        </div>
      ) : null}

      {sub === 'slabType' ? (
        <>
          {slabHint ? <p className={styles.subLead}>{slabHint}</p> : null}
          <div className={styles.grid}>
            {slabOptions.map((opt) => (
              <CardSelect
                key={opt.id}
                dense
                title={opt.label}
                selected={room.slabType === opt.id}
                onClick={() => setSlabType(opt.id)}
              />
            ))}
          </div>
        </>
      ) : null}

      {sub === 'slabThickness' ? (
        <div className={styles.grid}>
          {SLAB_THICKNESS_OPTIONS.map((opt) => (
            <CardSelect
              key={opt.id}
              dense
              title={opt.label}
              selected={room.slabThickness === opt.id}
              onClick={() => setSlabThickness(opt.id)}
            />
          ))}
        </div>
      ) : null}

      {sub === 'basics' ? (
        <>
          <div className={styles.grid}>
            {ROOM_TYPES.map((type) => (
              <CardSelect
                key={type}
                dense
                title={ROOM_TYPE_LABELS[type]}
                selected={room.roomType === type}
                onClick={() => setRoomType(type)}
              />
            ))}
          </div>

          {room.roomType === 'other' ? (
            <Field label="Название комнаты" hint="Как назвать это помещение в отчёте">
              <TextInput
                type="text"
                inputMode="text"
                autoComplete="off"
                maxLength={60}
                placeholder="Например, гардеробная"
                value={room.roomTypeCustom}
                onChange={(e) => setRoomTypeCustom(e.target.value)}
                autoFocus
              />
            </Field>
          ) : null}

          <Field
            label="Площадь потолка, м²"
            hint="Нужна, чтобы посчитать количество панелей"
          >
            <TextInput
              type="number"
              inputMode="decimal"
              min={1}
              step={0.1}
              placeholder="Например, 18"
              value={room.ceilingAreaM2 ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                setCeilingArea(v === '' ? null : Number(v));
              }}
            />
          </Field>

          {!canGoNext && hint ? (
            <p className={styles.validation} role="status">
              {hint}
            </p>
          ) : null}
        </>
      ) : null}

      {sub === 'plannedCeiling' ? (
        <div className={styles.grid}>
          {PLANNED_CEILING_OPTIONS.map((opt) => (
            <CardSelect
              key={opt.id}
              dense
              title={opt.label}
              selected={room.plannedCeiling === opt.id}
              onClick={() => setPlannedCeiling(opt.id)}
            />
          ))}
        </div>
      ) : null}

      {sub === 'objectStage' ? (
        <div className={styles.grid}>
          {OBJECT_STAGE_OPTIONS.map((opt) => (
            <CardSelect
              key={opt.id}
              dense
              title={opt.label}
              selected={room.objectStage === opt.id}
              onClick={() => setObjectStage(opt.id)}
            />
          ))}
        </div>
      ) : null}

      {sub === 'noisyNeighbors' ? (
        <div className={styles.grid}>
          {NOISY_NEIGHBORS_OPTIONS.map((opt) => (
            <CardSelect
              key={opt.id}
              dense
              title={opt.label}
              selected={room.noisyNeighbors === opt.id}
              onClick={() => setNoisyNeighbors(opt.id)}
            />
          ))}
        </div>
      ) : null}

      {sub === 'noiseKind' ? (
        <div className={styles.grid}>
          {NOISE_KIND_OPTIONS.map((opt) => (
            <CardSelect
              key={opt.id}
              dense
              title={opt.label}
              hint={opt.hint}
              selected={room.noiseKind === opt.id}
              onClick={() => setNoiseKind(opt.id)}
            />
          ))}
        </div>
      ) : null}

      {sub === 'roomWish' ? (
        <>
          <div className={styles.grid}>
            {ROOM_WISH_OPTIONS.map((opt) => (
              <CardSelect
                key={opt.id}
                dense
                title={opt.label}
                selected={room.roomWishes.includes(opt.id)}
                onClick={() => toggleRoomWish(opt.id)}
              />
            ))}
          </div>
          {!canGoNext && hint ? (
            <p className={styles.validation} role="status">
              {hint}
            </p>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
