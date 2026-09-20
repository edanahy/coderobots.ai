import lilybotPlatform from './lilybot';
import microbitPlatform from './microbit';
import cutebotPlatform from './cutebot';
import esp32Platform from './esp32';
import esp32ArduinoPlatform from './esp32-arduino';
import legoPlatform from './lego';
import spikePlatform from './spike';

export const PLATFORMS = [lilybotPlatform, microbitPlatform, cutebotPlatform, esp32Platform, esp32ArduinoPlatform, legoPlatform, spikePlatform];

const PLATFORMS_BY_ID = PLATFORMS.reduce((acc, platform) => {
  acc[platform.id] = platform;
  return acc;
}, {});

export function getPlatform(id) {
  return PLATFORMS_BY_ID[id] || null;
}
