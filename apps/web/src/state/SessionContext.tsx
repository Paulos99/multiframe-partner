import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type {
  HouseTypeOption,
  NoiseKindOption,
  NoisyNeighborsOption,
  ObjectStageOption,
  PlannedCeilingOption,
  RoomAnswers,
  RoomType,
  RoomWishOption,
  SessionState,
  SlabThicknessOption,
  SlabTypeOption,
  WizardStep,
} from './types';
import { allowedSlabTypes, ROOM_SUBSTEPS, shouldAskNoiseKind } from './types';
import {
  canProceed,
  createInitialSession,
  nextRoomSubstep,
  nextStep,
  prevRoomSubstep,
  prevStep,
  withDerived,
} from './session';
import { tryRestoreSharedSession } from './shareLink';
import { toggleRoomWish as toggleWishInList } from './wish';
import { resetAnalyticsSessionId } from '../analytics';
import { useFunnelAnalytics } from '../analytics/useFunnelAnalytics';

interface SessionApi {
  session: SessionState;
  goNext: () => void;
  goBack: () => void;
  goTo: (step: WizardStep) => void;
  restart: () => void;
  setRoomType: (roomType: RoomType) => void;
  setCeilingArea: (area: number | null) => void;
  patchRoom: (patch: Partial<RoomAnswers>) => void;
  setSlabType: (v: SlabTypeOption) => void;
  setSlabThickness: (v: SlabThicknessOption) => void;
  setHouseType: (v: HouseTypeOption) => void;
  setObjectStage: (v: ObjectStageOption) => void;
  setPlannedCeiling: (v: PlannedCeilingOption) => void;
  setNoisyNeighbors: (v: NoisyNeighborsOption) => void;
  setNoiseKind: (v: NoiseKindOption) => void;
  setRoomWishes: (v: RoomWishOption[]) => void;
  toggleRoomWish: (v: RoomWishOption) => void;
  canGoNext: boolean;
}

const SessionContext = createContext<SessionApi | null>(null);

function initialSession(): SessionState {
  return tryRestoreSharedSession() ?? createInitialSession();
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionState>(initialSession);
  useFunnelAnalytics(session);

  const patch = useCallback((fn: (s: SessionState) => SessionState) => {
    setSession((prev) => fn(prev));
  }, []);

  const goNext = useCallback(() => {
    setSession((prev) => {
      if (!canProceed(prev)) return prev;

      if (prev.step === 'room') {
        const nextSub = nextRoomSubstep(prev.roomSubstep, prev.answers.room);
        if (nextSub) {
          return { ...prev, roomSubstep: nextSub };
        }
        return withDerived({ ...prev, step: 'processing' });
      }

      if (prev.step === 'processing') {
        return { ...prev, step: 'result' };
      }

      const n = nextStep(prev.step);
      if (!n) return prev;
      let next = { ...prev, step: n };
      if (n === 'room') {
        next = { ...next, roomSubstep: ROOM_SUBSTEPS[0]! };
      }
      if (n === 'result') {
        next = withDerived(next);
      }
      return next;
    });
  }, []);

  const goBack = useCallback(() => {
    setSession((prev) => {
      if (prev.step === 'room') {
        const prevSub = prevRoomSubstep(prev.roomSubstep, prev.answers.room);
        if (prevSub) {
          return { ...prev, roomSubstep: prevSub };
        }
        return { ...prev, step: 'start', roomSubstep: ROOM_SUBSTEPS[0]! };
      }

      // Processing → last Room question; Result → Room (skip replaying ceremony).
      if (prev.step === 'processing' || prev.step === 'result') {
        return {
          ...prev,
          step: 'room',
          roomSubstep: ROOM_SUBSTEPS[ROOM_SUBSTEPS.length - 1]!,
        };
      }

      const p = prevStep(prev.step);
      if (!p) return prev;
      if (p === 'room') {
        return {
          ...prev,
          step: 'room',
          roomSubstep: ROOM_SUBSTEPS[ROOM_SUBSTEPS.length - 1]!,
        };
      }
      return { ...prev, step: p };
    });
  }, []);

  const goTo = useCallback((step: WizardStep) => {
    setSession((prev) => {
      let next = {
        ...prev,
        step,
        roomSubstep:
          step === 'room' ? prev.roomSubstep : ROOM_SUBSTEPS[0]!,
      };
      if (step === 'result' && !prev.derived) {
        next = withDerived(next);
      }
      return next;
    });
  }, []);

  const restart = useCallback(() => {
    resetAnalyticsSessionId();
    setSession(createInitialSession());
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has('p')) {
        url.searchParams.delete('p');
        history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const patchRoom = useCallback(
    (roomPatch: Partial<RoomAnswers>) => {
      patch((s) => ({
        ...s,
        answers: {
          ...s.answers,
          room: { ...s.answers.room, ...roomPatch },
        },
      }));
    },
    [patch],
  );

  const setRoomType = useCallback(
    (roomType: RoomType) => patchRoom({ roomType }),
    [patchRoom],
  );

  const setCeilingArea = useCallback(
    (ceilingAreaM2: number | null) => patchRoom({ ceilingAreaM2 }),
    [patchRoom],
  );

  const setSlabType = useCallback(
    (slabType: SlabTypeOption) => patchRoom({ slabType }),
    [patchRoom],
  );
  const setSlabThickness = useCallback(
    (slabThickness: SlabThicknessOption) => patchRoom({ slabThickness }),
    [patchRoom],
  );
  const setHouseType = useCallback(
    (houseType: HouseTypeOption) => {
      patch((s) => {
        const allowed = allowedSlabTypes(houseType);
        const slabType = allowed.includes(s.answers.room.slabType)
          ? s.answers.room.slabType
          : 'unknown';
        return {
          ...s,
          answers: {
            ...s.answers,
            room: { ...s.answers.room, houseType, slabType },
          },
        };
      });
    },
    [patch],
  );
  const setObjectStage = useCallback(
    (objectStage: ObjectStageOption) => patchRoom({ objectStage }),
    [patchRoom],
  );
  const setPlannedCeiling = useCallback(
    (plannedCeiling: PlannedCeilingOption) => patchRoom({ plannedCeiling }),
    [patchRoom],
  );
  const setNoisyNeighbors = useCallback(
    (noisyNeighbors: NoisyNeighborsOption) => {
      if (shouldAskNoiseKind(noisyNeighbors)) {
        patchRoom({ noisyNeighbors });
      } else {
        patchRoom({ noisyNeighbors, noiseKind: 'unknown' });
      }
    },
    [patchRoom],
  );
  const setNoiseKind = useCallback(
    (noiseKind: NoiseKindOption) => patchRoom({ noiseKind }),
    [patchRoom],
  );
  const setRoomWishes = useCallback(
    (roomWishes: RoomWishOption[]) => patchRoom({ roomWishes }),
    [patchRoom],
  );
  const toggleRoomWish = useCallback(
    (id: RoomWishOption) => {
      patch((s) => ({
        ...s,
        answers: {
          ...s.answers,
          room: {
            ...s.answers.room,
            roomWishes: toggleWishInList(s.answers.room.roomWishes, id),
          },
        },
      }));
    },
    [patch],
  );

  const value = useMemo<SessionApi>(
    () => ({
      session,
      goNext,
      goBack,
      goTo,
      restart,
      setRoomType,
      setCeilingArea,
      patchRoom,
      setSlabType,
      setSlabThickness,
      setHouseType,
      setObjectStage,
      setPlannedCeiling,
      setNoisyNeighbors,
      setNoiseKind,
      setRoomWishes,
      toggleRoomWish,
      canGoNext: canProceed(session),
    }),
    [
      session,
      goNext,
      goBack,
      goTo,
      restart,
      setRoomType,
      setCeilingArea,
      patchRoom,
      setSlabType,
      setSlabThickness,
      setHouseType,
      setObjectStage,
      setPlannedCeiling,
      setNoisyNeighbors,
      setNoiseKind,
      setRoomWishes,
      toggleRoomWish,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionApi {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
}
