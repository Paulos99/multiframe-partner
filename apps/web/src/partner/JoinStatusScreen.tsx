import { useState, type FormEvent } from 'react';
import { ROLE_LABELS, STAFF_ROLES, type UserRole } from '../../../../packages/shared/partner';
import { Button } from '../ui/Button';
import { CompanyField } from './CompanyField';
import { FadeRise } from './motionBits';
import { usePartner } from './PartnerContext';
import { isStaffRegisterRole } from './staffJoin';
import styles from './LoginScreen.module.css';

/**
 * Экран после самостоятельной регистрации сотрудника:
 * заявка ещё на рассмотрении или уже отклонена. В кабинет человек не попадает.
 */
export function JoinStatusScreen() {
  const { user, logout, submitStaffJoin } = usePartner();
  const join = user?.staffJoin;
  const rejected = join?.status === 'rejected';
  const [again, setAgain] = useState(false);
  const [orgId, setOrgId] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [role, setRole] = useState<UserRole>(isStaffRegisterRole(String(join?.role || '')) ? (join!.role as UserRole) : 'measurer');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!orgId) {
      setError('Выберите компанию из списка');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await submitStaffJoin(orgId, role);
      setAgain(false);
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'Не удалось отправить заявку');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.shell}>
      <FadeRise className={styles.stack} blur>
        <section className={styles.card} aria-labelledby="join-title">
          <header className={styles.brand}>
            <img
              className={styles.logo}
              src={`${import.meta.env.BASE_URL}logo-multiframe.png`}
              alt="MultiFrame"
              width={1024}
              height={173}
              decoding="async"
            />
            <h1 id="join-title">{rejected ? 'Заявка отклонена' : 'Заявка на рассмотрении'}</h1>
            <p className={styles.lead}>
              {rejected
                ? 'Владелец или менеджер компании отклонил заявку. Кабинет пока закрыт.'
                : 'Владелец или менеджер компании ещё не подтвердил заявку. Кабинет откроется после одобрения.'}
            </p>
          </header>
          {join?.companyName ? (
            <p className={styles.notice} role="status">
              {join.companyName}
              {join.role ? ` · ${ROLE_LABELS[join.role as UserRole] || join.role}` : ''}
              {rejected && join.reason ? `. ${join.reason}` : ''}
            </p>
          ) : null}
          {rejected && again ? (
            <form className={styles.form} onSubmit={(event) => void onSubmit(event)}>
              <label className={styles.field}>
                Компания
                <CompanyField
                  value={companyName}
                  selectedId={orgId}
                  onChange={(next) => {
                    setOrgId(next.id);
                    setCompanyName(next.name);
                  }}
                />
              </label>
              <label className={styles.field}>
                Роль
                <select value={role} onChange={(event) => setRole(event.target.value as UserRole)}>
                  {STAFF_ROLES.map((item) => (
                    <option key={item} value={item}>
                      {ROLE_LABELS[item]}
                    </option>
                  ))}
                </select>
              </label>
              {error ? (
                <p className={styles.error} role="alert">
                  {error}
                </p>
              ) : null}
              <Button type="submit" fullWidth loading={busy} disabled={busy}>
                {busy ? 'Отправляем заявку…' : 'Отправить заявку'}
              </Button>
              <button type="button" className={styles.linkButton} onClick={() => setAgain(false)}>
                Отмена
              </button>
            </form>
          ) : null}
          {rejected && !again ? (
            <Button type="button" fullWidth onClick={() => setAgain(true)}>
              Отправить новую заявку
            </Button>
          ) : null}
          <button type="button" className={styles.linkButton} onClick={() => logout()}>
            Выйти
          </button>
        </section>
      </FadeRise>
    </div>
  );
}
