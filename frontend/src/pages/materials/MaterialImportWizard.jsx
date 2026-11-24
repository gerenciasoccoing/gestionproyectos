import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { materialImportApi } from '../../api';
import { Card, Button, Select, Table, Badge, ErrorText, extractError } from '../../components/ui';
import useSubmitGuard from '../../hooks/useSubmitGuard';

const FIELDS = ['code', 'name', 'unit', 'category', 'description', 'referenceCost'];
const STATUS_COLORS = { nuevo: 'blue', existe: 'yellow', duplicado_archivo: 'gray', error: 'red' };

// Asistente de importación masiva de materiales (ver la especificación completa) — sin indicador de
// progreso en vivo fila por fila (esta app no tiene ninguna infraestructura de colas/progreso en
// tiempo real, ver materialImportService.js): el avance se comunica como PASOS explícitos (Subir →
// Analizar → Vista previa → Guardar → Resultado), cada uno con su propio spinner mientras espera al
// servidor. El guardado real (miles de filas) es rápido porque usa bulkCreate por lotes dentro de
// una sola transacción (ver commitImport), así que no debería sentirse lento.
export default function MaterialImportWizard({ onDone }) {
  const { t } = useTranslation();
  const [step, setStep] = useState('upload'); // upload | mapping | preview | result
  const [file, setFile] = useState(null);
  const [headers, setHeaders] = useState([]);
  const [mapping, setMapping] = useState({});
  const [rows, setRows] = useState([]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const [analyze, analyzing] = useSubmitGuard(async (mappingOverride) => {
    setError('');
    try {
      const res = await materialImportApi.parse(file, mappingOverride);
      setHeaders(res.headers);
      setMapping(res.mapping);
      setRows(res.rows);
      setStep(res.aiSuggested ? 'mapping' : 'preview');
    } catch (err) {
      setError(extractError(err));
    }
  });

  const [confirmMapping, confirmingMapping] = useSubmitGuard(async () => {
    await analyze(mapping);
    setStep('preview');
  });

  const setRowDecision = (idx, decision) => setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, decision } : r)));
  const bulkDecisionForExisting = (decision) => setRows((rs) => rs.map((r) => (r.status === 'existe' ? { ...r, decision } : r)));

  const [commit, committing] = useSubmitGuard(async () => {
    setError('');
    try {
      const res = await materialImportApi.commit(rows);
      setResult(res);
      setStep('result');
    } catch (err) {
      setError(extractError(err));
    }
  });

  const reset = () => {
    setStep('upload'); setFile(null); setHeaders([]); setMapping({}); setRows([]); setSummary(null); setResult(null); setError('');
  };

  const counts = rows.reduce((acc, r) => {
    const key = r.decision === 'omitir' ? 'omitir' : r.status;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const importableCount = rows.filter((r) => r.decision !== 'omitir').length;

  return (
    <Card title={t('materialsInventory.import.title')}>
      <div className="mb-3 flex gap-2 text-xs text-gray-500">
        {['upload', 'mapping', 'preview', 'result'].map((s, i) => (
          <span key={s} className={`px-2 py-1 rounded ${step === s ? 'bg-blue-100 text-blue-700 font-medium' : 'bg-gray-100'}`}>
            {i + 1}. {t(`materialsInventory.import.steps.${s}`)}
          </span>
        ))}
      </div>

      {step === 'upload' && (
        <div className="space-y-3">
          <Button variant="secondary" onClick={() => materialImportApi.downloadTemplate()}>{t('materialsInventory.import.downloadTemplate')}</Button>
          <div>
            <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </div>
          <Button onClick={() => analyze(null)} loading={analyzing} disabled={!file}>{t('materialsInventory.import.analyze')}</Button>
          <ErrorText>{error}</ErrorText>
        </div>
      )}

      {step === 'mapping' && (
        <div className="space-y-3">
          <p className="text-sm text-amber-700">{t('materialsInventory.import.mappingHint')}</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {FIELDS.map((field) => (
              <Select key={field} label={t(`materialsInventory.import.fields.${field}`)} value={mapping[field] || ''} onChange={(e) => setMapping({ ...mapping, [field]: e.target.value || null })}>
                <option value="">{t('materialsInventory.import.noColumn')}</option>
                {headers.map((h) => <option key={h} value={h}>{h}</option>)}
              </Select>
            ))}
          </div>
          <Button onClick={confirmMapping} loading={confirmingMapping || analyzing} disabled={!mapping.name || !mapping.unit}>{t('common.save')}</Button>
          <ErrorText>{error}</ErrorText>
        </div>
      )}

      {step === 'preview' && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge color="blue">{t('materialsInventory.import.summaryNew', { count: counts.nuevo || 0 })}</Badge>
            <Badge color="yellow">{t('materialsInventory.import.summaryExisting', { count: counts.existe || 0 })}</Badge>
            <Badge color="gray">{t('materialsInventory.import.summaryDuplicate', { count: counts.duplicado_archivo || 0 })}</Badge>
            <Badge color="red">{t('materialsInventory.import.summaryError', { count: counts.error || 0 })}</Badge>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => bulkDecisionForExisting('omitir')}>{t('materialsInventory.import.allSkip')}</Button>
            <Button variant="secondary" onClick={() => bulkDecisionForExisting('actualizar')}>{t('materialsInventory.import.allUpdate')}</Button>
          </div>
          <div className="max-h-96 overflow-y-auto">
            <Table columns={['#', t('materialsInventory.catalog.name'), t('materialsInventory.catalog.unit'), t('materialsInventory.categories.title'), t('materialsInventory.catalog.status'), t('materialsInventory.import.decision')]}>
              {rows.map((r, idx) => (
                <tr key={idx} className="border-b border-gray-100">
                  <td className="py-1 pr-2 text-xs text-gray-400">{r.rowNumber}</td>
                  <td className="py-1 pr-2">{r.name || '-'}</td>
                  <td className="py-1 pr-2">{r.unit || '-'}</td>
                  <td className="py-1 pr-2">{r.categoryName || t('materialsInventory.categories.defaultHint')}{r.categoryIsNew && <span className="ml-1 text-xs text-amber-700">({t('materialsInventory.import.newCategory')})</span>}</td>
                  <td className="py-1 pr-2">
                    <Badge color={STATUS_COLORS[r.status]}>{t(`materialsInventory.import.status.${r.status}`)}</Badge>
                    {r.reason && <div className="text-xs text-red-600">{r.reason}</div>}
                  </td>
                  <td className="py-1 pr-2">
                    {r.status === 'error' || r.status === 'duplicado_archivo' ? (
                      <span className="text-xs text-gray-400">{t('materialsInventory.import.decisionSkip')}</span>
                    ) : r.status === 'existe' ? (
                      <Select className="w-auto" value={r.decision} onChange={(e) => setRowDecision(idx, e.target.value)}>
                        <option value="omitir">{t('materialsInventory.import.decisionSkip')}</option>
                        <option value="actualizar">{t('materialsInventory.import.decisionUpdate')}</option>
                      </Select>
                    ) : (
                      <Select className="w-auto" value={r.decision} onChange={(e) => setRowDecision(idx, e.target.value)}>
                        <option value="importar">{t('materialsInventory.import.decisionImport')}</option>
                        <option value="omitir">{t('materialsInventory.import.decisionSkip')}</option>
                      </Select>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          </div>
          <Button onClick={commit} loading={committing} disabled={importableCount === 0}>
            {t('materialsInventory.import.confirmImport', { count: importableCount })}
          </Button>
          <ErrorText>{error}</ErrorText>
        </div>
      )}

      {step === 'result' && result && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="border rounded p-2"><p className="text-xs text-gray-500">{t('materialsInventory.import.resultCreated')}</p><p className="text-lg font-semibold">{result.created}</p></div>
            <div className="border rounded p-2"><p className="text-xs text-gray-500">{t('materialsInventory.import.resultUpdated')}</p><p className="text-lg font-semibold">{result.updated}</p></div>
            <div className="border rounded p-2"><p className="text-xs text-gray-500">{t('materialsInventory.import.resultSkipped')}</p><p className="text-lg font-semibold">{result.skipped}</p></div>
            <div className="border rounded p-2"><p className="text-xs text-gray-500">{t('materialsInventory.import.resultErrors')}</p><p className="text-lg font-semibold text-red-600">{result.errors}</p></div>
          </div>
          {result.errorRows?.length > 0 && (
            <Button variant="secondary" onClick={() => materialImportApi.exportErrors(result.errorRows)}>{t('materialsInventory.import.downloadErrors')}</Button>
          )}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={reset}>{t('materialsInventory.import.importAnother')}</Button>
            <Button onClick={() => onDone?.()}>{t('common.close')}</Button>
          </div>
        </div>
      )}
    </Card>
  );
}
