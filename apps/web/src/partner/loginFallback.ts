/**
 * Когда вход без токена (только на устройстве) допустим.
 * Только в демо: выбранная демо-роль, закрытая на сервере, или обрыв связи.
 * Отказ сервера по паролю (в том числе старому, до смены) в обычном входе — это отказ, а не повод
 * впустить по демо-паролю из сборки: иначе вход «проходит», а материалы с сервера не открываются.
 */
export function allowDeviceLogin(input: { demoEnabled: boolean; demoAccount: boolean; transientError: boolean }): boolean {
  return input.demoEnabled && (input.demoAccount || input.transientError);
}
