import { describe, expect, it } from 'vitest';
import type { PublicMaterial } from '../../../api/materialsLib.js';
import { contentsLabel, folderContents } from './MaterialsContextMenu';

const node = (id: string, kind: 'folder' | 'file', parentId: string | null) =>
  ({ id, kind, parentId, name: id }) as unknown as PublicMaterial;

describe('удаление папки: что удалится вместе с ней', () => {
  it('считает файлы и папки рекурсивно', () => {
    const items = [
      node('root', 'folder', null),
      node('sub', 'folder', 'root'),
      node('deep', 'folder', 'sub'),
      node('f1', 'file', 'root'),
      node('f2', 'file', 'deep'),
      node('other', 'file', null),
    ];
    expect(folderContents(items, 'root')).toEqual({ files: 2, folders: 2 });
    expect(folderContents(items, 'deep')).toEqual({ files: 1, folders: 0 });
  });
  it('склоняет по-русски', () => {
    expect(contentsLabel({ files: 0, folders: 0 })).toBe('Папка пустая.');
    expect(contentsLabel({ files: 1, folders: 0 })).toBe('Вместе с ней удалятся 1 файл.');
    expect(contentsLabel({ files: 5, folders: 2 })).toBe('Вместе с ней удалятся 5 файлов и 2 вложенные папки.');
    expect(contentsLabel({ files: 21, folders: 11 })).toBe('Вместе с ней удалятся 21 файл и 11 вложенных папок.');
  });
});
