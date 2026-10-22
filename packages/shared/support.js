/**
 * Обращения партнёров и меры поддержки StP.
 * Заявка не прикладывает персональные данные конечного клиента.
 */

                             
           
                 
             
               
                
            

                                                                               

                           
             
                
                                
                      
                            
                            
                                              
                        
                   
                          
                                   
                         
  

                            
             
                
                               
                      
                     
                    
                          
                                                                          
                          
  

export const SUPPORT_CATEGORY_LABELS                                  = {
  sales: 'Продажи',
  calculation: 'Расчёт',
  install: 'Монтаж',
  materials: 'Материалы',
  tech_error: 'Техническая ошибка',
  other: 'Другое',
};

const CLIENT_PII_KEYS = ['clientName', 'clientPhone', 'phone', 'address', 'fio', 'fullName']         ;

/** Запрос помощи не должен автоматически прикладывать карточку клиента. */
export function assertSupportPayloadSafe(
  payload                                            ,
)           {
  if (!payload || typeof payload !== 'object') return [];
  return CLIENT_PII_KEYS.filter((key) => payload[key] != null && payload[key] !== '');
}

export function isSupportPayloadSafe(payload                                            )          {
  return assertSupportPayloadSafe(payload).length === 0;
}

export function createSupportCase(input   
             
                
                                
                      
                            
                         
                    
 )              {
  return {
    id: input.id,
    orgId: input.orgId,
    openedByUserId: input.openedByUserId,
    role: input.role,
    category: input.category,
    status: 'open',
    module: input.module ?? null,
    openedAt: input.openedAt || new Date().toISOString(),
    closedAt: null,
    assigneeStpUserId: null,
    outcome: null,
  };
}

export function linkInterventionToSignal(
  intervention              ,
  signalId        ,
  reviewAt        ,
)               {
  return {
    ...intervention,
    signalId,
    reviewAt,
  };
}

/** Мало наблюдений — результат insufficient_data, не «улучшение». */
export function interventionResultFromSamples(
  before        ,
  after        ,
  minSamples = 5,
)                         {
  if (before < minSamples || after < minSamples) return 'insufficient_data';
  if (after > before) return 'improved';
  if (after < before) return 'worse';
  return 'unchanged';
}
