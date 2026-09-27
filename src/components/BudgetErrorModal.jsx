/**
 * Budget Error Modal Component
 * Displays budget exceeded messages
 */

import { useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import './ModalBase.css';
import './BudgetErrorModal.css';

const BudgetErrorModal = ({ visible, onClose, accessLevel, nonPremiumModels = [] }) => {
  const { t } = useLanguage();
  useEffect(() => {
    if (!visible) return;
  }, [visible]);

  if (!visible) return null;

  const isCamps = accessLevel === 'camps' || accessLevel === 'en1';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="budget-error-modal-header">
          <h2>{t('budgetLimitTitle')}</h2>
        </div>
        <div className="budget-error-modal-body">
          {isCamps ? (
            <>
              <p className="budget-error-message">
                {t('budgetMessagePremium')}
              </p>
              <div className="budget-error-suggestion-block">
                <p className="budget-error-suggestion">
                  <strong>{nonPremiumModels.length > 1 ? t('budgetUseNonPremiumPlural') : t('budgetUseNonPremiumSingular')}</strong>
                </p>
                <ul className="budget-error-model-list">
                  {nonPremiumModels.map((model) => (
                    <li key={model}>{model}</li>
                  ))}
                </ul>
              </div>
              <p className="budget-error-info">
                {t('budgetResetPremium')}
              </p>
            </>
          ) : (
            <>
              <p className="budget-error-message">
                {t('budgetMessageGeneral')}
              </p>
              <p className="budget-error-info">
                {t('budgetResetGeneral')}
              </p>
            </>
          )}
        </div>
        <div className="budget-error-modal-footer">
          <button className="modal-close-button" onClick={onClose}>
            {t('ok')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default BudgetErrorModal;

