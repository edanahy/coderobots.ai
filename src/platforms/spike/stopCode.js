// Halt all SPIKE Prime motors on connect: stop any motor running directly via
// the `motor` module, then unpair all three `motor_pair` pairs (a paired
// motor ignores plain motor.stop() while still paired). Ported from the Fall
// 2025 EN1 Editor's stopSpike.js.
export const stopCode = `
import motor
motor.stop()

import motor_pair
motor_pair.unpair(motor_pair.PAIR_1)
motor_pair.unpair(motor_pair.PAIR_2)
motor_pair.unpair(motor_pair.PAIR_3)
`;
