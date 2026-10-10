import { virtual } from '@guidepup/virtual-screen-reader';

// Helpers around the Virtual Screen Reader (RR-55). It simulates what a
// screen reader would speak from the DOM, following the ARIA and HTML-AAM
// specs, not VoiceOver's actual behavior. Use it to pin down accessible
// names, roles and announced text; it does not replace a manual VoiceOver
// pass. Known limit: it reads a live region's text as ordinary content when
// walking the tree, so it shows what the region *says*, not whether a real
// screen reader announces it when it changes.

const MAX_STEPS = 500;

// Starts a reader over `container`. It listens for `focusin`, so anything
// the test focuses afterwards is spoken and ends up in the log. Pair every
// start with `stopReader()` in afterEach, so a failed test doesn't leave a
// reader running into the next one.
export async function startReader(container = document.body) {
    await virtual.start({ container });
    return virtual;
}

export async function stopReader() {
    await virtual.stop();
}

// Moves the cursor forward until `done(phrase)` is true for the last phrase
// spoken, and returns everything spoken so far. Throws, with the tail of the
// log, instead of looping forever when the end is never reached.
export async function readUntil(done) {
    for (let steps = 0; !done(await virtual.lastSpokenPhrase()); steps += 1) {
        if (steps > MAX_STEPS) {
            const tail = (await virtual.spokenPhraseLog()).slice(-8);
            throw new Error(`Virtual Screen Reader did not finish in ${MAX_STEPS} steps. Last spoken: ${JSON.stringify(tail)}`);
        }
        await virtual.next();
    }
    return virtual.spokenPhraseLog();
}

// Reads a whole page or region to its end.
export const readAll = () => readUntil((phrase) => phrase === 'end of document');

// Reads a modal dialog to its end. Carbon's Modal is aria-modal, so the
// reader stays inside it and starts over at the top instead of reaching
// "end of document"; `name` is the dialog's accessible name.
export const readDialog = (name) => readUntil((phrase) => phrase === `end of dialog, ${name}, modal`);

export const lastSpoken = () => virtual.lastSpokenPhrase();
export const spokenLog = () => virtual.spokenPhraseLog();
