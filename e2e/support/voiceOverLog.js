import fs from 'node:fs';
import path from 'node:path';

/**
 * Saves what VoiceOver spoke, one phrase per line, to
 * test-results/voiceover/<name>.txt and attaches it to the test, so a run
 * leaves a readable record to look at (and to paste into a ticket). The file
 * name includes the browser project, since VoiceOver speaks differently in
 * Chrome and Safari.
 */
export async function saveSpoken(testInfo, name, phrases) {
    const label = `${testInfo.project.name}-${name}`;
    const dir = path.join(process.cwd(), 'test-results', 'voiceover');
    fs.mkdirSync(dir, { recursive: true });
    const text = phrases.map((phrase, index) => `${String(index).padStart(3, '0')}  ${phrase}`).join('\n');
    fs.writeFileSync(path.join(dir, `${label}.txt`), `${text}\n`);
    await testInfo.attach(label, { body: text, contentType: 'text/plain' });
    console.log(`\n--- VoiceOver: ${label} ---\n${text}\n`);
}

/** Moves VoiceOver on `count` items, one at a time. */
export async function stepThrough(voiceOver, count) {
    for (let i = 0; i < count; i += 1) {
        await voiceOver.next();
    }
}

/**
 * Where VoiceOver is and what it last said. Guidepup's spoken phrase log only
 * holds speech that followed one of its own commands, so speech the page
 * caused (focus moving, a dialog opening) is not in it; these two are read
 * from VoiceOver itself.
 */
export async function nowSaying(voiceOver) {
    return [
        `last spoken phrase: ${await voiceOver.lastSpokenPhrase()}`,
        `item under the cursor: ${await voiceOver.itemText()}`,
    ];
}

/** Steps on until the item under the cursor matches `pattern`; false if `max` steps pass first. */
export async function stepUntil(voiceOver, pattern, max = 60) {
    for (let i = 0; i < max; i += 1) {
        await voiceOver.next();
        if (pattern.test(await voiceOver.itemText())) return true;
    }
    return false;
}

/** Presses Tab until VoiceOver's last phrase matches `pattern`; false if `max` presses pass first. */
export async function tabUntil(voiceOver, pattern, max = 25) {
    for (let i = 0; i < max; i += 1) {
        await voiceOver.press('Tab');
        if (pattern.test(await voiceOver.lastSpokenPhrase())) return true;
    }
    return false;
}

/** The headings VoiceOver finds, in order, with its heading command (VO+Command+H). */
export async function headingsInOrder(voiceOver, max = 8) {
    const found = [];
    for (let i = 0; i < max; i += 1) {
        await voiceOver.perform(voiceOver.keyboardCommands.findNextHeading);
        found.push(await voiceOver.itemText());
    }
    return found;
}

/** Waits for the page to settle after something that opens a dialog or moves focus. */
export const settle = (page) => page.waitForTimeout(1500);
