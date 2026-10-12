import fs from 'node:fs';
import path from 'node:path';

/**
 * Saves what VoiceOver spoke, one phrase per line, to
 * test-results/voiceover/<name>.txt and attaches it to the test, so a run
 * leaves a readable record to look at (and to paste into a ticket).
 */
export async function saveSpoken(testInfo, name, phrases) {
    const dir = path.join(process.cwd(), 'test-results', 'voiceover');
    fs.mkdirSync(dir, { recursive: true });
    const text = phrases.map((phrase, index) => `${String(index).padStart(3, '0')}  ${phrase}`).join('\n');
    fs.writeFileSync(path.join(dir, `${name}.txt`), `${text}\n`);
    await testInfo.attach(name, { body: text, contentType: 'text/plain' });
    console.log(`\n--- VoiceOver: ${name} ---\n${text}\n`);
}

/** Moves VoiceOver on `count` items, one at a time. */
export async function stepThrough(voiceOver, count) {
    for (let i = 0; i < count; i += 1) {
        await voiceOver.next();
    }
}
