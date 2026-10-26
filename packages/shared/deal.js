/**
 * Коммерческий процесс (сделка) — единица воронки продаж.
 * Не заменяет JobObject/Project: Deal привязан к projectId.
 */

                       
             
             
              
                
                   
                  
                          
                    
                    
                     
             
             

                         
              
              
               
                 
             
         

                        
               
             
                     
                 
                      
               
           
             
         

/** Независимые ответственные по этапам. */
                                 
                             
                                
                            
  

                    
             
                
                    
                   
                             
                                 
                              
                       
                         
                              
                    
                    
  

export const EMPTY_ASSIGNMENTS                    = {
  salesUserId: null,
  measurerUserId: null,
  crewUserId: null,
};

export const LOSS_REASON_LABELS                                            = {
  expensive: 'Дорого',
  no_need: 'Не видит потребности',
  doubts_efficacy: 'Сомневается в эффективности',
  chose_other: 'Выбрал другой вариант',
  postponed_repair: 'Отложил покупку/ремонт',
  technical: 'Нет технической возможности',
  other: 'Другая причина',
  unknown: 'Неизвестно',
};

export const DEAL_OUTCOME_LABELS                                             = {
  accepted: 'Согласился',
  declined: 'Отказался',
  postponed: 'Отложил',
  no_response: 'Ответа пока нет',
  unknown: 'Результат неизвестен',
  early_declined: 'Отказ до КП',
  early_paused: 'Пауза',
};

/**
 * Производное assignedTo для совместимости со старым JobObject.
 * Приоритет: measurer → sales → crew (текущий «в работе»).
 */
export function derivedAssignedTo(assignments                                      )                {
  if (!assignments) return null;
  return assignments.measurerUserId || assignments.salesUserId || assignments.crewUserId || null;
}

/** Закрытие объекта (JobObject.status === closed) само по себе не означает выигранную сделку. */
export function jobClosedImpliesDealAccepted(_jobStatus                           )          {
  return false;
}

/** Исход сделки задаётся только явным outcome, не статусом объекта. */
export function resolveDealOutcome(deal                                 )              {
  if (deal.outcome) return deal.outcome;
  if (deal.stage === 'quote_accepted') return 'accepted';
  if (deal.stage === 'quote_declined') return 'declined';
  if (deal.stage === 'quote_postponed') return 'postponed';
  return null;
}

export function applyDealOutcome(
  deal      ,
  outcome                            ,
  lossReason             = null,
  lossComment                = null,
)       {
  const next       = {
    ...deal,
    outcome,
    updatedAt: new Date().toISOString(),
    lossReason: outcome === 'declined' ? lossReason || 'unknown' : null,
    lossComment: outcome === 'declined' ? lossComment : null,
  };
  if (outcome === 'accepted') next.stage = 'quote_accepted';
  else if (outcome === 'declined') next.stage = 'quote_declined';
  else if (outcome === 'postponed') next.stage = 'quote_postponed';
  return next;
}
