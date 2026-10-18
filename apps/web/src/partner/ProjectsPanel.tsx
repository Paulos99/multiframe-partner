import { useState, type FormEvent } from 'react';
import type { UserRole } from '../../../../packages/shared/partner';
import { ProjectDetail, type ProjectRoom, type ProjectView } from './ProjectDetail';
import styles from './Projects.module.css';

export type NewProjectInput = Pick<ProjectView, 'name' | 'clientName' | 'clientPhone' | 'address' | 'city'>;
export function ProjectsPanel({ projects, rooms, role, loading, error, onRetry, onCreate, onAttach, onOpenRoom, onCalculate }: {
  projects: ProjectView[]; rooms: ProjectRoom[]; role: UserRole; loading?: boolean; error?: string;
  onRetry: () => void; onCreate?: (input: NewProjectInput) => Promise<ProjectView>;
  onAttach?: (roomId: string, projectId: string) => Promise<void>;
  onOpenRoom: (id: string) => void; onCalculate: (id: string) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [form, setForm] = useState<NewProjectInput>({ name: '', clientName: '', clientPhone: '', address: '', city: '' });
  const selected = projects.find(project => project.id === selectedId);
  const ungrouped = rooms.filter(room => !room.projectId);
  const canManage = role === 'owner' || role === 'sales';
  const filtered = projects.filter(project => [project.name, project.clientName, project.address, project.city].join(' ').toLocaleLowerCase('ru').includes(query.trim().toLocaleLowerCase('ru')));
  async function create(event: FormEvent) {
    event.preventDefault();
    if (!onCreate || !form.name.trim()) return;
    setBusy(true); setSaveError('');
    try {
      const project = await onCreate({ ...form, name: form.name.trim() });
      setSelectedId(project.id); setCreating(false);
      setForm({ name: '', clientName: '', clientPhone: '', address: '', city: '' });
    } catch (err) { setSaveError(err instanceof Error ? err.message : 'Не удалось сохранить проект'); }
    finally { setBusy(false); }
  }
  if (selected) return <ProjectDetail key={selected.id} project={selected} role={role}
    rooms={rooms.filter(room => room.projectId === selected.id && room.orgId === selected.orgId)} ungrouped={ungrouped}
    onBack={() => setSelectedId(null)} onOpenRoom={onOpenRoom} onCalculate={onCalculate} onAttach={onAttach} />;
  return <section className={styles.panel} aria-label="Проекты">
    <div className={styles.header}><div><p className={styles.caption}>Клиент · помещения · результат</p><h2>Проекты</h2>
      <p className={styles.muted}>Объедините комнаты одной квартиры. Расчёты и документы останутся у каждого помещения.</p>
    </div>{canManage && onCreate ? <button className={styles.primary} onClick={() => setCreating(value => !value)} aria-expanded={creating}>{creating ? 'Закрыть форму' : '+ Новый проект'}</button> : null}</div>
    {creating ? <form className={styles.form} onSubmit={event => void create(event)}>
      {([['name', 'Название проекта'], ['clientName', 'Клиент'], ['clientPhone', 'Телефон'], ['address', 'Адрес'], ['city', 'Город']] as const).map(([key, label]) =>
        <label key={key}>{label}<input type={key === 'clientPhone' ? 'tel' : 'text'} maxLength={250} required={key === 'name'} value={form[key]} disabled={busy} onChange={event => setForm(value => ({ ...value, [key]: event.target.value }))} /></label>)}
      {saveError ? <p className={styles.error} role="alert">{saveError}</p> : null}
      <button className={styles.primary} type="submit" disabled={busy || !form.name.trim()}>{busy ? 'Сохраняем…' : 'Создать проект'}</button>
    </form> : null}
    <input className={styles.search} aria-label="Поиск проекта" placeholder="Клиент, адрес или название проекта" value={query} onChange={event => setQuery(event.target.value)} />
    {loading ? <p role="status">Загружаем проекты…</p> : null}
    {error ? <div className={styles.error} role="alert"><p>{error}</p><button className={styles.secondary} onClick={onRetry}>Повторить загрузку</button></div> : null}
    <div className={styles.grid}>{filtered.map(project => {
      const projectRooms = rooms.filter(room => room.projectId === project.id && room.orgId === project.orgId);
      return <button className={styles.project} key={project.id} onClick={() => setSelectedId(project.id)}>
        <span className={styles.caption}>Помещений: {projectRooms.length}</span><strong>{project.name}</strong>
        <span className={styles.muted}>{[project.clientName, project.address].filter(Boolean).join(' · ') || 'Адрес не заполнен'}</span>
        <span className={styles.link}>Открыть проект →</span>
      </button>;
    })}</div>
    {!loading && !error && !filtered.length ? <p className={styles.empty}>{query ? 'По этому запросу проектов нет.' : 'Пока нет проектов. Старые объекты доступны ниже — их можно объединить без потери данных.'}</p> : null}
    {ungrouped.length ? <div className={styles.ungrouped}><h3>Помещения без проекта · {ungrouped.length}</h3>
      <p className={styles.muted}>Существующие карточки сохранены. Откройте их или добавьте в проект.</p>
      {ungrouped.map(room => <button key={room.id} className={styles.roomLink} onClick={() => onOpenRoom(room.id)}>
        <span>{room.roomName || room.clientName || 'Помещение'}</span><span>{room.room.areaM2 ?? '—'} м² →</span>
      </button>)}
    </div> : null}
  </section>;
}
