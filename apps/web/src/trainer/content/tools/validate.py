# -*- coding: utf-8 -*-
"""Проверка содержимого тренажёра продаж.
Запуск: python3 tools/validate.py [путь к training-transcripts.txt]
Проверяет: разбор JSON, обязательные поля, ссылки между файлами, дословность цитат,
запрещённые утверждения, совместимость шаблонов с JavaScript, самопроверку эталонов и отрицательные тесты."""
import sys, re, json, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import score_reference as R

TR = sys.argv[1] if len(sys.argv) > 1 else '/workspace/training-transcripts.txt'
errs, warns = [], []
def E(m): errs.append(m)
def W(m): warns.append(m)

def nrm(s): return re.sub(r'\s+', ' ', s).strip()

# ---------- загрузка ----------
files = {}
for n in ['objections.json', 'scenarios.json', 'quiz.json', 'scoring.json']:
    try: files[n] = R.load(n)
    except Exception as e: E(f'{n}: не читается: {e}')
if errs:
    print('\n'.join(errs)); sys.exit(1)
OB = files['objections.json']; SCN = files['scenarios.json']; QZ = files['quiz.json']; SC = files['scoring.json']

# ---------- транскрипты ----------
SEG = {}
if os.path.exists(TR):
    T = open(TR, encoding='utf-8').read()
    for v in OB['videos']:
        i = T.find('id: ' + v['id'])
        if i < 0: E(f"видео {v['code']} не найдено в расшифровках"); continue
        st = T.index('=' * 70 + '\n', i) + 71
        en = T.find('=' * 70, st)
        SEG[v['code']] = nrm(T[st:en if en > 0 else None])
else:
    W('расшифровки не найдены: проверка дословности цитат пропущена')
VIDS = {v['code'] for v in OB['videos']}

def check_quote(q, where):
    if q.get('videoCode') not in VIDS: E(f'{where}: неизвестное видео {q.get("videoCode")}'); return
    if not q.get('quote') or len(q['quote']) > 400: E(f'{where}: пустая или слишком длинная цитата')
    if SEG and nrm(q['quote']) not in SEG[q['videoCode']]: E(f'{where}: цитата не найдена дословно: {q["quote"][:60]}')

JS_BAD = [r'\\b', r'\\B', r'\\w', r'\\W']
def check_rx(p, where):
    try: re.compile(p)
    except Exception as e: E(f'{where}: шаблон не компилируется: {p}: {e}'); return
    if 'ё' in p: E(f'{where}: «ё» в шаблоне (должно быть «е»): {p}')
    for b in JS_BAD:
        if re.search(b, p): E(f'{where}: шаблон не переносится в JavaScript (\\b, \\w не работают с кириллицей): {p}')
    if re.search(r'\(\?<?[a-z]', p) and not re.search(r'\(\?(:|!|=|<=|<!)', p): E(f'{where}: встроенные флаги не переносятся: {p}')

ROLES = set(OB['roles'])
KEYS = {r['key'] for r in OB['refusalReasons']}

# ---------- возражения ----------
ids = set(); OBJ = {}
for o in OB['objections']:
    w = o['id']
    if w in ids: E(f'{w}: дубль id')
    ids.add(w); OBJ[w] = o
    for f in ['id','type','refusalReasonKey','roles','difficulty','clientPhrasing','pushback','referenceAnswer','pushbackReferenceAnswer','requiredPoints','forbiddenClaims','sourceQuotes','panel']:
        if f not in o: E(f'{w}: нет поля {f}')
    if o['refusalReasonKey'] not in KEYS: E(f'{w}: неизвестная причина отказа')
    if not set(o['roles']) <= ROLES or not o['roles']: E(f'{w}: неверные роли')
    if len(o['clientPhrasing']) < 2: E(f'{w}: меньше двух формулировок клиента')
    if not o['sourceQuotes']: E(f'{w}: нет цитат')
    qids = {q['id'] for q in o['sourceQuotes']}
    for q in o['sourceQuotes']:
        check_quote(q, f'{w}/{q["id"]}')
        if q.get('appliesTo') not in ('answer','pushback','both'): E(f'{w}/{q["id"]}: appliesTo')
    if not any(q['appliesTo'] in ('answer','both') for q in o['sourceQuotes']): E(f'{w}: нет цитаты к ответу')
    pids = set()
    for p in o['requiredPoints']:
        pw = f'{w}/{p["id"]}'
        if p['id'] in pids: E(f'{pw}: дубль')
        pids.add(p['id'])
        if p['beat'] not in (1, 2): E(f'{pw}: beat')
        if not p['anyOf']: E(f'{pw}: пустой anyOf')
        for rxp in p['anyOf']: check_rx(rxp, pw)
        for qi in p['quoteIds']:
            if qi not in qids: E(f'{pw}: ссылка на отсутствующую цитату {qi}')
        if p.get('minMatches', 1) > len(p['anyOf']): E(f'{pw}: minMatches больше числа шаблонов')
    if not any(p['critical'] and p['beat'] == 1 for p in o['requiredPoints']): W(f'{w}: нет критичного пункта в первой реплике')
    if not (any(p['beat'] == 1 for p in o['requiredPoints']) and any(p['beat'] == 2 for p in o['requiredPoints'])): E(f'{w}: нет пунктов для обеих реплик')
    if not o['forbiddenClaims']: E(f'{w}: нет запрещённых утверждений')
    # ссылки на фрагменты каждой причины: у каждого пункта хотя бы один пункт с цитатой
    if not any(p['quoteIds'] for p in o['requiredPoints']): E(f'{w}: ни один пункт не привязан к цитате')

used = {o['refusalReasonKey'] for o in OB['objections']}
for r in OB['refusalReasons']:
    if r['primary'] and r['key'] not in used: E(f'основная причина без возражений: {r["key"]}')
    if r['key'] not in used: W(f'причина {r["key"]} без возражений')

# ---------- оценка ----------
local = [{'id': k, **v} for k, v in SC['localForbiddenPatterns'].items()]
SC['_localForbidden'] = local
_SCW = {k: v for k, v in SC.items() if k != '_localForbidden'}
for g in SC['globalForbidden'] + local:
    for p in g['patterns'] + g.get('exceptIfSentenceMatches', []): check_rx(p, f'scoring/{g["id"]}')
for k in ['ackStarters','openQuestionStarters','valueLinkPattern']:
    for p in ([SC[k]] if isinstance(SC[k], str) else SC[k]): check_rx(p, f'scoring/{k}')
for k in ['action','time','who']:
    for p in SC['nextStep'][k]: check_rx(p, f'scoring/nextStep.{k}')
crit_ids = {c['id'] for c in SC['criteria']}
if len(crit_ids) != 6: E('в scoring.json должно быть 6 критериев')
if abs(sum(c['weight'] for c in SC['criteria']) - 1) > 1e-9: E('сумма весов не 1')
for c in SC['criteria']:
    if set(c['anchors']) != {'1','2','3','4','5'}: E(f'{c["id"]}: нужны якоря 1–5')
for lf in [f['id'] for o in OB['objections'] for f in o['forbiddenClaims']]:
    pass
gids = {g['id'] for g in SC['globalForbidden']}
for o in OB['objections']:
    for f in o['forbiddenClaims']:
        if f['id'].startswith('g-') and f['id'] not in gids: E(f'{o["id"]}: нет глобального правила {f["id"]}')
        if f.get('patternsRef') and f['patternsRef'] not in SC['localForbiddenPatterns']: E(f'{o["id"]}: patternsRef {f["patternsRef"]}')

# ---------- самопроверка эталонов ----------
for o in OB['objections']:
    for beat, txt in ((1, o['referenceAnswer']), (2, o['pushbackReferenceAnswer'])):
        pts = [p for p in o['requiredPoints'] if p['beat'] == beat]
        cov, mc = R.coverage(pts, txt)
        if cov < 1: E(f'{o["id"]}: эталон реплики {beat} не проходит свои пункты: ' + '; '.join(p['id'] for p in pts if not R.point_ok(p, txt)))
        h = R.forbidden_hits(txt, SC)
        if h: E(f'{o["id"]}: эталон реплики {beat} содержит запрещённое: {h}')
    # эталон первой реплики не должен засчитывать пункты второй (пункты различимы)
    sc1, _, _, _ = R.score_text(o['referenceAnswer'] + ' ' + o['pushbackReferenceAnswer'], o['requiredPoints'], o['clientPhrasing'][0], SC)
    if sc1['objection'] < 5: E(f'{o["id"]}: объединённый эталон не даёт 5 по «Ответ на возражение»')
    st, sh, scov, smc = R.score_step(o['referenceAnswer'], o['pushbackReferenceAnswer'], o, 0, SC)
    if st['objection'] < 5 or st['honesty'] < 5: E(f'{o["id"]}: пара эталонов не даёт 5 по охвату и честности: {st} {sh}')
    if R.total(st, 'objection', SC) < 3.5: E(f'{o["id"]}: пара эталонов не проходит порог быстрой отработки: {R.total(st, "objection", SC)}')
    # перестановка: ответ первой реплики вместо второй не должен давать полный охват
    st2, _, cov2, _ = R.score_step(o['pushbackReferenceAnswer'], o['referenceAnswer'], o, 0, SC)
    if cov2 >= 1: W(f'{o["id"]}: пункты не различают реплики (перестановка даёт полный охват)')

# ---------- викторина ----------
qids = set()
for q in QZ['questions']:
    w = q['id']
    if w in qids: E(f'{w}: дубль')
    qids.add(w)
    oids = {o['id'] for o in q['options']}
    if len(oids) < 2 or not q['correctOptionIds'] or not set(q['correctOptionIds']) <= oids: E(f'{w}: варианты')
    if not q['sourceQuotes']: E(f'{w}: нет цитаты')
    for x in q['sourceQuotes']: check_quote(x, w)
    if not set(q['roles']) <= ROLES: E(f'{w}: роли')
    for r in q['relatedObjectionIds']:
        if r not in OBJ: E(f'{w}: нет возражения {r}')
    if q['topic'] not in {t['id'] for t in QZ['topics']}: E(f'{w}: тема')
    if len({o['text'] for o in q['options']}) != len(q['options']): E(f'{w}: одинаковые варианты')

# ---------- сценарии ----------
sids = set()
for s in SCN['scenarios']:
    w = s['id']
    if w in sids: E(f'{w}: дубль')
    sids.add(w)
    if not set(s['roles']) <= ROLES or not s['roles']: E(f'{w}: роли')
    if not s['steps']: E(f'{w}: нет шагов')
    for st in s['steps']:
        o = OBJ.get(st['objectionId'])
        if not o: E(f'{w}/{st["id"]}: нет возражения {st["objectionId"]}'); continue
        if not 0 <= st['clientPhrasingIndex'] < len(o['clientPhrasing']): E(f'{w}/{st["id"]}: индекс формулировки')
        if not set(s['roles']) & set(o['roles']): E(f'{w}/{st["id"]}: ни одна роль сценария не подходит возражению')
        if st['beats'] != 2: E(f'{w}/{st["id"]}: beats != 2')
    if not s['closing'].get('requiresNextStep'): E(f'{w}: нет заключительной реплики со следующим шагом')
    for ex in s['closing']['goodExamples']:
        # пример следующего шага должен проходить автооценку следующего шага
        res, hits, _, _ = R.score_text(ex, [], '', SC)
        if res['nextstep'] < 5: E(f'{w}: пример следующего шага получает {res["nextstep"]} из 5: {ex}')
        if hits: E(f'{w}: пример следующего шага содержит запрещённое: {hits}')
    if not any(c['kind'] == 'nextStep' for c in s['successCriteria']): E(f'{w}: нет критерия следующего шага')

# ---------- запрещённые слова и цифры во всём содержимом ----------
BANNED = [
  ('g-17db', r'до\s+17(?!\d|:)|17\s*дб'),
  ('g-hypo', r'гипоаллерген'),
  ('g-smartlock', r'smart\s*-?lock|смарт\s*-?лок|смартлок'),
  ('g-price', r'\d[\d\s]*\s*(₽|руб|тыс[а-я]*\s*руб)|\d\s*тысяч'),
  ('g-percent', r'\d+\s*(%|процент)'),
  ('g-years', r'\d+\s*(лет|года)(?![а-я])'),
]
def walk(o, path=''):
    if isinstance(o, dict):
        for k, v in o.items(): yield from walk(v, f'{path}/{k}')
    elif isinstance(o, list):
        for i, v in enumerate(o): yield from walk(v, f'{path}[{i}]')
    elif isinstance(o, str): yield path, o
def allowed(path, name, text_key):
    if '/forbiddenClaims' in path and path.endswith('/text'): return True
    if path.startswith('/globalForbidden') or path.startswith('/localForbiddenPatterns'): return True
    if name == 'quiz.json' and '/options[' in path: return True      # неверные варианты и ловушки
    if '/commonMistake' in path: return True                          # «типичная ошибка»: можно назвать запрещённую формулировку
    if '/quote' in path and path.endswith('/quote'): return True      # дословные цитаты
    return False
files['scoring.json'] = _SCW
for name, d in files.items():
    for path, s in walk(d):
        if path.endswith('/id') or path.endswith('/patternsRef'): continue
        for bid, rxp in BANNED:
            if re.search(rxp, s.lower()) and not allowed(path, name, None):
                E(f'{name}{path}: запрещённый элемент {bid}: {s[:80]}')
# доп.: любое упоминание «дб» с числом вне допустимых значений
ALLOWED_DB = {'1','2','3','4','5','9','38','45','57'}
for name, d in files.items():
    if name == 'scoring.json': continue
    for path, s in walk(d):
        if path.endswith('/quote') or '/options[' in path: continue
        for m in re.finditer(r'(\d+)\s*дб', s.lower()):
            if m.group(1) not in ALLOWED_DB: W(f'{name}{path}: число дБ вне списка проверенных ({m.group(1)}): {s[:70]}')
# англицизмы в тексте для пользователя (вне цитат и ключей)
ANGL = [r'фидбек', r'дедлайн', r'кейс', r'лайфхак', r'трекер', r'дашборд', r'онлайн', r'оффлайн', r'офлайн', r'апсел', r'скрипт', r'чек-лист', r'чеклист', r'бонус', r'лидер', r'тренер(?!ов)', r'коуч', r'мотиваци']
for name, d in files.items():
    for path, s in walk(d):
        if path.endswith('/quote'): continue
        if '/forbiddenClaims' in path or path.startswith('/globalForbidden') or '/patterns' in path or '/anyOf' in path or '/goodExamples' in path: continue
        for a in ANGL:
            if re.search(a, s.lower()): W(f'{name}{path}: возможный англицизм «{a}»: {s[:70]}')
# латиница внутри русских слов (опечатки с латинскими буквами)
for name, d in files.items():
    for path, s in walk(d):
        for w in re.findall(r'[A-Za-zА-Яа-яЁё]+', s):
            if re.search(r'[A-Za-z]', w) and re.search(r'[А-Яа-яЁё]', w): E(f'{name}{path}: смесь латиницы и кириллицы в слове «{w}»')

# ---------- отрицательные и положительные тесты автооценки ----------
BAD = {
 'г-тишина': 'Гарантирую полную тишину, вы ничего не услышите.',
 'г-потолок9': 'На потолке у вас тоже будет плюс 9 дБ, как на стене.',
 'г-цифра': 'У вас в квартире шум снизится на 15 дБ.',
 'г-замок': 'Панели держит наш замок SmartLock.',
 'г-негорючий': 'Материал негорючий, он совсем не горит.',
 'г-гипо': 'Это гипоаллергенная система.',
 'г-17': 'Эффект до 17 дБ.',
 'г-срок': 'Прослужит 50 лет, гарантия вечная.',
 'г-аллергия': 'Система безопасна для аллергиков.',
}
for k, t in BAD.items():
    h = R.forbidden_hits(t, SC)
    if not any(x['severity'] == 'critical' for x in h): E(f'отрицательный тест {k}: нарушение не найдено: «{t}»')
GOOD = [
 'Мы не обещаем тишину: ни одна система не делает квартиру абсолютно беззвучной.',
 'Гарантировать результат я не могу, он зависит от перекрытия, типа шума и качества монтажа.',
 'На потолке в испытании было +1 дБ при исходных 57 дБ, а на стене +9 дБ при исходных 38 дБ.',
 'Система не поддерживает горения и не выделяет опасного чёрного дыма.',
 'Обещать полную тишину было бы неправдой.',
 'Для вашей квартиры цифру я не называю, нужен замер.',
 'В видео сказано, что система не вызывает горения? Нет: не поддерживает горения.',
]
for t in GOOD:
    h = R.forbidden_hits(t, SC)
    if h: E(f'положительный тест: ложное срабатывание: «{t}» -> {h}')
# общий ответ «не знаю» должен получить низкий итог
weak, _, _, _ = R.score_text('Не знаю, это просто хороший материал.', OB['objections'][0]['requiredPoints'], OB['objections'][0]['clientPhrasing'][0], SC)
if R.total(weak, 'objection', SC) >= 2.5: E('слабый ответ получает слишком высокий итог')
# ответ с обещанием тишины: итог ограничен
bad_scores, _, _, _ = R.score_text(OB['objections'][0]['referenceAnswer'] + ' Гарантирую полную тишину.', OB['objections'][0]['requiredPoints'], OB['objections'][0]['clientPhrasing'][0], SC)
if R.total(bad_scores, 'objection', SC) > SC['honestyGate']['capTotalTo']: E('ограничение по честности не сработало')

# ---------- итог ----------
print('Возражений:', len(OB['objections']), '| сценариев:', len(SCN['scenarios']), '| вопросов:', len(QZ['questions']), '| критериев:', len(SC['criteria']))
print('Предупреждений:', len(warns), '| ошибок:', len(errs))
for w in warns[:40]: print('  ПРЕДУПРЕЖДЕНИЕ', w)
for e in errs[:80]: print('  ОШИБКА', e)
sys.exit(1 if errs else 0)
