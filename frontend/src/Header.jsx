import { Header, HeaderName, HeaderNavigation, HeaderMenuItem, HeaderGlobalBar, HeaderGlobalAction } from '@carbon/react';
import { Asleep, Awake, Logout } from '@carbon/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useLogout, useMe } from './api/auth';
import useTheme from './useTheme';
import styles from './Header.module.scss';

const SECTIONS = [
    { id: 'dashboard', label: 'Research Records' },
    { id: 'ask-the-repo', label: 'Ask the Repo' },
];

export default function AppHeader({ activeSection, onNavigate }) {
    const queryClient = useQueryClient();
    const logout = useLogout();
    const { isDark, toggle: toggleTheme } = useTheme();
    // Read-only cache hit: App.jsx only mounts this component once its own
    // useMe() call has resolved successfully, so this shares that same
    // ['me'] cache entry with data already populated — no loading flash.
    const me = useMe();

    function handleLogout() {
        logout.mutate(undefined, {
            onSuccess: () => queryClient.invalidateQueries({ queryKey: ['me'] }),
        });
    }

    return (
        <Header aria-label="UX Research Repo">
            <HeaderName href="#" prefix="">UX Research Repo</HeaderName>
            <HeaderNavigation aria-label="Primary">
                {SECTIONS.map((section) => (
                    // href="#" + preventDefault, not a real link: Carbon's own
                    // .cds--header__menu-item CSS (hover/focus/current styles)
                    // is scoped to `a.cds--header__menu-item` specifically, and
                    // this app has no router to hand HeaderMenuItem a real `as`.
                    // Matches the existing HeaderName href="#" above.
                    <HeaderMenuItem
                        key={section.id}
                        href="#"
                        isActive={activeSection === section.id}
                        onClick={(event) => {
                            event.preventDefault();
                            onNavigate(section.id);
                        }}
                    >
                        {section.label}
                    </HeaderMenuItem>
                ))}
            </HeaderNavigation>
            <HeaderGlobalBar>
                <span className={styles.welcome}>Welcome, {me.data.git_name}</span>
                <HeaderGlobalAction
                    aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                    onClick={toggleTheme}
                >
                    {isDark ? <Awake size={20} /> : <Asleep size={20} />}
                </HeaderGlobalAction>
                <HeaderGlobalAction aria-label="Log out" onClick={handleLogout}>
                    <Logout size={20} />
                </HeaderGlobalAction>
            </HeaderGlobalBar>
        </Header>
    );
}