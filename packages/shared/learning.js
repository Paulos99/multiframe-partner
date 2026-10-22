/**
 * Академия / тренажёры. Попытки изолированы от боевой аналитики продаж.
 * Не импортирует partner.ts — избегаем циклов с реэкспортом.
 */

                                                                                                     

                             
                    
                   
                     
             
                        
               
                        

                              
                              
                                                                                   
                              
  

                                
                         
                                                                  
                                         
                  
                
                         
  

                                                                                       

                               
             
                 
                
                                 
                                
                           
                             
                       
                       
                                                                
                      
  

export const DEFAULT_SALES_RUBRIC                 = {
  criteria: [
    'need_discovery',
    'tech_accuracy',
    'non_pushy_offer',
    'clarity',
    'objection_handling',
    'next_step',
    'no_false_promises',
  ],
  falsePromisePenalty: 25,
};

/** Открытие тренажёра ≠ освоение навыка. */
export function openingCountsAsMastery(_attempt                                 )          {
  return false;
}

export function isAttemptCompleted(attempt                                                 )          {
  return attempt.status === 'completed' && Boolean(attempt.completedAt);
}

/** Учебные попытки никогда не увеличивают воронку продаж. */
export function learningAttemptAffectsSalesFunnel(_attempt                 )          {
  return false;
}

export function scoreWithFalsePromisePenalty(
  baseScore        ,
  hasFalsePromise         ,
  rubric                 = DEFAULT_SALES_RUBRIC,
)         {
  const raw = hasFalsePromise ? baseScore - rubric.falsePromisePenalty : baseScore;
  return Math.max(0, Math.min(100, raw));
}

export function progressDelta(
  previous                           ,
  current                           ,
)                {
  if (previous == null || current == null) return null;
  if (!Number.isFinite(previous) || !Number.isFinite(current)) return null;
  return current - previous;
}
