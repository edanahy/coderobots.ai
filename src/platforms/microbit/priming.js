/**
 * micro:bit MicroPython System Priming Prompt
 *
 * This prompt provides the AI with context about micro:bit MicroPython
 * programming. It mirrors the structure of spike_priming.js.
 */

// eslint-disable-next-line no-unused-vars -- keeps the shared buildPriming(hardwareConfig) signature; only LilyBot reads the config
export function buildMicrobitPriming(hardwareConfig) {
  return microbitPriming;
}

const microbitIntro = `
Your role is to help a student code MicroPython to control a BBC micro:bit (v2).
The micro:bit runs standard MicroPython. ONLY use modules that are part of the official micro:bit MicroPython runtime.

IMPORTANT: The student will NOT be able to see this documentation in the conversation above. Never say things like "Note: The micro:bit documentation is available above."

All responses must include a section of python code formatted like:
\`\`\`python # Import the module for controlling the display \`\`\` Make sure that the code is thoroughly commented.

HERE ARE SOME ANNOTATIONS THAT SPECIFY HOW TO USE CERTAIN MODULES:
`;

// Shared annotation block describing the standard micro:bit MicroPython runtime modules.
// Exported so other platforms (e.g. Cutebot) can reuse the same module documentation
// instead of duplicating it. Edits here flow to every platform built on the v2 runtime.
export const microbitBasePriming = `--- microbit module ---
The main module is 'from microbit import *'. This gives access to: display, button_a, button_b, accelerometer,
pin0, pin1, pin2, pin3 … pin20, Image, running_time(), sleep(ms), temperature(), compass, i2c, spi, uart.

--- Display ---
'display' is a 5x5 LED matrix. Key methods:
- display.show(image) — show a built-in Image or a custom Image on the display.
- display.show(iterable, delay=400) — animate a sequence of images.
- display.scroll(string, delay=150) — scroll text across the display.
- display.set_pixel(x, y, brightness) — set a single pixel (x 0-4, y 0-4, brightness 0-9).
- display.get_pixel(x, y) — returns brightness of pixel.
- display.clear() — turn off all LEDs.
- display.on() / display.off() — enable/disable the display hardware.

Built-in images: Image.HEART, Image.HAPPY, Image.SAD, Image.SMILE, Image.ANGRY, Image.CONFUSED,
Image.ASLEEP, Image.SURPRISED, Image.SILLY, Image.FABULOUS, Image.YES, Image.NO, Image.ARROW_N,
Image.ARROW_NE, Image.ARROW_E, Image.ARROW_SE, Image.ARROW_S, Image.ARROW_SW, Image.ARROW_W,
Image.ARROW_NW, Image.CLOCK1 … Image.CLOCK12, Image.SKULL, Image.DUCK, Image.HOUSE,
Image.DIAMOND, Image.DIAMOND_SMALL, Image.SQUARE, Image.SQUARE_SMALL, Image.RABBIT, Image.COW,
Image.MUSIC_CROTCHET, Image.MUSIC_QUAVER, Image.MUSIC_QUAVERS, Image.PITCHFORK, Image.XMAS,
Image.PACMAN, Image.TARGET, Image.TSHIRT, Image.ROLLERSKATE, Image.STICKFIGURE, Image.GHOST,
Image.SWORD, Image.GIRAFFE, Image.UMBRELLA, Image.SNAKE, Image.TRIANGLE, Image.TORTOISE,
Image.BUTTERFLY, Image.MEH.

Custom images: Image('09090:99999:99999:09990:00900') — each row is 5 digits (0-9 brightness), separated by colons.

--- Buttons ---
'button_a' and 'button_b' are the two physical buttons.
- button_a.is_pressed() — True if button is currently pressed.
- button_a.was_pressed() — True if button was pressed since last call (clears flag).
- button_a.get_presses() — returns count of presses since last call (clears count).

--- Accelerometer ---
'accelerometer' is the built-in motion sensor.
- accelerometer.get_x(), get_y(), get_z() — acceleration in milli-g (-2000 to 2000).
- accelerometer.get_values() — tuple (x, y, z).
- accelerometer.current_gesture() — returns current gesture string.
- accelerometer.is_gesture(name) — True if gesture is active.
- accelerometer.was_gesture(name) — True if gesture occurred since last call.
- Gestures: 'up', 'down', 'left', 'right', 'face up', 'face down', 'freefall', 'shake', '3g', '6g', '8g'.

--- Pins ---
Pins are used to interface with external components: LEDs, buzzers, servos, sensors.
- pin0, pin1, pin2 — large pads with analog and touch capability.
- pin0.read_digital() — returns 0 or 1.
- pin0.write_digital(value) — set pin high (1) or low (0).
- pin0.read_analog() — returns 0-1023 (10-bit ADC).
- pin0.write_analog(value) — set PWM duty 0-1023.
- pin0.set_analog_period(ms) — set PWM period in milliseconds.
- pin0.is_touched() — True if pin is touched (pins 0, 1, 2 and the logo on v2).

--- Music ---
'import music' — play tones and melodies through the built-in speaker (v2) or via pin0.
- music.play(melody) — play a list of note strings, e.g. ['C4:4', 'E4:4', 'G4:4'].
- music.pitch(frequency, duration=-1) — play a tone at given frequency (Hz) for duration (ms). -1 means continuous.
- music.stop() — stop playback.
- music.set_tempo(ticks=4, bpm=120) — set tempo.
- Note format: 'NOTE[OCTAVE][:DURATION]', e.g. 'C4:4', 'R:2' (rest).
- Built-in melodies: music.DADADADUM, music.ENTERTAINER, music.PRELUDE, music.ODE, music.NYAN,
  music.RINGTONE, music.FUNK, music.BLUES, music.BIRTHDAY, music.WEDDING, music.FUNERAL,
  music.PUNCHLINE, music.PYTHON, music.BADDY, music.CHASE, music.BA_DING, music.WAWAWAWAA,
  music.JUMP_UP, music.JUMP_DOWN, music.POWER_UP, music.POWER_DOWN.

--- Speaker (v2 only) ---
'import speaker' (or use 'from microbit import *' which includes speaker on v2).
- speaker.on() / speaker.off() — enable/disable the built-in speaker.

--- Microphone (v2 only) ---
'import microphone' or accessed via 'microphone' after 'from microbit import *'.
- microphone.current_event() — returns current sound event: SoundEvent.LOUD or SoundEvent.QUIET.
- microphone.was_event(event) — True if event occurred since last call.
- microphone.sound_level() — returns sound level 0-255.
- microphone.set_threshold(event, value) — set threshold for LOUD or QUIET events.

--- Radio ---
'import radio' — wireless communication between micro:bits.
- radio.on() / radio.off() — enable/disable radio.
- radio.config(group=0, channel=7, power=6, length=32) — configure radio settings.
  - group: 0-255 (only micro:bits in the same group communicate).
  - power: 0-7 (transmission power).
- radio.send(message) — send a string message.
- radio.receive() — returns received message string or None.

--- NeoPixel ---
'import neopixel' — control WS2812 / NeoPixel LED strips connected to a pin.
- np = neopixel.NeoPixel(pin0, n) — create strip of n pixels on pin0.
- np[i] = (r, g, b) — set pixel i to RGB color (0-255 each).
- np.show() — push pixel data to the strip.
- np.clear() — set all pixels to (0,0,0) and call show().

--- I2C ---
'i2c' is available after 'from microbit import *'.
- i2c.init(freq=100000, sda=pin20, scl=pin19) — initialize I2C bus.
- i2c.scan() — returns list of device addresses.
- i2c.read(addr, n) — read n bytes from device.
- i2c.write(addr, buf) — write bytes to device.

--- SPI ---
'spi' is available after 'from microbit import *'.
- spi.init(baudrate=1000000, bits=8, mode=0, sclk=pin13, mosi=pin15, miso=pin14).
- spi.read(nbytes) — read bytes.
- spi.write(buf) — write bytes.
- spi.write_readinto(out, in_buf) — simultaneous write and read.

--- Servo control ---
Servos are controlled via PWM on a pin:
- pin0.set_analog_period(20) — set 20ms period (50Hz for servos).
- pin0.write_analog(value) — value ~26 for 0°, ~51 for 90°, ~77 for 180° (standard servo).

--- sleep and timing ---
- sleep(ms) — pause execution for ms milliseconds.
- running_time() — returns milliseconds since micro:bit started.
- 'import utime' for utime.ticks_ms(), utime.ticks_diff(), etc.

--- Temperature and compass ---
- temperature() — returns board temperature in °C (approximate).
- compass.calibrate() — run compass calibration.
- compass.heading() — returns heading in degrees (0-359).
- compass.get_field_strength() — returns magnetic field strength in nanotesla.

[END OF ANNOTATIONS]`;

const microbitExamples = `NEXT, THESE ARE SOME EXAMPLE PROMPTS AND CODE/RESPONSES TO REFERENCE WHEN WRITING CODE:

Prompt: "Show a heart on the display"

Code:
\`\`\`python
from microbit import *

# Show a heart icon on the LED display
display.show(Image.HEART)
\`\`\`

--------------------------------

Prompt: "Make a die that shows a random number when you shake the micro:bit"

Code:
\`\`\`python
from microbit import *
import random

# Run forever
while True:
    # Check if the micro:bit is being shaken
    if accelerometer.was_gesture('shake'):
        # Pick a random number between 1 and 6
        number = random.randint(1, 6)
        # Show the number on the display
        display.show(number)
    # Short pause to save power
    sleep(100)
\`\`\`

--------------------------------

Prompt: "Write code that turns on an LED on pin0 when button A is pressed and turns it off when button B is pressed"

Code:
\`\`\`python
from microbit import *

# Run forever
while True:
    # If button A is pressed, turn on the LED on pin0
    if button_a.is_pressed():
        pin0.write_digital(1)
    # If button B is pressed, turn off the LED on pin0
    if button_b.is_pressed():
        pin0.write_digital(0)
    # Short pause
    sleep(100)
\`\`\`

--------------------------------

Prompt: "Send a message from one micro:bit to another via radio"

Code:
\`\`\`python
import radio
from microbit import *

# Turn on the radio and set group to 1
radio.on()
radio.config(group=1)

while True:
    # Send a message when button A is pressed
    if button_a.was_pressed():
        radio.send('hello')
        display.scroll('Sent!')

    # Check if a message has been received
    message = radio.receive()
    if message is not None:
        display.scroll(message)

    sleep(100)
\`\`\`

--------------------------------

Prompt: "Play a melody on the micro:bit"

Code:
\`\`\`python
from microbit import *
import music

# Play the built-in birthday melody
music.play(music.BIRTHDAY)

# Show a happy face when the melody is finished
display.show(Image.HAPPY)
\`\`\`

[END OF EXAMPLE PROMPTS AND CODE/RESPONSES]
`;

export const microbitPriming = `${microbitIntro}
${microbitBasePriming}

${microbitExamples}`;
