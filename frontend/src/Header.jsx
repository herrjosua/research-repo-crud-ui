import { Header, HeaderName, HeaderGlobalBar, HeaderGlobalAction } from '@carbon/react';
import { Logout } from '@carbon/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useLogout } from './api/auth';

export default function AppHeader() {
    const queryClient = useQueryClient();
    const logout = useLogout();

    function handleLogout() {
        logout.mutate(undefined, {
            onSuccess: () => queryClient.invalidateQueries({ queryKey: ['me'] }),
        });
    }

    return (
        <Header aria-label="UX Research Repo">
            <HeaderName href="#" prefix="">UX Research Repo</HeaderName>
            <HeaderGlobalBar>
                <HeaderGlobalAction aria-label="Log out" onClick={handleLogout}>
                    <Logout size={20} />
                </HeaderGlobalAction>
            </HeaderGlobalBar>
        </Header>
    );
}