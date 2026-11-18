import { useEffect, useRef, useState, type FormEvent } from 'react';
import { PASSWORD_MIN } from '../../../../packages/shared/passwordPolicy.js';
import { ORG_ROLES, ROLE_LABELS, type UserRole } from '../../../../packages/shared/partner';
import { Button } from '../ui/Button';
import { PasswordInput } from '../ui/PasswordInput';
import { passwordProblem } from './activation';
import { CityField } from './CityField';
import { CompanyField } from './CompanyField';
import { FadeRise } from './motionBits';
import { usePartner } from './PartnerContext';
import { leaveRegister, registerFormProblem, type RegisterForm } from './registration';
import { isStaffRegisterRole, staffJoinFormProblem, type StaffJoinForm } from './staffJoin';
import styles from './LoginScreen.module.css';

const EMPTY_OWNER: RegisterForm = {
  firstName: '',
  lastName: '',
  companyName: '',
  city: '',
  login: '',
  password: '',
  passwordRepeat: '',
  trap: '',
};

const EMPTY_STAFF: StaffJoinForm = {
  firstName: '',
  lastName: '',
  orgId: '',
  companyName: '',
  role: 'measurer',
  login: '',
  password: '',
  passwordRepeat: '',
  phone: '',
  trap: '',
};

/**
 * Страница регистрации (#/register): сначала роль.
 * Владелец видит прежнюю форму и сразу получает кабинет.
 * Сотрудник отправляет заявку в выбранную компанию и ждёт одобрения.
 */
export function RegisterScreen() {
  const { registerOwner, registerStaff, remote } = usePartner();
  const [role, setRole] = useState<UserRole | null>(null);
  const [ownerForm, setOwnerForm] = useState<RegisterForm>(EMPTY_OWNER);
  const [staffForm, setStaffForm] = useState<StaffJoinForm>(EMPTY_STAFF);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorTick, setErrorTick] = useState(0);
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (errorTick) errorRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [errorTick]);
  const fail = (message: string) => {
    setError(message);
    setErrorTick((n) => n + 1);
  };
  const setOwner = (key: keyof RegisterForm) => (value: string) => setOwnerForm((prev) => ({ ...prev, [key]: value }));
  const setStaff = (key: keyof StaffJoinForm) => (value: string) => setStaffForm((prev) => ({ ...prev, [key]: value }));

  function pickRole(next: UserRole) {
    setRole(next);
    setError(null);
    if (isStaffRegisterRole(next)) setStaffForm((prev) => ({ ...prev, role: next }));
  }

  async function onSubmitOwner(event: FormEvent) {
    event.preventDefault();
    const problem = registerFormProblem(ownerForm, passwordProblem);
    if (problem) {
      fail(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await registerOwner({ ...ownerForm, login: ownerForm.login.trim() });
      leaveRegister();
      const top = () => window.scrollTo({ top: 0, behavior: 'instant' });
      top();
      window.setTimeout(top, 80);
      window.setTimeout(top, 400);
    } catch (ex) {
      fail(ex instanceof Error ? ex.message : 'Не удалось зарегистрироваться');
    } finally {
      setBusy(false);
    }
  }

  async function onSubmitStaff(event: FormEvent) {
    event.preventDefault();
    const problem = staffJoinFormProblem(staffForm, passwordProblem);
    if (problem) {
      fail(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await registerStaff({ ...staffForm, login: staffForm.login.trim() });
      leaveRegister();
      const top = () => window.scrollTo({ top: 0, behavior: 'instant' });
      top();
      window.setTimeout(top, 80);
      window.setTimeout(top, 400);
    } catch (ex) {
      fail(ex instanceof Error ? ex.message : 'Не удалось отправить заявку');
    } finally {
      setBusy(false);
    }
  }

  const title = !role
    ? 'Регистрация'
    : role === 'owner'
      ? 'Регистрация компании'
      : 'Подключение к компании';
  const lead = !role
    ? 'Сначала выберите роль. Владелец открывает новый кабинет компании. Сотрудник подключается к уже зарегистрированной.'
    : role === 'owner'
      ? 'Кабинет партнёра MultiFrame для владельца компании. Работать можно сразу после регистрации, StP проверит заявку в ближайшие дни.'
      : 'Найдите свою компанию, заполните данные и отправьте заявку. Владелец или менеджер подтвердит её — до этого кабинет закрыт.';

  return (
    <div className={styles.shell}>
      <FadeRise className={styles.stack} blur>
        <section className={styles.card} aria-labelledby="register-title">
          <header className={styles.brand}>
            <img
              className={styles.logo}
              src={`${import.meta.env.BASE_URL}logo-multiframe.png`}
              alt="MultiFrame"
              width={1024}
              height={173}
              decoding="async"
            />
            <h1 id="register-title">{title}</h1>
            <p className={styles.lead}>{lead}</p>
          </header>
          {!remote ? (
            <p className={styles.notice} role="status">
              Регистрация работает только на рабочем сервисе.
            </p>
          ) : null}
          <div className={styles.roles} role="group" aria-label="Роль">
            {ORG_ROLES.map((item) => (
              <button
                key={item}
                type="button"
                className={role === item ? styles.roleBtnOn : styles.roleBtn}
                aria-pressed={role === item}
                onClick={() => pickRole(item)}
              >
                {ROLE_LABELS[item]}
              </button>
            ))}
          </div>
          {role === 'owner' ? (
            <form className={styles.form} onSubmit={(event) => void onSubmitOwner(event)} noValidate>
              <div className={styles.pair}>
                <label className={styles.field}>
                  Имя
                  <input
                    value={ownerForm.firstName}
                    onChange={(event) => setOwner('firstName')(event.target.value)}
                    autoComplete="given-name"
                    maxLength={60}
                    required
                  />
                </label>
                <label className={styles.field}>
                  Фамилия
                  <input
                    value={ownerForm.lastName}
                    onChange={(event) => setOwner('lastName')(event.target.value)}
                    autoComplete="family-name"
                    maxLength={60}
                    required
                  />
                </label>
              </div>
              <label className={styles.field}>
                Название компании
                <input
                  value={ownerForm.companyName}
                  onChange={(event) => setOwner('companyName')(event.target.value)}
                  autoComplete="organization"
                  maxLength={120}
                  required
                />
              </label>
              <label className={styles.field}>
                Город
                <CityField value={ownerForm.city} onChange={setOwner('city')} placeholder="Начните вводить, например Казань" />
              </label>
              <label className={styles.field}>
                Логин
                <input
                  value={ownerForm.login}
                  onChange={(event) => setOwner('login')(event.target.value)}
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  maxLength={64}
                  required
                />
              </label>
              <div className={styles.pair}>
                <label className={styles.field}>
                  Пароль
                  <PasswordInput
                    value={ownerForm.password}
                    onChange={(event) => setOwner('password')(event.target.value)}
                    autoComplete="new-password"
                    required
                  />
                </label>
                <label className={styles.field}>
                  Повторите пароль
                  <PasswordInput
                    value={ownerForm.passwordRepeat}
                    onChange={(event) => setOwner('passwordRepeat')(event.target.value)}
                    autoComplete="new-password"
                    required
                  />
                </label>
              </div>
              <p className={styles.hint}>Пароль не короче {PASSWORD_MIN} символов, без пробелов по краям. Логин без пробелов.</p>
              <div className={styles.trap} aria-hidden="true">
                <label>
                  Сайт
                  <input
                    tabIndex={-1}
                    autoComplete="off"
                    value={ownerForm.trap}
                    onChange={(event) => setOwner('trap')(event.target.value)}
                  />
                </label>
              </div>
              {error ? (
                <p className={styles.error} role="alert" ref={errorRef}>
                  {error}
                </p>
              ) : null}
              <Button type="submit" fullWidth loading={busy} disabled={busy || !remote}>
                {busy ? 'Создаём кабинет…' : 'Зарегистрироваться'}
              </Button>
              <button type="button" className={styles.linkButton} onClick={leaveRegister}>
                Уже есть кабинет? Войти
              </button>
            </form>
          ) : null}
          {role && isStaffRegisterRole(role) ? (
            <form className={styles.form} onSubmit={(event) => void onSubmitStaff(event)} noValidate>
              <label className={styles.field}>
                Компания
                <CompanyField
                  value={staffForm.companyName}
                  selectedId={staffForm.orgId}
                  onChange={(next) =>
                    setStaffForm((prev) => ({ ...prev, orgId: next.id, companyName: next.name }))
                  }
                />
              </label>
              <div className={styles.pair}>
                <label className={styles.field}>
                  Имя
                  <input
                    value={staffForm.firstName}
                    onChange={(event) => setStaff('firstName')(event.target.value)}
                    autoComplete="given-name"
                    maxLength={60}
                    required
                  />
                </label>
                <label className={styles.field}>
                  Фамилия
                  <input
                    value={staffForm.lastName}
                    onChange={(event) => setStaff('lastName')(event.target.value)}
                    autoComplete="family-name"
                    maxLength={60}
                    required
                  />
                </label>
              </div>
              <label className={styles.field}>
                Логин
                <input
                  value={staffForm.login}
                  onChange={(event) => setStaff('login')(event.target.value)}
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  maxLength={64}
                  required
                />
              </label>
              <label className={styles.field}>
                Телефон
                <input
                  value={staffForm.phone}
                  onChange={(event) => setStaff('phone')(event.target.value)}
                  autoComplete="tel"
                  inputMode="tel"
                  maxLength={40}
                />
              </label>
              <div className={styles.pair}>
                <label className={styles.field}>
                  Пароль
                  <PasswordInput
                    value={staffForm.password}
                    onChange={(event) => setStaff('password')(event.target.value)}
                    autoComplete="new-password"
                    required
                  />
                </label>
                <label className={styles.field}>
                  Повторите пароль
                  <PasswordInput
                    value={staffForm.passwordRepeat}
                    onChange={(event) => setStaff('passwordRepeat')(event.target.value)}
                    autoComplete="new-password"
                    required
                  />
                </label>
              </div>
              <p className={styles.hint}>
                Пароль не короче {PASSWORD_MIN} символов, без пробелов по краям. Логин без пробелов. Телефон можно не указывать.
              </p>
              <div className={styles.trap} aria-hidden="true">
                <label>
                  Сайт
                  <input
                    tabIndex={-1}
                    autoComplete="off"
                    value={staffForm.trap}
                    onChange={(event) => setStaff('trap')(event.target.value)}
                  />
                </label>
              </div>
              {error ? (
                <p className={styles.error} role="alert" ref={errorRef}>
                  {error}
                </p>
              ) : null}
              <Button type="submit" fullWidth loading={busy} disabled={busy || !remote}>
                {busy ? 'Отправляем заявку…' : 'Отправить заявку'}
              </Button>
              <button type="button" className={styles.linkButton} onClick={leaveRegister}>
                Уже есть кабинет? Войти
              </button>
            </form>
          ) : null}
          {!role ? (
            <button type="button" className={styles.linkButton} onClick={leaveRegister}>
              Уже есть кабинет? Войти
            </button>
          ) : null}
        </section>
      </FadeRise>
    </div>
  );
}
