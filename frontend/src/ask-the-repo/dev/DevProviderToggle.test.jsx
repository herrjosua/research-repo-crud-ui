import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DevProviderToggle from './DevProviderToggle';
import { TOGGLE_LABEL } from './devProviderCopy';
import { useDevProvider, useSetDevProvider } from '../../api/dev';

vi.mock('../../api/dev', () => ({ useDevProvider: vi.fn(), useSetDevProvider: vi.fn() }));

const SWITCHED_TO_STATIC = 'Switched to pre-generated answers (static). Conversations were cleared.';
const UNREACHABLE = "Ollama isn't reachable at http://localhost:11434";

let mutateAsync;

function serverOn(provider) {
    vi.mocked(useDevProvider).mockReturnValue({ data: { provider } });
}

// A switch whose outcome the test decides later.
function deferred() {
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

const switcher = () => screen.getByRole('tablist', { name: TOGGLE_LABEL });
const tab = (name) => screen.getByRole('tab', { name });
const status = () => screen.getByRole('status');

// Every element that would announce something: live regions and the roles
// that imply one. The result of a switch must be in exactly one.
function liveRegionsSaying(text) {
    return [...document.querySelectorAll('[aria-live], [role="status"], [role="alert"], [role="log"]')]
        .filter((el) => el.getAttribute('aria-live') !== 'off')
        .filter((el) => el.textContent.includes(text));
}

beforeEach(() => {
    mutateAsync = vi.fn();
    vi.mocked(useSetDevProvider).mockReturnValue({ mutateAsync });
});

describe('DevProviderToggle', () => {
    it('renders nothing while the dev route is loading or missing (a 404)', () => {
        vi.mocked(useDevProvider).mockReturnValue({ data: undefined, isPending: true });
        const { container, rerender } = render(<DevProviderToggle />);
        expect(container).toBeEmptyDOMElement();

        vi.mocked(useDevProvider).mockReturnValue({ data: undefined, isError: true });
        rerender(<DevProviderToggle />);
        expect(container).toBeEmptyDOMElement();
    });

    it('is a named tablist with the active provider selected and only it in the tab order', () => {
        serverOn('ollama');
        render(<DevProviderToggle />);

        expect(switcher()).toBeInTheDocument();
        expect(tab('Live (Ollama)')).toHaveAttribute('aria-selected', 'true');
        expect(tab('Static')).toHaveAttribute('aria-selected', 'false');
        expect(tab('Live (Ollama)')).toHaveAttribute('tabindex', '0');
        expect(tab('Static')).toHaveAttribute('tabindex', '-1');
        expect(screen.getByText('Dev')).toBeInTheDocument();
    });

    it('keeps the first option reachable by Tab when no provider is active yet', async () => {
        const user = userEvent.setup();
        serverOn(null);
        render(<DevProviderToggle />);

        expect(tab('Static')).toHaveAttribute('aria-selected', 'false');
        expect(tab('Live (Ollama)')).toHaveAttribute('aria-selected', 'false');
        await user.tab();
        expect(tab('Static')).toHaveFocus();
    });

    it('moves focus with the arrow keys without switching, and switches on Enter', async () => {
        const user = userEvent.setup();
        serverOn('ollama');
        mutateAsync.mockResolvedValue({ provider: 'static' });
        const onSwitched = vi.fn();
        render(<DevProviderToggle onSwitched={onSwitched} />);

        await user.tab();
        expect(tab('Live (Ollama)')).toHaveFocus();
        await user.keyboard('{ArrowLeft}');
        expect(tab('Static')).toHaveFocus();
        await user.keyboard('{ArrowRight}');
        expect(tab('Live (Ollama)')).toHaveFocus();
        expect(mutateAsync).not.toHaveBeenCalled();

        await user.keyboard('{ArrowLeft}{Enter}');
        await waitFor(() => expect(onSwitched).toHaveBeenCalledWith('static'));
        expect(mutateAsync).toHaveBeenCalledTimes(1);
        expect(mutateAsync).toHaveBeenCalledWith('static');
    });

    it('switches on Space, once', async () => {
        const user = userEvent.setup();
        serverOn('ollama');
        mutateAsync.mockResolvedValue({ provider: 'static' });
        render(<DevProviderToggle />);

        await user.tab();
        await user.keyboard('{ArrowLeft}[Space]');
        await waitFor(() => expect(status()).toHaveTextContent(SWITCHED_TO_STATIC));
        expect(mutateAsync).toHaveBeenCalledTimes(1);
    });

    it('does nothing when the active provider is picked again', async () => {
        const user = userEvent.setup();
        serverOn('ollama');
        render(<DevProviderToggle />);

        await user.click(tab('Live (Ollama)'));
        expect(mutateAsync).not.toHaveBeenCalled();
        expect(status()).toHaveTextContent('');
    });

    it('announces a successful switch exactly once, and nothing while it is pending', async () => {
        const user = userEvent.setup();
        serverOn('ollama');
        const pending = deferred();
        mutateAsync.mockReturnValue(pending.promise);
        const onSwitched = vi.fn();
        render(<DevProviderToggle onSwitched={onSwitched} />);

        await user.click(tab('Static'));
        expect(screen.getByText('Switching…')).toBeInTheDocument();
        expect(tab('Static')).toHaveAttribute('aria-selected', 'true');
        expect(status()).toHaveTextContent('');
        expect(liveRegionsSaying('Switching')).toHaveLength(0);
        // The other option can't be picked while one is in flight.
        expect(tab('Live (Ollama)')).toBeDisabled();
        await user.click(tab('Live (Ollama)'));
        expect(mutateAsync).toHaveBeenCalledTimes(1);
        expect(tab('Static')).toHaveAttribute('aria-selected', 'true');

        serverOn('static'); // what the mutation's onSuccess writes to the cache
        pending.resolve({ provider: 'static' });
        await waitFor(() => expect(status()).toHaveTextContent(SWITCHED_TO_STATIC));
        expect(liveRegionsSaying('Switched to')).toHaveLength(1);
        expect(onSwitched).toHaveBeenCalledTimes(1);
        expect(screen.queryByText('Switching…')).not.toBeInTheDocument();
        expect(tab('Static')).toHaveAttribute('aria-selected', 'true');
        expect(tab('Live (Ollama)')).toBeEnabled();
    });

    it('on an error, reselects and refocuses the active provider, shows why, and announces it exactly once', async () => {
        const user = userEvent.setup();
        serverOn('static');
        mutateAsync.mockRejectedValue(Object.assign(new Error(UNREACHABLE), { status: 502 }));
        const onSwitched = vi.fn();
        render(<DevProviderToggle onSwitched={onSwitched} />);

        await user.tab();
        await user.keyboard('{ArrowRight}{Enter}');

        const announced = `Couldn't switch to live answers (Ollama). ${UNREACHABLE}`;
        await waitFor(() => expect(status()).toHaveTextContent(announced));
        expect(liveRegionsSaying(UNREACHABLE)).toHaveLength(1);
        expect(screen.getByText('Provider not switched')).toBeInTheDocument();
        expect(screen.getByText(UNREACHABLE)).toBeInTheDocument();
        expect(tab('Static')).toHaveAttribute('aria-selected', 'true');
        expect(tab('Live (Ollama)')).toHaveAttribute('aria-selected', 'false');
        await waitFor(() => expect(tab('Static')).toHaveFocus());
        expect(onSwitched).not.toHaveBeenCalled();

        await user.click(screen.getByRole('button', { name: 'Dismiss' }));
        expect(screen.queryByText('Provider not switched')).not.toBeInTheDocument();
        expect(tab('Static')).toHaveFocus();
    });

    it('announces the same failure again when it happens twice in a row', async () => {
        const user = userEvent.setup();
        serverOn('static');
        mutateAsync.mockRejectedValue(new Error(UNREACHABLE));
        render(<DevProviderToggle />);

        await user.click(tab('Live (Ollama)'));
        await waitFor(() => expect(status()).toHaveTextContent(UNREACHABLE));
        const first = status().textContent;

        await user.click(tab('Live (Ollama)'));
        await waitFor(() => expect(status().textContent).not.toBe(first));
        expect(status()).toHaveTextContent(UNREACHABLE);
    });
});
