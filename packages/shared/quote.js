/**
 * Версии коммерческого предложения.
 * Копирование текста / генерация PDF ≠ подтверждённая отправка.
 */

                            
                   
                  
                          
                    
                    
                      

                             
             
                    
                        
                  
                                                        
                               
                        
                          
                    
                           
                                                                 
                          
                                                                  
                                 
                             
                            
  

                             
            
               
                  
           
                  
            
             
               

/** Копирование текста или генерация PDF не переводит КП в «отправлено». */
export function copyOrPdfImpliesSent(_action                              )          {
  return false;
}

export function nextQuoteLifecycle(
  current                ,
  action                 ,
)                 {
  if (action === 'copy_text' || action === 'generate_pdf') return current;
  if (action === 'create') return 'quote_created';
  if (action === 'share') {
    if (current === 'quote_created') return 'quote_shared';
    return current;
  }
  if (action === 'confirm_sent') return 'quote_sent_confirmed';
  if (action === 'accept') return 'quote_accepted';
  if (action === 'decline') return 'quote_declined';
  if (action === 'postpone') return 'quote_postponed';
  return current;
}

export function applyQuoteAction(revision               , action                 , atIso         )                {
  const at = atIso || new Date().toISOString();
  const lifecycle = nextQuoteLifecycle(revision.lifecycle, action);
  const next                = { ...revision, lifecycle };
  if (action === 'share' && !next.sharedAt) next.sharedAt = at;
  if (action === 'confirm_sent') next.sentConfirmedAt = at;
  return next;
}

export function isSentConfirmed(revision                                                      )          {
  return Boolean(revision.sentConfirmedAt) || revision.lifecycle === 'quote_sent_confirmed';
}
