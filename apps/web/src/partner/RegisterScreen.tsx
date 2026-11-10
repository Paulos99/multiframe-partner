import { useState, type FormEvent } from 'react';
import { PASSWORD_MIN } from '../../../../packages/shared/passwordPolicy.js';
import { Button } from '../ui/Button';
import { passwordProblem } from './activation';
import { CityField } from './CityField';
import { FadeRise } from './motionBits';
import { usePartner } from './PartnerContext';
import { leaveRegister, registerFormProblem, type RegisterForm } from './registration';
import styles from './LoginScreen.module.css';

const EMPTY: RegisterForm = {
  firstName: '',
  lastName: '',
  companyName: '',
  city: '',
  login: '',
  password: '',
  passwordRepeat: '',
  trap: '',
};

/**
 * Страница регистрации владельца (#/register): ссылка из письма партнёрам.
 * Кабинет создаётся сразу и открывается без ожидания; StP подтверждает заявку позже.
 */
export function RegisterScreen() {
  const { registerOwner, remote } = usePartner();
  const [form, setForm] = useState<RegisterForm>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof RegisterForm) => (value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const problem = registerFormProblem(form, passwordProblem);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await registerOwner({ ...form, login: form.login.trim() });
      leaveRegister();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'Не удалось зарегистрироваться');
    } finally {
      setBusy(false);
    }
  }

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
            <h1 id="register-title">Регистрация компании</h1>
            <p className={styles.lead}>
              Кабинет партнёра MultiFrame для владельца компании. Работать можно сразу после регистрации,
              StP проверит заявку в ближайшие дни.
            </p>
          </header>
          {!remote ? (
            <p className={styles.notice} role="status">
              Регистрация работает только на рабочем сервисе.
            </p>
          ) : null}
          <form className={styles.form} onSubmit={(event) => void onSubmit(event)} noValidate>
            <div className={styles.pair}>
              <label className={styles.field}>
                Имя
                <input
                  value={form.firstName}
                  onChange={(event) => set('firstName')(event.target.value)}
                  autoComplete="given-name"
                  maxLength={60}
                  required
                />
              </label>
              <label className={styles.field}>
                Фамилия
                <input
                  value={form.lastName}
                  onChange={(event) => set('lastName')(event.target.value)}
                  autoComplete="family-name"
                  maxLength={60}
                  required
                />
              </label>
            </div>
            <label className={styles.field}>
              Название компании
              <input
                value={form.companyName}
                onChange={(event) => set('companyName')(event.target.value)}
                autoComplete="organization"
                maxLength={120}
                required
              />
            </label>
            <label className={styles.field}>
              Город
              <CityField value={form.city} onChange={set('city')} placeholder="Начните вводить, например Казань" />
            </label>
            <label className={styles.field}>
              Логин
              <input
                value={form.login}
                onChange={(event) => set('login')(event.target.value)}
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
                <input
                  type="password"
                  value={form.password}
                  onChange={(event) => set('password')(event.target.value)}
                  autoComplete="new-password"
                  required
                />
              </label>
              <label className={styles.field}>
                Повторите пароль
                <input
                  type="password"
                  value={form.passwordRepeat}
                  onChange={(event) => set('passwordRepeat')(event.target.value)}
                  autoComplete="new-password"
                  required
                />
              </label>
            </div>
            <p className={styles.hint}>Пароль не короче {PASSWORD_MIN} символов, без пробелов по краям. Логин без пробелов.</p>
            {/* Ловушка для программ-рассыльщиков: человек это поле не видит. */}
            <div className={styles.trap} aria-hidden="true">
              <label>
                Сайт
                <input
                  tabIndex={-1}
                  autoComplete="off"
                  value={form.trap}
                  onChange={(event) => set('trap')(event.target.value)}
                />
              </label>
            </div>
            {error ? (
              <p className={styles.error} role="alert">
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
        </section>
      </FadeRise>
    </div>
  );
}
