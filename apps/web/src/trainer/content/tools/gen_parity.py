# -*- coding: utf-8 -*-
"""Пересоздаёт parity.fixtures.json: результаты эталонной автооценки (score_reference.py),
с которыми сверяется перенос на TypeScript (scoring.parity.test.ts).
Запуск: python3 tools/gen_parity.py  (из папки content)."""
import json, os, re, sys, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import score_reference as R

OB = R.load('objections.json'); SC = R.load('scoring.json'); SCN = R.load('scenarios.json')
SC['_localForbidden'] = [{'id': k, **v} for k, v in SC['localForbiddenPatterns'].items()]
first = lambda t: re.split(r'[.!?\n;]+', t)[0]

def recipe(o, name):
    r1, r2 = o['referenceAnswer'], o['pushbackReferenceAnswer']
    if name == 'ref': return r1, r2, 0
    if name == 'phr1': return r1, r2, 1
    if name == 'swap': return r2, r1, 0
    if name == 'unknown': return 'Не знаю, это просто хороший материал.', 'Не знаю.', 0
    if name == 'silence': return r1 + ' Гарантирую полную тишину.', r2, 0
    if name == 'half': return first(r1), first(r2), 0
    if name == 'question': return 'Скажите, что вы слышите вечером и когда? ' + first(r1) + '.', r2, 0
    raise KeyError(name)

NAMES = ['ref', 'phr1', 'swap', 'unknown', 'silence', 'half', 'question']
steps = []
for o in OB['objections']:
    for n in NAMES:
        b1, b2, idx = recipe(o, n)
        res, hits, cov, miss = R.score_step(b1, b2, o, idx, SC)
        steps.append({'objectionId': o['id'], 'recipe': n, 'scores': res, 'hits': hits, 'cov': cov, 'missing': miss,
                      'total': R.total(res, 'objection', SC)})

texts = {
 'g-тишина': 'Гарантирую полную тишину, вы ничего не услышите.',
 'g-потолок9': 'На потолке у вас тоже будет плюс 9 дБ, как на стене.',
 'g-цифра': 'У вас в квартире шум снизится на 15 дБ.',
 'g-замок': 'Панели держит наш замок SmartLock.',
 'g-негорючий': 'Материал негорючий, он совсем не горит.',
 'g-гипо': 'Это гипоаллергенная система.',
 'g-17': 'Эффект до 17 дБ.',
 'g-срок': 'Прослужит 50 лет, гарантия вечная.',
 'g-аллергия': 'Система безопасна для аллергиков.',
 'ok-1': 'Мы не обещаем тишину: ни одна система не делает квартиру абсолютно беззвучной.',
 'ok-2': 'Гарантировать результат я не могу, он зависит от перекрытия, типа шума и качества монтажа.',
 'ok-3': 'На потолке в испытании было +1 дБ при исходных 57 дБ, а на стене +9 дБ при исходных 38 дБ.',
 'ok-4': 'Система не поддерживает горения и не выделяет опасного чёрного дыма.',
 'ok-5': 'Обещать полную тишину было бы неправдой.',
 'ok-6': 'Для вашей квартиры цифру я не называю, нужен замер.',
 'ok-7': 'В видео сказано, что система не вызывает горения? Нет: не поддерживает горения.',
 'mix-1': 'Понимаю вас. Что именно вы слышите по вечерам? Для вас это важно, давайте сделаем расчёт.',
 'mix-2': 'Шумоизоляция Wave лучше глушит, чем Flat. Гарантирую, что будет тихо!',
 'mix-3': 'ЁЖИК   «Тишина»\nбудет полная; потом тишина.',
}
free = []
pts = OB['objections'][0]['requiredPoints']; client = OB['objections'][0]['clientPhrasing'][0]
for k, t in texts.items():
    sc, hits, cov, mc = R.score_text(t, pts, client, SC)
    free.append({'key': k, 'text': t, 'scores': sc, 'hits': R.forbidden_hits(t, SC), 'cov': cov, 'missing': mc})
nexts = []
for s in SCN['scenarios']:
    for i, ex in enumerate(s['closing']['goodExamples']):
        sc, hits, _, _ = R.score_text(ex, [], '', SC)
        nexts.append({'scenarioId': s['id'], 'index': i, 'scores': sc, 'hits': hits})

rnd = random.Random(7)
totals = []
for mode in ['objection', 'roleplay', 'quiz']:
    for _ in range(60):
        sc = {c['id']: rnd.randint(1, 5) for c in SC['criteria']}
        totals.append({'mode': mode, 'scores': sc, 'total': R.total(sc, mode, SC)})
totals += [{'mode': 'objection', 'scores': {'discovery': 1, 'listening': 4, 'objection': 5, 'value': 5, 'honesty': 5, 'nextstep': 1}, 'total': R.total({'discovery': 1, 'listening': 4, 'objection': 5, 'value': 5, 'honesty': 5, 'nextstep': 1}, 'objection', SC)}]

out = {'steps': steps, 'free': free, 'nextSteps': nexts, 'totals': totals}
here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
with open(os.path.join(here, 'parity.fixtures.json'), 'w', encoding='utf-8') as f:
    json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
print(len(steps), len(free), len(nexts), len(totals))
