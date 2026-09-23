/**
 * AboutModal Component
 * Displays application information, version, and contact details
 */

import { useLanguage } from '../contexts/LanguageContext';
import instance from '../config/instance';
import './ModalBase.css';
import './AboutModal.css';

const { supportEmail } = instance.brand;

const AboutModal = ({ visible, onClose }) => {
  const { t } = useLanguage();
  if (!visible) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="about-header">
          <h1 className="about-title">{t('aboutAppName')}</h1>
          <p className="about-subtitle">{t('aboutAppSubtitle')}</p>
        </div>

        <div className="about-info-section">
          <div className="about-info-row">
            <span className="about-info-label">{t('version')}</span>
            <span className="about-info-value">{__APP_VERSION__}</span>
          </div>

          <div className="about-info-row">
            <span className="about-info-label">{t('createdBy')}</span>
            <span className="about-info-value">
              Dr. Ethan Danahy, Duncan Johnson, Bill Church, Dr. Morgan Hynes, and Yash Garje
            </span>
          </div>
        </div>

        <div className="about-footer">
          <p className="about-contact">
            {t('bugReportPrefix')}{' '}
            <a
              href={`mailto:${supportEmail}`}
              className="about-link"
            >
              {supportEmail}
            </a>
            .
          </p>
        </div>

        <button className="modal-close-button" onClick={onClose}>
          {t('close')}
        </button>
      </div>
    </div>
  );
};

export default AboutModal;

