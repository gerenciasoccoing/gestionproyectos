import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { employeesApi } from '../api';
import { money, extractError } from './ui';

// Ayuda visible bajo el campo de salario del trabajador (Personal): muestra el SMLV y el auxilio
// de transporte vigentes (ver laborParamsApi.current, LaborParameters) para dejar claro que el
// salario capturado es el BÁSICO, antes de sumar el auxilio de transporte. Cuando el tipo de
// contrato usa fecha de fin (showRange), también calcula en vivo (sin persistir nada, ver
// employeeController.js#previewContractValue) el valor total del contrato para ese rango de días.
export default function ContractValueHelper({ laborParams, projectId, salaryValue, entryDate, contractEndDate, showRange }) {
  const { t } = useTranslation();
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setPreview(null);
    setError('');
    if (!showRange || !projectId || !salaryValue || !entryDate || !contractEndDate) return undefined;
    const handle = setTimeout(() => {
      employeesApi.previewContractValue(projectId, { salaryValue, entryDate, contractEndDate })
        .then(setPreview)
        .catch((err) => setError(extractError(err)));
    }, 500);
    return () => clearTimeout(handle);
  }, [showRange, projectId, salaryValue, entryDate, contractEndDate]);

  if (!laborParams) return null;

  return (
    <div className="col-span-full text-xs bg-blue-50 border border-blue-100 rounded p-2 text-blue-900">
      <p>{t('personnel.detail.salaryHelp.baseSalaryNote')}</p>
      <p>
        {t('personnel.detail.salaryHelp.smlv')}: {money(laborParams.smlv)} · {t('personnel.detail.salaryHelp.auxTransporte')}: {money(laborParams.auxTransporte)}
        {' '}({t('personnel.detail.salaryHelp.auxTransporteNote')})
      </p>
      {showRange && preview && (
        <div className="mt-1 pt-1 border-t border-blue-200">
          <p>{t('personnel.detail.salaryHelp.rangeDays', { count: preview.days })}</p>
          <p>{t('personnel.detail.salaryHelp.rangeBase')}: {money(preview.total)}</p>
          <p>
            {t('personnel.detail.salaryHelp.rangeAux')}: {money(preview.auxTransporteTotal)}
            {!preview.auxTransporteApplies && ` (${t('personnel.detail.salaryHelp.notApplicable')})`}
          </p>
          <p className="font-semibold">{t('personnel.detail.salaryHelp.rangeTotal')}: {money(preview.grandTotal)}</p>
        </div>
      )}
      {showRange && error && <p className="text-red-600">{error}</p>}
    </div>
  );
}
