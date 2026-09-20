import { buildSpikePriming } from './priming';
import { stopCode } from './stopCode';

const spikePlatform = {
  id: 'spike',
  label: 'LEGO SPIKE Prime',
  connectionType: 'spike',
  buildPriming: buildSpikePriming,
  stopCode,
};

export default spikePlatform;
