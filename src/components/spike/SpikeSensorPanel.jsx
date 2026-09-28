import { useLanguage } from '../../contexts/LanguageContext';
import { PORTS } from '../../utils/spike/messages.js';
import './Spike.css';

// Approximate on-screen colours for the SPIKE colour enum.
const SWATCH = {
  black: '#1b1b1b', magenta: '#d02ad0', purple: '#7b3fe4', blue: '#1f5bd6', azure: '#35a7f0',
  turquoise: '#1fc3b0', green: '#27a345', yellow: '#f5cf1d', orange: '#f28a1c', red: '#dc2d2d',
  white: '#ffffff',
};

const capitalize = (name) => `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
const colorKey = (name) => `spikeColor${capitalize(name)}`;
const faceKey = (face) => `spikeFace${capitalize(face)}`;

const MOTOR_LABEL_KEY = { large: 'spikeLargeMotor', medium: 'spikeMediumMotor', small: 'spikeSmallMotor' };

const Swatch = ({ name, dimmed = false }) => (
  <span
    className={`spike-swatch${name ? '' : ' spike-swatch--none'}`}
    style={name ? { background: SWATCH[name], opacity: dimmed ? 0.35 : 1 } : undefined}
  />
);

const PortCard = ({ port, device, t }) => {
  let label = t('spikePortEmpty');
  let body = null;

  if (device?.type === 'motor') {
    label = t(MOTOR_LABEL_KEY[device.motorType] || 'spikeMotor');
    body = (
      <>
        <div className="spike-port-value">{device.position}°</div>
        <div className="spike-port-detail">
          {t('spikeSpeed')} {device.speed}% · {t('spikeAbsolute')} {device.absolutePosition}°
        </div>
      </>
    );
  } else if (device?.type === 'color') {
    label = t('spikeColorSensor');
    body = (
      <>
        <div className="spike-port-value">
          <Swatch name={device.color} />
          {device.color ? t(colorKey(device.color)) : t('spikeNoColor')}
        </div>
        <div className="spike-port-detail">RGB {device.rgb.join(' / ')}</div>
      </>
    );
  } else if (device?.type === 'distance') {
    label = t('spikeDistanceSensor');
    body = (
      <div className="spike-port-value">
        {device.distance == null ? t('spikeNothingDetected') : `${device.distance} mm`}
      </div>
    );
  } else if (device?.type === 'force') {
    label = t('spikeForceSensor');
    body = (
      <div className="spike-port-value">
        {device.value}%
        {device.pressed && <span className="spike-badge">{t('spikePressed')}</span>}
      </div>
    );
  } else if (device?.type === 'colorMatrix') {
    label = t('spikeColorMatrix');
    body = (
      <div className="spike-matrix3">
        {device.pixels.map((pixel, i) => (
          <Swatch key={i} name={pixel.brightness ? pixel.color : null} dimmed={pixel.brightness < 5} />
        ))}
      </div>
    );
  }

  return (
    <div className={`spike-port${device ? '' : ' spike-port--empty'}`}>
      <div className="spike-port-head">
        <span className="spike-port-letter">{port}</span>
        <span className="spike-port-label">{label}</span>
      </div>
      {body}
    </div>
  );
};

/** Live Hub OS device notifications: hub IMU/display/battery + ports A–F. */
const SpikeSensorPanel = ({ deviceState, onClose }) => {
  const { t } = useLanguage();
  const imu = deviceState?.imu;

  return (
    <aside className="spike-sensor-panel" aria-label={t('spikeSensors')}>
      <div className="spike-sensor-header">
        <span>{t('spikeSensors')}</span>
        <button type="button" onClick={onClose} className="spike-sensor-close" aria-label={t('close')}>×</button>
      </div>

      {!deviceState ? (
        <div className="spike-sensor-empty">{t('spikeSensorsWaiting')}</div>
      ) : (
        <>
          <div className="spike-sensor-hub">
            {deviceState.display && (
              <div className="spike-display" title={t('spikeLightMatrix')}>
                {deviceState.display.map((level, i) => (
                  <span key={i} style={{ opacity: 0.12 + (level / 100) * 0.88 }} />
                ))}
              </div>
            )}
            <dl className="spike-imu">
              {imu && (
                <>
                  <dt>{t('spikeYaw')}</dt><dd>{imu.yaw.toFixed(1)}°</dd>
                  <dt>{t('spikePitch')}</dt><dd>{imu.pitch.toFixed(1)}°</dd>
                  <dt>{t('spikeRoll')}</dt><dd>{imu.roll.toFixed(1)}°</dd>
                  {imu.faceUp && (<><dt>{t('spikeFaceUp')}</dt><dd>{t(faceKey(imu.faceUp))}</dd></>)}
                </>
              )}
              {deviceState.battery != null && (
                <><dt>{t('spikeBattery')}</dt><dd>{deviceState.battery}%</dd></>
              )}
            </dl>
          </div>

          <div className="spike-port-grid">
            {PORTS.map((port) => (
              <PortCard key={port} port={port} device={deviceState.ports[port]} t={t} />
            ))}
          </div>
        </>
      )}
    </aside>
  );
};

export default SpikeSensorPanel;
