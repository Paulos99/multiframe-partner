# -*- coding: utf-8 -*-
"""Эталонная реализация автооценки без нейросети (для проверки и переноса на JavaScript).
Читает scoring.json. Используется validate.py и как образец для разработчика."""
import re, json, os
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

def load(name):
    with open(os.path.join(ROOT, name), encoding='utf-8') as f:
        return json.load(f)

def norm(s):
    s = s.lower().replace('ё', 'е')
    s = re.sub(r'[«»"“”]', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()

def sentences(text):
    return [x.strip() for x in re.split(r'[.!?\n;]+', text) if x.strip()]

def tokens(s):
    return re.findall(r'[а-яa-z0-9]+', s)

def rx(p):
    return re.compile(norm(p) if False else p.replace('ё', 'е'), re.I)

CLAUSE_SPLIT = re.compile(r',|;|:|\u2014|\u2013| но | а | зато | однако ')
ADVERSATIVE = re.compile(r' но | зато | однако ')

def clauses(sent):
    """Делит часть предложения на клаузы по запятым, тире, «а»: отрицание действует внутри своей клаузы."""
    return [c.strip() for c in CLAUSE_SPLIT.split(sent) if c.strip()]

def forbidden_hits(text, scoring):
    """Возвращает список {id, severity, fragment}.
    1) предложение делится по «но/зато/однако» на смысловые части: исключение exceptIfSentenceMatches действует только на свою часть
       («я не обещаю идеал, но полная тишина будет» нарушение: исключение не распространяется на часть после «но»);
    2) внутри части отрицание считается по КЛАУЗЕ: любое слово из negationWords до или после совпадения в той же клаузе гасит правило negationAware
       («абсолютной тишины мы вам не гарантируем» не нарушение, хотя «не» стоит после совпадения)."""
    neg = set(scoring['negationWords'])
    hits = []
    for rule in scoring['globalForbidden'] + scoring.get('_localForbidden', []):
        for sent in sentences(norm(text)):
            for seg in ADVERSATIVE.split(sent):
                if any(re.search(e, seg) for e in rule.get('exceptIfSentenceMatches', [])):
                    continue
                for part in clauses(seg):
                    if rule.get('negationAware') and any(t in neg for t in tokens(part)):
                        continue
                    for p in rule['patterns']:
                        for m in re.finditer(p, part):
                            hits.append({'id': rule['id'], 'severity': rule['severity'], 'fragment': m.group(0)})
    return hits

def point_ok(point, text):
    t = norm(text)
    need = point.get('minMatches', 1)
    got = sum(1 for p in point['anyOf'] if re.search(p, t))
    return got >= need

def coverage(points, text):
    tot = got = 0
    missing_crit = []
    for p in points:
        w = 2 if p['critical'] else 1
        tot += w
        if point_ok(p, text):
            got += w
        elif p['critical']:
            missing_crit.append(p['id'])
    return (got / tot if tot else 1.0), missing_crit

def cov_to_score(cov, missing_crit, scoring):
    s = 1
    for th, sc in scoring['coverageToScore']:
        if cov >= th:
            s = sc
    if missing_crit:
        s = min(s, scoring['capIfCriticalMissing'])
    return s

def score_text(text, points, client_text, scoring, need_next_step=False, require_discovery=True):
    t = norm(text)
    res = {}
    # discovery
    q = t.count('?')
    open_q = any(re.search(p, sent) for sent in sentences(t) for p in scoring['openQuestionStarters']) and q > 0
    res['discovery'] = 1 if q == 0 else (3 if not open_q else 5)
    # listening
    ack = any(re.search(p, t[:120]) for p in scoring['ackStarters'])
    ct = {w[:5] for w in tokens(norm(client_text)) if len(w) >= 5}
    echo = len({w[:5] for w in tokens(t) if len(w) >= 5} & ct) >= 1
    res['listening'] = 1 + (2 if ack else 0) + (2 if echo else 0)
    # objection
    cov, mc = coverage(points, text)
    res['objection'] = cov_to_score(cov, mc, scoring)
    # value
    facts = sum(1 for p in points if p.get('quoteIds') and point_ok(p, text))
    link = bool(re.search(scoring['valueLinkPattern'], t))
    res['value'] = 1 if facts == 0 else (3 if not link else 5 if facts >= 2 else 4)
    # honesty
    hits = forbidden_hits(text, scoring)
    crit = [h for h in hits if h['severity'] == 'critical']
    warn = [h for h in hits if h['severity'] == 'warn']
    res['honesty'] = 1 if crit else max(3, 5 - len(warn))
    # next step
    act = any(re.search(p, t) for p in scoring['nextStep']['action'])
    tm = any(re.search(p, t) for p in scoring['nextStep']['time'])
    who = any(re.search(p, t) for p in scoring['nextStep']['who'])
    res['nextstep'] = 1 if not act else (3 if not tm else (5 if who else 4))
    return res, hits, cov, mc

def score_step(beat1, beat2, obj, phrasing_idx, scoring):
    """Один шаг для свободной практики: два ответа (на возражение и на повтор).
    Пункты requiredPoints — подсказки «что содержит хороший ответ». Каждый пункт ищется в ОБОИХ ответах вместе:
    клиент мог сказать нужное в первой реплике, а не во второй (поле beats показывает лишь, где это обычно ждут)."""
    pts = obj['requiredPoints']
    p1 = [p for p in pts if p['beats'] == [1]]
    p2 = [p for p in pts if p['beats'] == [2]]
    c1 = obj['clientPhrasing'][phrasing_idx]
    s1, h1, cov1, mc1 = score_text(beat1, p1, c1, scoring)
    s2, h2, cov2, mc2 = score_text(beat2, p2, obj['pushback'], scoring)
    both = beat1 + ' ' + beat2
    cov, missing = coverage(pts, both)
    res = {
      'discovery': max(s1['discovery'], s2['discovery']),
      'listening': max(s1['listening'], s2['listening']),
      'objection': cov_to_score(cov, missing, scoring),
      'value': max(s1['value'], s2['value']),
      'honesty': min(s1['honesty'], s2['honesty']),
      'nextstep': max(s1['nextstep'], s2['nextstep']),
    }
    return res, h1 + h2, cov, missing

def total(scores, mode, scoring):
    ws = {c['id']: c['weight'] for c in scoring['criteria'] if mode in c['modes']}
    if mode == 'objection' and scoring.get('discoveryOptionalInDrill') and scores.get('discovery', 1) == 1:
        ws.pop('discovery', None)
    s = sum(ws[k] * scores[k] for k in ws)
    tw = sum(ws.values())
    tot = s / tw
    if scores.get('honesty', 5) <= scoring['honestyGate']['honestyAtMost']:
        tot = min(tot, scoring['honestyGate']['capTotalTo'])
    return round(tot, 2)
