/**
 * Chat Configuration Component
 * Contains controls for coding level, AI model selection, and documentation attachment
 */

import { useLanguage } from '../contexts/LanguageContext';
import './ChatConfiguration.css';

const ChatConfiguration = ({
  codingLevel,
  onCodingLevelChange,
  showModelPicker = true,
  showUsage = true,
  selectedModel,
  onModelChange,
  modelsByProvider,
  dailyUsagePercentage,
}) => {
  const { t } = useLanguage();
  const usagePercent = Number.isFinite(dailyUsagePercentage) ? Math.max(0, Math.min(100, Math.round(dailyUsagePercentage))) : 0;

  return (
    <div className="chat-configuration">
      <div className="config-left">
        <label htmlFor="coding-level-selector">{t('codingLevel')}</label>
        <select
          id="coding-level-selector"
          className="chat-level-selector"
          value={codingLevel}
          onChange={(e) => onCodingLevelChange(e.target.value)}
        >
          <option value="beginner">{t('beginner')}</option>
          <option value="intermediate">{t('intermediate')}</option>
          <option value="experienced">{t('experienced')}</option>
        </select>

        {showModelPicker && (
          <>
            <label htmlFor="model-selector" style={{ marginLeft: '15px' }}>{t('aiModelLabel')}</label>
            <select
              id="model-selector"
              className="chat-level-selector"
              value={selectedModel}
              onChange={(e) => onModelChange(e.target.value)}
            >
              {Object.entries(modelsByProvider || {}).map(([provider, models]) => (
                <optgroup key={provider} label={provider.toUpperCase()}>
                  {models.map((model) => {
                    return (
                      <option key={model} value={model}>
                        {model}
                      </option>
                    );
                  })}
                </optgroup>
              ))}
            </select>
          </>
        )}
        {showUsage && (
          <div className="llm-usage-indicator">
            <div
              className="llm-usage-ring"
              style={{ '--usage-percent': usagePercent }}
              aria-label={t('llmUsageAria').replace('{percent}', usagePercent)}
              role="img"
            >
            </div>
            <div className="llm-usage-text">
              {t('llmUsageToday').replace('{percent}', usagePercent)}
              <span className="usage-tooltip">
                <span className="usage-tooltip-icon">ℹ️</span>
                <span className="usage-tooltip-text">
                  {t('llmUsageTooltip')}
                </span>
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatConfiguration;

