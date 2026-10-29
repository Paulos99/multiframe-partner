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
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
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

IDEAS = {}
for _i in OB.get('ideas', []):
    if _i['id'] in IDEAS: E(f'ideas: дубль {_i["id"]}')
    IDEAS[_i['id']] = _i
if OB.get('requiredPointsRole') != 'hint': E('objections.json: requiredPointsRole должен быть "hint" (пункты — подсказки, не оценка)')

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

WEB_KINDS = {'manufacturer', 'retailer', 'material-producer', 'standard', 'independent'}
WEB_DOMAINS = ('stp.store', 'stp-multiframe.ru', 'stp-russia.ru', 'stp-dom.ru', 'ruch.de', 'knauf.ru', 'knauf-penoplast.ru', 'specialty-polymer.com', 'qdmaifeng.com', 'sleepfoundation.org', 'sleepworld.com', 'consultant.ru')
SNAP = {}
def _squash(t): return re.sub(r'\s+', '', t).lower()
ATTRIB = re.compile(r'производител|на\s+сайте|указыва|пишет|заявля|по\s+словам|считает', re.I)
def check_quote(q, where):
    st = q.get('sourceType') or ('video' if q.get('videoCode') else None)
    if st not in ('video', 'web', 'company'): E(f'{where}: sourceType должен быть video, web или company'); return
    if not q.get('quote') or len(q['quote']) > 400: E(f'{where}: пустая или слишком длинная цитата'); return
    if st == 'company':
        # заявление компании: источник и дата вместо ссылки; проверить дословно нечем, поэтому обязательны автор, дата и пометка
        if not q.get('source'): E(f'{where}: у заявления компании нет source')
        if not re.match(r'\d{4}-\d\d-\d\d$', q.get('date', '')): E(f'{where}: у заявления компании нет даты (ГГГГ-ММ-ДД)')
        if q.get('use') != 'claim' or not q.get('note'): E(f'{where}: у заявления компании нужны use=claim и note')
        return
    if st == 'video':
        if q.get('videoCode') not in VIDS: E(f'{where}: неизвестное видео {q.get("videoCode")}'); return
        if SEG and nrm(q['quote']) not in SEG[q['videoCode']]: E(f'{where}: цитата не найдена дословно: {q["quote"][:60]}')
        return
    # веб-источник: url, издатель, тип, дата, снимок страницы, цитата дословно в снимке
    u = q.get('url', '')
    m = re.match(r'https://(?:www\.)?([^/]+)/', u)
    if not m: E(f'{where}: у веб-источника нет https-ссылки'); return
    if not any(m.group(1) == d or m.group(1).endswith('.' + d) for d in WEB_DOMAINS): E(f'{where}: домен {m.group(1)} не в списке надёжных источников')
    if q.get('sourceKind') not in WEB_KINDS: E(f'{where}: sourceKind {q.get("sourceKind")}')
    if not q.get('publisher'): E(f'{where}: нет publisher')
    if not re.match(r'\d{4}-\d\d-\d\d$', q.get('accessed', '')): E(f'{where}: нет даты accessed (ГГГГ-ММ-ДД)')
    if q.get('use') not in ('claim', 'caveat'): E(f'{where}: use должно быть claim или caveat')
    if q.get('use') == 'claim' and not isinstance(q.get('attributionRequired'), bool): E(f'{where}: у claim нет attributionRequired')
    sp = os.path.join(ROOT, q.get('snapshot', '')) if q.get('snapshot') else ''
    if not sp or not os.path.exists(sp): E(f'{where}: нет снимка страницы {q.get("snapshot")}'); return
    if sp not in SNAP: SNAP[sp] = _squash(open(sp, encoding='utf-8').read())
    if _squash(q['quote']) not in SNAP[sp]: E(f'{where}: цитата не найдена в снимке страницы: {q["quote"][:60]}')

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
        if q.get('sourceType') not in ('video', 'web', 'company'): E(f'{w}/{q["id"]}: нет sourceType (video, web или company)')
        check_quote(q, f'{w}/{q["id"]}')
        if q.get('appliesTo') not in ('answer','pushback','both'): E(f'{w}/{q["id"]}: appliesTo')
    if not any(q['appliesTo'] in ('answer','both') and q.get('sourceType') == 'video' for q in o['sourceQuotes']): E(f'{w}: нет видеоцитаты к ответу')
    pids = set(); seen_ideas = set()
    for p in o['requiredPoints']:
        pw = f'{w}/{p["id"]}'
        if p['id'] in pids: E(f'{pw}: дубль')
        pids.add(p['id'])
        if not p.get('beats') or not set(p['beats']) <= {1, 2} or p['beats'] != sorted(set(p['beats'])): E(f'{pw}: beats')
        if p.get('ideaId') not in IDEAS: E(f'{pw}: нет идеи {p.get("ideaId")} в ideas')
        else:
            ide = IDEAS[p['ideaId']]
            if p['text'] != ide['text'] or p['anyOf'] != ide['anyOf']: E(f'{pw}: text/anyOf расходятся с идеей {p["ideaId"]}')
            if p['ideaId'] in seen_ideas: E(f'{pw}: идея {p["ideaId"]} повторяется в возражении')
            seen_ideas.add(p['ideaId'])
        if not p['anyOf']: E(f'{pw}: пустой anyOf')
        for rxp in p['anyOf']: check_rx(rxp, pw)
        for qi in p['quoteIds']:
            if qi not in qids: E(f'{pw}: ссылка на отсутствующую цитату {qi}')
        if p.get('minMatches', 1) > len(p['anyOf']): E(f'{pw}: minMatches больше числа шаблонов')
    if not any(p['critical'] and 1 in p['beats'] for p in o['requiredPoints']): W(f'{w}: нет критичного пункта в первой реплике')
    if not (any(1 in p['beats'] for p in o['requiredPoints']) and any(2 in p['beats'] for p in o['requiredPoints'])): E(f'{w}: нет пунктов для обеих реплик')
    if not o['forbiddenClaims']: E(f'{w}: нет запрещённых утверждений')
    # ссылки на фрагменты каждой причины: у каждого пункта хотя бы один пункт с цитатой
    if not any(p['quoteIds'] for p in o['requiredPoints']): E(f'{w}: ни один пункт не привязан к цитате')


# ---------- идеи: одна идея — один пункт ----------
def _nt(t): return re.sub(r'[^а-яa-z0-9]+', ' ', t.lower().replace('ё', 'е')).strip()
_usedIdeas = {p['ideaId'] for o in OB['objections'] for p in o['requiredPoints']}
for _id, _i in IDEAS.items():
    if _id not in _usedIdeas: E(f'ideas: идея {_id} не используется')
    for _rx in _i['anyOf']: check_rx(_rx, f'ideas/{_id}')
_texts = {}
for _id, _i in IDEAS.items():
    _k = _nt(_i['text'])
    if _k in _texts: E(f'ideas: одинаковый текст у {_id} и {_texts[_k]}')
    _texts[_k] = _id
# регрессия по ошибке Павла (возражение про огонь): нужные слова сказаны в первой реплике, во второй — нет
_fire = next(o for o in OB['objections'] if o['id'] == 'obj-eco-fire')
_sc, _, _cov, _miss = R.score_step('Система не поддерживает горения, и вообще вот сертификат, посмотрите.', 'Ну да.', _fire, 0, SC)
if _miss: E(f'регрессия «огонь»: сказанное в первой реплике не засчитано: {_miss}')
for _txt in ['не поддерживает горение, сертификаты есть', 'Скажу точнее, не горит совсем я не говорю: не поддерживает горения. Ознакомьтесь с сертификацией по QR']:
    _c, _m = R.coverage(_fire['requiredPoints'], _txt)
    if _m: E(f'регрессия «огонь»: «{_txt[:30]}» не засчитан: {_m}')
# факты об огне: у верных вариантов нет «негорючий», «не горит»; из классов допустимы только заявленные компанией Г2 и КМ2
for o in OB['objections']:
    for b in ('beat1', 'beat2'):
        for op in o['choices'][b]['options']:
            if not op['correct']: continue
            t = op['text'].lower().replace('ё', 'е')
            if re.search(r'негорюч|(?<![а-я])не\s+горит|(?<![а-я])нг(?![а-я])|(?<![а-я])г[134](?![0-9])|(?<![а-я])км[01345](?![0-9])', t) and not re.search(r'совсем\s+не\s+горит', t):
                E(f'{op["id"]}: огонь: верный вариант называет не заявленный компанией класс или «негорючий»')
            if re.search(r'пожарн[а-я]*\s+класс|класс[а-я]*\s+пожарн', t) and 'км2' not in t:
                E(f'{op["id"]}: огонь: класс пожарной опасности назван без заявленного КМ2')
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
        pts = [p for p in o['requiredPoints'] if p['beats'] == [beat]]
        cov, mc = R.coverage(pts, txt)
        if cov < 1: E(f'{o["id"]}: эталон реплики {beat} не проходит свои пункты: ' + '; '.join(p['id'] for p in pts if not R.point_ok(p, txt)))
        # пункты, ожидаемые в нескольких репликах: хотя бы в одном из эталонов
        for p in o['requiredPoints']:
            if len(p['beats']) > 1 and beat == 1 and not any(R.point_ok(p, (o['referenceAnswer'], o['pushbackReferenceAnswer'])[b - 1]) for b in p['beats']): E(f'{o["id"]}/{p["id"]}: пункт на несколько реплик не встречается ни в одном эталоне')
        h = R.forbidden_hits(txt, SC)
        if h: E(f'{o["id"]}: эталон реплики {beat} содержит запрещённое: {h}')
    # эталон первой реплики не должен засчитывать пункты второй (пункты различимы)
    sc1, _, _, _ = R.score_text(o['referenceAnswer'] + ' ' + o['pushbackReferenceAnswer'], o['requiredPoints'], o['clientPhrasing'][0], SC)
    if sc1['objection'] < 5: E(f'{o["id"]}: объединённый эталон не даёт 5 по «Ответ на возражение»')
    st, sh, scov, smc = R.score_step(o['referenceAnswer'], o['pushbackReferenceAnswer'], o, 0, SC)
    if st['objection'] < 5 or st['honesty'] < 5: E(f'{o["id"]}: пара эталонов не даёт 5 по охвату и честности: {st} {sh}')
    if R.total(st, 'objection', SC) < 3.5: E(f'{o["id"]}: пара эталонов не проходит порог быстрой отработки: {R.total(st, "objection", SC)}')
    # пункты ищутся по обоим ответам вместе: порядок реплик не должен менять охват
    st2, _, cov2, _ = R.score_step(o['pushbackReferenceAnswer'], o['referenceAnswer'], o, 0, SC)
    if abs(cov2 - scov) > 1e-9: E(f'{o["id"]}: охват зависит от порядка ответов')

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
    if not any(c['kind'] in ('nextStep', 'nextStepChoice') for c in s['successCriteria']): E(f'{w}: нет критерия следующего шага')


BANNED = [
  ('g-17db', r'до\s+17(?!\d|:)|17\s*дб'),
   ('g-allergy-promise', r'не\s+будет\s+аллерги|аллерги[а-я]*\s+(не\s+вызыва|не\s+будет|не\s+бывает)|не\s+вызыва[а-я]*\s+аллерги'),
  ('g-price', r'\d[\d\s]*\s*(₽|руб|тыс[а-я]*\s*руб)|\d\s*тысяч'),
  ('g-percent', r'\d+\s*(%|процент)'),
  ('g-years', r'\d+\s*(лет|года)(?![а-я])'),
]

# ---------- выбор ответа (choices) ----------
ERR_TYPES = {'false_promise', 'pressure', 'vague', 'ignores_concern'}
CRIT = {c['id'] for c in SC['criteria']}
ALL_ABOVE = re.compile(r'все\s+(выше|перечисл)|все\s+вышеперечисл|оба\s+вариант|ни\s+один\s+из|все\s+ответы|все\s+(три|четыре)\s+вариант|a\s*и\s*b', re.I)
BOOKISH = re.compile(r'логично|без\s+нажима|резонн|безусловно|разумеется|вследствие|посредством|данн(ый|ая|ое)\s+(вопрос|систем)', re.I)
ALLOWED_DB_SET = {'1', '2', '3', '4', '5', '9', '38', '45', '57'}
def strip_quotes(t): return re.sub(r'«[^»]*»', ' ', t)
def check_option_text(o, where, correct_beat_text=True):
    t = o['text']
    if not t.strip() or len(t) > 360: E(f'{where}: пустой или слишком длинный вариант')
    if ALL_ABOVE.search(t): E(f'{where}: вариант «все вышеперечисленное» и подобные запрещены')
    if not o.get('explanation', '').strip(): E(f'{where}: нет пояснения')
    if o['correct']:
        if o.get('errorType') or o.get('violates'): E(f'{where}: у верного варианта не должно быть errorType/violates')
        h = R.forbidden_hits(t, SC)
        if h: E(f'{where}: верный вариант содержит запрещённое: {h}')
        for bid, rxp in BANNED:
            if re.search(rxp, t.lower()): E(f'{where}: верный вариант содержит запрещённый элемент {bid}')
        for bid, rxp in BANNED:
            if re.search(rxp, strip_quotes(o['explanation']).lower()): E(f'{where}: пояснение верного варианта содержит запрещённый элемент {bid}')
        for m in re.finditer(r'(\d+)\s*дб', t.lower()):
            if m.group(1) not in ALLOWED_DB_SET: E(f'{where}: число дБ вне списка проверенных: {m.group(1)}')
    else:
        if o.get('errorType') not in ERR_TYPES: E(f'{where}: неверный errorType {o.get("errorType")}')
        if o.get('violates') not in CRIT: E(f'{where}: неверный violates {o.get("violates")}')
    # вставки «…» в пояснениях должны быть дословными цитатами
    if SEG and o['correct']:
        for frag in re.findall(r'«([^»]{18,})»', o.get('explanation', '')):
            f2 = nrm(frag).rstrip('.…').strip()
            if not any(f2.lower() in seg.lower() for seg in SEG.values()) and not f2.lower() in nrm(o['text']).lower():
                E(f'{where}: цитата в пояснении не найдена дословно: «{frag[:60]}»')

def check_beat(b, where, qids=None, size=(3, 5)):
    if b.get('mode') != 'single': E(f'{where}: mode должен быть single'); return
    ops = b['options']
    if not size[0] <= len(ops) <= size[1]: E(f'{where}: вариантов {len(ops)}, нужно {size[0]}–{size[1]}')
    if sum(1 for o in ops if o['correct']) != 1: E(f'{where}: ровно один верный вариант, найдено {sum(1 for o in ops if o["correct"])}')
    if len({o['id'] for o in ops}) != len(ops): E(f'{where}: дубли id')
    if len({nrm(o['text']).lower() for o in ops}) != len(ops): E(f'{where}: одинаковые тексты')
    for o in ops:
        check_option_text(o, f'{where}/{o["id"]}')
        if qids is not None:
            for qi in o.get('quoteIds', []):
                if qi not in qids: E(f'{where}/{o["id"]}: ссылка на отсутствующую цитату {qi}')

POS = {}; LONGEST = [0, 0]; RATIO = []
def stat_beat(b):
    ops = b['options']; ls = [len(o['text']) for o in ops]
    ci = next(i for i, o in enumerate(ops) if o['correct'])
    POS[ci] = POS.get(ci, 0) + 1
    LONGEST[1] += 1; LONGEST[0] += ls[ci] == max(ls)
    RATIO.append(ls[ci] / (sum(l for i, l in enumerate(ls) if i != ci) / (len(ls) - 1)))
CR_USED = {}
for o in OB['objections']:
    w = o['id']
    ch = o.get('choices')
    if not ch or set(ch) != {'beat1', 'beat2'}: E(f'{w}: нет choices.beat1 и choices.beat2'); continue
    qs = {q['id'] for q in o['sourceQuotes']}
    for bk in ('beat1', 'beat2'):
        check_beat(ch[bk], f'{w}/{bk}', qs, size=(3, 4))
        stat_beat(ch[bk])
        for x in ch[bk]['options']:
            if not x['correct']: CR_USED[x['violates']] = CR_USED.get(x['violates'], 0) + 1
        if not any(x['correct'] and x['quoteIds'] for x in ch[bk]['options']): E(f'{w}/{bk}: верный вариант не привязан к цитате')
        WQ = {q['id']: q for q in o['sourceQuotes'] if q.get('sourceType') == 'web'}
        CQ = {q['id']: q for q in o['sourceQuotes'] if q.get('sourceType') == 'company'}
        for x in ch[bk]['options']:
            for qi in x['quoteIds']:
                if qi in WQ and x['correct']:
                    if WQ[qi]['use'] == 'caveat': E(f'{w}/{bk}/{x["id"]}: верный вариант опирается на веб-цитату-предостережение {qi}')
                    elif WQ[qi].get('attributionRequired') and not ATTRIB.search(x['text']): E(f'{w}/{bk}/{x["id"]}: факт с сайта ({qi}) без атрибуции (производитель пишет / указывает)')
                if qi in CQ:
                    if not x['correct']: E(f'{w}/{bk}/{x["id"]}: неверный вариант не должен ссылаться на заявление компании {qi}')
                    for t in CQ[qi].get('mustSay', []):
                        if t.lower() not in x['text'].lower(): E(f'{w}/{bk}/{x["id"]}: вариант со ссылкой на заявление компании {qi} не содержит «{t}»')
                if qi in WQ and not x['correct']: E(f'{w}/{bk}/{x["id"]}: неверный вариант не должен ссылаться на веб-цитату {qi}')
    for bk in ('beat1', 'beat2'):
        if not any(x['errorType'] == 'false_promise' for x in ch[bk]['options']) and bk == 'beat1' and not any(x['errorType'] == 'false_promise' for x in ch['beat2']['options']):
            W(f'{w}: нет вариантов с ложным обещанием ни в одной реплике')
# баланс: верный вариант не должен выделяться ни длиной, ни положением
if LONGEST[1] and LONGEST[0] / LONGEST[1] > 0.45: E(f'верный вариант самый длинный в {LONGEST[0]} из {LONGEST[1]} реплик (допустимо не больше 45%): по длине ответ угадывается')
if RATIO and not 0.8 <= sum(RATIO) / len(RATIO) <= 1.25: E(f'средняя длина верного варианта отличается от неверных в {sum(RATIO) / len(RATIO):.2f} раза (допустимо 0,8–1,25)')
if POS and max(POS.values()) / sum(POS.values()) > 0.45: E(f'верный вариант слишком часто на одной позиции: {POS}')
for c in ('honesty', 'listening', 'objection', 'value'):
    if CR_USED.get(c, 0) == 0: E(f'ни один неверный вариант не помечен критерием {c}')
for c in ('discovery',):
    if CR_USED.get(c, 0) == 0: W(f'ни один неверный вариант не помечен критерием {c}: критерий не будет оцениваться в режиме выбора')
for sc_ in SCN['scenarios']:
    w = sc_['id']
    for st in sc_['steps']:
        sw = f'{w}/{st["id"]}'
        o = OBJ.get(st['objectionId'])
        if not o: continue
        cl_ = st.get('clientLines')
        if not (isinstance(cl_, list) and len(cl_) == 2 and all(x.strip() for x in cl_)): E(f'{sw}: нужны clientLines из двух реплик'); continue
        for x in cl_ + [st['afterPass'], st['afterFail']]:
            if BOOKISH.search(x): E(f'{sw}: книжное слово в реплике: {x[:70]}')
        for bk in ('beat1', 'beat2'):
            b = st.get('choices', {}).get(bk)
            if not b: E(f'{sw}: нет choices.{bk}'); continue
            check_beat(b, f'{sw}/{bk}', None, size=(3, 4))
            src = {x['id']: x for x in o['choices'][bk]['options']}
            for x in b['options']:
                s0 = src.get(x.get('sourceOptionId'))
                if not s0: E(f'{sw}/{x["id"]}: sourceOptionId не найден'); continue
                if any(s0[k] != x[k] for k in ('text', 'correct', 'errorType', 'violates', 'explanation')): E(f'{sw}/{x["id"]}: расходится с вариантом возражения {s0["id"]}')
            if {x['sourceOptionId'] for x in b['options']} != set(src): E(f'{sw}/{bk}: набор вариантов не совпадает с вариантами возражения')
    cl = sc_['closing']
    if not cl.get('clientLine') or not cl.get('afterCorrect') or not cl.get('afterWrong'): E(f'{w}/closing: нет clientLine/afterCorrect/afterWrong')
    for x in (cl.get('clientLine', ''), cl.get('afterCorrect', ''), cl.get('afterWrong', '')):
        if BOOKISH.search(x): E(f'{w}/closing: книжное слово в реплике: {x[:70]}')
    b = cl.get('choices')
    if not b: E(f'{w}/closing: нет choices'); continue
    check_beat(b, f'{w}/closing', None, size=(4, 4))
    for x in b['options']:
        if not x['correct'] and x['violates'] != 'nextstep': E(f'{w}/closing/{x["id"]}: неверный следующий шаг должен нарушать критерий nextstep')
        res, _, _, _ = R.score_text(x['text'], [], '', SC)
        if x['correct'] and res['nextstep'] < 5: E(f'{w}/closing/{x["id"]}: верный следующий шаг получает {res["nextstep"]} из 5 (нужны действие, срок, кто делает)')
        if not x['correct'] and res['nextstep'] >= 5: E(f'{w}/closing/{x["id"]}: неверный следующий шаг выглядит как полный (действие+срок+кто): {x["text"][:60]}')
    if cl['goodExamples'] != [next(x['text'] for x in b['options'] if x['correct'])]: E(f'{w}/closing: goodExamples расходится с верным вариантом')

# ---------- запрещённые слова и цифры во всём содержимом ----------
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
    if '/choices' in path and (path.endswith('/text') or path.endswith('/explanation')): return True   # неверные варианты и пояснения; верные проверяются отдельно (блок «выбор ответа»)
    if '/sourceQuotes[' in path and path.endswith('/note'): return True   # пояснение к веб-источнику-предостережению
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
 'г-негорючий': 'Материал негорючий, он совсем не горит.',
 'г-нг': 'Это негорючий материал, группа НГ.',
 'г-г4': 'У панели группа горючести Г4.',
 'г-аллергии-не-будет': 'Аллергии точно не будет, это вылечит любую аллергию.',
 'г-17': 'Эффект до 17 дБ.',
 'г-срок': 'Прослужит 50 лет, гарантия вечная.',
 'г-аллергия': 'Система безопасна для аллергиков.',
 'г-тишина-после-не': 'Не волнуйтесь, гарантирую полную тишину.',
 'г-тишина-запятая': 'Нет проблем, после монтажа будет полная тишина.',
 'г-тишина-но': 'Я не обещаю идеал, но полная тишина у вас будет.',
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
 'Материал гипоаллергенный: вспененный полипропилен и вязкоэластичная пена считаются гипоаллергенными, химически инертны, не пылят.',
 'Группа горючести Г2, класс КМ2, система не поддерживает горения.',
 'Замок шип-паз (SmartLock) соединяет панели в монолитное полотно.',
 'Гарантий от аллергии никто не даёт, по конкретной аллергии лучше свериться с врачом.',
 'Для вашей квартиры цифру я не называю, нужен замер.',
 'В видео сказано, что система не вызывает горения? Нет: не поддерживает горения.',
 'Абсолютной тишины мы вам не гарантируем.',
 'Тишину мы не гарантируем.',
 'Мы не гарантируем тишину, но шум станет менее раздражающим.',
 'Полной тишины я не обещаю, но шум станет менее заметным.',
 'Гарантировать тишину нельзя, это было бы нечестно.',
 'Ни одна система не даст вам полной тишины, и мы такого не обещаем.',
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
