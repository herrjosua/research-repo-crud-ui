import { Header, HeaderName, HeaderGlobalBar, HeaderGlobalAction } from '@carbon/react';
import { Logout } from '@carbon/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useLogout, useMe } from './api/auth';
import styles from './Header.module.scss';

export default function AppHeader() {
    const queryClient = useQueryClient();
    const logout = useLogout();
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
            <HeaderGlobalBar>
                <span className={styles.welcome}>Welcome, {me.data.git_name}</span>
                <HeaderGlobalAction aria-label="Log out" onClick={handleLogout}>
                    <Logout size={20} />
                </HeaderGlobalAction>
            </HeaderGlobalBar>
        </Header>
    );
}