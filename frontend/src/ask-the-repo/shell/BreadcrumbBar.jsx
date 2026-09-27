import { Breadcrumb, BreadcrumbItem, Grid, Column } from '@carbon/react';
import styles from './BreadcrumbBar.module.scss';

export default function BreadcrumbBar() {
    return (
        // Grid/Column, not a flat `padding-inline`: Dashboard.jsx gets its own
        // horizontal inset entirely from Carbon's Grid (a responsive margin,
        // not a fixed rem value), and this bar sitting directly above that
        // same content needs to line up with it at every breakpoint, not just
        // approximate it at one. See AskTheRepo.jsx's own Grid/Column wrapper
        // for the sibling fix this mirrors.
        <Grid className={styles.bar}>
            <Column sm={4} md={8} lg={16} className={styles.content}>
                {/* Neither crumb has an href: "Research Repo" isn't a link back
                    to the dashboard (that's what the primary nav is for) and
                    "Ask the Repo" is the current page — both render as plain
                    text. */}
                <Breadcrumb noTrailingSlash aria-label="Breadcrumb">
                    <BreadcrumbItem>Research Repo</BreadcrumbItem>
                    <BreadcrumbItem isCurrentPage>Ask the Repo</BreadcrumbItem>
                </Breadcrumb>
            </Column>
        </Grid>
    );
}
