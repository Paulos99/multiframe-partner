import {
  DEFAULT_SALES_RUBRIC,
  scoreWithFalsePromisePenalty,
  type LearningScenario,
} from '../../../../../packages/shared/learning.ts';
import { detectFalsePromise } from './sellMultiframe.ts';

export type ObjectionCategory = 'price' | 'efficacy' | 'height' | 'trust';

export const OBJECTION_CATEGORY_LABELS: Record<ObjectionCategory, string> = {
  price: 'Цена и бюджет',
  efficacy: 'Эффективность решения',
  height: 'Сохранение высоты потолка',
  trust: 'Доверие и мнение прораба',
};

export type ObjectionOption = {
  id: string;
  text: string;
  points: number;
  isBest?: boolean;
  hasFalsePromise?: boolean;
  errorType?: string;
  explanation: string;
};

export type ObjectionStep = {
  id: string;
  clientObjection: string;
  options: ObjectionOption[];
};

export type ObjectionCase = {
  id: string;
  category: ObjectionCategory;
  title: string;
  durationMinutes: string;
  situation: string;
  steps: [ObjectionStep, ObjectionStep];
  keyTakeaway: string;
};

export const OBJECTIONS_SCENARIO: LearningScenario = {
  id: 'objections',
  role: 'any',
  difficulty: 'easy',
  version: '1.0',
  title: 'Возражения и переговоры (4 коротких кейса)',
  rubric: DEFAULT_SALES_RUBRIC,
};

export const OBJECTION_CASES: ObjectionCase[] = [
  {
    id: 'case_price',
    category: 'price',
    title: 'Кейс 1: «Дорого, мы рассчитывали только на полотно»',
    durationMinutes: '3 мин',
    situation:
      'Клиент заказывает натяжной потолок в детскую 14 м². После показа расчёта с MultiFrame говорит, что сумма выходит за рамки бюджета на потолок.',
    steps: [
      {
        id: 'price_step_1',
        clientObjection:
          '«Слушайте, с панелями выходит почти в два раза дороже обычного полотна. Мы на это не рассчитывали.»',
        options: [
          {
            id: 'price_1_best',
            text: '«Понимаю, бюджет важен. Давайте разделим: само полотно остаётся по вашей базовой цене, а MultiFrame — это отдельный слой акустического комфорта в детской, который ставится один раз до натяжки, чтобы потом не снимать потолок. Покажу в КП оба варианта отдельно.»',
            points: 50,
            isBest: true,
            explanation:
              'Правильно: вы не обесцениваете продукт, разделяете базовый потолок и опцию комфорта и напоминаете, что дооснастить после натяжки сложнее и дороже.',
          },
          {
            id: 'price_1_weak',
            text: '«Ну да, материал недешёвый. Можем тогда вообще убрать панели из расчёта, поставим просто плёнку.»',
            points: 15,
            errorType: 'dropped_value',
            explanation:
              'Слишком быстрый отказ от аргументации: клиент ещё не увидел ценность разового монтажа до натяжки полотна.',
          },
          {
            id: 'price_1_false',
            text: '«Зато это гарантированная тишина 100% на всю жизнь и минус 50 дБ — дешевле любого ремонта!»',
            points: 0,
            hasFalsePromise: true,
            errorType: 'false_promise',
            explanation:
              'Нельзя оправдывать цену ложными обещаниями «100% тишины» и выдуманными децибелами.',
          },
        ],
      },
      {
        id: 'price_step_2',
        clientObjection:
          '«А если делать не на всю квартиру сразу, а начать только с одной комнаты?»',
        options: [
          {
            id: 'price_2_best',
            text: '«Отличное решение: чаще всего начинают со спальни или детской, где тишина важнее всего. Давайте зафиксируем в КП расчёт именно для детской 14 м² — это 34 панели, а остальные комнаты оставим в базовом варианте.»',
            points: 50,
            isBest: true,
            explanation:
              'Верный приём: приоритизация самой чувствительной комнаты сохраняет сделку и комфорт клиента в рамках бюджета.',
          },
          {
            id: 'price_2_pushy',
            text: '«Нет, в одной комнате смысла нет, надо брать сразу на всю квартиру, иначе мы не повезём материал.»',
            points: 10,
            errorType: 'pushy_sale',
            explanation:
              'Ошибочное давление: MultiFrame отлично работает покомнатно (спальня/детская/кабинет).',
          },
        ],
      },
    ],
    keyTakeaway:
      'Разделяйте в КП базовый потолок и слой комфорта; если бюджет ограничен — предложите начать с приоритетной комнаты (спальня или детская) до натяжки полотна.',
  },
  {
    id: 'case_efficacy',
    category: 'efficacy',
    title: 'Кейс 2: «Тонкая панель под потолком не может работать»',
    durationMinutes: '4 мин',
    situation:
      'Клиент читал форумы по ремонту и сомневается, что бескаркасная панель под натяжным потолком даёт ощутимый результат.',
    steps: [
      {
        id: 'efficacy_step_1',
        clientObjection:
          '«На форумах пишут, что настоящая звукоизоляция — это только каркас 12 см с минватой и двумя слоями ГКЛ, а всё остальное — маркетинг.»',
        options: [
          {
            id: 'efficacy_1_best',
            text: '«На форумах правы в одном: тяжёлый каркас нужен, когда строят студию звукозаписи. Но под обычным натяжным потолком главная беда — пустая полость, которая усиливает воздушный шум и гул как барабан. MultiFrame убирает этот резонанс в полости и снижает бытовой воздушный шум без потери 12 см высоты.»',
            points: 50,
            isBest: true,
            explanation:
              'Точный инженерный ответ: вы соглашаетесь с физикой, разграничиваете задачи и объясняете борьбу с эффектом барабана натяжного потолка.',
          },
          {
            id: 'efficacy_1_false',
            text: '«На форумах ничего не понимают! MultiFrame заменяет 20 см бетона и даёт гарантированную тишину 45 дБ от перфоратора!»',
            points: 0,
            hasFalsePromise: true,
            errorType: 'false_promise',
            explanation:
              'Ложное обещание: сравнение с 20 см бетона и выдуманные 45 дБ от структурного шума вызовут жёсткую претензию после монтажа.',
          },
          {
            id: 'efficacy_1_vague',
            text: '«Ну нам завод сказал, что работает, у нас сертификаты где-то есть, поверьте на слово.»',
            points: 15,
            errorType: 'weak_argument',
            explanation:
              'Слабая позиция без объяснения принципа работы и без демонстрации в Проблемомере.',
          },
        ],
      },
      {
        id: 'efficacy_step_2',
        clientObjection: '«А как мне до монтажа понять, какая будет разница по звуку в моей комнате?»',
        options: [
          {
            id: 'efficacy_2_best',
            text: '«Давайте откроем Проблемомер прямо сейчас: укажем ваш тип дома и площадь, послушаем аудио-сравнение До/После и сохраним PDF-профиль акустического комфорта вашей комнаты.»',
            points: 50,
            isBest: true,
            explanation:
              'Использование штатного инструмента Проблемомер переводит абстрактный спор в наглядную демонстрацию.',
          },
          {
            id: 'efficacy_2_passive',
            text: '«Никак, только когда натянем потолок — тогда и послушаете.»',
            points: 10,
            errorType: 'no_next_step',
            explanation:
              'Вы упустили возможность показать аудио-демо и профиль комнаты в Проблемомере.',
          },
        ],
      },
    ],
    keyTakeaway:
      'Честно разграничивайте каркасную изоляцию и устранение «эффекта барабана» + бытового воздушного шума под натяжным потолком, подкрепляя разговор Проблемомером.',
  },
  {
    id: 'case_height',
    category: 'height',
    title: 'Кейс 3: «У нас потолки 2.65 м, каждый сантиметр на счету»',
    durationMinutes: '3 мин',
    situation:
      'Квартира с невысокими потолками, клиент боится, что акустические панели «украдут» высоту комнаты.',
    steps: [
      {
        id: 'height_step_1',
        clientObjection:
          '«У нас чистовая высота 2.65 м и встроенный шкаф-купе. Если ставить звукоизоляцию, потолок упадёт нам на голову!»',
        options: [
          {
            id: 'height_1_best',
            text: '«Именно для таких квартир и создан MultiFrame: панель монтируется вплотную к плите перекрытия в зазор, который всё равно нужен под профиль и светильники натяжного потолка. Вы не теряете 10–12 см, как с гипсокартоном.»',
            points: 50,
            isBest: true,
            explanation:
              'Отлично: вы показываете, что панель использует уже существующий технологический зазор натяжного потолка.',
          },
          {
            id: 'height_1_wrong',
            text: '«Придётся опустить потолок на 15 см и подпилить ваш шкаф, иначе никак.»',
            points: 5,
            errorType: 'tech_inaccuracy',
            explanation:
              'Техническая ошибка: для MultiFrame не нужен опуск 15 см.',
          },
        ],
      },
      {
        id: 'height_step_2',
        clientObjection: '«А что со встроенными светильниками и закладными под карниз?»',
        options: [
          {
            id: 'height_2_best',
            text: '«Панели легко подрезаются по месту вокруг платформ светильников, закладных под гардину и трасс проводки — в Калькуляторе мы сразу сделаем схему раскладки под размеры вашей комнаты.»',
            points: 50,
            isBest: true,
            explanation:
              'Точный практический ответ, снимающий страх по узлам примыкания и свету.',
          },
          {
            id: 'height_2_weak',
            text: '«Со светильниками тогда нельзя, придётся вешать одну люстру на крюк.»',
            points: 10,
            errorType: 'tech_inaccuracy',
            explanation:
              'Неверно: закладные под точечный свет и треки штатно обходятся при монтаже панелей.',
          },
        ],
      },
    ],
    keyTakeaway:
      'Подчёркивайте, что MultiFrame помещается в технологический зазор натяжного потолка и штатно обходит закладные под свет и карнизы.',
  },
  {
    id: 'case_trust',
    category: 'trust',
    title: 'Кейс 4: «Я посоветуюсь со своим прорабом / впервые слышу»',
    durationMinutes: '4 мин',
    situation:
      'Клиент готов рассмотреть решение, но хочет переслать информацию своему общестроительному прорабу.',
    steps: [
      {
        id: 'trust_step_1',
        clientObjection:
          '«Я про такую систему раньше не слышал. Спрошу у своего прораба, что он скажет.»',
        options: [
          {
            id: 'trust_1_best',
            text: '«Это разработка StP (Стандартпласт) — профильного завода акустических материалов со собственной лабораторией. Общестроительные прорабы часто привыкли к мокрым процессам и ГКЛ, поэтому давайте я подготовлю для вас и прораба PDF со схемой раскладки, спецификацией и узлами крепежа.»',
            points: 50,
            isBest: true,
            explanation:
              'Сильный ход: опираетесь на авторитет производителя StP и вооружаете клиента конкретным техническим документом для разговора с прорабом.',
          },
          {
            id: 'trust_1_conflict',
            text: '«Не слушайте прорабов, они все хотят только заработать на гипсокартоне и ничего не знают!»',
            points: 10,
            errorType: 'pushy_sale',
            explanation:
              'Атака на прораба клиента настраивает против вас обоих.',
          },
          {
            id: 'trust_1_false',
            text: '«Скажите прорабу, что панель даёт гарантированную тишину 100% и 45 дБ по ГОСТу в любой новостройке!»',
            points: 0,
            hasFalsePromise: true,
            errorType: 'false_promise',
            explanation:
              'Любой грамотный строитель сразу разоблачит выдуманные «100% тишины» и «45 дБ» от тонкой панели.',
          },
        ],
      },
      {
        id: 'trust_step_2',
        clientObjection: '«Да, пришлите материалы в WhatsApp/Telegram, мы сегодня вечером посмотрим.»',
        options: [
          {
            id: 'trust_2_best',
            text: '«Договорились! Сейчас отправлю смету в двух вариантах и акустический профиль комнаты, а завтра в первой половине дня напишу узнать, какие вопросы появились у вас или прораба.»',
            points: 50,
            isBest: true,
            explanation:
              'Отлично: вы отправляете полный комплект из кабинета и фиксируете время следующего контакта.',
          },
          {
            id: 'trust_2_passive',
            text: '«Хорошо, скину просто цену в сообщении. Если что — сами звоните.»',
            points: 15,
            errorType: 'no_next_step',
            explanation:
              'Голая цифра без PDF-профиля и без договорённости о звонке легко теряется.',
          },
        ],
      },
    ],
    keyTakeaway:
      'Опирайтесь на экспертизу завода StP, не спорьте с прорабом заочно, а отправляйте наглядный PDF-профиль и смету с конкретным временем следующей связи.',
  },
];

export type ObjectionCaseAttemptResult = {
  caseId: string;
  baseScore: number;
  finalScore: number;
  hasFalsePromise: boolean;
  errorTypes: string[];
  explanations: string[];
  passed: boolean;
};

export function evaluateObjectionCase(
  caseItem: ObjectionCase,
  selectedOptionIds: [string, string],
): ObjectionCaseAttemptResult {
  const opt1 = caseItem.steps[0].options.find((o) => o.id === selectedOptionIds[0]);
  const opt2 = caseItem.steps[1].options.find((o) => o.id === selectedOptionIds[1]);
  const picked = [opt1, opt2].filter((o): o is ObjectionOption => Boolean(o));

  const baseScore = Math.max(
    0,
    Math.min(100, picked.reduce((sum, o) => sum + o.points, 0)),
  );

  const errorSet = new Set<string>();
  const explanations: string[] = [];

  for (const opt of picked) {
    explanations.push(opt.explanation);
    if (opt.errorType) errorSet.add(opt.errorType);
    const detected = detectFalsePromise(opt.text);
    if (opt.hasFalsePromise || detected.hasFalsePromise) {
      errorSet.add('false_promise');
    }
  }

  const hasFalsePromise = errorSet.has('false_promise');
  const finalScore = scoreWithFalsePromisePenalty(baseScore, hasFalsePromise, OBJECTIONS_SCENARIO.rubric);

  return {
    caseId: caseItem.id,
    baseScore,
    finalScore,
    hasFalsePromise,
    errorTypes: [...errorSet],
    explanations,
    passed: finalScore >= 70 && !hasFalsePromise,
  };
}
