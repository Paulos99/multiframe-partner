/**
 * Событийная модель без персональных данных клиентов.
 * Воронка продаж считается по dealId, не по комнате/расчёту.
 */

                               
                       
                          
                        
                         
                           
                           
                        
                          
                       
                   
                  
                          
                   
                   
                    
                          
                            
                       
                      
                        
                       
                       

                                                        

                             
                  
                          
                     
                       
                        
                            
                         
                        
                         
                          
  

const FORBIDDEN_PAYLOAD_KEYS = [
  'clientName',
  'clientPhone',
  'phone',
  'fio',
  'fullName',
  'address',
  'message',
  'comment',
  'pdf',
  'pdfBase64',
  'dataBase64',
  'transcript',
]         ;

/** Техническое событие не должно содержать ПД клиента или содержимое документов. */
export function assertEventPayloadSafe(payload                                            )           {
  if (!payload || typeof payload !== 'object') return [];
  const hits           = [];
  for (const key of FORBIDDEN_PAYLOAD_KEYS) {
    if (key in payload && payload[key] != null && payload[key] !== '') hits.push(key);
  }
  return hits;
}

export function isEventPayloadSafe(payload                                            )          {
  return assertEventPayloadSafe(payload).length === 0;
}

/** Учебные и демо-действия исключаются из боевых KPI. */
export function countsTowardSalesKpi(event                                         )          {
  if (event.context === 'training' || event.context === 'demo') return false;
  if (event.name.startsWith('training_')) return false;
  return true;
}

                                
                  
                     
                       
                             
                   
                   
                    
  

const DEAL_FUNNEL_ORDER                      = [
  'multiframe_offered',
  'calculator_completed',
  'quote_created',
  'quote_sent_confirmed',
  'deal_accepted',
];

/**
 * Воронка по уникальным dealId (не по комнатам).
 * События без dealId в воронку сделок не входят.
 */
export function computeDealFunnel(events                                             )                   {
  const list = Array.isArray(events) ? events : [];
  const byDeal = new Map                                ();
  for (const e of list) {
    if (!countsTowardSalesKpi(e)) continue;
    const dealId = typeof e.dealId === 'string' ? e.dealId.trim() : '';
    if (!dealId) continue;
    let set = byDeal.get(dealId);
    if (!set) {
      set = new Set();
      byDeal.set(dealId, set);
    }
    set.add(e.name);
  }

  const counts                   = {
    offered: 0,
    calculated: 0,
    quoteCreated: 0,
    quoteSentConfirmed: 0,
    accepted: 0,
    declined: 0,
    postponed: 0,
  };

  for (const names of byDeal.values()) {
    if (names.has('multiframe_offered') || names.has('consultation_started')) counts.offered += 1;
    if (names.has('calculator_completed')) counts.calculated += 1;
    if (names.has('quote_created')) counts.quoteCreated += 1;
    if (names.has('quote_sent_confirmed')) counts.quoteSentConfirmed += 1;
    if (names.has('deal_accepted')) counts.accepted += 1;
    if (names.has('deal_declined')) counts.declined += 1;
    if (names.has('deal_postponed')) counts.postponed += 1;
  }
  return counts;
}

/** Дедупликация повторной отправки после офлайна по eventId. */
export function dedupeEventsById                                             (
  events              ,
)      {
  const seen = new Set        ();
  const out      = [];
  for (const e of events) {
    const id = (e.eventId || e.id || '').trim();
    if (!id) {
      out.push(e);
      continue;
    }
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(e);
  }
  return out;
}

export const INSUFFICIENT_OBSERVATIONS_LABEL = 'недостаточно наблюдений';

/** На малых выборках не выдаём уверенный диагноз. */
export function diagnosisConfidence(sampleSize        , minReliable = 5)   
                    
                       
  {
  if (!Number.isFinite(sampleSize) || sampleSize < minReliable) {
    return { reliable: false, label: INSUFFICIENT_OBSERVATIONS_LABEL };
  }
  return { reliable: true, label: null };
}

export { DEAL_FUNNEL_ORDER };
