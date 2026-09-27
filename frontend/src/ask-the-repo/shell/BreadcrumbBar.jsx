import { Breadcrumb, BreadcrumbItem } from '@carbon/react';
import styles from './BreadcrumbBar.module.scss';

export default function BreadcrumbBar() {
    return (
        <div className={styles.bar}>
            {/* Neither crumb has an href: "Research Repo" isn't a link back to
                the dashboard (that's what the primary nav is for) and "Ask the
                Repo" is the current page — both render as plain text. */}
            <Breadcrumb noTrailingSlash aria-label="Breadcrumb">
                <BreadcrumbItem>Research Repo</BreadcrumbItem>
                <BreadcrumbItem isCurrentPage>Ask the Repo</BreadcrumbItem>
            </Breadcrumb>
        </div>
    );
}
