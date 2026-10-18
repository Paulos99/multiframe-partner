/**
 * Доступ к проектам. Нет серверного маршрута — это ошибка, а не локальное демо.
 */
import type { Project, ProjectInput } from '../../../../packages/shared/partner';
import { hasRemoteApi } from './apiClient';
import { loadSession } from './localStore';
import { loadVisibleProjects, saveProjectSynced, type ProjectLoadResult } from './syncEngine';

export class ProjectsUnavailableError extends Error {
  constructor(message = 'Проекты на сервере пока недоступны') {
    super(message);
    this.name = 'ProjectsUnavailableError';
  }
}

export function isProjectsUnavailable(err: unknown): boolean {
  return err instanceof Error && err.name === 'ProjectsUnavailableError';
}

export async function listProjects(): Promise<ProjectLoadResult> {
  const user = loadSession();
  if (!user) throw new Error('Нет сессии');
  return loadVisibleProjects(user, hasRemoteApi());
}

export async function createProject(input: ProjectInput): Promise<Project> {
  const user = loadSession();
  if (!user) throw new Error('Нет сессии');
  try {
    return await saveProjectSynced(user, hasRemoteApi(), input);
  } catch (err) {
    if (isProjectsUnavailable(err)) throw new ProjectsUnavailableError(err instanceof Error ? err.message : undefined);
    throw err;
  }
}

export async function updateProject(id: string, input: ProjectInput): Promise<Project> {
  const user = loadSession();
  if (!user) throw new Error('Нет сессии');
  try {
    return await saveProjectSynced(user, hasRemoteApi(), input, id);
  } catch (err) {
    if (isProjectsUnavailable(err)) throw new ProjectsUnavailableError(err instanceof Error ? err.message : undefined);
    throw err;
  }
}
