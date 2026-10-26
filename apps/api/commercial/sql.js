/**
 * Тексты запросов к одной таблице commercial_records.
 * Оптимистичная блокировка — предикат version = $expected, не ETag JSON-файла.
 */

export function tableRef(database) {
  const path = `${String(database || '').replace(/\/$/, '').replace(/`/g, '')}/commercial_records`;
  return `\`${path}\``;
}

export function commercialSql(ref) {
  const row = `org_id AS orgId, kind AS kind, id AS id, project_id AS projectId,
    parent_id AS parentId, version AS version, payload AS payload, updated_at AS updatedAt`;
  return {
    get: `
      DECLARE $org_id AS Utf8;
      DECLARE $kind AS Utf8;
      DECLARE $id AS Utf8;
      SELECT ${row}
      FROM ${ref}
      WHERE org_id = $org_id AND kind = $kind AND id = $id;
    `,
    listByOrgKind: `
      DECLARE $org_id AS Utf8;
      DECLARE $kind AS Utf8;
      SELECT ${row}
      FROM ${ref}
      WHERE org_id = $org_id AND kind = $kind;
    `,
    listByProject: `
      DECLARE $org_id AS Utf8;
      DECLARE $project_id AS Utf8;
      DECLARE $kind AS Utf8;
      SELECT ${row}
      FROM ${ref} VIEW commercial_by_project
      WHERE org_id = $org_id AND project_id = $project_id AND kind = $kind;
    `,
    listByParent: `
      DECLARE $org_id AS Utf8;
      DECLARE $parent_id AS Utf8;
      DECLARE $kind AS Utf8;
      SELECT ${row}
      FROM ${ref} VIEW commercial_by_parent
      WHERE org_id = $org_id AND parent_id = $parent_id AND kind = $kind;
    `,
    insert: `
      DECLARE $org_id AS Utf8;
      DECLARE $kind AS Utf8;
      DECLARE $id AS Utf8;
      DECLARE $project_id AS Utf8;
      DECLARE $parent_id AS Utf8;
      DECLARE $version AS Uint64;
      DECLARE $payload AS Utf8;
      DECLARE $updated_at AS Utf8;
      INSERT INTO ${ref} (org_id, kind, id, project_id, parent_id, version, payload, updated_at)
      VALUES ($org_id, $kind, $id, $project_id, $parent_id, $version, $payload, $updated_at);
    `,
    update: `
      DECLARE $org_id AS Utf8;
      DECLARE $kind AS Utf8;
      DECLARE $id AS Utf8;
      DECLARE $project_id AS Utf8;
      DECLARE $parent_id AS Utf8;
      DECLARE $expected AS Uint64;
      DECLARE $version AS Uint64;
      DECLARE $payload AS Utf8;
      DECLARE $updated_at AS Utf8;
      UPDATE ${ref}
      SET project_id = $project_id,
          parent_id = $parent_id,
          version = $version,
          payload = $payload,
          updated_at = $updated_at
      WHERE org_id = $org_id AND kind = $kind AND id = $id AND version = $expected;
    `,
  };
}
