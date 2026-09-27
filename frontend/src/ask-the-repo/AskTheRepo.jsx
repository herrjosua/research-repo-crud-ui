import { useState } from 'react';
import { Grid, Column, Tabs, TabList, Tab, TabPanels, TabPanel } from '@carbon/react';
import BreadcrumbBar from './shell/BreadcrumbBar';
import styles from './AskTheRepo.module.scss';

// Order here drives both the Tab/TabPanel pairing (Carbon's Tabs matches
// them up by index) and Tabs' own controlled `selectedIndex`.
const VIEWS = ['ask', 'insights'];

export default function AskTheRepo() {
    const [activeView, setActiveView] = useState('ask');

    return (
        <div>
            <BreadcrumbBar />
            <Tabs
                selectedIndex={VIEWS.indexOf(activeView)}
                onChange={({ selectedIndex }) => setActiveView(VIEWS[selectedIndex])}
            >
                <TabList aria-label="Ask the Repo views" className={styles.tabList}>
                    <Tab>Ask</Tab>
                    <Tab>Saved Insights</Tab>
                </TabList>
                <TabPanels>
                    <TabPanel>
                        <Grid>
                            <Column sm={4} md={8} lg={16}>
                                {/* Chat content: a later ticket. */}
                                <p className={styles.placeholder}>Chat content ships in a later ticket.</p>
                            </Column>
                        </Grid>
                    </TabPanel>
                    <TabPanel>
                        <Grid>
                            <Column sm={4} md={8} lg={16}>
                                {/* Saved insights content: a later ticket. */}
                                <p className={styles.placeholder}>Saved insights content ships in a later ticket.</p>
                            </Column>
                        </Grid>
                    </TabPanel>
                </TabPanels>
            </Tabs>
        </div>
    );
}
