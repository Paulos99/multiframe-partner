/**
 * Тестовый объект «ТЕСТ доступ монтажника» в компании «Потолки Столицы».
 *
 * PDF — из встроенного калькулятора в headless Chrome (тот же exportCalculationPDF).
 * Дальше только HTTP API. platform-v2.json не читается и не пишется.
 * Учётные данные только из env. Ничего не удаляет.
 *
 *   node apps/api/scripts/create-crew-test-object.mjs --dry-run --out ./crew-test-pdfs
 *
 * Env: MF_STAFF_LOGIN, MF_STAFF_PASSWORD, MF_CREW_LOGIN, MF_CREW_PASSWORD,
 *      необязательно API_BASE, CALC_URL, CHROME_PATH.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { assertReportSafe, readConfig, runCrewTest } from './crew-test-object-lib.mjs';
import { renderCalculatorPdfs } from './crew-test-pdf.mjs';

const config = readConfig(process.env, process.argv.slice(2));

async function writeFiles(dir, pdf) {
  await mkdir(dir, { recursive: true });
  const estimatePath = path.join(dir, 'estimate.pdf');
  const specPath = path.join(dir, 'spec.pdf');
  await writeFile(estimatePath, Buffer.from(pdf.estimatePdfBase64, 'base64'));
  await writeFile(specPath, Buffer.from(pdf.specPdfBase64, 'base64'));
  return [estimatePath, specPath];
}

try {
  const report = await runCrewTest({
    config,
    fetchImpl: globalThis.fetch,
    renderPdfs: renderCalculatorPdfs,
    writeFiles,
    log: (line) => console.error(line),
  });
  assertReportSafe(report, [config.password, config.crewPassword]);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
}
